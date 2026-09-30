package org.xjuarlab.lab.member;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/admin/members")
public class AdminMemberController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;

    public AdminMemberController(JdbcTemplate jdbc, CurrentMember current) {
        this.jdbc = jdbc;
        this.current = current;
    }

    @GetMapping
    public List<AdminMemberView> list(Authentication auth) {
        UUID actor = current.id(auth);
        current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        return jdbc.query("""
                SELECT m.id,m.account_id,m.display_name,m.real_name,m.student_number,m.class_name,m.contact,m.cohort,m.active,m.version,
                       COALESCE(string_agg(DISTINCT r.role, ',' ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '') AS roles,
                       s.desired,s.version AS sync_version,s.confirmed_version,s.status AS sync_status,
                       s.last_error,s.confirmed_at
                FROM member m
                LEFT JOIN role_assignment r ON r.member_id=m.id AND r.revoked_at IS NULL
                LEFT JOIN external_role_sync s ON s.member_id=m.id
                GROUP BY m.id,s.desired,s.version,s.confirmed_version,s.status,s.last_error,s.confirmed_at
                ORDER BY m.active DESC,m.display_name,m.id
                """, (rs, row) -> new AdminMemberView((UUID) rs.getObject("id"), rs.getString("account_id"),
                rs.getString("display_name"), rs.getString("real_name"), rs.getString("student_number"), rs.getString("class_name"), rs.getString("contact"),
                rs.getObject("cohort", Integer.class), rs.getBoolean("active"), rs.getLong("version"),
                parseRoles(rs.getString("roles")), (Boolean) rs.getObject("desired"), rs.getObject("sync_version", Long.class),
                rs.getObject("confirmed_version", Long.class), rs.getString("sync_status"), rs.getString("last_error"),
                rs.getObject("confirmed_at", OffsetDateTime.class)));
    }

    @PatchMapping("/{memberId}/identity") @Transactional
    public AdminMemberView updateIdentity(Authentication auth, @PathVariable UUID memberId,
            @RequestHeader("If-Match-Version") long version, @Valid @RequestBody IdentityUpdate input) {
        UUID actor = current.id(auth);
        current.requireRole(actor, "SUPER_ADMIN");
        String realName = input.realName().trim();
        String studentNumber = input.studentNumber().trim();
        int changed = jdbc.update("UPDATE member SET real_name=?,display_name=?,student_number=?,version=version+1,updated_at=now() WHERE id=? AND version=?",
                realName, realName, studentNumber, memberId, version);
        if (changed == 0) {
            if (jdbc.query("SELECT 1 FROM member WHERE id=?", (rs,row) -> rs.getInt(1), memberId).isEmpty()) throw new ResponseStatusException(NOT_FOUND,"成员不存在");
            throw new ResponseStatusException(CONFLICT,"成员版本已变化，请刷新后重试");
        }
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'UPDATE_MEMBER_IDENTITY','member',?,jsonb_build_object('realNameChanged',true,'studentNumberChanged',true))",
                actor, memberId.toString());
        return list(auth).stream().filter(member -> member.id().equals(memberId)).findFirst().orElseThrow();
    }

    private static List<String> parseRoles(String value) {
        return value == null || value.isBlank() ? List.of() : Arrays.asList(value.split(","));
    }

    public record IdentityUpdate(@NotBlank @Size(max=80) String realName,@NotBlank @Size(max=32) String studentNumber) { }
    public record AdminMemberView(UUID id, String accountId, String displayName, String realName, String studentNumber, String className, String contact,
            Integer cohort, boolean active, long version, List<String> roles, Boolean ojAdminDesired,
            Long ojSyncVersion, Long ojConfirmedVersion, String ojSyncStatus, String ojLastError,
            OffsetDateTime ojConfirmedAt) { }
}
