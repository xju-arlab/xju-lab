package org.xjuarlab.lab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.xjuarlab.lab.api.RequestIdFilter;

@Component
public class OidcLoginFailureHandler implements AuthenticationFailureHandler {
    public enum Reason { EMAIL_UNVERIFIED, EMAIL_DOMAIN, MEMBER_INACTIVE, PROVISIONING_FAILED, LOGIN_EXPIRED }
    private static final Logger log = LoggerFactory.getLogger(OidcLoginFailureHandler.class);
    private final String frontendOrigin;

    public OidcLoginFailureHandler(@Value("${lab.frontend-origin:http://localhost:5173}") String frontendOrigin) {
        this.frontendOrigin = frontendOrigin.replaceAll("/+$", "");
    }

    @Override public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        reject(request, response, Reason.LOGIN_EXPIRED);
    }

    public void reject(HttpServletRequest request, HttpServletResponse response, Reason reason) throws IOException {
        // OAuth authentication may already have been saved before member admission fails.
        SecurityContextHolder.clearContext();
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        log.warn("OIDC login rejected reason={} requestId={}", reason, request.getAttribute(RequestIdFilter.ATTRIBUTE));
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.sendRedirect(frontendOrigin + "/app/dashboard?authError=" + reason.name().toLowerCase(java.util.Locale.ROOT));
    }
}
