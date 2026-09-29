package org.xjuarlab.lab.leave;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/leaves/email-action")
public class EmailApprovalController {
    private final JdbcTemplate jdbc; private final CurrentMember current; private final ApprovalTokenCryptography crypto;
    public EmailApprovalController(JdbcTemplate jdbc,CurrentMember current,ApprovalTokenCryptography crypto){this.jdbc=jdbc;this.current=current;this.crypto=crypto;}

    @GetMapping public EmailApprovalPreview preview(Authentication auth,@RequestParam String token){
        UUID actor=current.id(auth); return readPreview(token,actor);
    }

    @PostMapping @Transactional public EmailApprovalPreview decide(Authentication auth,@Valid @RequestBody EmailDecision input){
        UUID actor=current.id(auth); EmailApprovalPreview before=readPreview(input.token(),actor); TokenRow token=lockToken(input.token());
        if(!token.approverId().equals(actor))throw hidden();
        LeaveRow leave=lockLeave(token.applicationId());
        if(!leave.status().equals("PENDING"))throw new ResponseStatusException(CONFLICT,"申请已经处理");
        if(!"APPROVED".equals(input.decision())&& !"REJECTED".equals(input.decision()))throw new ResponseStatusException(BAD_REQUEST,"审批结果无效");
        if("REJECTED".equals(input.decision())&&(input.reason()==null||input.reason().isBlank()))throw new ResponseStatusException(BAD_REQUEST,"驳回时请填写原因");
        int changed=jdbc.update("UPDATE leave_application SET status=?,version=version+1,updated_at=now() WHERE id=? AND status='PENDING' AND version=?",input.decision(),leave.id(),leave.version());
        if(changed==0)throw new ResponseStatusException(CONFLICT,"申请状态已变化");
        jdbc.update("UPDATE approval_token SET consumed_at=now() WHERE id=? AND consumed_at IS NULL",token.id());
        jdbc.update("INSERT INTO leave_decision(application_id,actor_id,decision,reason) VALUES (?,?,?,?)",leave.id(),actor,input.decision(),input.reason());
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,before_summary,after_summary) VALUES (?,?,'leave_application',?,jsonb_build_object('value','PENDING'),jsonb_build_object('value',?))",actor,"EMAIL_LEAVE_"+input.decision(),leave.id().toString(),input.decision());
        notify(leave.memberId(),leave.id(),"LEAVE_"+input.decision(),input.decision());
        return new EmailApprovalPreview(before.applicationId(),before.memberId(),before.memberName(),before.startsAt(),before.endsAt(),before.reason(),input.decision(),before.version()+1);
    }

    private EmailApprovalPreview readPreview(String raw,UUID actor){
        String hash=crypto.hash(raw);
        return jdbc.query("SELECT t.application_id,l.member_id,m.display_name,l.starts_at,l.ends_at,l.reason,l.status,l.version FROM approval_token t JOIN leave_application l ON l.id=t.application_id JOIN member m ON m.id=l.member_id WHERE t.token_hash=? AND t.approver_id=? AND t.consumed_at IS NULL AND t.expires_at>now()",
            (rs,row)->new EmailApprovalPreview((UUID)rs.getObject("application_id"),(UUID)rs.getObject("member_id"),rs.getString("display_name"),rs.getObject("starts_at",OffsetDateTime.class),rs.getObject("ends_at",OffsetDateTime.class),rs.getString("reason"),rs.getString("status"),rs.getLong("version")),hash,actor).stream().findFirst().orElseThrow(EmailApprovalController::hidden);
    }
    private TokenRow lockToken(String raw){
        String hash=crypto.hash(raw);
        return jdbc.query("SELECT id,application_id,approver_id FROM approval_token WHERE token_hash=? AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",(rs,row)->new TokenRow((UUID)rs.getObject(1),(UUID)rs.getObject(2),(UUID)rs.getObject(3)),hash).stream().findFirst().orElseThrow(EmailApprovalController::hidden);
    }
    private LeaveRow lockLeave(UUID id){return jdbc.query("SELECT id,member_id,status,version FROM leave_application WHERE id=? FOR UPDATE",(rs,row)->new LeaveRow((UUID)rs.getObject(1),(UUID)rs.getObject(2),rs.getString(3),rs.getLong(4)),id).stream().findFirst().orElseThrow(EmailApprovalController::hidden);}
    private void notify(UUID recipient,UUID application,String kind,String status){
        UUID notification=jdbc.queryForObject("INSERT INTO notification(recipient_id,kind,payload) VALUES (?, ?, jsonb_build_object('applicationId',?::text,'status',?)) RETURNING id",UUID.class,recipient,kind,application.toString(),status);
        jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('NOTIFICATION_EMAIL',?,jsonb_build_object('notificationId',?::text,'kind',?,'applicationId',?::text))",recipient,notification.toString(),kind,application.toString());
    }
    private static ResponseStatusException hidden(){return new ResponseStatusException(NOT_FOUND,"审批链接不存在、已过期或无权使用");}
    private record TokenRow(UUID id,UUID applicationId,UUID approverId){}
    private record LeaveRow(UUID id,UUID memberId,String status,long version){}
    public record EmailApprovalPreview(UUID applicationId,UUID memberId,String memberName,OffsetDateTime startsAt,OffsetDateTime endsAt,String reason,String status,long version){}
    public record EmailDecision(@NotBlank @Size(max=100) String token,@NotBlank String decision,@Size(max=1000) String reason){}
}
