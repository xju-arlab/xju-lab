package org.xjuarlab.lab;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;
import org.xjuarlab.lab.config.ProductionConfigurationGuard;

class ProductionConfigurationGuardTest {
    @Test void productionAcceptsAnyVerifiedEmailModeButRejectsMistypedPolicy() {
        MockEnvironment env = new MockEnvironment()
            .withProperty("spring.security.oauth2.client.provider.lab.issuer-uri", "https://auth.icthub.top/application/o/xju-lab/")
            .withProperty("lab.frontend-origin", "https://lab.icthub.top")
            .withProperty("lab.registration-domain", "*")
            .withProperty("server.servlet.session.cookie.secure", "true")
            .withProperty("lab.approval-token-encryption-key", "test-only-encryption-key-at-least-32-characters");
        env.setActiveProfiles("prod");
        new ProductionConfigurationGuard(env).run(new DefaultApplicationArguments(new String[0]));
        env.withProperty("lab.registration-domain", "all");
        assertThatThrownBy(() -> new ProductionConfigurationGuard(env).run(new DefaultApplicationArguments(new String[0])))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("registration domain");
    }
    @Test void productionRejectsLoopbackIdentityProviderEvenWhenRequiredValuesExist(){
        MockEnvironment env=new MockEnvironment().withProperty("spring.security.oauth2.client.provider.lab.issuer-uri","http://localhost:8081/realms/xju-lab")
            .withProperty("lab.frontend-origin","https://lab.example.edu")
            .withProperty("server.servlet.session.cookie.secure","true");
        env.setActiveProfiles("prod");
        assertThatThrownBy(()->new ProductionConfigurationGuard(env).run(new DefaultApplicationArguments(new String[0])))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("HTTPS identity provider");
    }
    @Test void productionRejectsMissingOidcSettings(){
        MockEnvironment env=new MockEnvironment();env.setActiveProfiles("prod");
        assertThatThrownBy(()->new ProductionConfigurationGuard(env).run(new DefaultApplicationArguments(new String[0])))
            .isInstanceOf(IllegalStateException.class);
    }
}
