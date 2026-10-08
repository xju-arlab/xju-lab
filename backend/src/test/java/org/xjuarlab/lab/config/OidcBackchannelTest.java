package org.xjuarlab.lab.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.security.oauth2.client.OAuth2ClientAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.client.authentication.OAuth2LoginAuthenticationToken;
import org.springframework.security.oauth2.client.oidc.authentication.OidcAuthorizationCodeAuthenticationProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.endpoint.*;
import static org.assertj.core.api.Assertions.*;

class OidcBackchannelTest {
    static final String ISSUER = "https://idp.example.test/application/o/lab/";
    static final String PUBLIC = "https://idp.example.test";
    static final ObjectMapper json = new ObjectMapper();
    static RSAKey signingKey;
    HttpServer server;
    ExecutorService executor;
    String internal;
    Map<String,Object> metadata;
    final List<String> calls = new CopyOnWriteArrayList<>();
    final List<String> forwardedHosts = new CopyOnWriteArrayList<>();
    volatile String tokenIssuer = ISSUER, audience = "client", nonce, userInfoSubject = "subject";
    volatile boolean redirectToken, wrongSignature, rejectTokenUpgrade;
    volatile long discoveryDelay;
    volatile String tokenBody, authorizationHeader;
    volatile Instant expires = Instant.now().plusSeconds(300);

