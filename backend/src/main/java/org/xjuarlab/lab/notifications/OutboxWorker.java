package org.xjuarlab.lab.notifications;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.xjuarlab.lab.leave.ApprovalTokenCryptography;

@Component
public class OutboxWorker {
    private static final Logger log = LoggerFactory.getLogger(OutboxWorker.class);
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ApprovalTokenCryptography tokenCrypto;
    private final ObjectProvider<JavaMailSender> mailSender;
    private final String from;
    private final String frontendOrigin;
    private final int leaseSeconds;
    private final org.xjuarlab.lab.leave.LeaveAttachments attachments;

    public OutboxWorker(JdbcTemplate jdbc, ObjectMapper mapper, ApprovalTokenCryptography tokenCrypto, ObjectProvider<JavaMailSender> mailSender,
        @Value("${lab.mail.from:no-reply@localhost}") String from, @Value("${lab.frontend-origin}") String frontendOrigin,
        @Value("${lab.outbox.lease-seconds:60}") int leaseSeconds, org.xjuarlab.lab.leave.LeaveAttachments attachments) {
        this.jdbc=jdbc; this.mapper=mapper; this.tokenCrypto=tokenCrypto; this.mailSender=mailSender; this.from=from; this.frontendOrigin=frontendOrigin; this.leaseSeconds=leaseSeconds;
        this.attachments=attachments;
    }

    @Scheduled(fixedDelayString="${lab.outbox.poll-ms:5000}")
    public void dispatch() {
        String worker=UUID.randomUUID().toString();
        List<Event> events=jdbc.query("WITH pending AS (SELECT id FROM outbox_event WHERE event_type='NOTIFICATION_EMAIL' AND delivered_at IS NULL AND dead_lettered_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE outbox_event o SET lease_owner=?,lease_until=now()+(? * interval '1 second'),attempts=o.attempts+1 FROM pending p WHERE o.id=p.id RETURNING o.id,o.payload::text AS payload,o.attempts",
            (rs,row)->new Event((UUID)rs.getObject("id"),parse(rs.getString("payload")),rs.getInt("attempts")),worker,leaseSeconds);
        for(Event event:events) {
            try { String result=deliver(event); jdbc.update("UPDATE outbox_event SET delivered_at=now(),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?",result,event.id(),worker); }
            catch(Exception ex) { retry(event,worker,ex); }
        }
    }

