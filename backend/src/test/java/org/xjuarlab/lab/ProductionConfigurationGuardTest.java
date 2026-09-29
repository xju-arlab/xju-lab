package org.xjuarlab.lab;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;
import org.xjuarlab.lab.config.ProductionConfigurationGuard;

class ProductionConfigurationGuardTest {
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
