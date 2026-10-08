package org.xjuarlab.lab.config;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.RequestEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.converter.FormHttpMessageConverter;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.http.OAuth2ErrorResponseErrorHandler;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.core.http.converter.OAuth2AccessTokenResponseHttpMessageConverter;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

/** Same-host transport only: the public issuer and browser authorization URL never change. */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
@ConditionalOnProperty(name = "lab.oidc.backchannel-enabled", havingValue = "true")
public class OidcBackchannelConfiguration {
    private final URI issuer;
    private final URI internalOrigin;
    private final RestTemplate rest;

    @org.springframework.beans.factory.annotation.Autowired
    public OidcBackchannelConfiguration(
            @Value("${spring.security.oauth2.client.provider.lab.issuer-uri}") String issuer,
            @Value("${lab.oidc.backchannel-base-url}") String internalOrigin) {
        this(issuer, internalOrigin, Duration.ofSeconds(8));
    }

    OidcBackchannelConfiguration(String issuer, String internalOrigin, Duration timeout) {
        this.issuer = URI.create(issuer);
        this.internalOrigin = URI.create(internalOrigin);
        if (!"https".equals(this.issuer.getScheme()) || !safeUri(this.issuer))
            throw new IllegalArgumentException("OIDC public issuer must remain HTTPS");
        String host = this.internalOrigin.getHost();
        boolean localHttp = "http".equals(this.internalOrigin.getScheme()) && host != null
            && (host.equals("127.0.0.1") || host.equals("localhost") || host.matches("[a-zA-Z0-9-]+"));
        if (!safeUri(this.internalOrigin) || !(localHttp || "https".equals(this.internalOrigin.getScheme()))
                || !(this.internalOrigin.getPath().isEmpty() || this.internalOrigin.getPath().equals("/")))
            throw new IllegalArgumentException("OIDC backchannel must be a trusted service origin");
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(timeout);
        rest = new RestTemplate(factory);
        rest.getInterceptors().add((request, body, execution) -> {
            if (!sameOrigin(request.getURI(), this.internalOrigin))
                throw new IllegalArgumentException("OIDC request outside configured backchannel");
            request.getHeaders().set("X-Forwarded-Host", this.issuer.getRawAuthority());
            request.getHeaders().set("X-Forwarded-Proto", "https");
            return execution.execute(request, body);
        });
        rest.setErrorHandler(new OAuth2ErrorResponseErrorHandler());
    }

    @Bean
    ClientRegistrationRepository backchannelRegistrations(
            @Value("${spring.security.oauth2.client.registration.lab.client-id}") String clientId,
            @Value("${spring.security.oauth2.client.registration.lab.client-secret}") String clientSecret) {
        String discovery = issuer.toString().replaceAll("/+$", "") + "/.well-known/openid-configuration";
        Map<String, Object> metadata = rest.exchange(RequestEntity.get(internalUri(discovery)).build(),
            new ParameterizedTypeReference<Map<String, Object>>() {}).getBody();
        if (metadata == null || !issuer.toString().equals(metadata.get("issuer")))
            throw new IllegalStateException("OIDC discovery issuer does not match the trusted public issuer");
        String authorization = endpoint(metadata, "authorization_endpoint");
        var registration = ClientRegistrations.fromOidcConfiguration(metadata)
            .registrationId("lab").clientId(clientId).clientSecret(clientSecret)
            .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
            .scope("openid", "profile", "email").userNameAttributeName("sub")
            .authorizationUri(authorization)
            .tokenUri(internalUri(endpoint(metadata, "token_endpoint")).toString())
            .userInfoUri(internalUri(endpoint(metadata, "userinfo_endpoint")).toString())
            .jwkSetUri(internalUri(endpoint(metadata, "jwks_uri")).toString()).build();
        return new InMemoryClientRegistrationRepository(registration);
    }

    RestClientAuthorizationCodeTokenResponseClient tokenClient() {
        var client = new RestClientAuthorizationCodeTokenResponseClient();
        client.setRestClient(RestClient.builder(rest).messageConverters(converters -> {
            converters.clear();
            converters.add(new FormHttpMessageConverter());
            converters.add(new OAuth2AccessTokenResponseHttpMessageConverter());
        }).build());
        return client;
    }

    OidcUserService userService() {
        var oauth = new DefaultOAuth2UserService();
        oauth.setRestOperations(rest);
        var oidc = new OidcUserService();
        oidc.setOauth2UserService(oauth);
        return oidc;
    }

    @Bean
    JwtDecoderFactory<ClientRegistration> backchannelIdTokenDecoders() {
        var decoders = new ConcurrentHashMap<String, JwtDecoder>();
        return registration -> decoders.computeIfAbsent(registration.getRegistrationId(), id -> {
            var decoder = NimbusJwtDecoder.withJwkSetUri(registration.getProviderDetails().getJwkSetUri())
                .restOperations(rest).build();
            // Same validators and claim conversion as Spring Security 6.5's OidcIdTokenDecoderFactory.
            decoder.setJwtValidator(JwtValidators.createDefaultWithValidators(new OidcIdTokenValidator(registration)));
            decoder.setClaimSetConverter(OidcIdTokenDecoderFactory.createDefaultClaimTypeConverter());
            return decoder;
        });
    }

    private String endpoint(Map<String, Object> metadata, String key) {
        Object value = metadata.get(key);
        if (!(value instanceof String text)) throw new IllegalStateException("Missing OIDC endpoint: " + key);
        internalUri(text); // Validate every endpoint, including the public browser redirect.
        return text;
    }

    private URI internalUri(String endpoint) {
        URI uri = URI.create(endpoint);
        if (!safeUri(uri) || !sameOrigin(uri, issuer))
            throw new IllegalArgumentException("OIDC endpoint is outside the trusted issuer origin");
        return URI.create(internalOrigin.getScheme() + "://" + internalOrigin.getRawAuthority() + uri.getRawPath());
    }
    private static boolean safeUri(URI uri) {
        return uri.getHost() != null && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
    }
    private static boolean sameOrigin(URI left, URI right) {
        return left.getScheme().equals(right.getScheme()) && left.getRawAuthority().equals(right.getRawAuthority());
    }
}