    @BeforeAll static void keys() throws Exception { signingKey = new RSAKeyGenerator(2048).keyID("test-key").generate(); }
    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        executor = Executors.newCachedThreadPool(); server.setExecutor(executor);
        internal = "http://127.0.0.1:" + server.getAddress().getPort();
        metadata = new HashMap<>(Map.of("issuer",ISSUER,"authorization_endpoint",PUBLIC+"/application/o/authorize/",
            "token_endpoint",PUBLIC+"/application/o/token/","userinfo_endpoint",PUBLIC+"/application/o/userinfo/",
            "jwks_uri",ISSUER+"jwks/","response_types_supported",List.of("code"),
            "subject_types_supported",List.of("public"),"id_token_signing_alg_values_supported",List.of("RS256")));
        server.createContext("/", this::serve); server.start();
    }
    @AfterEach void stop() { server.stop(0); executor.shutdownNow(); }

    void serve(HttpExchange exchange) {
        String path = exchange.getRequestURI().getPath(); calls.add(path);
        forwardedHosts.add(exchange.getRequestHeaders().getFirst("X-Forwarded-Host")+":"+exchange.getRequestHeaders().getFirst("X-Forwarded-Proto"));
        try {
            Object body;
            if (path.endsWith("openid-configuration")) {
                Thread.sleep(discoveryDelay); body = metadata;
            } else if (path.endsWith("/token/")) {
                tokenBody = new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
                authorizationHeader = exchange.getRequestHeaders().getFirst("Authorization");
                if (rejectTokenUpgrade && exchange.getRequestHeaders().getFirst("Upgrade") != null) {
                    // Same-host Authentik rejects the h2c upgrade on the token POST with plain text.
                    byte[] failure = "Invalid HTTP request received.".getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type","text/plain;charset=utf-8");
                    exchange.sendResponseHeaders(400,failure.length);
                    exchange.getResponseBody().write(failure); return;
                }
                if (redirectToken) {
                    exchange.getResponseHeaders().add("Location",internal+"/must-not-receive-credentials");
                    exchange.sendResponseHeaders(302,-1); exchange.close(); return;
                }
                body = Map.of("access_token","test-access-token","token_type","Bearer","expires_in",300,
                    "scope","openid profile email","id_token",signedToken());
            } else if (path.endsWith("/jwks/")) body = new JWKSet(signingKey.toPublicJWK()).toJSONObject();
            else if (path.endsWith("/userinfo/")) body = Map.of("sub",userInfoSubject,"email","member@example.test","email_verified",true);
            else throw new IllegalStateException("Unexpected endpoint");
            byte[] bytes = json.writeValueAsBytes(body);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes);
        } catch (Exception ignored) { /* Timeout tests close the response while the fixture is delayed. */ }
        finally { exchange.close(); }
    }
    String signedToken() throws Exception {
        var claims = new JWTClaimsSet.Builder().issuer(tokenIssuer).subject("subject").audience(audience)
            .issueTime(Date.from(expires.minusSeconds(300))).expirationTime(Date.from(expires)).claim("nonce",nonce).build();
        var signed = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(),claims);
        signed.sign(new RSASSASigner(wrongSignature ? new RSAKeyGenerator(2048).generate() : signingKey));
        return signed.serialize();
    }
    OidcBackchannelConfiguration configuration() { return new OidcBackchannelConfiguration(ISSUER,internal); }
    record Login(OidcAuthorizationCodeAuthenticationProvider provider, OAuth2LoginAuthenticationToken request, ClientRegistration registration) { }
    Login login() {
        var config = configuration();
        var registrations = config.backchannelRegistrations("client","test-secret");
        var registration = registrations.findByRegistrationId("lab");
        var resolver = new DefaultOAuth2AuthorizationRequestResolver(registrations,"/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
        var request = resolver.resolve(new MockHttpServletRequest("GET","/oauth2/authorization/lab"),"lab");
        nonce = (String) request.getAdditionalParameters().get("nonce");
        assertThat(nonce).isNotBlank();
        assertThat(request.getAdditionalParameters()).containsEntry("code_challenge_method","S256");
        var response = OAuth2AuthorizationResponse.success("synthetic-code").state(request.getState()).redirectUri(request.getRedirectUri()).build();
        var provider = new OidcAuthorizationCodeAuthenticationProvider(config.tokenClient(),config.userService());
        provider.setJwtDecoderFactory(config.backchannelIdTokenDecoders());
        return new Login(provider,new OAuth2LoginAuthenticationToken(registration,new OAuth2AuthorizationExchange(request,response)),registration);
    }

    @Test void completeLoginUsesOnlyInternalTransportAndKeepsPublicIssuerPkceAndUserInfo() {
        var login = login();
        var authenticated = login.provider().authenticate(login.request());
        assertThat(authenticated.isAuthenticated()).isTrue();
        assertThat(login.registration().getProviderDetails().getIssuerUri()).isEqualTo(ISSUER);
        assertThat(login.registration().getProviderDetails().getAuthorizationUri()).isEqualTo(PUBLIC+"/application/o/authorize/");
        assertThat(calls).containsExactly("/application/o/lab/.well-known/openid-configuration","/application/o/token/","/application/o/lab/jwks/","/application/o/userinfo/");
        assertThat(forwardedHosts).containsOnly("idp.example.test:https");
        assertThat(tokenBody).contains("code_verifier=","code=synthetic-code");
        assertThat(authorizationHeader).startsWith("Basic ");
    }
    @Test void productionWiringReplacesPublicDiscoveryWithoutChangingTheIssuer() {
        new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OAuth2ClientAutoConfiguration.class))
            .withUserConfiguration(OidcBackchannelConfiguration.class)
            .withPropertyValues("spring.profiles.active=prod", "lab.oidc.backchannel-enabled=true",
                "lab.oidc.backchannel-base-url="+internal, "spring.security.oauth2.client.provider.lab.issuer-uri="+ISSUER,
                "spring.security.oauth2.client.registration.lab.client-id=client",
                "spring.security.oauth2.client.registration.lab.client-secret=test-secret")
            .run(context -> {
                assertThat(context).hasNotFailed().hasSingleBean(ClientRegistrationRepository.class)
                    .hasSingleBean(org.springframework.security.oauth2.jwt.JwtDecoderFactory.class);
                assertThat(context.getBean(ClientRegistrationRepository.class).findByRegistrationId("lab")
                    .getProviderDetails().getIssuerUri()).isEqualTo(ISSUER);
                assertThat(calls).containsExactly("/application/o/lab/.well-known/openid-configuration");
            });
    }
    @Test void completesLoginWhenIdentityServiceRejectsCleartextHttp2Upgrade() {
        rejectTokenUpgrade = true;
        var login = login();
        assertThat(login.provider().authenticate(login.request()).isAuthenticated()).isTrue();
        assertThat(calls).contains("/application/o/token/","/application/o/lab/jwks/","/application/o/userinfo/");
    }
    @Test void rejectsWrongIssuerAudienceExpirySignatureNonceAndUserInfoSubject() {
        for (String failure : List.of("issuer","audience","expiry","signature","nonce","subject")) {
            tokenIssuer=ISSUER; audience="client"; expires=Instant.now().plusSeconds(300); wrongSignature=false; userInfoSubject="subject";
            var login = login();
            switch (failure) {
                case "issuer" -> tokenIssuer="https://impostor.example.test/";
                case "audience" -> audience="another-client";
                case "expiry" -> expires=Instant.now().minusSeconds(300);
                case "signature" -> wrongSignature=true;
                case "nonce" -> nonce="wrong-nonce";
                case "subject" -> userInfoSubject="another-user";
            }
            assertThatThrownBy(() -> login.provider().authenticate(login.request())).as(failure).isInstanceOf(OAuth2AuthenticationException.class);
        }
    }
    @Test void refusesDiscoveryDriftAndForeignEndpointsBeforeSendingCredentials() {
        metadata.put("issuer", "https://impostor.example.test/");
        assertThatThrownBy(() -> configuration().backchannelRegistrations("client","test-secret")).isInstanceOf(IllegalStateException.class);
        metadata.put("issuer",ISSUER);
        for (String field : List.of("authorization_endpoint","token_endpoint","userinfo_endpoint","jwks_uri")) {
            Object saved=metadata.put(field,"https://impostor.example.test/steal");
            assertThatThrownBy(() -> configuration().backchannelRegistrations("client","test-secret")).isInstanceOf(IllegalArgumentException.class);
            metadata.put(field,saved);
        }
        assertThat(authorizationHeader).isNull();
    }
    @Test void neverFollowsTokenRedirectOrRetriesAnAuthorizationCode() {
        var login = login(); redirectToken=true;
        assertThatThrownBy(() -> login.provider().authenticate(login.request())).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(calls).containsExactly("/application/o/lab/.well-known/openid-configuration","/application/o/token/");
    }
    @Test void boundsDiscoveryWaitInsteadOfHangingUntilProxyTimeout() {
        discoveryDelay=1500;
        var config=new OidcBackchannelConfiguration(ISSUER,internal,Duration.ofMillis(250));
        Assertions.assertTimeoutPreemptively(Duration.ofSeconds(2), () ->
            assertThatThrownBy(() -> config.backchannelRegistrations("client","test-secret")).isInstanceOf(org.springframework.web.client.ResourceAccessException.class));
    }
    @Test void rejectsPublicPlaintextAndEmbeddedCredentialsInBackchannelConfiguration() {
        for (String base : List.of("http://untrusted.example.com","http://user:password@authentik:9000","http://authentik:9000/path","http://authentik:9000?next=x"))
            assertThatThrownBy(() -> new OidcBackchannelConfiguration(ISSUER,base)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OidcBackchannelConfiguration("http://idp.example.test/",internal)).isInstanceOf(IllegalArgumentException.class);
    }
}
