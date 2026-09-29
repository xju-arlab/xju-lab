package org.xjuarlab.lab.integrations.oj;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/assessment/acm/imports")
public class OjImportController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final String publicOrigin;

    public OjImportController(JdbcTemplate jdbc, CurrentMember current,
            @Value("${lab.oj.public-origin:https://oj.icthub.top}") String publicOrigin) {
        this.jdbc = jdbc; this.current = current; this.publicOrigin = publicOrigin.replaceAll("/+$", "");
    }

    @PostMapping
    @Transactional
    public ResponseEntity<ImportView> submit(Authentication auth, @RequestHeader("Idempotency-Key") String key,
            @Valid @RequestBody ImportRequest request) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        if (key == null || !key.matches("[A-Za-z0-9._:-]{8,100}")) throw new ResponseStatusException(BAD_REQUEST, "幂等键无效");
        Source source = parseSource(request.sourceUrl());
        List<UUID> activeTerms = jdbc.query("SELECT id FROM training_term WHERE active=true", (rs, row) -> (UUID) rs.getObject(1));
        if (activeTerms.size() != 1) throw new ResponseStatusException(CONFLICT, "请先设置唯一的活动培养期");
        UUID termId = activeTerms.getFirst();
        var existing = jdbc.query("SELECT id,term_id,contest_id,status,result::text FROM assessment_import_job WHERE created_by=? AND term_id=? AND idempotency_key=?",
            (rs, row) -> new ImportView((UUID) rs.getObject(1), (UUID) rs.getObject(2), rs.getString(3), rs.getString(4), parseJson(rs.getString(5))), actor, termId, key);
        if (!existing.isEmpty()) {
            ImportView previous = existing.getFirst();
            if (!previous.contestId().equals(source.contestId())) throw new ResponseStatusException(CONFLICT, "幂等键已用于另一场比赛");
            return ResponseEntity.accepted().body(previous);
        }
        UUID id = jdbc.queryForObject("INSERT INTO assessment_import_job(term_id,contest_url,contest_id,status,created_by,idempotency_key) VALUES (?,?,?,'QUEUED',?,?) RETURNING id",
            UUID.class, termId, source.canonicalUrl(), source.contestId(), actor, key);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'QUEUE_OJ_IMPORT','assessment_import',?,jsonb_build_object('contestId',?,'termId',?::text))",
            actor, id.toString(), source.contestId(), termId);
        return ResponseEntity.accepted().body(new ImportView(id, termId, source.contestId(), "QUEUED", parseJson("{}")));
    }

    @GetMapping("/{importId}")
    public ImportView get(Authentication auth, @PathVariable UUID importId) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        return jdbc.query("SELECT id,term_id,contest_id,status,result::text FROM assessment_import_job WHERE id=?",
            (rs, row) -> new ImportView((UUID) rs.getObject(1), (UUID) rs.getObject(2), rs.getString(3), rs.getString(4), parseJson(rs.getString(5))), importId)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "导入任务不存在"));
    }

    private Source parseSource(String value) {
        try {
            URI uri = URI.create(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1
                    || uri.getHost() == null || !(publicOrigin.equalsIgnoreCase("https://" + uri.getHost()))) {
                throw new IllegalArgumentException();
            }
            var match = java.util.regex.Pattern.compile("^/contest/([1-9][0-9]{0,11})(?:/rank)?/?$").matcher(uri.getPath());
            if (!match.matches()) throw new IllegalArgumentException();
            String id = match.group(1);
            return new Source(id, publicOrigin + "/contest/" + id);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(BAD_REQUEST, "只接受已配置 OJ 站点的比赛链接");
        }
    }

    private JsonNode parseJson(String value) { try { return new com.fasterxml.jackson.databind.ObjectMapper().readTree(value); } catch (Exception ex) { return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode(); } }
    private record Source(String contestId, String canonicalUrl) { }
    public record ImportRequest(@NotBlank @Size(max=2048) String sourceUrl) { }
    public record ImportView(UUID id, UUID termId, String contestId, String status, JsonNode result) { }
}
