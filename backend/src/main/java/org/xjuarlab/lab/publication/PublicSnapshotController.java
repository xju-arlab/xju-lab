package org.xjuarlab.lab.publication;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;

@RestController
@RequestMapping("/api/v1")
public class PublicSnapshotController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final ObjectMapper mapper;

    public PublicSnapshotController(JdbcTemplate jdbc, CurrentMember current, ObjectMapper mapper) {
        this.jdbc = jdbc; this.current = current; this.mapper = mapper;
    }

    @GetMapping("/public/snapshot")
    public PublicSnapshot latest() {
        List<PublicSnapshot> snapshots = jdbc.query("SELECT version,payload::text,published_at,withdrawn_at FROM published_snapshot ORDER BY version DESC LIMIT 1",
            (rs, row) -> new PublicSnapshot(rs.getLong(1), parse(rs.getString(2)), rs.getObject(3, OffsetDateTime.class), rs.getObject(4, OffsetDateTime.class) == null));
        if (snapshots.isEmpty() || !snapshots.getFirst().isPublished()) return new PublicSnapshot(0, mapper.createObjectNode(), null, false);
        return snapshots.getFirst();
    }

    @PostMapping("/admin/public/snapshot")
    @Transactional
    public PublicSnapshot publish(Authentication auth, @Valid @RequestBody PublishRequest request) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        String payload = write(safePayload(request));
        Long version = jdbc.queryForObject("SELECT COALESCE(max(version),0)+1 FROM published_snapshot", Long.class);
        UUID id = jdbc.queryForObject("INSERT INTO published_snapshot(version,payload,published_by) VALUES (?,?::jsonb,?) RETURNING id", UUID.class, version, payload, actor);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'PUBLISH_PUBLIC_SNAPSHOT','publication',?,jsonb_build_object('version',?))", actor, id.toString(), version);
        return new PublicSnapshot(version, parse(payload), OffsetDateTime.now(), true);
    }

    @GetMapping("/admin/public/draft")
    public DraftView draft(Authentication auth) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        List<DraftView> drafts = jdbc.query("SELECT version,content::text,updated_at FROM content_draft WHERE kind='PUBLIC' AND slug='home'",
            (rs, row) -> new DraftView(rs.getLong(1), parse(rs.getString(2)), rs.getObject(3, OffsetDateTime.class)));
        if (!drafts.isEmpty()) return drafts.getFirst();
        JsonNode initial = jdbc.queryForObject("SELECT jsonb_build_object('labName',name,'description',description,'projects','[]'::jsonb)::text FROM lab_setting WHERE singleton=true",
            (rs, row) -> parse(rs.getString(1)));
        return new DraftView(0, initial, null);
    }

    @PutMapping("/admin/public/draft")
    @Transactional
    public DraftView saveDraft(Authentication auth, @RequestHeader("If-Match-Version") long expectedVersion, @Valid @RequestBody PublishRequest request) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        String payload = write(safePayload(request));
        List<Long> currentVersions = jdbc.query("SELECT version FROM content_draft WHERE kind='PUBLIC' AND slug='home' FOR UPDATE", (rs, row) -> rs.getLong(1));
        long nextVersion;
        if (currentVersions.isEmpty()) {
            if (expectedVersion != 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "公开草稿已变化，请刷新后重试");
            nextVersion = 1;
            jdbc.update("INSERT INTO content_draft(kind,slug,content,version,updated_by) VALUES ('PUBLIC','home',?::jsonb,?,?)", payload, nextVersion, actor);
        } else {
            long currentVersion = currentVersions.getFirst();
            if (currentVersion != expectedVersion) throw new ResponseStatusException(HttpStatus.CONFLICT, "公开草稿已变化，请刷新后重试");
            nextVersion = currentVersion + 1;
            int updated = jdbc.update("UPDATE content_draft SET content=?::jsonb,version=?,updated_by=?,updated_at=now() WHERE kind='PUBLIC' AND slug='home' AND version=?", payload, nextVersion, actor, expectedVersion);
            if (updated == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "公开草稿已变化，请刷新后重试");
        }
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'SAVE_PUBLIC_DRAFT','publication','home',jsonb_build_object('version',?))", actor, nextVersion);
        return new DraftView(nextVersion, parse(payload), OffsetDateTime.now());
    }

    @PostMapping("/admin/public/snapshot/withdraw")
    @Transactional
    public PublicSnapshot withdraw(Authentication auth) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        List<UUID> ids = jdbc.query("SELECT id FROM published_snapshot ORDER BY version DESC LIMIT 1 FOR UPDATE", (rs, row) -> (UUID) rs.getObject(1));
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "没有已发布内容");
        UUID id = ids.getFirst();
        jdbc.update("UPDATE published_snapshot SET withdrawn_at=now() WHERE id=? AND withdrawn_at IS NULL", id);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'WITHDRAW_PUBLIC_SNAPSHOT','publication',?)", actor, id.toString());
        return latest();
    }

    private JsonNode parse(String value) { try { return mapper.readTree(value); } catch (Exception ex) { throw new IllegalStateException("Stored public snapshot is invalid", ex); } }
    private String write(Object value) { try { return mapper.writeValueAsString(value); } catch (Exception ex) { throw new IllegalStateException("Public snapshot could not be encoded", ex); } }
    private Map<String, Object> safePayload(PublishRequest request) {
        List<PublicProject> projects = request.projects() == null ? List.of() : request.projects();
        if (projects.size() > 12) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "公开项目最多 12 个");
        List<Map<String, String>> safeProjects = projects.stream().map(project -> {
            if (project.title() == null || project.title().isBlank() || project.title().length() > 120 || project.summary() != null && project.summary().length() > 500)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "公开项目标题或简介长度无效");
            return Map.of("title", project.title().trim(), "summary", project.summary() == null ? "" : project.summary().trim());
        }).toList();
        return Map.of("labName", request.labName().trim(), "description", request.description() == null ? "" : request.description().trim(), "projects", safeProjects);
    }

    public record PublicSnapshot(long version, JsonNode payload, OffsetDateTime publishedAt, boolean isPublished) { }
    public record DraftView(long version, JsonNode payload, OffsetDateTime updatedAt) { }
    public record PublishRequest(@NotBlank @Size(max=120) String labName, @Size(max=2000) String description, List<PublicProject> projects) { }
    public record PublicProject(String title, String summary) { }
}
