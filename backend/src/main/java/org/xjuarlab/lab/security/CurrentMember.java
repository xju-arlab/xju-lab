package org.xjuarlab.lab.security;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.FORBIDDEN;

@Component
public class CurrentMember {
    private final JdbcTemplate jdbc;
    public CurrentMember(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public UUID id(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof OidcUser user)) throw new ResponseStatusException(FORBIDDEN, "需要有效的实验室身份");
        List<UUID> found = jdbc.query("SELECT m.id FROM external_identity x JOIN member m ON m.id=x.member_id WHERE x.issuer=? AND x.subject=? AND x.active=true AND m.active=true",
            (rs, row) -> (UUID) rs.getObject(1), user.getIdToken().getIssuer().toString(), user.getIdToken().getSubject());
        if (found.isEmpty()) throw new ResponseStatusException(FORBIDDEN, "成员已停用或未加入实验室");
        return found.getFirst();
    }
    public List<String> roles(UUID memberId) {
        return jdbc.query("SELECT DISTINCT role FROM role_assignment WHERE member_id=? AND revoked_at IS NULL ORDER BY role",
            (rs, row) -> rs.getString(1), memberId);
    }
    public void requireRole(UUID memberId, String... required) {
        List<String> actual = roles(memberId);
        if (java.util.Arrays.stream(required).noneMatch(actual::contains)) throw new ResponseStatusException(FORBIDDEN, "没有管理权限");
    }
}
