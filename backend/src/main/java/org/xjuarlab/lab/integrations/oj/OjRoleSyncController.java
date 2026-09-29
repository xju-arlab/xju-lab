package org.xjuarlab.lab.integrations.oj;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/admin/members/{memberId}/oj-role-sync")
public class OjRoleSyncController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;

    public OjRoleSyncController(JdbcTemplate jdbc, CurrentMember current) { this.jdbc = jdbc; this.current = current; }

    @GetMapping
    public RoleSyncView status(Authentication auth, @PathVariable UUID memberId) {
        UUID actor = current.id(auth); current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN"); requireMember(memberId);
        List<RoleSyncView> rows = jdbc.query("SELECT s.member_id,s.desired,s.version,s.confirmed_version,s.status,s.last_error,s.confirmed_at FROM external_role_sync s WHERE s.member_id=?",
            (rs, row) -> new RoleSyncView((UUID) rs.getObject(1), rs.getBoolean(2), rs.getLong(3), rs.getLong(4), rs.getString(5), rs.getString(6), rs.getObject(7, OffsetDateTime.class)), memberId);
        return rows.isEmpty() ? new RoleSyncView(memberId, false, 0, 0, "NOT_REQUESTED", null, null) : rows.getFirst();
    }

    @PostMapping("/retry")
    @Transactional
    public RoleSyncView retry(Authentication auth, @PathVariable UUID memberId) {
        UUID actor = current.id(auth); current.requireRole(actor, "SUPER_ADMIN"); requireMember(memberId);
        List<Boolean> desiredRoles = jdbc.query("SELECT EXISTS(SELECT 1 FROM role_assignment r JOIN member m ON m.id=r.member_id WHERE r.member_id=? AND r.role='SUPER_ADMIN' AND r.revoked_at IS NULL AND m.active=true)",
            (rs, row) -> rs.getBoolean(1), memberId);
        boolean desired = !desiredRoles.isEmpty() && desiredRoles.getFirst();
        jdbc.update("INSERT INTO external_role_sync(member_id,desired,version,confirmed_version,status) VALUES (?,?,1,0,'PENDING') ON CONFLICT(member_id) DO UPDATE SET desired=excluded.desired,version=external_role_sync.version+1,status='PENDING',last_error=NULL,updated_at=now()",
            memberId, desired);
        Long version = jdbc.queryForObject("SELECT version FROM external_role_sync WHERE member_id=?", Long.class, memberId);
        jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('OJ_ADMIN_ROLE_SYNC',?,jsonb_build_object('memberId',?::text,'desired',?,'version',?))", memberId, memberId, desired, version);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'RETRY_OJ_ROLE_SYNC','member',?,jsonb_build_object('desired',?,'version',?))", actor, memberId.toString(), desired, version);
        return status(auth, memberId);
    }

    private void requireMember(UUID memberId) {
        if (jdbc.query("SELECT 1 FROM member WHERE id=?", (rs, row) -> rs.getInt(1), memberId).isEmpty()) throw new ResponseStatusException(NOT_FOUND, "成员不存在");
    }
    public record RoleSyncView(UUID memberId, boolean desiredAdmin, long version, long confirmedVersion, String status, String lastError, OffsetDateTime confirmedAt) { }
}
