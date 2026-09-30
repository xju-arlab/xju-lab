package org.xjuarlab.lab.api;

import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.xjuarlab.lab.security.CurrentMember;

@RestController
@RequestMapping("/api/v1")
public class SessionController {
    private final CurrentMember current;
    private final JdbcTemplate jdbc;
    public SessionController(CurrentMember current,JdbcTemplate jdbc) { this.current = current; this.jdbc=jdbc; }
    @GetMapping("/session") public Map<String,Object> session(Authentication auth) {
        var user = (OidcUser) auth.getPrincipal(); var id = current.id(auth); var roles = current.roles(id);
        var details=jdbc.queryForObject("SELECT display_name,(real_name IS NOT NULL AND student_number IS NOT NULL AND class_name IS NOT NULL AND jsonb_array_length(directions)>0) AS registration_complete FROM member WHERE id=? AND active=true",
            (rs,row)->Map.entry(rs.getString("display_name"),rs.getBoolean("registration_complete")),id);
        String displayName=details.getKey();
        return Map.of("authenticated", true, "memberId", id, "displayName", displayName,
            "roles", roles, "issuer", user.getIdToken().getIssuer().toString(), "registrationComplete", details.getValue());
    }
}
