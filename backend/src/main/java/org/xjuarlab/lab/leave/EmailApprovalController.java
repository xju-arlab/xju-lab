package org.xjuarlab.lab.leave;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/leaves/email-action")
public class EmailApprovalController {
    private final JdbcTemplate jdbc;
    private final ApprovalTokenCryptography crypto;
    private final LeaveController leaves;
    public EmailApprovalController(JdbcTemplate jdbc, ApprovalTokenCryptography crypto, LeaveController leaves) {
        this.jdbc=jdbc; this.crypto=crypto; this.leaves=leaves;
    }
    @ModelAttribute public void privateResponse(HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }
    @GetMapping public EmailApprovalPreview preview(@RequestParam(required=false) String token, HttpServletRequest request) {
        return readCapability(hash(token, request)).preview();
    }
    @PostMapping @Transactional public EmailApprovalPreview decide(@Valid @RequestBody EmailDecision input, HttpServletRequest request) {
        String hash = hash(input.token(), request);
        Capability capability = readCapability(hash);
        EmailApprovalPreview before = capability.preview();
        // Lock the application before tokens, like transfer/withdraw/station decisions.
        jdbc.queryForObject("SELECT id FROM leave_application WHERE id=? FOR UPDATE", UUID.class, before.applicationId());
        capability = readCapability(hash);
        before = capability.preview();
        if (input.token() == null && (input.applicationId() == null || input.version() == null))
            throw new ResponseStatusException(CONFLICT, "请重新打开邮件并确认申请内容");
        if ((input.applicationId() != null && !input.applicationId().equals(before.applicationId()))
                || (input.version() != null && input.version() != before.version()))
            throw new ResponseStatusException(CONFLICT, "申请或邮件链接已变化，请重新打开邮件");
        var leave = leaves.decideAs(capability.approverId(), before.applicationId(), new LeaveController.Decision(input.decision(), input.reason(), before.version()));
        if (request.getSession(false) != null) request.getSession().removeAttribute(EmailApprovalContextController.SESSION_KEY);
        return new EmailApprovalPreview(leave.id(), leave.memberId(), leave.memberName(), leave.startsAt(), leave.endsAt(), leave.reason(), leave.status(), leave.version());
    }
    private String hash(String raw, HttpServletRequest request) {
        if (raw != null && raw.matches("[A-Za-z0-9_-]{43}")) return crypto.hash(raw);
        if (raw == null && request.getSession(false) != null
                && request.getSession().getAttribute(EmailApprovalContextController.SESSION_KEY) instanceof String hash) return hash;
        throw hidden();
    }
    private Capability readCapability(String hash) {
        return jdbc.query("SELECT t.approver_id,t.application_id,l.member_id,m.display_name,l.starts_at,l.ends_at,l.reason,l.status,l.version FROM approval_token t JOIN leave_application l ON l.id=t.application_id JOIN member m ON m.id=l.member_id JOIN member a ON a.id=t.approver_id WHERE t.token_hash=? AND a.active=true AND EXISTS (SELECT 1 FROM role_assignment r WHERE r.member_id=a.id AND r.role IN ('LAB_ADMIN','SUPER_ADMIN') AND r.revoked_at IS NULL) AND l.approver_id=t.approver_id AND l.member_id<>t.approver_id AND l.status='PENDING' AND t.consumed_at IS NULL AND t.expires_at>now()",
            (rs,row) -> new Capability(rs.getObject("approver_id",UUID.class), new EmailApprovalPreview(rs.getObject("application_id",UUID.class),rs.getObject("member_id",UUID.class),rs.getString("display_name"),rs.getObject("starts_at",OffsetDateTime.class),rs.getObject("ends_at",OffsetDateTime.class),rs.getString("reason"),rs.getString("status"),rs.getLong("version"))), hash)
            .stream().findFirst().orElseThrow(EmailApprovalController::hidden);
    }
    private static ResponseStatusException hidden() { return new ResponseStatusException(NOT_FOUND,"审批链接已失效、申请已处理或审批权限已变更，请打开最新邮件或前往请假页面"); }
    private record Capability(UUID approverId, EmailApprovalPreview preview) {}
    public record EmailApprovalPreview(UUID applicationId, UUID memberId, String memberName, OffsetDateTime startsAt, OffsetDateTime endsAt, String reason, String status, long version) {}
    public record EmailDecision(@Size(max=100) String token, @NotBlank String decision, @Size(max=1000) String reason, UUID applicationId, Long version) {}
}
