package org.xjuarlab.lab.notifications;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final JdbcTemplate jdbc; private final CurrentMember current; private final ObjectMapper mapper;
    public NotificationController(JdbcTemplate jdbc, CurrentMember current, ObjectMapper mapper) { this.jdbc=jdbc; this.current=current; this.mapper=mapper; }
    @GetMapping public PageEnvelope<NotificationView> list(Authentication auth, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize) {
        UUID actor=current.id(auth); long offset=PageEnvelope.offset(page,pageSize);
        List<NotificationView> items=jdbc.query("SELECT id,kind,payload::text AS payload,read_at,created_at FROM notification WHERE recipient_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",(rs,row)->new NotificationView((UUID)rs.getObject("id"),rs.getString("kind"),parse(rs.getString("payload")),rs.getObject("read_at",OffsetDateTime.class),rs.getObject("created_at",OffsetDateTime.class)),actor,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM notification WHERE recipient_id=?",Long.class,actor);
        return new PageEnvelope<>(items,total==null?0:total,page,pageSize);
    }
    @PutMapping("/{id}/read") @Transactional public NotificationView markRead(Authentication auth,@PathVariable UUID id) {
        UUID actor=current.id(auth); int changed=jdbc.update("UPDATE notification SET read_at=coalesce(read_at,now()) WHERE id=? AND recipient_id=?",id,actor);
        if(changed==0)throw new ResponseStatusException(NOT_FOUND,"通知不存在或无权访问");
        return jdbc.queryForObject("SELECT id,kind,payload::text AS payload,read_at,created_at FROM notification WHERE id=? AND recipient_id=?",(rs,row)->new NotificationView((UUID)rs.getObject("id"),rs.getString("kind"),parse(rs.getString("payload")),rs.getObject("read_at",OffsetDateTime.class),rs.getObject("created_at",OffsetDateTime.class)),id,actor);
    }
    private JsonNode parse(String value){try{return mapper.readTree(value);}catch(Exception ex){throw new IllegalStateException("Stored notification payload is invalid");}}
    public record NotificationView(UUID id,String kind,JsonNode payload,OffsetDateTime readAt,OffsetDateTime createdAt) {}
}
