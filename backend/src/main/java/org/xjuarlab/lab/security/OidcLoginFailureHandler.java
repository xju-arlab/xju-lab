package org.xjuarlab.lab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
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
        // Log protocol categories only, never messages, authorization codes, tokens or personal claims.
        String error = exception instanceof OAuth2AuthenticationException oauth ? oauth.getError().getErrorCode() : "authentication_failed";
        if (error == null || !error.matches("[a-z_]{1,64}")) error = "authentication_failed";
        Throwable cause = exception;
        for (int depth = 0; depth < 8 && cause.getCause() != null; depth++) cause = cause.getCause();
        log.warn("OIDC protocol failure error={} cause={} requestId={}", error,
            cause.getClass().getSimpleName(), request.getAttribute(RequestIdFilter.ATTRIBUTE));
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
