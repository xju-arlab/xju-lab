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
        String displayName=jdbc.queryForObject("SELECT display_name FROM member WHERE id=?",String.class,id);
        return Map.of("authenticated", true, "memberId", id, "displayName", displayName,
            "roles", roles, "issuer", user.getIdToken().getIssuer().toString());
    }
}
