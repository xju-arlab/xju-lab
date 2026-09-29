package org.xjuarlab.lab.member;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.CONFLICT;

@RestController
@RequestMapping("/api/v1/lab/settings")
public class LabSettingsController {
    private final JdbcTemplate jdbc; private final CurrentMember current;
    public LabSettingsController(JdbcTemplate jdbc,CurrentMember current){this.jdbc=jdbc;this.current=current;}
    @GetMapping public Settings get(Authentication auth) { current.id(auth); return jdbc.queryForObject("SELECT name,location,timezone,description,mail_enabled,toner_alert_enabled,version FROM lab_setting WHERE singleton=true",(rs,row)->new Settings(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getBoolean(5),rs.getBoolean(6),rs.getLong(7))); }
    @PutMapping public Settings put(Authentication auth,@RequestHeader("If-Match-Version") long version,@Valid @RequestBody SettingsUpdate value){
        UUID actor=current.id(auth); current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");
        try { ZoneId.of(value.timezone()); } catch (RuntimeException e) { throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"业务时区无效"); }
        int updated=jdbc.update("UPDATE lab_setting SET name=?,location=?,timezone=?,description=?,mail_enabled=?,toner_alert_enabled=?,version=version+1,updated_at=now() WHERE singleton=true AND version=?",value.name().trim(),value.location().trim(),value.timezone(),value.description()==null?"":value.description().trim(),value.mailEnabled(),value.tonerAlertEnabled(),version);
        if(updated==0) throw new ResponseStatusException(CONFLICT,"设置版本已变化，请刷新后重试");
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'UPDATE_LAB_SETTINGS','lab','settings',jsonb_build_object('version',?))",actor,version+1);
        return get(auth);
    }
    public record Settings(String name,String location,String timezone,String description,boolean mailEnabled,boolean tonerAlertEnabled,long version){}
    public record SettingsUpdate(@NotBlank @Size(max=120) String name,@NotBlank @Size(max=160) String location,@NotBlank String timezone,@Size(max=2000) String description,boolean mailEnabled,boolean tonerAlertEnabled){}
}
