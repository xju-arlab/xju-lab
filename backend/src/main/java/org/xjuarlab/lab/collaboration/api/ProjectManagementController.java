package org.xjuarlab.lab.collaboration.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.FORBIDDEN;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.NO_CONTENT;

@RestController
@RequestMapping("/api/v1/projects/{projectId}")
public class ProjectManagementController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;

    public ProjectManagementController(JdbcTemplate jdbc, CurrentMember current) {
        this.jdbc = jdbc;
        this.current = current;
    }

    @PatchMapping
    @Transactional
    public ProjectState update(Authentication auth, @PathVariable UUID projectId,
            @RequestHeader("If-Match-Version") long version, @Valid @RequestBody ProjectUpdate input) {
        UUID actor = current.id(auth);
        requireManager(projectId, actor);
        if (!List.of("ACTIVE", "ARCHIVED").contains(input.status())) throw new ResponseStatusException(BAD_REQUEST, "项目状态无效");
        int changed = jdbc.update("UPDATE project SET title=?,description=?,status=?,version=version+1,updated_at=now() WHERE id=? AND version=?",
                input.title().trim(), input.description() == null ? "" : input.description().trim(), input.status(), projectId, version);
        if (changed == 0) throw new ResponseStatusException(CONFLICT, "项目已变化，请刷新后重试");
        audit(actor, "UPDATE_PROJECT", projectId, input.status());
        return project(projectId);
    }

    @GetMapping("/members")
    public List<ProjectMemberView> members(Authentication auth, @PathVariable UUID projectId) {
        UUID actor = current.id(auth); requireProjectMember(projectId, actor);
        return jdbc.query("SELECT pm.member_id,m.display_name,m.direction,m.cohort,pm.role FROM project_member pm JOIN member m ON m.id=pm.member_id WHERE pm.project_id=? AND m.active=true ORDER BY pm.role DESC,m.display_name,pm.member_id",
                (rs, row) -> new ProjectMemberView((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getObject(4, Integer.class), rs.getString(5)), projectId);
    }

    @PutMapping("/members/{memberId}")
    @Transactional
    public ProjectMemberView addMember(Authentication auth, @PathVariable UUID projectId, @PathVariable UUID memberId,
            @Valid @RequestBody ProjectMemberInput input) {
        UUID actor = current.id(auth); requireManager(projectId, actor);
        if (!"MEMBER".equals(input.role())) throw new ResponseStatusException(BAD_REQUEST, "新成员角色只能是 MEMBER");
        if (jdbc.query("SELECT 1 FROM member WHERE id=? AND active=true", (rs, row) -> rs.getInt(1), memberId).isEmpty())
            throw new ResponseStatusException(BAD_REQUEST, "成员不存在或已停用");
        jdbc.update("INSERT INTO project_member(project_id,member_id,role) VALUES (?,?,'MEMBER') ON CONFLICT(project_id,member_id) DO NOTHING", projectId, memberId);
        audit(actor, "ADD_PROJECT_MEMBER", projectId, memberId.toString());
        return jdbc.query("SELECT pm.member_id,m.display_name,m.direction,m.cohort,pm.role FROM project_member pm JOIN member m ON m.id=pm.member_id WHERE pm.project_id=? AND pm.member_id=?",
                (rs, row) -> new ProjectMemberView((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getObject(4, Integer.class), rs.getString(5)), projectId, memberId)
                .stream().findFirst().orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "项目成员不存在"));
    }

    @DeleteMapping("/members/{memberId}")
    @ResponseStatus(NO_CONTENT)
    @Transactional
    public void removeMember(Authentication auth, @PathVariable UUID projectId, @PathVariable UUID memberId) {
        UUID actor = current.id(auth); requireManager(projectId, actor);
        UUID lead = jdbc.query("SELECT lead_id FROM project WHERE id=?", (rs, row) -> (UUID) rs.getObject(1), projectId).stream().findFirst().orElseThrow(ProjectManagementController::hidden);
        if (lead.equals(memberId)) throw new ResponseStatusException(CONFLICT, "项目负责人不能从项目成员中移除");
        int removed = jdbc.update("DELETE FROM project_member WHERE project_id=? AND member_id=?", projectId, memberId);
        if (removed == 0) throw hidden();
        audit(actor, "REMOVE_PROJECT_MEMBER", projectId, memberId.toString());
    }

    @GetMapping("/milestones")
    public List<MilestoneView> milestones(Authentication auth, @PathVariable UUID projectId) {
        UUID actor = current.id(auth); requireProjectMember(projectId, actor);
        return jdbc.query("SELECT id,project_id,title,due_date,completed_at,version FROM milestone WHERE project_id=? ORDER BY due_date NULLS LAST,id",
                (rs, row) -> milestoneRow(rs), projectId);
    }

    @PostMapping("/milestones")
    @Transactional
    public MilestoneView createMilestone(Authentication auth, @PathVariable UUID projectId, @Valid @RequestBody MilestoneInput input) {
        UUID actor = current.id(auth); requireManager(projectId, actor);
        UUID id = jdbc.queryForObject("INSERT INTO milestone(project_id,title,due_date) VALUES (?,?,?) RETURNING id", UUID.class, projectId, input.title().trim(), input.dueDate());
        audit(actor, "CREATE_PROJECT_MILESTONE", id, projectId.toString());
        return jdbc.queryForObject("SELECT id,project_id,title,due_date,completed_at,version FROM milestone WHERE id=?", (rs, row) -> milestoneRow(rs), id);
    }

    @PatchMapping("/milestones/{milestoneId}")
    @Transactional
    public MilestoneView updateMilestone(Authentication auth, @PathVariable UUID projectId, @PathVariable UUID milestoneId,
            @RequestHeader("If-Match-Version") long version, @Valid @RequestBody MilestoneUpdate input) {
        UUID actor = current.id(auth); requireManager(projectId, actor);
        int changed = jdbc.update("UPDATE milestone SET title=?,due_date=?,completed_at=CASE WHEN ? THEN COALESCE(completed_at,now()) ELSE NULL END,version=version+1 WHERE id=? AND project_id=? AND version=?",
                input.title().trim(), input.dueDate(), input.completed(), milestoneId, projectId, version);
        if (changed == 0) throw new ResponseStatusException(CONFLICT, "里程碑已变化或不存在，请刷新后重试");
        audit(actor, "UPDATE_PROJECT_MILESTONE", milestoneId, input.completed());
        return jdbc.queryForObject("SELECT id,project_id,title,due_date,completed_at,version FROM milestone WHERE id=?", (rs, row) -> milestoneRow(rs), milestoneId);
    }

    private MilestoneView milestoneRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new MilestoneView((UUID) rs.getObject("id"), (UUID) rs.getObject("project_id"), rs.getString("title"),
                rs.getObject("due_date", LocalDate.class), rs.getObject("completed_at", OffsetDateTime.class), rs.getLong("version"));
    }
    private ProjectState project(UUID id) {
        return jdbc.query("SELECT id,title,description,status,lead_id,version FROM project WHERE id=?",
                (rs, row) -> new ProjectState((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4), (UUID) rs.getObject(5), rs.getLong(6)), id)
                .stream().findFirst().orElseThrow(ProjectManagementController::hidden);
    }
    private void requireProjectMember(UUID projectId, UUID actor) {
        if (jdbc.query("SELECT 1 FROM project p JOIN project_member pm ON pm.project_id=p.id WHERE p.id=? AND pm.member_id=? AND p.status='ACTIVE'", (rs, row) -> rs.getInt(1), projectId, actor).isEmpty()) throw hidden();
    }
    private void requireManager(UUID projectId, UUID actor) {
        boolean admin = current.roles(actor).stream().anyMatch(role -> role.equals("LAB_ADMIN") || role.equals("SUPER_ADMIN"));
        if (jdbc.query("SELECT 1 FROM project WHERE id=? AND lead_id=? AND status='ACTIVE'", (rs, row) -> rs.getInt(1), projectId, actor).isEmpty() && !admin) throw hidden();
        if (jdbc.query("SELECT 1 FROM project WHERE id=? AND status='ACTIVE'", (rs, row) -> rs.getInt(1), projectId).isEmpty()) throw hidden();
    }
    private void audit(UUID actor, String action, UUID target, Object after) {
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?, 'project',?,jsonb_build_object('value',?::text))", actor, action, target.toString(), String.valueOf(after));
    }
    private static ResponseStatusException hidden() { return new ResponseStatusException(NOT_FOUND, "项目不存在或无权访问"); }

    public record ProjectState(UUID id, String title, String description, String status, UUID leadId, long version) { }
    public record ProjectMemberView(UUID memberId, String displayName, String direction, Integer cohort, String role) { }
    public record MilestoneView(UUID id, UUID projectId, String title, LocalDate dueDate, OffsetDateTime completedAt, long version) { }
    public record ProjectUpdate(@NotBlank @Size(max=160) String title, @Size(max=5000) String description, @NotBlank String status) { }
    public record ProjectMemberInput(@NotBlank String role) { }
    public record MilestoneInput(@NotBlank @Size(max=200) String title, LocalDate dueDate) { }
    public record MilestoneUpdate(@NotBlank @Size(max=200) String title, LocalDate dueDate, boolean completed) { }
}
