package org.xjuarlab.lab.security;

import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import static org.springframework.http.HttpStatus.FORBIDDEN;

@Component
public class MemberRegistrationInterceptor implements HandlerInterceptor {
    private static final Set<String> ALLOWED_WHILE_INCOMPLETE = Set.of(
            "/api/v1/health", "/api/v1/ready", "/api/v1/csrf", "/api/v1/session",
            "/api/v1/logout", "/api/v1/members/me", "/api/v1/members/me/registration", "/api/v1/leaves/email-action/context", "/api/v1/leaves/email-action");
    private final JdbcTemplate jdbc;
    private final CurrentMember current;

    public MemberRegistrationInterceptor(JdbcTemplate jdbc, CurrentMember current) {
        this.jdbc = jdbc; this.current = current;
    }

    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String path = request.getRequestURI();
        if (ALLOWED_WHILE_INCOMPLETE.contains(path) || path.startsWith("/api/v1/leaves/email-action/attachments/") || path.startsWith("/api/v1/public/") || !path.startsWith("/api/v1/")) return true;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof OidcUser)) return true;
        var memberId = current.id(auth);
        Boolean complete = jdbc.queryForObject("SELECT real_name IS NOT NULL AND student_number IS NOT NULL AND class_name IS NOT NULL AND jsonb_array_length(directions)>0 FROM member WHERE id=? AND active=true", Boolean.class, memberId);
        if (!Boolean.TRUE.equals(complete)) throw new ResponseStatusException(FORBIDDEN, "请先完成实名、学号、班级和研究方向登记");
        return true;
    }
}
