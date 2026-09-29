package org.xjuarlab.lab.integrations.oj;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OjImportWorker {
    private static final Logger log = LoggerFactory.getLogger(OjImportWorker.class);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final OjIntegrationClient oj;
    private final ObjectMapper mapper;
    private final ZoneId businessZone;

    public OjImportWorker(JdbcTemplate jdbc, org.springframework.transaction.PlatformTransactionManager manager,
            OjIntegrationClient oj, ObjectMapper mapper,
            @org.springframework.beans.factory.annotation.Value("${lab.timezone:Asia/Shanghai}") String timezone) {
        this.jdbc = jdbc; this.transactions = new TransactionTemplate(manager); this.oj = oj; this.mapper = mapper;
        this.businessZone = ZoneId.of(timezone);
    }

    @Scheduled(fixedDelayString = "${lab.oj.import-poll-ms:3000}")
    public void poll() {
        for (int i = 0; i < 5; i++) {
            ImportJob job = claim();
            if (job == null) return;
            try {
                OjIntegrationClient.ContestResults result = oj.results(job.contestId());
                String status = persist(job, result);
                log.info("OJ import completed id={} status={}", job.id(), status);
            } catch (OjIntegrationClient.OjConnectorException ex) {
                fail(job, ex.code());
            } catch (RuntimeException ex) {
                fail(job, "OJ_RESULT_VALIDATION_FAILED");
            }
        }
    }

    private ImportJob claim() {
        return transactions.execute(status -> jdbc.query("WITH candidate AS (SELECT id FROM assessment_import_job WHERE status='QUEUED' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE assessment_import_job j SET status='RUNNING',updated_at=now() FROM candidate c WHERE j.id=c.id RETURNING j.id,j.term_id,j.contest_id,j.contest_url",
            (rs, row) -> new ImportJob((UUID) rs.getObject(1), (UUID) rs.getObject(2), rs.getString(3), rs.getString(4))).stream().findFirst().orElse(null));
    }

    private String persist(ImportJob job, OjIntegrationClient.ContestResults source) {
        return transactions.execute(tx -> {
            if (!source.contestId().equals(job.contestId()) || !"ACM".equalsIgnoreCase(source.ruleType()) || !source.finalRanking())
                throw new InvalidImport("OJ_CONTEST_NOT_FINAL_ACM");
            OffsetDateTime endedAt;
            try { endedAt = OffsetDateTime.parse(source.endedAt()); }
            catch (RuntimeException ex) { throw new InvalidImport("OJ_ENDED_AT_INVALID"); }
            var term = jdbc.query("SELECT starts_on,ends_on FROM training_term WHERE id=? FOR UPDATE",
                (rs, row) -> new TermDates(rs.getObject(1, LocalDate.class), rs.getObject(2, LocalDate.class)), job.termId()).stream().findFirst().orElseThrow(() -> new InvalidImport("TERM_NOT_FOUND"));
            LocalDate contestDate = endedAt.atZoneSameInstant(businessZone).toLocalDate();
            if (contestDate.isBefore(term.startsOn()) || contestDate.isAfter(term.endsOn())) throw new InvalidImport("CONTEST_OUTSIDE_ACTIVE_TERM");
            if (source.total() != source.items().size() || source.total() <= 0 || source.snapshotVersion().isBlank()) throw new InvalidImport("OJ_RESULT_INCOMPLETE");

            List<RosterMember> roster = jdbc.query("SELECT tm.member_id,COALESCE(NULLIF(m.account_id,''),min(x.account_id)) account_id,count(DISTINCT x.account_id),COALESCE(bool_or(x.account_id IS NOT NULL AND m.account_id IS NOT NULL AND x.account_id<>m.account_id),false) FROM term_member tm JOIN member m ON m.id=tm.member_id AND m.active=true LEFT JOIN external_identity x ON x.member_id=m.id AND x.active=true AND x.account_id IS NOT NULL WHERE tm.term_id=? GROUP BY tm.member_id,m.account_id ORDER BY tm.member_id",
                (rs, row) -> new RosterMember((UUID) rs.getObject(1), rs.getString(2), rs.getLong(3), rs.getBoolean(4)), job.termId());
            List<UUID> missingAccounts = roster.stream().filter(member -> member.accountId() == null || !member.accountId().matches("[0-9]{8}") || member.identityCount() > 1 || member.conflict())
                .map(RosterMember::memberId).toList();
            if (!missingAccounts.isEmpty()) {
                updateJob(job.id(), "WAITING_MAPPING", Map.of("code", "ROSTER_IDENTITY_INCOMPLETE", "memberIds", missingAccounts));
                return "WAITING_MAPPING";
            }
            Map<String, UUID> accountToMember = new HashMap<>();
            for (RosterMember member : roster) {
                if (accountToMember.putIfAbsent(member.accountId(), member.memberId()) != null) {
                    updateJob(job.id(), "WAITING_MAPPING", Map.of("code", "ROSTER_ACCOUNT_CONFLICT"));
                    return "WAITING_MAPPING";
                }
            }
            Set<String> seenUsers = new HashSet<>();
            List<MappedResult> mapped = new ArrayList<>();
            int unmapped = 0;
            for (JsonNode item : source.items()) {
                String userId = item.path("sourceUserId").asText("");
                String accountId = item.path("accountId").asText("");
                if (userId.isBlank() || !seenUsers.add(userId) || !accountId.matches("[0-9]{8}")) throw new InvalidImport("OJ_RESULT_IDENTITY_INVALID");
                UUID memberId = accountToMember.get(accountId);
                if (memberId == null) { unmapped++; continue; } // Contestants outside this LabOS roster are not ranked locally.
                int solved = boundedInt(item.path("acceptedCount"), 0, 200, "acceptedCount");
                long penalty = boundedLong(item.path("penaltySeconds"), 0, 10_000_000_000L, "penaltySeconds");
                BigDecimal rank = decimal(item.path("rank"));
                if (rank.signum() <= 0) throw new InvalidImport("OJ_RESULT_RANK_INVALID");
                mapped.add(new MappedResult(memberId, userId, rank, solved, penalty));
            }
            if (mapped.isEmpty()) {
                updateJob(job.id(), "WAITING_MAPPING", Map.of("code", "NO_ROSTER_RESULTS", "sourceParticipants", source.total()));
                return "WAITING_MAPPING";
            }
            String sourcePayload = json(Map.of("sourceVersion", source.sourceVersion(), "snapshotVersion", source.snapshotVersion(), "total", source.total(), "items", source.items()));
            String hash = sha256(sourcePayload);
            if (!jdbc.query("SELECT 1 FROM contest_snapshot WHERE term_id=? AND contest_id=? AND payload_hash=? AND complete=true",
                    (rs, row) -> rs.getInt(1), job.termId(), job.contestId(), hash).isEmpty()) {
                updateJob(job.id(), "NO_CHANGE", Map.of("code", "SOURCE_UNCHANGED", "sourceParticipants", source.total(), "mappedMembers", mapped.size(), "externalParticipants", unmapped));
                return "NO_CHANGE";
            }
            int eventOrder = jdbc.queryForObject("SELECT COALESCE(max(event_order),0)+1 FROM contest_snapshot WHERE term_id=? AND ended_at=? AND complete=true", Integer.class,
                job.termId(), endedAt);
            UUID snapshotId = jdbc.queryForObject("INSERT INTO contest_snapshot(term_id,contest_id,contest_url,source_version,payload_hash,complete,ended_at,event_order,title,source_payload) VALUES (?,?,?,?,?,true,?,?,?,?::jsonb) RETURNING id",
                UUID.class, job.termId(), job.contestId(), job.contestUrl(), source.sourceVersion() + ":" + source.snapshotVersion(), hash, endedAt, eventOrder, source.title(), sourcePayload);
            for (MappedResult row : mapped) jdbc.update("INSERT INTO contest_result(snapshot_id,member_id,oj_user_id,rank,solved,penalty) VALUES (?,?,?,?,?,?)",
                snapshotId, row.memberId(), row.sourceUserId(), row.rank(), row.solved(), row.penalty());
            jdbc.update("UPDATE training_term SET version=version+1 WHERE id=?", job.termId());
            String detail = json(Map.of("snapshotId", snapshotId, "sourceParticipants", source.total(), "mappedMembers", mapped.size(), "externalParticipants", unmapped, "sourceVersion", source.snapshotVersion(), "payloadHash", hash));
            jdbc.update("UPDATE assessment_import_job SET status='COMPLETED',result=?::jsonb,updated_at=now() WHERE id=?", detail, job.id());
            jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) SELECT created_by,'IMPORT_OJ_CONTEST','assessment',?,?::jsonb FROM assessment_import_job WHERE id=?",
                snapshotId.toString(), detail, job.id());
            return "COMPLETED";
        });
    }

    private void fail(ImportJob job, String code) {
        transactions.executeWithoutResult(tx -> updateJob(job.id(), "FAILED", Map.of("code", code, "retryable", true)));
        log.warn("OJ import failed id={} code={}", job.id(), code);
    }

    private void updateJob(UUID id, String status, Object result) {
        jdbc.update("UPDATE assessment_import_job SET status=?,result=?::jsonb,updated_at=now() WHERE id=?", status, json(result), id);
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Could not encode OJ import data", ex); }
    }

    private static int boundedInt(JsonNode node, int min, int max, String field) {
        long value = boundedLong(node, min, max, field); return (int) value;
    }
    private static long boundedLong(JsonNode node, long min, long max, String field) {
        try { long value = node.isNumber() ? node.longValue() : Long.parseLong(node.asText()); if (value < min || value > max) throw new NumberFormatException(); return value; }
        catch (RuntimeException ex) { throw new InvalidImport("OJ_RESULT_" + field.toUpperCase() + "_INVALID"); }
    }
    private static BigDecimal decimal(JsonNode node) {
        try { return new BigDecimal(node.asText()); } catch (RuntimeException ex) { throw new InvalidImport("OJ_RESULT_RANK_INVALID"); }
    }
    private static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException("SHA-256 is unavailable", ex); }
    }
    private record ImportJob(UUID id, UUID termId, String contestId, String contestUrl) { }
    private record TermDates(LocalDate startsOn, LocalDate endsOn) { }
    private record RosterMember(UUID memberId, String accountId, long identityCount, boolean conflict) { }
    private record MappedResult(UUID memberId, String sourceUserId, BigDecimal rank, int solved, long penalty) { }
    private static class InvalidImport extends RuntimeException { InvalidImport(String code) { super(code); } }
}
