package org.xjuarlab.lab.integrations.oj;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OjRoleSyncWorker {
    private static final Logger log = LoggerFactory.getLogger(OjRoleSyncWorker.class);
    private final JdbcTemplate jdbc;
    private final OjIntegrationClient oj;
    private final ObjectMapper mapper;
    private final int leaseSeconds;

    public OjRoleSyncWorker(JdbcTemplate jdbc, OjIntegrationClient oj, ObjectMapper mapper,
            @org.springframework.beans.factory.annotation.Value("${lab.outbox.lease-seconds:60}") int leaseSeconds) {
        this.jdbc = jdbc; this.oj = oj; this.mapper = mapper; this.leaseSeconds = Math.max(15, leaseSeconds);
    }

    @Scheduled(fixedDelayString = "${lab.oj.role-sync-poll-ms:5000}")
    public void dispatch() {
        String owner = UUID.randomUUID().toString();
        List<Event> events = jdbc.query("WITH pending AS (SELECT id FROM outbox_event WHERE event_type='OJ_ADMIN_ROLE_SYNC' AND delivered_at IS NULL AND dead_lettered_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE outbox_event o SET lease_owner=?,lease_until=now()+(? * interval '1 second'),attempts=o.attempts+1 FROM pending p WHERE o.id=p.id RETURNING o.id,o.payload::text,o.attempts",
            (rs, row) -> new Event((UUID) rs.getObject(1), parse(rs.getString(2)), rs.getInt(3)), owner, leaseSeconds);
        for (Event event : events) process(owner, event);
    }

    private void process(String owner, Event event) {
        UUID memberId;
        long eventVersion;
        boolean enabled;
        try {
            memberId = UUID.fromString(event.payload().path("memberId").asText());
            eventVersion = event.payload().path("version").asLong(-1);
            if (eventVersion < 1 || !event.payload().path("desired").isBoolean()) throw new IllegalArgumentException();
            enabled = event.payload().path("desired").asBoolean();
        } catch (RuntimeException ex) {
            terminalFailure(owner, event, null, "OJ_ROLE_EVENT_INVALID"); return;
        }
        List<SyncTarget> targets = jdbc.query("SELECT s.version,s.desired,COALESCE(NULLIF(m.account_id,''),(SELECT x.account_id FROM external_identity x WHERE x.member_id=m.id AND x.account_id IS NOT NULL ORDER BY x.active DESC,x.created_at LIMIT 1)) account_id FROM external_role_sync s JOIN member m ON m.id=s.member_id WHERE s.member_id=?",
            (rs, row) -> new SyncTarget(rs.getLong(1), rs.getBoolean(2), rs.getString(3)), memberId);
        if (targets.isEmpty()) { acknowledge(owner, event, memberId, eventVersion, false, "MEMBER_NOT_FOUND"); return; }
        SyncTarget target = targets.getFirst();
        if (target.version() != eventVersion || target.desired() != enabled) { acknowledge(owner, event, memberId, eventVersion, false, "SUPERSEDED"); return; }
        if (target.accountId() == null || !target.accountId().matches("[0-9]{8}")) {
            jdbc.update("UPDATE external_role_sync SET status='WAITING_IDENTITY',last_error='OJ_ACCOUNT_ID_UNAVAILABLE',updated_at=now() WHERE member_id=? AND version=?", memberId, eventVersion);
            acknowledgeOutbox(owner, event.id(), "WAITING_IDENTITY"); return;
        }
        try {
            oj.setLabosAdmin(target.accountId(), event.id(), eventVersion, enabled);
            jdbc.update("UPDATE external_role_sync SET confirmed_version=?,status='SYNCED',last_error=NULL,confirmed_at=now(),updated_at=now() WHERE member_id=? AND version=? AND desired=?",
                eventVersion, memberId, eventVersion, enabled);
            acknowledgeOutbox(owner, event.id(), null);
        } catch (RuntimeException ex) {
            retry(owner, event, memberId, eventVersion, safeError(ex));
        }
    }

    private void acknowledge(String owner, Event event, UUID memberId, long version, boolean ignored, String reason) {
        jdbc.update("UPDATE external_role_sync SET last_error=?,updated_at=now() WHERE member_id=? AND version=?", reason, memberId, version);
        acknowledgeOutbox(owner, event.id(), reason);
    }
    private void acknowledgeOutbox(String owner, UUID id, String message) {
        jdbc.update("UPDATE outbox_event SET delivered_at=now(),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?", message, id, owner);
    }
    private void retry(String owner, Event event, UUID memberId, long version, String code) {
        if (event.attempts() >= 12) {
            jdbc.update("UPDATE external_role_sync SET status='FAILED',last_error=?,updated_at=now() WHERE member_id=? AND version=?", code, memberId, version);
            jdbc.update("UPDATE outbox_event SET dead_lettered_at=now(),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?", code, event.id(), owner);
            log.error("OJ role sync moved to dead letter member={} version={} error={}", memberId, version, code);
        } else {
            jdbc.update("UPDATE external_role_sync SET status='PENDING',last_error=?,updated_at=now() WHERE member_id=? AND version=?", code, memberId, version);
            jdbc.update("UPDATE outbox_event SET available_at=now()+(LEAST(3600,10 * power(2,attempts)) * interval '1 second'),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?", code, event.id(), owner);
            log.warn("OJ role sync will retry member={} version={} error={}", memberId, version, code);
        }
    }
    private void terminalFailure(String owner, Event event, UUID memberId, String code) {
        if (memberId != null) jdbc.update("UPDATE external_role_sync SET status='FAILED',last_error=?,updated_at=now() WHERE member_id=?", code, memberId);
        jdbc.update("UPDATE outbox_event SET dead_lettered_at=now(),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?", code, event.id(), owner);
    }
    private String safeError(RuntimeException ex) {
        return ex instanceof OjIntegrationClient.OjConnectorException connector ? connector.code() : "OJ_ROLE_SYNC_UNAVAILABLE";
    }
    private JsonNode parse(String value) { try { return mapper.readTree(value); } catch (Exception ex) { return mapper.createObjectNode(); } }
    private record Event(UUID id, JsonNode payload, int attempts) { }
    private record SyncTarget(long version, boolean desired, String accountId) { }
}
