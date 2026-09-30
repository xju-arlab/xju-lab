package org.xjuarlab.lab.leave;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/leaves")
public class LeaveController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final ApprovalTokenCryptography tokenCrypto;
    private final LeaveAttachments attachments;

    public LeaveController(JdbcTemplate jdbc, CurrentMember current, ApprovalTokenCryptography tokenCrypto, LeaveAttachments attachments) {
        this.jdbc = jdbc;
        this.current = current;
        this.tokenCrypto = tokenCrypto;
        this.attachments = attachments;
    }

    @PostMapping(consumes="application/json")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    @Transactional
    public LeaveView create(Authentication auth, @Valid @RequestBody CreateLeave input) {
        UUID actor = current.id(auth);
        if (!input.startsAt().isBefore(input.endsAt())) throw new ResponseStatusException(BAD_REQUEST, "结束时间必须晚于开始时间");
        requireActiveMember(input.approverId());
        if (actor.equals(input.approverId())) throw new ResponseStatusException(BAD_REQUEST, "申请人不能审批自己的请假申请");
        UUID id = jdbc.queryForObject("INSERT INTO leave_application(member_id,approver_id,starts_at,ends_at,reason) VALUES (?,?,?,?,?) RETURNING id",
            UUID.class, actor, input.approverId(), input.startsAt(), input.endsAt(), input.reason().trim());
        jdbc.update("INSERT INTO leave_decision(application_id,actor_id,decision) VALUES (?,?,'SUBMITTED')", id, actor);
        audit(actor, "CREATE_LEAVE", id, null, "PENDING");
        ApprovalTokenCryptography.Issued token = issueApprovalToken(id, input.approverId());
        notify(input.approverId(), id, "LEAVE_PENDING", "PENDING", token.encrypted());
        return load(id);
    }

    @PostMapping(consumes="multipart/form-data")
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    @Transactional
    public LeaveView createWithAttachments(Authentication auth,
            @Valid @org.springframework.web.bind.annotation.RequestPart("application") CreateLeave input,
            @org.springframework.web.bind.annotation.RequestPart(value="files",required=false) List<org.springframework.web.multipart.MultipartFile> files) {
        current.id(auth);
        var uploads=attachments.validate(files);
        LeaveView leave=create(auth,input);
        attachments.save(leave.id(),uploads);
        return load(leave.id());
    }

    @GetMapping("/{id}/attachments/{attachmentId}")
    public org.springframework.http.ResponseEntity<byte[]> download(Authentication auth,@PathVariable UUID id,@PathVariable UUID attachmentId) {
        get(auth,id);
        var file=attachments.read(id,attachmentId);
        return org.springframework.http.ResponseEntity.ok()
            .contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
            .header("Content-Disposition",org.springframework.http.ContentDisposition.attachment().filename(file.filename(),java.nio.charset.StandardCharsets.UTF_8).build().toString())
            .header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff")
            .contentLength(file.content().length).body(file.content());
    }

    @GetMapping("/mine")
    public PageEnvelope<LeaveView> mine(Authentication auth, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize) {
        UUID actor = current.id(auth);
        return page("member_id", actor, page, pageSize);
    }

    @GetMapping("/inbox")
    public PageEnvelope<LeaveView> inbox(Authentication auth, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize) {
        UUID actor = current.id(auth);
        return page("approver_id", actor, page, pageSize);
    }

    @GetMapping("/{id}")
    public LeaveView get(Authentication auth, @PathVariable UUID id) {
        UUID actor = current.id(auth);
        LeaveView leave = load(id);
        if (!leave.memberId().equals(actor) && !leave.approverId().equals(actor) && !isAdmin(actor)) throw hidden();
        return leave;
    }

    @PostMapping("/{id}/decision")
    @Transactional
    public LeaveView decide(Authentication auth, @PathVariable UUID id, @Valid @RequestBody Decision input) {
        UUID actor = current.id(auth);
        LeaveView leave = lock(id);
        if (!"APPROVED".equals(input.decision()) && !"REJECTED".equals(input.decision())) throw new ResponseStatusException(BAD_REQUEST, "审批结果无效");
        if (!leave.approverId().equals(actor) || leave.memberId().equals(actor)) throw hidden();
        expectVersion(leave, input.version());
        if (!leave.status().equals("PENDING")) throw new ResponseStatusException(CONFLICT, "仅待审批申请可处理");
        if (input.decision().equals("REJECTED") && (input.reason() == null || input.reason().isBlank())) throw new ResponseStatusException(BAD_REQUEST, "驳回时请填写原因");
        transition(leave, actor, input.decision(), input.reason());
        notify(leave.memberId(), id, "LEAVE_" + input.decision(), input.decision());
        return load(id);
    }

    @PostMapping("/{id}/withdraw")
    @Transactional
    public LeaveView withdraw(Authentication auth, @PathVariable UUID id, @Valid @RequestBody VersionInput input) {
        UUID actor = current.id(auth);
        LeaveView leave = lock(id);
        if (!leave.memberId().equals(actor)) throw hidden();
        expectVersion(leave, input.version());
        if (!leave.status().equals("PENDING")) throw new ResponseStatusException(CONFLICT, "仅待审批申请可撤回");
        transition(leave, actor, "WITHDRAWN", null);
        notify(leave.approverId(), id, "LEAVE_WITHDRAWN", "WITHDRAWN");
        return load(id);
    }

    @PostMapping("/{id}/transfer")
    @Transactional
    public LeaveView transfer(Authentication auth, @PathVariable UUID id, @Valid @RequestBody Transfer input) {
        UUID actor = current.id(auth);
        current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        LeaveView leave = lock(id);
        expectVersion(leave, input.version());
        if (!leave.status().equals("PENDING")) throw new ResponseStatusException(CONFLICT, "仅待审批申请可转交");
        requireActiveMember(input.approverId());
        if (leave.memberId().equals(input.approverId())) throw new ResponseStatusException(BAD_REQUEST, "申请人不能审批自己的请假申请");
        jdbc.update("UPDATE leave_application SET approver_id=?,version=version+1,updated_at=now() WHERE id=? AND version=?", input.approverId(), id, input.version());
        jdbc.update("INSERT INTO leave_decision(application_id,actor_id,decision,reason) VALUES (?,?,'TRANSFERRED',?)", id, actor, input.reason());
        jdbc.update("UPDATE approval_token SET consumed_at=now() WHERE application_id=? AND consumed_at IS NULL", id);
        audit(actor, "TRANSFER_LEAVE", id, leave.approverId().toString(), input.approverId().toString());
        notify(leave.approverId(), id, "LEAVE_TRANSFERRED", "TRANSFERRED");
        ApprovalTokenCryptography.Issued token = issueApprovalToken(id, input.approverId());
        notify(input.approverId(), id, "LEAVE_PENDING", "PENDING", token.encrypted());
        return load(id);
    }

    @PostMapping("/{id}/revoke")
    @Transactional
    public LeaveView revoke(Authentication auth, @PathVariable UUID id, @Valid @RequestBody Revoke input) {
        UUID actor = current.id(auth);
        current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN");
        LeaveView leave = lock(id);
        expectVersion(leave, input.version());
        if (!leave.status().equals("APPROVED")) throw new ResponseStatusException(CONFLICT, "仅已批准申请可撤销");
        transition(leave, actor, "REVOKED", input.reason());
        notify(leave.memberId(), id, "LEAVE_REVOKED", "REVOKED");
        return load(id);
    }

    private PageEnvelope<LeaveView> page(String column, UUID actor, int page, int pageSize) {
        long offset = PageEnvelope.offset(page, pageSize);
        List<LeaveView> items = jdbc.query("SELECT l.id,l.member_id,m.display_name,l.approver_id,a.display_name AS approver_name,l.starts_at,l.ends_at,l.reason,l.status,l.version,l.created_at FROM leave_application l JOIN member m ON m.id=l.member_id JOIN member a ON a.id=l.approver_id WHERE l." + column + "=? ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?",
            (rs, row) -> row(rs), actor, pageSize, offset);
        Long total = jdbc.queryForObject("SELECT count(*) FROM leave_application WHERE " + column + "=?", Long.class, actor);
        return new PageEnvelope<>(items, total == null ? 0 : total, page, pageSize);
    }

    private LeaveView load(UUID id) {
        return jdbc.query("SELECT l.id,l.member_id,m.display_name,l.approver_id,a.display_name AS approver_name,l.starts_at,l.ends_at,l.reason,l.status,l.version,l.created_at FROM leave_application l JOIN member m ON m.id=l.member_id JOIN member a ON a.id=l.approver_id WHERE l.id=?",
            (rs, row) -> row(rs), id).stream().findFirst().orElseThrow(LeaveController::hidden);
    }

    private LeaveView lock(UUID id) {
        return jdbc.query("SELECT l.id,l.member_id,m.display_name,l.approver_id,a.display_name AS approver_name,l.starts_at,l.ends_at,l.reason,l.status,l.version,l.created_at FROM leave_application l JOIN member m ON m.id=l.member_id JOIN member a ON a.id=l.approver_id WHERE l.id=? FOR UPDATE OF l",
            (rs, row) -> row(rs), id).stream().findFirst().orElseThrow(LeaveController::hidden);
    }

    private LeaveView row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new LeaveView((UUID) rs.getObject("id"), (UUID) rs.getObject("member_id"), rs.getString("display_name"), (UUID) rs.getObject("approver_id"), rs.getString("approver_name"),
            rs.getObject("starts_at", OffsetDateTime.class), rs.getObject("ends_at", OffsetDateTime.class), rs.getString("reason"), rs.getString("status"), rs.getLong("version"), rs.getObject("created_at", OffsetDateTime.class), attachments.list(rs.getObject("id",UUID.class)));
    }

    private void transition(LeaveView leave, UUID actor, String status, String reason) {
        int changed = jdbc.update("UPDATE leave_application SET status=?,version=version+1,updated_at=now() WHERE id=? AND version=? AND status=?", status, leave.id(), leave.version(), leave.status());
        if (changed == 0) throw new ResponseStatusException(CONFLICT, "申请状态已变化，请刷新后重试");
        jdbc.update("INSERT INTO leave_decision(application_id,actor_id,decision,reason) VALUES (?,?,?,?)", leave.id(), actor, status, reason);
        audit(actor, "LEAVE_" + status, leave.id(), leave.status(), status);
    }

    private void notify(UUID recipient, UUID application, String kind, String status) {
        notify(recipient, application, kind, status, null);
    }

    private void notify(UUID recipient, UUID application, String kind, String status, String encryptedToken) {
        UUID notification = jdbc.queryForObject("INSERT INTO notification(recipient_id,kind,payload) VALUES (?, ?, jsonb_build_object('applicationId',?::text,'status',?)) RETURNING id", UUID.class, recipient, kind, application.toString(), status);
        jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('NOTIFICATION_EMAIL',?,jsonb_build_object('notificationId',?::text,'kind',?,'applicationId',?::text,'approvalTokenCiphertext',?::text))", recipient, notification.toString(), kind, application.toString(), encryptedToken);
    }

    private ApprovalTokenCryptography.Issued issueApprovalToken(UUID application, UUID approver) {
        ApprovalTokenCryptography.Issued token=tokenCrypto.issue();
        jdbc.update("INSERT INTO approval_token(application_id,approver_id,token_hash,expires_at) VALUES (?,?,?,now()+interval '72 hours')",application,approver,token.hash());
        return token;
    }

    private void audit(UUID actor, String action, UUID id, String before, String after) {
        if (before == null) {
            jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?,'leave_application',?,jsonb_build_object('value',?))", actor, action, id.toString(), after);
        } else {
            jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,before_summary,after_summary) VALUES (?,?,'leave_application',?,jsonb_build_object('value',?),jsonb_build_object('value',?))", actor, action, id.toString(), before, after);
        }
    }

    private void expectVersion(LeaveView leave, long expected) { if (leave.version() != expected) throw new ResponseStatusException(CONFLICT, "申请版本已变化，请刷新后重试"); }
    private void requireActiveMember(UUID id) { if (jdbc.query("SELECT 1 FROM member WHERE id=? AND active=true", (rs, row) -> rs.getInt(1), id).isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "审批人不存在或已停用"); }
    private boolean isAdmin(UUID id) { return current.roles(id).stream().anyMatch(r -> r.equals("LAB_ADMIN") || r.equals("SUPER_ADMIN")); }
    private static ResponseStatusException hidden() { return new ResponseStatusException(NOT_FOUND, "申请不存在或无权访问"); }

    public record LeaveView(UUID id, UUID memberId, String memberName, UUID approverId, String approverName, OffsetDateTime startsAt, OffsetDateTime endsAt, String reason, String status, long version, OffsetDateTime createdAt,List<LeaveAttachments.AttachmentView> attachments) {}
    public record CreateLeave(@NotNull OffsetDateTime startsAt, @NotNull OffsetDateTime endsAt, @NotNull UUID approverId, @NotBlank @Size(max=1000) String reason) {}
    public record Decision(@NotBlank String decision, @Size(max=1000) String reason, @NotNull Long version) {}
    public record VersionInput(@NotNull Long version) {}
    public record Transfer(@NotNull UUID approverId, @NotNull Long version, @NotBlank @Size(max=1000) String reason) {}
    public record Revoke(@NotNull Long version, @NotBlank @Size(max=1000) String reason) {}
}
