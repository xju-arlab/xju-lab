package org.xjuarlab.lab.config;

import java.net.URI;
import java.util.Arrays;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class ProductionConfigurationGuard implements ApplicationRunner {
    private final Environment environment;
    public ProductionConfigurationGuard(Environment environment) { this.environment = environment; }
    @Override public void run(ApplicationArguments args) {
        if (Arrays.asList(environment.getActiveProfiles()).contains("prod")) {
            String issuer = environment.getRequiredProperty("spring.security.oauth2.client.provider.lab.issuer-uri");
            URI uri = URI.create(issuer);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().equalsIgnoreCase("localhost") || uri.getHost().equals("127.0.0.1") || uri.getHost().endsWith(".invalid"))
                throw new IllegalStateException("Production OIDC issuer must be a configured HTTPS identity provider");
            String frontend = environment.getRequiredProperty("lab.frontend-origin");
            if (!frontend.startsWith("https://")) throw new IllegalStateException("Production frontend origin must use HTTPS");
            if (!"icthub.top".equalsIgnoreCase(environment.getRequiredProperty("lab.registration-domain")))
                throw new IllegalStateException("Production self-registration is restricted to verified icthub.top email addresses");
            if (!environment.getRequiredProperty("server.servlet.session.cookie.secure", Boolean.class))
                throw new IllegalStateException("Production session cookies must be Secure");
            if (environment.getRequiredProperty("lab.approval-token-encryption-key").length()<32)
                throw new IllegalStateException("Production approval token encryption key must contain at least 32 characters");
            optionalProductionUrl("lab.oj.public-origin", true, false);
            String ojBase = environment.getProperty("lab.oj.base-url", "");
            String ojToken = environment.getProperty("lab.oj.service-token", "");
            if (ojBase.isBlank() != ojToken.isBlank()) throw new IllegalStateException("Production OJ integration URL and service credential must be configured together");
            if (!ojBase.isBlank()) optionalProductionUrl("lab.oj.base-url", true, false);
            optionalProductionUrl("lab.monitor.prometheus-url", false, true);
        }
    }

    private void optionalProductionUrl(String key, boolean httpsOnly, boolean allowPrivatePrometheus) {
        String configured = environment.getProperty(key, "");
        if (configured.isBlank()) return;
        URI uri = URI.create(configured);
        boolean internalPrometheus = allowPrivatePrometheus && "prometheus".equalsIgnoreCase(uri.getHost()) && "http".equalsIgnoreCase(uri.getScheme());
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || (!"https".equalsIgnoreCase(uri.getScheme()) && !(internalPrometheus && !httpsOnly))
                || uri.getHost().equalsIgnoreCase("localhost") || uri.getHost().equals("127.0.0.1") || uri.getHost().endsWith(".invalid")) {
            throw new IllegalStateException("Production integration URL must be an explicit secure endpoint: " + key);
        }
    }
}
