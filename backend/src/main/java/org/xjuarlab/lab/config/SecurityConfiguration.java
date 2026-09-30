package org.xjuarlab.lab.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.xjuarlab.lab.security.OidcMemberProvisioningSuccessHandler;
import org.xjuarlab.lab.security.ApiSecurityErrorWriter;
import org.xjuarlab.lab.api.RequestIdFilter;
import org.springframework.security.web.context.SecurityContextHolderFilter;

@Configuration
public class SecurityConfiguration {
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http, ClientRegistrationRepository clients, OidcMemberProvisioningSuccessHandler successHandler, ApiSecurityErrorWriter errors) throws Exception {
        var csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        var authorizationRequestResolver = new DefaultOAuth2AuthorizationRequestResolver(
            clients, OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI);
        authorizationRequestResolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
        http.authorizeHttpRequests(auth -> auth
            .requestMatchers("/actuator/health", "/actuator/health/**", "/api/v1/health", "/api/v1/ready", "/api/v1/csrf", "/oauth2/**", "/login/**", "/api/v1/public/**", "/api/v1/printer-agent/**").permitAll()
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .anyRequest().authenticated())
            .csrf(c -> c.csrfTokenRepository(csrf).ignoringRequestMatchers("/api/v1/printer-agent/**"))
            .exceptionHandling(c -> c.defaultAuthenticationEntryPointFor(errors.authenticationEntryPoint(), new AntPathRequestMatcher("/api/v1/**")).accessDeniedHandler(errors.accessDeniedHandler()))
            .oauth2Login(o -> o.authorizationEndpoint(a -> a.authorizationRequestResolver(authorizationRequestResolver))
                .successHandler(successHandler))
            .logout(logout -> logout.logoutUrl("/api/v1/logout").invalidateHttpSession(true).clearAuthentication(true).deleteCookies("SESSION", "JSESSIONID").logoutSuccessHandler((request, response, auth) -> response.setStatus(204)))
            .addFilterBefore(new RequestIdFilter(), SecurityContextHolderFilter.class);
        return http.build();
    }
}
