package org.xjuarlab.lab.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OidcMemberProvisioningSuccessHandler implements AuthenticationSuccessHandler {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final String registrationDomain;
    private final String bootstrapIssuer;
    private final String bootstrapSubject;
    private final String frontendOrigin;

    public OidcMemberProvisioningSuccessHandler(JdbcTemplate jdbc, TransactionTemplate transactions,
            @Value("${lab.registration-domain:icthub.top}") String registrationDomain,
            @Value("${lab.bootstrap-admin.issuer:}") String bootstrapIssuer,
            @Value("${lab.bootstrap-admin.subject:}") String bootstrapSubject,
            @Value("${lab.frontend-origin:http://localhost:5173}") String frontendOrigin) {
        this.jdbc = jdbc; this.transactions = transactions; this.registrationDomain = registrationDomain.toLowerCase(java.util.Locale.ROOT);
        this.bootstrapIssuer = bootstrapIssuer; this.bootstrapSubject = bootstrapSubject; this.frontendOrigin = frontendOrigin;
    }

    @Override public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException, ServletException {
        if (!(authentication.getPrincipal() instanceof OidcUser user)) { response.sendError(403); return; }
        String email = user.getClaimAsString("email");
        Boolean emailVerified = user.getClaimAsBoolean("email_verified");
        boolean exactBootstrapIdentity = !bootstrapIssuer.isBlank() && !bootstrapSubject.isBlank()
            && bootstrapIssuer.equals(user.getIdToken().getIssuer().toString())
            && bootstrapSubject.equals(user.getIdToken().getSubject());
        if (!Boolean.TRUE.equals(emailVerified) || email == null || email.isBlank() || (!isAllowedEmail(email) && !exactBootstrapIdentity)) {
            response.sendError(403, "A verified @" + registrationDomain + " email address is required"); return;
        }
        try {
            UUID memberId = transactions.execute(status -> provision(user, request));
            if (memberId == null) { response.sendError(403, "Member is inactive"); return; }
            request.getSession(true).setAttribute("lab.memberId", memberId.toString());
            response.sendRedirect(frontendOrigin);
        } catch (RuntimeException e) {
            response.sendError(403, "Identity could not be linked safely");
        }
    }

    private boolean isAllowedEmail(String email) {
        if (email == null || email.isBlank()) return false;
        String normalized = email.trim().toLowerCase(java.util.Locale.ROOT);
        int at = normalized.lastIndexOf('@');
        return at > 0 && at == normalized.indexOf('@') && normalized.substring(at + 1).equals(registrationDomain);
    }

    private UUID provision(OidcUser user, HttpServletRequest request) {
        String issuer = user.getIdToken().getIssuer().toString();
        String subject = user.getIdToken().getSubject();
        var existing = jdbc.query("SELECT m.id,m.active FROM external_identity x JOIN member m ON m.id=x.member_id WHERE x.issuer=? AND x.subject=? AND x.active=true",
            (rs, row) -> Map.entry((UUID) rs.getObject("id"), rs.getBoolean("active")), issuer, subject);
        UUID memberId;
        if (!existing.isEmpty()) {
            if (!existing.getFirst().getValue()) return null;
            memberId = existing.getFirst().getKey();
        } else {
            String accountId = user.getClaimAsString("icthub_account_id");
            if (accountId != null && accountId.isBlank()) accountId = null;
            var mapped = accountId == null ? List.<UUID>of() : jdbc.query("SELECT id FROM member WHERE account_id=? AND active=true",
                (rs, row) -> (UUID) rs.getObject(1), accountId);
            if (!mapped.isEmpty()) memberId = mapped.getFirst();
            else {
                String displayName = user.getClaimAsString("name");
                if (displayName == null || displayName.isBlank()) displayName = user.getClaimAsString("preferred_username");
                if (displayName == null || displayName.isBlank()) displayName = "Lab member";
                memberId = jdbc.queryForObject("INSERT INTO member(account_id,display_name) VALUES (?,?) RETURNING id",
                    UUID.class, accountId, displayName);
                jdbc.update("INSERT INTO role_assignment(member_id,role,source) VALUES (?,'MEMBER','oidc-admission')", memberId);
            }
            jdbc.update("INSERT INTO external_identity(member_id,issuer,subject,account_id) VALUES (?,?,?,?)", memberId, issuer, subject, accountId);
        }
        if (!bootstrapIssuer.isBlank() && issuer.equals(bootstrapIssuer) && subject.equals(bootstrapSubject)) {
            int claimed = jdbc.update("INSERT INTO admin_bootstrap(bootstrap_key,issuer,subject) VALUES ('initial-super-admin',?,?) ON CONFLICT DO NOTHING", issuer, subject);
            if (claimed == 1) {
                jdbc.update("INSERT INTO role_assignment(member_id,role,source) VALUES (?,'SUPER_ADMIN','bootstrap')", memberId);
                jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary,request_id) VALUES (?,'BOOTSTRAP_SUPER_ADMIN','member',?,jsonb_build_object('role','SUPER_ADMIN'),?)",
                    memberId, memberId.toString(), request.getHeader("X-Request-Id"));
            }
        }
        String linkedAccountId = jdbc.queryForObject("SELECT COALESCE(NULLIF(m.account_id,''),x.account_id) FROM member m LEFT JOIN external_identity x ON x.member_id=m.id AND x.issuer=? AND x.subject=? WHERE m.id=?", String.class, issuer, subject, memberId);
        ensureOjRoleSync(memberId, linkedAccountId);
        String notificationEmail = user.getClaimAsString("email");
        Boolean emailVerified = user.getClaimAsBoolean("email_verified");
        if (notificationEmail != null && emailVerified != null) {
            jdbc.update("UPDATE member SET notification_email=?,notification_email_verified=?,updated_at=now() WHERE id=?",
                notificationEmail.trim(), emailVerified && !notificationEmail.isBlank(), memberId);
        }
        return memberId;
    }

    private void ensureOjRoleSync(UUID memberId, String accountId) {
        if (accountId == null || !accountId.matches("[0-9]{8}")) return;
        boolean superAdmin = !jdbc.query("SELECT 1 FROM role_assignment r JOIN member m ON m.id=r.member_id WHERE r.member_id=? AND r.role='SUPER_ADMIN' AND r.revoked_at IS NULL AND m.active=true",
            (rs, row) -> rs.getInt(1), memberId).isEmpty();
        if (!superAdmin) return;
        jdbc.update("INSERT INTO external_role_sync(member_id,desired,version,confirmed_version,status) VALUES (?,true,1,0,'PENDING') ON CONFLICT(member_id) DO NOTHING", memberId);
        var pending = jdbc.query("SELECT version,desired,status,confirmed_version FROM external_role_sync WHERE member_id=?",
            (rs, row) -> new Object[]{rs.getLong(1), rs.getBoolean(2), rs.getString(3), rs.getLong(4)}, memberId);
        if (pending.isEmpty()) return;
        Object[] state = pending.getFirst();
        if (!(boolean) state[1] || ("SYNCED".equals(state[2]) && (long) state[3] >= (long) state[0])) return;
        Integer queued = jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE event_type='OJ_ADMIN_ROLE_SYNC' AND aggregate_id=? AND delivered_at IS NULL AND dead_lettered_at IS NULL", Integer.class, memberId);
        if (queued == null || queued == 0) jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('OJ_ADMIN_ROLE_SYNC',?,jsonb_build_object('memberId',?::text,'desired',true,'version',?))", memberId, memberId, state[0]);
    }
}