    private String deliver(Event event) throws Exception {
        JsonNode payload=event.payload(); String notificationId=payload.path("notificationId").asText();
        var messageData=jdbc.query("SELECT n.kind,m.id,m.active,m.notification_email,m.notification_email_verified,m.display_name FROM notification n JOIN member m ON m.id=n.recipient_id WHERE n.id=?",
            (rs,row)->new MessageData(rs.getString("kind"),rs.getString("notification_email"),rs.getBoolean("notification_email_verified"),rs.getString("display_name"),rs.getObject("id",UUID.class),rs.getBoolean("active")),UUID.fromString(notificationId));
        if(messageData.isEmpty() || messageData.getFirst().email()==null || !messageData.getFirst().verified() || !messageData.getFirst().active()) {
            return "SUPPRESSED_NO_VERIFIED_RECIPIENT";
        }
        Boolean enabled=jdbc.queryForObject("SELECT mail_enabled FROM lab_setting WHERE singleton=true",Boolean.class);
        if(!Boolean.TRUE.equals(enabled)) return "SUPPRESSED_MAIL_DISABLED";
        JavaMailSender sender=mailSender.getIfAvailable();
        if(sender==null) throw new IllegalStateException("SMTP sender is not configured");
        MessageData data=messageData.getFirst();
        String link=frontendOrigin + "/app/leave";
        String encrypted=payload.path("approvalTokenCiphertext").asText("");
        if (data.kind().equals("LEAVE_PENDING")) {
            if (encrypted.isBlank()) return "SUPPRESSED_STALE_APPROVAL";
            String token = tokenCrypto.decrypt(encrypted);
            Integer valid = jdbc.queryForObject("SELECT count(*) FROM approval_token t JOIN leave_application l ON l.id=t.application_id WHERE t.token_hash=? AND t.application_id=? AND t.approver_id=? AND l.approver_id=t.approver_id AND l.member_id<>t.approver_id AND l.status='PENDING' AND t.consumed_at IS NULL AND t.expires_at>now() AND EXISTS (SELECT 1 FROM role_assignment r WHERE r.member_id=t.approver_id AND r.role IN ('LAB_ADMIN','SUPER_ADMIN') AND r.revoked_at IS NULL)", Integer.class, tokenCrypto.hash(token), UUID.fromString(payload.path("applicationId").asText()), data.recipientId());
            if (valid == null || valid == 0) return "SUPPRESSED_STALE_APPROVAL";
            link += "/email-action#token=" + token;
        }
        String summary = "";
        if (payload.hasNonNull("applicationId")) {
            var details = jdbc.query("SELECT m.display_name,l.starts_at,l.ends_at FROM leave_application l JOIN member m ON m.id=l.member_id WHERE l.id=?",
                (rs,row) -> "申请人：" + rs.getString(1) + "\n请假时间：" + date(rs.getObject(2,OffsetDateTime.class)) + " — " + date(rs.getObject(3,OffsetDateTime.class)), UUID.fromString(payload.path("applicationId").asText()));
            if (!details.isEmpty()) summary = details.getFirst();
        }
        var content = LabMailTemplate.render(frontendOrigin, subject(data.kind()), data.displayName(), body(data.kind()), summary, link, data.kind().equals("LEAVE_PENDING"));
        var mime = sender.createMimeMessage();
        var message = new MimeMessageHelper(mime, true, "UTF-8");
        message.setFrom(from, "算法与科研实验室"); message.setTo(data.email()); message.setSubject(subject(data.kind()));
        message.setText(content.text(), content.html());
        if(data.kind().equals("LEAVE_PENDING")) {
            UUID application=UUID.fromString(payload.path("applicationId").asText());
            for(var item:attachments.list(application)) {
                var file=attachments.read(application,item.id());
                message.addAttachment(file.filename(), new org.springframework.core.io.ByteArrayResource(file.content()));
            }
        }
        sender.send(mime);
        return null;
    }

    private void retry(Event event,String worker,Exception ex) {
        String safe=ex.getClass().getSimpleName();
        if(event.attempts()>=8) {
            jdbc.update("UPDATE outbox_event SET dead_lettered_at=now(),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?",safe,event.id(),worker);
            log.error("Outbox event moved to dead letter id={} attempts={} error={}",event.id(),event.attempts(),safe);
        } else {
            jdbc.update("UPDATE outbox_event SET available_at=now()+(LEAST(3600,10 * power(2,attempts)) * interval '1 second'),lease_owner=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_owner=?",safe,event.id(),worker);
            log.warn("Outbox event will retry id={} attempts={} error={}",event.id(),event.attempts(),safe);
        }
    }
    private JsonNode parse(String value) { try{return mapper.readTree(value);}catch(Exception ex){throw new IllegalStateException("Outbox payload is invalid");} }
    private static String subject(String kind) { return switch(kind) { case "LEAVE_PENDING" -> "实验室请假申请待处理"; case "LEAVE_APPROVED" -> "实验室请假申请已批准"; case "LEAVE_REJECTED" -> "实验室请假申请已驳回"; case "LEAVE_WITHDRAWN" -> "实验室请假申请已撤回"; case "LEAVE_REVOKED" -> "实验室请假审批已撤销"; default -> "实验室平台通知"; }; }
    private static String body(String kind) { return switch(kind) { case "LEAVE_PENDING" -> "您有一条新的请假申请待审批。"; case "LEAVE_APPROVED" -> "您的请假申请已批准。"; case "LEAVE_REJECTED" -> "您的请假申请已驳回，请登录平台查看处理说明。"; case "LEAVE_WITHDRAWN" -> "一条待审批的请假申请已撤回。"; case "LEAVE_REVOKED" -> "一条已批准的请假申请已由管理员撤销。"; default -> "您有一条新的平台通知。"; }; }
    private record Event(UUID id,JsonNode payload,int attempts) {}
    private static String date(OffsetDateTime time) { return time.atZoneSameInstant(java.time.ZoneId.of("Asia/Shanghai")).format(java.time.format.DateTimeFormatter.ofPattern("MM月dd日 HH:mm")); }
    private record MessageData(String kind,String email,boolean verified,String displayName,UUID recipientId,boolean active) {}
}
