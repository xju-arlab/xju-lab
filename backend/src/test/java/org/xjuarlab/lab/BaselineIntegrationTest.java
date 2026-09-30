package org.xjuarlab.lab;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.xjuarlab.lab.leave.ApprovalTokenCryptography;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.context.annotation.Primary;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.xjuarlab.lab.notifications.OutboxWorker;
import org.xjuarlab.lab.security.OidcMemberProvisioningSuccessHandler;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"spring.profiles.active=test", "lab.monitor.ssh-enabled=false"})
@Import(BaselineIntegrationTest.TestOidcConfiguration.class)
@AutoConfigureMockMvc
class BaselineIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(DockerImageName.parse("postgres:17.6-bookworm"))
        .withDatabaseName("xju_lab_test").withUsername("xju_test").withPassword("test-password");
    @Container static final GenericContainer<?> redis = new GenericContainer<>(DockerImageName.parse("redis:7.4.3-alpine"))
        .withExposedPorts(6379).withCommand("redis-server", "--requirepass", "redis-test-password");

    @DynamicPropertySource static void services(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", postgres::getJdbcUrl);
        properties.add("spring.datasource.username", postgres::getUsername);
        properties.add("spring.datasource.password", postgres::getPassword);
        properties.add("spring.data.redis.host", redis::getHost);
        properties.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        properties.add("spring.data.redis.password", () -> "redis-test-password");
    }

    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ApprovalTokenCryptography tokenCrypto;
    @Autowired OutboxWorker outboxWorker;
    @Autowired OidcMemberProvisioningSuccessHandler oidcMemberProvisioningSuccessHandler;
    @Autowired JavaMailSender mailSender;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired org.xjuarlab.lab.monitoring.SshMonitoring sshMonitoring;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    org.xjuarlab.lab.servers.infrastructure.SshWorker sshWorker;

    @BeforeEach void isolateMutableFixtures(){
        jdbc.update("DELETE FROM approval_token");
        jdbc.update("DELETE FROM leave_decision");
        jdbc.update("DELETE FROM leave_application");
        jdbc.update("DELETE FROM outbox_event WHERE event_type='NOTIFICATION_EMAIL'");
        jdbc.update("DELETE FROM notification");
        jdbc.update("UPDATE lab_setting SET mail_enabled=false WHERE singleton=true");
        reset(mailSender);
        reset(sshWorker);
        jdbc.update("DELETE FROM seat_assignment");
        jdbc.update("DELETE FROM layout_revision WHERE version>1");
        jdbc.update("UPDATE seat s SET layout_item=d.value FROM layout_revision r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'desks') d(value) WHERE r.version=1 AND d.value->>'id'=s.id");
    }

    @TestConfiguration static class TestOidcConfiguration {
        @Bean ClientRegistrationRepository clientRegistrationRepository() {
            ClientRegistration registration = ClientRegistration.withRegistrationId("lab")
                .clientId("integration-test").clientSecret("not-a-production-secret")
                .clientAuthenticationMethod(org.springframework.security.oauth2.core.ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid", "profile").authorizationUri("http://idp.invalid/authorize")
                .tokenUri("http://idp.invalid/token").userInfoUri("http://idp.invalid/userinfo")
                .userNameAttributeName("sub").jwkSetUri("http://idp.invalid/jwks").issuerUri("http://idp.invalid")
                .build();
            return new InMemoryClientRegistrationRepository(registration);
        }
        @Bean @Primary JavaMailSender testMailSender() { return org.mockito.Mockito.mock(JavaMailSender.class); }
    }

    @Test void migratesTheRealPostgresSchemaAndExposesSafeHealthChecks() {
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' and table_name='member'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from seat where kind='seat'", Integer.class)).isEqualTo(31);
        assertThat(jdbc.queryForObject("select version from layout_revision order by version desc limit 1", Long.class)).isEqualTo(1L);
        assertThat(http.getForEntity("/api/v1/health", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(http.getForEntity("/api/v1/ready", String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(http.getForEntity("/actuator/health", String.class).getBody()).doesNotContain("jdbcUrl", "redis", "password");
    }

    @Test void oidcAuthorizationRequestsIncludePkceForTheConfidentialClient() throws Exception {
        var response = mvc.perform(get("/oauth2/authorization/lab"))
            .andExpect(status().is3xxRedirection())
            .andReturn();
        assertThat(response.getResponse().getRedirectedUrl())
            .contains("code_challenge=")
            .contains("code_challenge_method=S256");
    }

    @Test void oidcAdmissionRequiresAnEmailVerifiedAtTheExactLabDomainAndGrantsOnlyMember() throws Exception {
        var unverifiedRequest = new MockHttpServletRequest();
        var unverifiedResponse = new MockHttpServletResponse();
        oidcMemberProvisioningSuccessHandler.onAuthenticationSuccess(unverifiedRequest, unverifiedResponse,
                oidcAuthentication("unverified@icthub.top", false, "signup-unverified"));
        assertThat(unverifiedResponse.getStatus()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM external_identity WHERE subject='signup-unverified'", Integer.class)).isZero();

        var foreignRequest = new MockHttpServletRequest();
        var foreignResponse = new MockHttpServletResponse();
        oidcMemberProvisioningSuccessHandler.onAuthenticationSuccess(foreignRequest, foreignResponse,
                oidcAuthentication("member@evil.icthub.top", true, "signup-foreign"));
        assertThat(foreignResponse.getStatus()).isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM external_identity WHERE subject='signup-foreign'", Integer.class)).isZero();

        var acceptedRequest = new MockHttpServletRequest();
        var acceptedResponse = new MockHttpServletResponse();
        oidcMemberProvisioningSuccessHandler.onAuthenticationSuccess(acceptedRequest, acceptedResponse,
                oidcAuthentication("member@icthub.top", true, "signup-accepted"));
        assertThat(acceptedResponse.getStatus()).isEqualTo(302);
        UUID memberId = jdbc.queryForObject("SELECT member_id FROM external_identity WHERE issuer='http://idp.invalid' AND subject='signup-accepted'", UUID.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM role_assignment WHERE member_id=? AND role='MEMBER' AND revoked_at IS NULL", Integer.class, memberId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM role_assignment WHERE member_id=? AND role IN ('LAB_ADMIN','SUPER_ADMIN') AND revoked_at IS NULL", Integer.class, memberId)).isZero();
    }

    @Test void bootstrapDomainExceptionRequiresExactIssuerSubjectAndVerifiedEmailAndCannotRegrantRevokedRole() throws Exception {
        var handler = new OidcMemberProvisioningSuccessHandler(jdbc,
                new org.springframework.transaction.support.TransactionTemplate(transactionManager),
                "icthub.top", "http://idp.invalid", "operator-bootstrap", "http://lab.invalid");
        for (var authentication : List.of(
                oidcAuthentication("operator@external.invalid", false, "operator-bootstrap"),
                oidcAuthentication("operator@external.invalid", true, "wrong-bootstrap"),
                oidcAuthentication("operator@external.invalid", true, "operator-bootstrap", "http://other-idp.invalid"))) {
            var request = new MockHttpServletRequest();
            var response = new MockHttpServletResponse();
            handler.onAuthenticationSuccess(request, response, authentication);
            assertThat(response.getStatus()).isEqualTo(403);
            assertThat(request.getSession(false)).isNull();
        }
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        var verified = oidcAuthentication("operator@external.invalid", true, "operator-bootstrap");
        handler.onAuthenticationSuccess(request, response, verified);
        assertThat(response.getRedirectedUrl()).isEqualTo("http://lab.invalid");
        UUID id = UUID.fromString((String) request.getSession().getAttribute("lab.memberId"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM role_assignment WHERE member_id=? AND role='SUPER_ADMIN' AND revoked_at IS NULL", Integer.class, id)).isEqualTo(1);
        jdbc.update("UPDATE role_assignment SET revoked_at=now() WHERE member_id=? AND role='SUPER_ADMIN'", id);
        handler.onAuthenticationSuccess(new MockHttpServletRequest(), new MockHttpServletResponse(), verified);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM role_assignment WHERE member_id=? AND role='SUPER_ADMIN' AND revoked_at IS NULL", Integer.class, id)).isZero();
        jdbc.update("UPDATE member SET active=false WHERE id=?", id);
        var disabled = new MockHttpServletResponse();
        handler.onAuthenticationSuccess(new MockHttpServletRequest(), disabled, verified);
        assertThat(disabled.getStatus()).isEqualTo(403);
    }

    @Test void selfRegistrationDerivesGradeAndDoesNotAllowMembersToEditNameOrStudentNumber() throws Exception {
        UUID id = incompleteMember("registration-self-service");
        String studentNumber = "s-" + UUID.randomUUID().toString().substring(0, 8);
        mvc.perform(get("/api/v1/overview").with(login("registration-self-service")))
            .andExpect(status().isForbidden());
        String registration = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                "realName", "李晓", "studentNumber", studentNumber, "className", "计算机24-3", "directions", List.of("算法", "深度学习", "图神经网络")));
        mvc.perform(put("/api/v1/members/me/registration").with(login("registration-self-service")).with(csrf())
                .header("If-Match-Version", 1).contentType(MediaType.APPLICATION_JSON).content(registration))
            .andExpect(status().isOk()).andExpect(jsonPath("$.realName").value("李晓"))
            .andExpect(jsonPath("$.studentNumber").value(studentNumber)).andExpect(jsonPath("$.grade").value(24))
            .andExpect(jsonPath("$.registrationComplete").value(true)).andExpect(jsonPath("$.directions.length()").value(3));
        assertThat(jdbc.queryForObject("SELECT cohort FROM member WHERE id=?", Integer.class, id)).isEqualTo(24);
        mvc.perform(get("/api/v1/session").with(login("registration-self-service")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.registrationComplete").value(true));

        incompleteMember("registration-duplicate-student");
        String duplicateRegistration = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                "realName", "重复学号", "studentNumber", studentNumber, "className", "计算机24-3", "directions", List.of("算法")));
        mvc.perform(put("/api/v1/members/me/registration").with(login("registration-duplicate-student")).with(csrf())
                .header("If-Match-Version", 1).contentType(MediaType.APPLICATION_JSON).content(duplicateRegistration))
            .andExpect(status().isConflict());

        mvc.perform(put("/api/v1/members/me/registration").with(login("registration-self-service")).with(csrf())
                .header("If-Match-Version", 2).contentType(MediaType.APPLICATION_JSON)
                .content("{\"realName\":\"另一个姓名\",\"studentNumber\":\"another-number\",\"className\":\"信安25-1\",\"directions\":[\"算法\"]}"))
            .andExpect(status().isConflict());

        mvc.perform(patch("/api/v1/members/me").with(login("registration-self-service")).with(csrf())
                .header("If-Match-Version", 2).contentType(MediaType.APPLICATION_JSON)
                .content("{\"className\":\"信安25-1\",\"directions\":[\"算法\",\"量子计算\"],\"introduction\":\"研究者\",\"realName\":\"伪造姓名\",\"studentNumber\":\"伪造学号\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.realName").value("李晓"))
            .andExpect(jsonPath("$.studentNumber").value(studentNumber)).andExpect(jsonPath("$.className").value("信安25-1"))
            .andExpect(jsonPath("$.grade").value(25)).andExpect(jsonPath("$.directions.length()").value(2));
        assertThat(jdbc.queryForObject("SELECT direction FROM member WHERE id=?", String.class, id)).isEqualTo("算法、量子计算");

        mvc.perform(patch("/api/v1/members/me").with(login("registration-self-service")).with(csrf())
                .header("If-Match-Version", 3).contentType(MediaType.APPLICATION_JSON)
                .content("{\"className\":\"计算机2024-3\",\"directions\":[\"算法\"]}"))
            .andExpect(status().isBadRequest());
    }

    @Test void onlySuperAdminCanChangeMemberRealNameOrStudentNumber() throws Exception {
        UUID target = member("identity-update-target", null);
        member("identity-update-lab-admin", "LAB_ADMIN");
        member("identity-update-super-admin", "SUPER_ADMIN");
        String body = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of(
                "realName", "管理员修改姓名", "studentNumber", "i-" + UUID.randomUUID().toString().substring(0, 8)));
        mvc.perform(patch("/api/v1/admin/members/" + target + "/identity").with(login("identity-update-lab-admin")).with(csrf())
                .header("If-Match-Version", 1).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/admin/members/" + target + "/identity").with(login("identity-update-target")).with(csrf())
                .header("If-Match-Version", 1).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/admin/members/" + target + "/identity").with(login("identity-update-super-admin")).with(csrf())
                .header("If-Match-Version", 1).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.realName").value("管理员修改姓名"));
        assertThat(jdbc.queryForObject("SELECT display_name FROM member WHERE id=?", String.class, target)).isEqualTo("管理员修改姓名");
    }

    @Test void postgresConstraintsPreventASecondActiveSeatForOneMember() {
        var member = jdbc.queryForObject("insert into member(display_name) values ('constraint-test') returning id", java.util.UUID.class);
        jdbc.update("insert into seat_assignment(seat_id,member_id) values ('A01',?)", member);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("insert into seat_assignment(seat_id,member_id) values ('A02',?)", member))
            .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        assertThat(jdbc.queryForObject("select count(*) from seat_assignment where member_id=? and released_at is null", Integer.class, member)).isEqualTo(1);
    }

    @Test void protectedApiReturnsStructured401WithoutDemoFallback() {
        var response = http.getForEntity("/api/v1/session", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getHeaders().getContentType().toString()).contains("application/json");
        assertThat(response.getBody()).contains("AUTHENTICATION_REQUIRED", "requestId");
    }

    @Test void oidcIdentityUsesIssuerAndSubjectAndCannotBeReassigned() throws Exception {
        UUID first=member("shared-subject",null);
        UUID second=jdbc.queryForObject("INSERT INTO member(display_name,real_name,student_number,class_name,cohort,directions,direction) VALUES ('second issuer identity','second issuer identity',?,'计算机24-3',24,'[\"算法\"]'::jsonb,'算法') RETURNING id",UUID.class,"t"+UUID.randomUUID().toString().replace("-","").substring(0,20));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("INSERT INTO external_identity(member_id,issuer,subject) VALUES (?, 'http://idp.invalid', 'shared-subject')",second))
            .isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
        jdbc.update("INSERT INTO external_identity(member_id,issuer,subject) VALUES (?, 'http://other-idp.invalid', 'shared-subject')",second);

        mvc.perform(get("/api/v1/session").with(login("http://idp.invalid","shared-subject")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.memberId").value(first.toString()));
        mvc.perform(get("/api/v1/session").with(login("http://other-idp.invalid","shared-subject")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.memberId").value(second.toString()));
    }

    @Test void memberDeactivationImmediatelyRevokesExistingIdentitySessionsAndApiMutationsRequireCsrf() throws Exception {
        member("status-admin","LAB_ADMIN");
        UUID target=member("status-target","MEMBER");
        mvc.perform(get("/api/v1/session").with(login("status-target"))).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/admin/members/"+target+"/status").with(login("status-admin"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false,\"version\":1}"))
            .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT active FROM member WHERE id=?",Boolean.class,target)).isTrue();

        mvc.perform(patch("/api/v1/admin/members/"+target+"/status").with(login("status-admin")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false,\"version\":1}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get("/api/v1/session").with(login("status-target"))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT active FROM external_identity WHERE member_id=?",Boolean.class,target)).isFalse();

        mvc.perform(patch("/api/v1/admin/members/"+target+"/status").with(login("status-admin")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":true,\"version\":2}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true)).andExpect(jsonPath("$.version").value(3));
        mvc.perform(get("/api/v1/session").with(login("status-target"))).andExpect(status().isOk());
    }

    @Test void adminMemberDirectoryRequiresAnAdministratorAndReportsOjSyncState() throws Exception {
        UUID admin=member("member-directory-admin","LAB_ADMIN");
        UUID target=member("member-directory-target","SUPER_ADMIN");
        member("member-directory-outsider",null);
        jdbc.update("INSERT INTO external_role_sync(member_id,desired,version,confirmed_version,status) VALUES (?,true,3,2,'RETRYING')",target);
        String directoryJson=mvc.perform(get("/api/v1/admin/members").with(login("member-directory-admin")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var directoryRows=new com.fasterxml.jackson.databind.ObjectMapper().readTree(directoryJson);
        com.fasterxml.jackson.databind.JsonNode targetRow=null;
        for(var row:directoryRows)if(row.path("id").asText().equals(target.toString())){targetRow=row;break;}
        assertThat(targetRow).isNotNull();
        assertThat(targetRow.path("displayName").asText()).isEqualTo("member-directory-target");
        assertThat(targetRow.path("ojSyncStatus").asText()).isEqualTo("RETRYING");
        assertThat(targetRow.path("ojConfirmedVersion").asInt()).isEqualTo(2);
        mvc.perform(get("/api/v1/admin/members").with(login("member-directory-outsider")))
            .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT id FROM member WHERE id=?",UUID.class,admin)).isEqualTo(admin);
    }

    @Test void publicSnapshotsRequireExplicitPublicationAndWithdrawToAnEmptySafeView() throws Exception {
        UUID admin=member("snapshot-publisher","LAB_ADMIN");
        String payload="{\"labName\":\"算法与科研实验室\",\"description\":\"已审核介绍\",\"projects\":[{\"title\":\"公开项目\",\"summary\":\"脱敏摘要\"}]}";
        mvc.perform(get("/api/v1/public/snapshot"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPublished").value(false)).andExpect(jsonPath("$.payload.projects").doesNotExist());
        mvc.perform(put("/api/v1/admin/public/draft").with(login("snapshot-publisher")).with(csrf()).header("If-Match-Version",0)
                .contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/public/snapshot"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPublished").value(false)).andExpect(jsonPath("$.payload.projects").doesNotExist());
        mvc.perform(get("/api/v1/admin/public/draft").with(login("snapshot-publisher")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.payload.labName").value("算法与科研实验室"));
        mvc.perform(get("/api/v1/admin/public/draft").with(login("member-directory-outsider")))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/public/snapshot").with(login("snapshot-publisher")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPublished").value(true));
        mvc.perform(get("/api/v1/public/snapshot"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.payload.projects[0].title").value("公开项目"))
            .andExpect(jsonPath("$.payload.members").doesNotExist());
        mvc.perform(post("/api/v1/admin/public/snapshot/withdraw").with(login("snapshot-publisher")).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPublished").value(false));
        mvc.perform(get("/api/v1/public/snapshot"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPublished").value(false)).andExpect(jsonPath("$.payload.projects").doesNotExist());
    }

    @Test void confirmedSeatLayoutIsVersionedAndAssignmentConstraintsReturnConflict() throws Exception {
        UUID admin=member("seat-admin","LAB_ADMIN"); UUID person=member("seat-person",null);
        mvc.perform(get("/api/v1/seats").with(login("seat-admin")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(33)).andExpect(jsonPath("$.total").value(33));
        mvc.perform(get("/api/v1/seats/layout").with(login("seat-admin")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        String baseline=new String(new org.springframework.core.io.ClassPathResource("seat-layout.confirmed.json").getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        mvc.perform(put("/api/v1/seats/layout").with(login("seat-admin")).with(csrf()).header("If-Match-Version",1).contentType(MediaType.APPLICATION_JSON).content(baseline))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        mvc.perform(put("/api/v1/seats/layout").with(login("seat-admin")).with(csrf()).header("If-Match-Version",1).contentType(MediaType.APPLICATION_JSON).content(baseline))
            .andExpect(status().isConflict());
        String assignment="{\"memberId\":\""+person+"\"}";
        mvc.perform(put("/api/v1/seats/A01/assignment").with(login("seat-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(assignment))
            .andExpect(status().isOk());
        mvc.perform(put("/api/v1/seats/B01/assignment").with(login("seat-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(assignment))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESOURCE_CONFLICT"));
        mvc.perform(put("/api/v1/seats/A05/assignment").with(login("seat-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(assignment))
            .andExpect(status().isBadRequest());
    }

    @Test void concurrentSeatAssignmentsForOneMemberHaveExactlyOneWinner() throws Exception {
        member("seat-race-admin","LAB_ADMIN");
        UUID person=member("seat-race-person","MEMBER");
        String body="{\"memberId\":\""+person+"\"}";
        List<Integer> outcomes=runConcurrently(
            () -> mvc.perform(put("/api/v1/seats/A01/assignment").with(login("seat-race-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus(),
            () -> mvc.perform(put("/api/v1/seats/B01/assignment").with(login("seat-race-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus());

        assertThat(outcomes).containsExactlyInAnyOrder(HttpStatus.OK.value(),HttpStatus.CONFLICT.value());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM seat_assignment WHERE member_id=? AND released_at IS NULL",Integer.class,person)).isEqualTo(1);
    }

    @Test void projectMeetingAndMyTaskViewsShareOneAuthorizedTaskRecord() throws Exception {
        UUID actor=member("collab-owner","MEMBER");member("collab-unrelated","MEMBER");
        var created=mvc.perform(post("/api/v1/projects").with(login("collab-owner")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Access study\",\"description\":\"Private work\"}"))
            .andExpect(status().isCreated()).andReturn();
        var projectJson=new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString());
        String project=projectJson.get("id").asText();
        mvc.perform(get("/api/v1/projects").with(login("collab-unrelated"))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/projects/"+project+"/tasks").with(login("collab-unrelated"))).andExpect(status().isNotFound());
        var meetingCreated=mvc.perform(post("/api/v1/meetings").with(login("collab-owner")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Weekly\",\"projectId\":\""+project+"\",\"startsAt\":\""+Instant.now().plusSeconds(3600)+"\",\"participants\":[]}"))
            .andExpect(status().isCreated()).andReturn();
        String meeting=new com.fasterxml.jackson.databind.ObjectMapper().readTree(meetingCreated.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(post("/api/v1/meetings/"+meeting+"/actions").with(login("collab-owner")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"Reproduce the baseline\",\"assigneeId\":\""+actor+"\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("OPEN"));
        String taskId=jdbc.queryForObject("SELECT id FROM task WHERE project_id=? AND title='Reproduce the baseline'",UUID.class,UUID.fromString(project)).toString();
        mvc.perform(get("/api/v1/projects/"+project+"/tasks").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].title").value("Reproduce the baseline"))
            .andExpect(jsonPath("$.items[0].status").value("OPEN"));
        mvc.perform(get("/api/v1/meetings/"+meeting+"/actions").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].title").value("Reproduce the baseline")).andExpect(jsonPath("$[0].status").value("OPEN"));
        mvc.perform(get("/api/v1/tasks/mine").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].title").value("Reproduce the baseline"))
            .andExpect(jsonPath("$.items[0].status").value("OPEN"));
        mvc.perform(patch("/api/v1/tasks/"+taskId).with(login("collab-unrelated")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DONE\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/tasks/"+taskId).with(login("collab-owner")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DONE\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get("/api/v1/projects/"+project+"/tasks").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].status").value("DONE"));
        mvc.perform(get("/api/v1/meetings/"+meeting+"/actions").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("DONE"));
        mvc.perform(get("/api/v1/tasks/mine").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].status").value("DONE"));
        mvc.perform(patch("/api/v1/tasks/"+taskId).with(login("collab-owner")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"OPEN\"}"))
            .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/meetings").with(login("collab-unrelated"))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/v1/meetings/"+meeting+"/minutes").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.body").value(""));
        mvc.perform(put("/api/v1/meetings/"+meeting+"/minutes").with(login("collab-owner")).with(csrf()).header("If-Match-Version",1).contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Decision recorded\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get("/api/v1/meetings/"+meeting+"/minutes").with(login("collab-owner"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.body").value("Decision recorded"));
        mvc.perform(put("/api/v1/meetings/"+meeting+"/minutes").with(login("collab-owner")).with(csrf()).header("If-Match-Version",1).contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Stale edit\"}"))
            .andExpect(status().isConflict());
    }

    @Test void projectMembershipMilestonesAndArchiveEnforceOwnerScopeAndVersions() throws Exception {
        UUID lead=member("project-management-lead","MEMBER");
        UUID participant=member("project-management-member","MEMBER");
        UUID outsider=member("project-management-outsider","MEMBER");
        var created=mvc.perform(post("/api/v1/projects").with(login("project-management-lead")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Research plan\",\"description\":\"Shared only with assigned members\"}"))
            .andExpect(status().isCreated()).andReturn();
        String project=new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString()).get("id").asText();

        mvc.perform(get("/api/v1/projects/"+project+"/members").with(login("project-management-outsider")))
            .andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/projects/"+project+"/members/"+participant).with(login("project-management-lead")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"MEMBER\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.memberId").value(participant.toString()));
        mvc.perform(get("/api/v1/projects/"+project+"/members").with(login("project-management-outsider")))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/projects/"+project+"/milestones").with(login("project-management-lead")))
            .andExpect(status().isOk()).andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(0)));
        var milestone=mvc.perform(post("/api/v1/projects/"+project+"/milestones").with(login("project-management-lead")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Baseline complete\",\"dueDate\":\"2026-10-01\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1)).andReturn();
        String milestoneId=new com.fasterxml.jackson.databind.ObjectMapper().readTree(milestone.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(patch("/api/v1/projects/"+project+"/milestones/"+milestoneId).with(login("project-management-lead")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Baseline complete\",\"dueDate\":\"2026-10-01\",\"completed\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.completedAt").isNotEmpty()).andExpect(jsonPath("$.version").value(2));
        mvc.perform(patch("/api/v1/projects/"+project+"/milestones/"+milestoneId).with(login("project-management-lead")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Stale edit\",\"completed\":false}"))
            .andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/projects/"+project+"/members/"+participant).with(login("project-management-lead")).with(csrf()))
            .andExpect(status().isNoContent());
        mvc.perform(patch("/api/v1/projects/"+project).with(login("project-management-lead")).with(csrf()).header("If-Match-Version",1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Research plan\",\"description\":\"Archived\",\"status\":\"ARCHIVED\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ARCHIVED"));
        mvc.perform(get("/api/v1/projects/"+project+"/milestones").with(login("project-management-lead")))
            .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id=? AND action IN ('ADD_PROJECT_MEMBER','CREATE_PROJECT_MILESTONE','UPDATE_PROJECT_MILESTONE','REMOVE_PROJECT_MEMBER','UPDATE_PROJECT')",Integer.class,lead)).isGreaterThanOrEqualTo(5);
    }

    @Test void lastSuperAdminIsProtectedAndRoleChangesCommitAnOutboxExpectation() throws Exception {
        jdbc.update("UPDATE role_assignment SET revoked_at=now(),version=version+1 WHERE role='SUPER_ADMIN' AND revoked_at IS NULL");
        UUID only=member("only-super-admin","SUPER_ADMIN");
        mvc.perform(put("/api/v1/admin/members/"+only+"/roles/SUPER_ADMIN").with(login("only-super-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"granted\":false,\"version\":1}"))
            .andExpect(status().isConflict());
        UUID actor=member("role-admin","SUPER_ADMIN");UUID target=member("role-target","SUPER_ADMIN");
        mvc.perform(put("/api/v1/admin/members/"+target+"/roles/SUPER_ADMIN").with(login("role-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"granted\":false,\"version\":1}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.granted").value(false));
        assertThat(jdbc.queryForObject("SELECT desired FROM external_role_sync WHERE member_id=?",Boolean.class,target)).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE event_type='OJ_ADMIN_ROLE_SYNC' AND aggregate_id=?",Integer.class,target)).isEqualTo(1);
    }

    @Test void leaveApprovalEnforcesOverlapPrivacyAndVersionedTransitions() throws Exception {
        UUID applicant=member("leave-applicant","MEMBER"); UUID approver=member("leave-approver","TEACHER"); member("leave-outsider","MEMBER");
        String start=Instant.now().plusSeconds(3600).toString(); String end=Instant.now().plusSeconds(7200).toString();
        var created=mvc.perform(post("/api/v1/leaves").with(login("leave-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"startsAt\":\""+start+"\",\"endsAt\":\""+end+"\",\"approverId\":\""+approver+"\",\"reason\":\"Appointment\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING")).andReturn();
        String application=new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString()).get("id").asText();
        mvc.perform(post("/api/v1/leaves").with(login("leave-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"startsAt\":\""+start+"\",\"endsAt\":\""+end+"\",\"approverId\":\""+approver+"\",\"reason\":\"Overlap\"}"))
            .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/leaves/"+application).with(login("leave-outsider"))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/leaves/"+application+"/decision").with(login("leave-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVED\",\"version\":1}"))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/leaves/"+application+"/decision").with(login("leave-approver")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"APPROVED\",\"version\":1}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(post("/api/v1/leaves/"+application+"/withdraw").with(login("leave-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}"))
            .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notification WHERE recipient_id=? AND kind='LEAVE_PENDING'",Integer.class,approver)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE event_type='NOTIFICATION_EMAIL' AND aggregate_id=?",Integer.class,approver)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE target_type='leave_application' AND target_id=?",Integer.class,application)).isGreaterThanOrEqualTo(2);
    }

    @Test void leaveRequestsRejectSelfApprovalAndInvalidIntervalsButAllowHalfOpenAdjacency() throws Exception {
        UUID applicant=member("leave-boundary-applicant","MEMBER"); UUID approver=member("leave-boundary-approver","TEACHER");
        String now=Instant.now().plusSeconds(3600).toString(); String later=Instant.now().plusSeconds(7200).toString(); String later2=Instant.now().plusSeconds(10800).toString();
        String self="{\"startsAt\":\""+now+"\",\"endsAt\":\""+later+"\",\"approverId\":\""+applicant+"\",\"reason\":\"Self\"}";
        mvc.perform(post("/api/v1/leaves").with(login("leave-boundary-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(self)).andExpect(status().isBadRequest());
        String reversed="{\"startsAt\":\""+later+"\",\"endsAt\":\""+now+"\",\"approverId\":\""+approver+"\",\"reason\":\"Bad interval\"}";
        mvc.perform(post("/api/v1/leaves").with(login("leave-boundary-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(reversed)).andExpect(status().isBadRequest());
        String first="{\"startsAt\":\""+now+"\",\"endsAt\":\""+later+"\",\"approverId\":\""+approver+"\",\"reason\":\"First\"}";
        String adjacent="{\"startsAt\":\""+later+"\",\"endsAt\":\""+later2+"\",\"approverId\":\""+approver+"\",\"reason\":\"Adjacent\"}";
        mvc.perform(post("/api/v1/leaves").with(login("leave-boundary-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(first)).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/leaves").with(login("leave-boundary-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(adjacent)).andExpect(status().isCreated());
    }

    @Test void concurrentLeaveApprovalAndWithdrawalAllowOnlyOneTransition() throws Exception {
        member("leave-race-applicant","MEMBER");
        UUID approver=member("leave-race-approver","TEACHER");
        String starts=Instant.now().plusSeconds(3600).toString(), ends=Instant.now().plusSeconds(7200).toString();
        var created=mvc.perform(post("/api/v1/leaves").with(login("leave-race-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"startsAt\":\""+starts+"\",\"endsAt\":\""+ends+"\",\"approverId\":\""+approver+"\",\"reason\":\"Concurrent decision test\"}"))
            .andExpect(status().isCreated()).andReturn();
        String application=new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString()).get("id").asText();
        List<Integer> outcomes=runConcurrently(
            () -> mvc.perform(post("/api/v1/leaves/"+application+"/decision").with(login("leave-race-approver")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"APPROVED\",\"version\":1}" )).andReturn().getResponse().getStatus(),
            () -> mvc.perform(post("/api/v1/leaves/"+application+"/withdraw").with(login("leave-race-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":1}" )).andReturn().getResponse().getStatus());

        assertThat(outcomes).containsExactlyInAnyOrder(HttpStatus.OK.value(),HttpStatus.CONFLICT.value());
        assertThat(jdbc.queryForObject("SELECT status FROM leave_application WHERE id=?",String.class,UUID.fromString(application)))
            .isIn("APPROVED","WITHDRAWN");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM leave_decision WHERE application_id=? AND decision IN ('APPROVED','WITHDRAWN')",Integer.class,UUID.fromString(application))).isEqualTo(1);
    }


    @Test void emailApprovalGetDoesNotMutateAndPostConsumesOnlyForTheAssignedApprover() throws Exception {
        UUID approver=member("email-approval-approver","TEACHER"); member("email-approval-applicant","MEMBER"); member("email-approval-outsider","MEMBER");
        String starts=Instant.now().plusSeconds(3600).toString(), ends=Instant.now().plusSeconds(7200).toString();
        var created=mvc.perform(post("/api/v1/leaves").with(login("email-approval-applicant")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"startsAt\":\""+starts+"\",\"endsAt\":\""+ends+"\",\"approverId\":\""+approver+"\",\"reason\":\"Email token test\"}"))
            .andExpect(status().isCreated()).andReturn();
        String application=new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString()).get("id").asText();
        String cipher=jdbc.queryForObject("SELECT payload->>'approvalTokenCiphertext' FROM outbox_event WHERE aggregate_id=? AND event_type='NOTIFICATION_EMAIL'",String.class,approver);
        assertThat(cipher).isNotBlank();
        String token=tokenCrypto.decrypt(cipher);
        assertThat(jdbc.queryForObject("SELECT token_hash FROM approval_token WHERE application_id=?",String.class,UUID.fromString(application))).isEqualTo(tokenCrypto.hash(token)).isNotEqualTo(token);
        mvc.perform(get("/api/v1/leaves/email-action").param("token",token).with(login("email-approval-approver")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(jdbc.queryForObject("SELECT consumed_at FROM approval_token WHERE application_id=?",java.time.OffsetDateTime.class,UUID.fromString(application))).isNull();
        mvc.perform(post("/api/v1/leaves/email-action").with(login("email-approval-outsider")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\""+token+"\",\"decision\":\"APPROVED\"}" )).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/leaves/email-action").with(login("email-approval-approver")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\""+token+"\",\"decision\":\"APPROVED\"}" ))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        assertThat(jdbc.queryForObject("SELECT consumed_at FROM approval_token WHERE application_id=?",java.time.OffsetDateTime.class,UUID.fromString(application))).isNotNull();
        mvc.perform(post("/api/v1/leaves/email-action").with(login("email-approval-approver")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\""+token+"\",\"decision\":\"APPROVED\"}" )).andExpect(status().isNotFound());
    }

    @Test void outboxRecoversExpiredLeasesAndRetriesMailAfterTransientFailure() {
        UUID recipient=member("outbox-recipient","MEMBER");
        jdbc.update("UPDATE member SET notification_email='member@example.invalid',notification_email_verified=true WHERE id=?",recipient);
        jdbc.update("UPDATE lab_setting SET mail_enabled=true WHERE singleton=true");
        UUID notification=jdbc.queryForObject("INSERT INTO notification(recipient_id,kind,payload) VALUES (?,'MANUAL_TEST','{}') RETURNING id",UUID.class,recipient);
        UUID event=jdbc.queryForObject("INSERT INTO outbox_event(event_type,aggregate_id,payload,lease_owner,lease_until) VALUES ('NOTIFICATION_EMAIL',?,jsonb_build_object('notificationId',?::text,'kind','MANUAL_TEST'),'crashed-worker',now()-interval '1 second') RETURNING id",UUID.class,recipient,notification.toString());
        doThrow(new MailSendException("simulated transient SMTP failure")).when(mailSender).send(any(SimpleMailMessage.class));
        outboxWorker.dispatch();
        assertThat(jdbc.queryForObject("SELECT attempts FROM outbox_event WHERE id=?",Integer.class,event)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT delivered_at FROM outbox_event WHERE id=?",java.time.OffsetDateTime.class,event)).isNull();
        assertThat(jdbc.queryForObject("SELECT last_error FROM outbox_event WHERE id=?",String.class,event)).isEqualTo("MailSendException");
        assertThat(jdbc.queryForObject("SELECT lease_owner FROM outbox_event WHERE id=?",String.class,event)).isNull();
        reset(mailSender);
        jdbc.update("UPDATE outbox_event SET available_at=now()-interval '1 second' WHERE id=?",event);
        outboxWorker.dispatch();
        assertThat(jdbc.queryForObject("SELECT delivered_at FROM outbox_event WHERE id=?",java.time.OffsetDateTime.class,event)).isNotNull();
        verify(mailSender).send(any(SimpleMailMessage.class));
    }

    @Test void assessmentHistoryVeteranFilteringVersioningAndPublishedPrivacyWorkTogether() throws Exception {
        member("assessment-admin","LAB_ADMIN");member("assessment-teacher","TEACHER");
        UUID alice=member("assessment-alice","MEMBER"),bob=member("assessment-bob","MEMBER"),veteran=member("assessment-veteran","MEMBER");
        var termResponse=mvc.perform(post("/api/v1/assessment/terms").with(login("assessment-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Scoring test\",\"startsOn\":\"2026-01-01\",\"endsOn\":\"2026-06-30\",\"active\":false}"))
            .andExpect(status().isOk()).andReturn();
        UUID term=UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(termResponse.getResponse().getContentAsString()).get("id").asText());
        addTermMember(term,alice,false);addTermMember(term,bob,false);addTermMember(term,veteran,true);
        UUID written=createExam(term,"Historic written","WRITTEN","2026-02-01T09:00:00Z");
        UUID practical=createExam(term,"Historic practical","PRACTICAL","2026-03-01T09:00:00Z");
        UUID selected=createExam(term,"Current written","WRITTEN","2026-04-01T09:00:00Z");
        saveGrade(written,alice,1,80,"GRADED");saveGrade(written,bob,2,90,"GRADED");saveGrade(written,veteran,3,100,"GRADED");
        saveGrade(practical,alice,1,90,"GRADED");saveGrade(practical,bob,2,80,"GRADED");saveGrade(practical,veteran,3,100,"GRADED");
        saveGrade(selected,alice,1,90,"GRADED");saveGrade(selected,bob,2,60,"GRADED");saveGrade(selected,veteran,3,0,"GRADED");

        var ranking=mvc.perform(get("/api/v1/assessment/exams/"+selected+"/ranking").with(login("assessment-admin")).param("excludeVeterans","true"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.algorithmVersion").value("xju-ranking-v1")).andReturn();
        var rows=new com.fasterxml.jackson.databind.ObjectMapper().readTree(ranking.getResponse().getContentAsString()).get("items");
        var aliceRow=java.util.stream.StreamSupport.stream(rows.spliterator(),false).filter(row->row.path("student").path("id").asText().equals(alice.toString())).findFirst().orElseThrow();
        var bobRow=java.util.stream.StreamSupport.stream(rows.spliterator(),false).filter(row->row.path("student").path("id").asText().equals(bob.toString())).findFirst().orElseThrow();
        assertThat(aliceRow.path("history").size()).isEqualTo(2);assertThat(aliceRow.path("historyAverage").asDouble()).isEqualTo(85d);
        assertThat(aliceRow.path("composite").asDouble()).isEqualTo(88.75d);assertThat(aliceRow.path("currentRank").asInt()).isEqualTo(1);assertThat(aliceRow.path("overallRank").asInt()).isEqualTo(1);
        assertThat(bobRow.path("composite").asDouble()).isEqualTo(66.25d);assertThat(bobRow.path("currentRank").asInt()).isEqualTo(2);assertThat(bobRow.path("overallRank").asInt()).isEqualTo(2);

        long currentTermVersion=jdbc.queryForObject("SELECT version FROM training_term WHERE id=?",Long.class,term);
        mvc.perform(post("/api/v1/assessment/exams/"+selected+"/publish").with(login("assessment-admin")).with(csrf()).header("If-Match-Version",currentTermVersion-1))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/assessment/exams/"+selected+"/publish").with(login("assessment-admin")).with(csrf()).header("If-Match-Version",currentTermVersion))
            .andExpect(status().isOk()).andExpect(jsonPath("$.algorithmVersion").value("xju-ranking-v1"));
        mvc.perform(get("/api/v1/assessment/exams/"+selected+"/published").with(login("assessment-alice")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].payload.rows.length()").value(1)).andExpect(jsonPath("$[0].payload.rows[0].student.id").value(alice.toString()));
        mvc.perform(get("/api/v1/assessment/exams/"+selected+"/ranking").with(login("assessment-alice")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].student.id").value(alice.toString()));
    }

    @Test void printerAgentReportsOnlyAuthenticatedDeviceStatus() throws Exception {
        member("printer-status-admin", "LAB_ADMIN");
        member("printer-status-viewer", "MEMBER");
        var created = mvc.perform(post("/api/v1/admin/printers").with(login("printer-status-admin")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"name":"Status printer","location":"A411"}
                    """))
            .andExpect(status().isOk()).andReturn();
        var credential = new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString());
        String token = credential.get("token").asText();
        UUID agent = UUID.fromString(credential.get("agentId").asText());
        assertThat(jdbc.queryForObject("SELECT token_hash FROM agent_identity WHERE id=?", String.class, agent)).isNotEqualTo(token);

        String heartbeat = """
            {"agentVersion":"0.2.0","deviceState":"READY","tonerSupported":true,"tonerPercent":18}
            """;
        mvc.perform(post("/api/v1/printer-agent/heartbeat").header("Authorization", "Bearer invalid-token")
                .contentType(MediaType.APPLICATION_JSON).content(heartbeat))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/printer-agent/heartbeat").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(heartbeat))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OK"));
        mvc.perform(get("/api/v1/printers").with(login("printer-status-viewer")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("ONLINE"))
            .andExpect(jsonPath("$[0].lastReport.deviceState").value("READY"))
            .andExpect(jsonPath("$[0].lastReport.tonerPercent").value(18));
        mvc.perform(post("/api/v1/printer-agent/heartbeat").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"agentVersion":"0.2.0","deviceState":"READY","tonerSupported":true,"tonerPercent":101}
                    """))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/printer-agent/poll").header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/print/jobs").with(login("printer-status-viewer")))
            .andExpect(status().isNotFound());
    }

    @Test void ojImportRejectsAnyContestHostOutsideTheConfiguredOrigin() throws Exception {
        member("oj-import-admin", "LAB_ADMIN");
        mvc.perform(post("/api/v1/assessment/acm/imports").with(login("oj-import-admin")).with(csrf())
                .header("Idempotency-Key", "oj-import-link-001").contentType(MediaType.APPLICATION_JSON)
                .content("{\"sourceUrl\":\"https://example.com/contest/21/rank?page=2\"}"))
            .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM assessment_import_job WHERE contest_id='21'", Integer.class)).isZero();
    }

    @Test void superAdminRoleChangesQueueVersionedOjSyncAndExposeItsRealState() throws Exception {
        UUID admin = member("oj-role-super-admin", "SUPER_ADMIN");
        UUID target = member("oj-role-target", "MEMBER");
        mvc.perform(put("/api/v1/admin/members/" + target + "/roles/SUPER_ADMIN").with(login("oj-role-super-admin")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"granted\":true,\"version\":1}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.granted").value(true));
        assertThat(jdbc.queryForObject("SELECT desired FROM external_role_sync WHERE member_id=?", Boolean.class, target)).isTrue();
        assertThat(jdbc.queryForObject("SELECT status FROM external_role_sync WHERE member_id=?", String.class, target)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_event WHERE event_type='OJ_ADMIN_ROLE_SYNC' AND aggregate_id=? AND delivered_at IS NULL", Integer.class, target)).isEqualTo(1);
        mvc.perform(get("/api/v1/admin/members/" + target + "/oj-role-sync").with(login("oj-role-super-admin")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.desiredAdmin").value(true)).andExpect(jsonPath("$.confirmedVersion").value(0));
        mvc.perform(post("/api/v1/admin/members/" + target + "/oj-role-sync/retry").with(login("oj-role-super-admin")).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(admin).isNotNull();
    }

    @Test void ojImportUsesAStableSnapshotAndPersistsOnlyMappedLabMembers() throws Exception {
        jdbc.update("UPDATE training_term SET active=false WHERE active=true");
        UUID admin = member("oj-import-integration-admin", "LAB_ADMIN");
        UUID student = jdbc.queryForObject("INSERT INTO member(account_id,display_name) VALUES ('12345678','OJ roster member') RETURNING id", UUID.class);
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai"));
        UUID term = jdbc.queryForObject("INSERT INTO training_term(name,starts_on,ends_on,active) VALUES ('OJ integration term',?,?,true) RETURNING id", UUID.class, today.minusDays(2), today.plusDays(2));
        jdbc.update("INSERT INTO term_member(term_id,member_id) VALUES (?,?)", term, student);
        var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/integrations/labos/contests/42/results", exchange -> {
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer test-service-token");
            byte[] body = ("{\"sourceVersion\":\"v7\",\"snapshotVersion\":\"snap-2\",\"total\":2,\"title\":\"ACM final\",\"endedAt\":\"" + today.atTime(12, 0).atZone(java.time.ZoneId.of("Asia/Shanghai")).toOffsetDateTime() + "\",\"ruleType\":\"ACM\",\"finalRanking\":true,\"items\":[{\"sourceUserId\":\"oj-1\",\"accountId\":\"12345678\",\"rank\":1,\"acceptedCount\":4,\"penaltySeconds\":1200},{\"sourceUserId\":\"oj-2\",\"accountId\":\"87654321\",\"rank\":2,\"acceptedCount\":3,\"penaltySeconds\":1400}]}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json"); exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            String source = "https://oj.icthub.top/contest/42/rank?page=3";
            var queued = mvc.perform(post("/api/v1/assessment/acm/imports").with(login("oj-import-integration-admin")).with(csrf())
                    .header("Idempotency-Key", "oj-import-integration-42").contentType(MediaType.APPLICATION_JSON).content("{\"sourceUrl\":\"" + source + "\"}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("QUEUED")).andReturn();
            UUID importId = UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(queued.getResponse().getContentAsString()).get("id").asText());
            String endpoint = "http://127.0.0.1:" + server.getAddress().getPort();
            new org.xjuarlab.lab.integrations.oj.OjImportWorker(jdbc, transactionManager,
                new org.xjuarlab.lab.integrations.oj.OjIntegrationClient(endpoint, "test-service-token", new com.fasterxml.jackson.databind.ObjectMapper()),
                new com.fasterxml.jackson.databind.ObjectMapper(), "Asia/Shanghai").poll();
            assertThat(jdbc.queryForObject("SELECT status FROM assessment_import_job WHERE id=?", String.class, importId)).isEqualTo("COMPLETED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM contest_snapshot WHERE term_id=? AND contest_id='42' AND complete=true", Integer.class, term)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM contest_result cr JOIN contest_snapshot cs ON cs.id=cr.snapshot_id WHERE cs.term_id=? AND cs.contest_id='42'", Integer.class, term)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT source_payload->'items'->0->>'sourceUserId' FROM contest_snapshot WHERE term_id=? AND contest_id='42'", String.class, term)).isEqualTo("oj-1");
            assertThat(jdbc.queryForObject("SELECT version FROM training_term WHERE id=?", Long.class, term)).isEqualTo(2L);
        } finally {
            server.stop(0);
            jdbc.update("UPDATE training_term SET active=false WHERE id=?", term);
        }
    }

    private void addTermMember(UUID term,UUID member,boolean veteran) throws Exception {
        mvc.perform(post("/api/v1/assessment/terms/"+term+"/members").with(login("assessment-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"memberId\":\""+member+"\",\"veteran\":"+veteran+"}" )).andExpect(status().isOk());
    }
    private UUID createExam(UUID term,String title,String kind,String startsAt) throws Exception {
        var created=mvc.perform(post("/api/v1/assessment/terms/"+term+"/exams").with(login("assessment-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\""+title+"\",\"kind\":\""+kind+"\",\"startsAt\":\""+startsAt+"\",\"rubric\":[]}"))
            .andExpect(status().isOk()).andReturn();
        return UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(created.getResponse().getContentAsString()).get("id").asText());
    }
    private void saveGrade(UUID exam,UUID member,long version,double score,String statusValue) throws Exception {
        mvc.perform(put("/api/v1/assessment/exams/"+exam+"/grades/"+member).with(login("assessment-teacher")).with(csrf()).header("If-Match-Version",version)
            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\""+statusValue+"\",\"score\":"+score+",\"reason\":\"integration fixture\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.examVersion").value(version+1));
    }

    @Test void sshMonitoringOnlyConnectsOnDemandAndReusesRecentOrRunningReads() throws Exception {
        member("on-demand-member",null);
        UUID id=jdbc.queryForObject("INSERT INTO server_asset(name,ssh_connection) VALUES ('按需采集测试','{\"nodes\":[{\"host\":\"fixture\",\"user\":\"lab\",\"port\":22}]}') RETURNING id",UUID.class);
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        var entered=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            entered.countDown();
            assertThat(release.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            return mapper.readTree("{\"status\":\"CONNECTED\",\"metrics\":[{\"metric\":\"CPU\",\"unit\":\"%\",\"value\":12,\"status\":\"AVAILABLE\"}]}");
        });
        try(var onDemand=new org.xjuarlab.lab.monitoring.SshMonitoring(jdbc,mapper,sshWorker,true)) {
            onDemand.cleanup();
            mvc.perform(get("/api/v1/monitor/assets").with(login("on-demand-member"))).andExpect(status().isOk());
            onDemand.series(id,"CPU","1h",java.time.Duration.ofHours(1));
            org.mockito.Mockito.verifyNoInteractions(sshWorker);
            assertThat(onDemand.metrics(id,false).state()).isEqualTo("COLLECTING");
            assertThat(entered.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(onDemand.metrics(id,false).state()).isEqualTo("COLLECTING");
            verify(sshWorker,org.mockito.Mockito.times(1)).run(any());
            release.countDown();
            org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(5)).untilAsserted(()->
                assertThat(onDemand.metrics(id,false).state()).isEqualTo("SSH_CONNECTED"));
            onDemand.cleanup();
            onDemand.metrics(id,false);
            verify(sshWorker,org.mockito.Mockito.times(1)).run(any());
            jdbc.update("UPDATE server_metric_sample SET sampled_at=now()-interval '35 seconds' WHERE asset_id=?",id);
            org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(5)).untilAsserted(()-> {
                onDemand.metrics(id,false);
                assertThat(jdbc.queryForObject("SELECT count(*) FROM server_metric_sample WHERE asset_id=?",Integer.class,id)).isEqualTo(2);
            });
            verify(sshWorker,org.mockito.Mockito.times(2)).run(any());
            jdbc.update("UPDATE server_metric_sample SET sampled_at=sampled_at-interval '26 hours' WHERE asset_id=?",id);
            onDemand.cleanup();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM server_metric_sample WHERE asset_id=?",Integer.class,id)).isZero();
            verify(sshWorker,org.mockito.Mockito.times(2)).run(any());
        } finally { release.countDown(); jdbc.update("DELETE FROM server_asset WHERE id=?",id); }
    }

    @Test void sshMonitoringPersistsRealSamplesAndSeparatesFailureDisabledAndStale() throws Exception {
        member("metrics-member",null);
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        UUID id=jdbc.queryForObject("INSERT INTO server_asset(name,gpu_supported,ssh_connection) VALUES ('采集测试',true,'{\"nodes\":[{\"host\":\"fixture\",\"user\":\"lab\",\"port\":22}]}') RETURNING id",UUID.class);
        String path="/api/v1/monitor/assets/"+id;
        mvc.perform(get(path+"/metrics")).andExpect(status().isUnauthorized());
        mvc.perform(get(path+"/metrics").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("COLLECTING"));
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            var input=(com.fasterxml.jackson.databind.JsonNode)call.getArgument(0);
            assertThat(input.path("action").asText()).isEqualTo("metrics");
            assertThat(input.has("password")).isFalse();
            return mapper.readTree("{\"status\":\"CONNECTED\",\"metrics\":[{\"metric\":\"CPU\",\"unit\":\"%\",\"value\":42.5,\"status\":\"AVAILABLE\"},{\"metric\":\"GPU\",\"unit\":\"%\",\"value\":0,\"status\":\"AVAILABLE\"}]}");
        });
        sshMonitoring.collect(id);
        mvc.perform(get(path+"/metrics").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("SSH_CONNECTED")).andExpect(jsonPath("$.metrics[0].value").value(42.5));
        mvc.perform(get(path+"/series?metric=CPU&range=1h").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.points[0].value").value(42.5));
        mvc.perform(get(path+"/series?metric=invalid&range=1h").with(login("metrics-member"))).andExpect(status().isBadRequest());
        mvc.perform(get(path+"/series?metric=CPU&range=2h").with(login("metrics-member"))).andExpect(status().isBadRequest());
        jdbc.update("UPDATE server_metric_sample SET sampled_at=now()-interval '2 minutes' WHERE asset_id=?",id);
        mvc.perform(get(path+"/metrics").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("STALE")).andExpect(jsonPath("$.metrics[0].status").value("STALE"));
        org.mockito.Mockito.doReturn(mapper.readTree("{\"status\":\"FAILED\"}")).when(sshWorker).run(any());
        sshMonitoring.collect(id);
        mvc.perform(get(path+"/metrics").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("SSH_UNAVAILABLE")).andExpect(jsonPath("$.metrics[0].value").doesNotExist());
        jdbc.update("UPDATE server_asset SET enabled=false WHERE id=?",id);
        reset(sshWorker); sshMonitoring.collect(id);
        org.mockito.Mockito.verifyNoInteractions(sshWorker);
        mvc.perform(get(path+"/metrics").with(login("metrics-member"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("DISABLED"));
        jdbc.update("DELETE FROM server_asset WHERE id=?",id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM server_metric_sample WHERE asset_id=?",Integer.class,id)).isZero();
    }

    @Test void sshDraftsEnforceAdminOwnershipConnectionSaveExpiryAndDeleteVersion() throws Exception {
        UUID owner=member("ssh-admin","LAB_ADMIN");member("ssh-other-admin","SUPER_ADMIN");member("ssh-member",null);
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return mapper.readTree("{\"nodes\":[{\"host\":\"fixture.internal\",\"port\":22,\"user\":\"lab\",\"alias\":\"test\"}]}");
        });
        String root="/api/v1/monitor/admin/ssh";
        mvc.perform(get(root+"/config").with(login("ssh-member"))).andExpect(status().isForbidden());
        mvc.perform(post(root+"/connections").with(login("ssh-member")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"测试服务器\",\"config\":\"Host test\",\"alias\":\"test\"}")).andExpect(status().isForbidden());
        String body=mvc.perform(post(root+"/connections").with(login("ssh-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"测试服务器\",\"config\":\"Host test\",\"alias\":\"test\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String id=mapper.readTree(body).path("id").asText();
        mvc.perform(post(root+"/connections/"+id+"/save").with(login("ssh-admin")).with(csrf())).andExpect(status().isConflict());
        mvc.perform(post(root+"/connections/"+id+"/connect").with(login("ssh-other-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return mapper.readTree("{\"status\":\"CONNECTED\",\"keyVerified\":true,\"hardware\":{\"kind\":\"GPU\",\"gpus\":[\"fixture\"]}}");
        });
        mvc.perform(post(root+"/connections/"+id+"/connect").with(login("ssh-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk()).andExpect(jsonPath("$.keyVerified").value(true));
        String saved=mvc.perform(post(root+"/connections/"+id+"/save").with(login("ssh-admin")).with(csrf())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String asset=mapper.readTree(saved).path("assetId").asText();
        mvc.perform(post(root+"/connections/"+id+"/save").with(login("ssh-admin")).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.assetId").value(asset));
        assertThat(jdbc.queryForObject("SELECT gpu_supported FROM server_asset WHERE id=?",Boolean.class,UUID.fromString(asset))).isTrue();
        mvc.perform(delete("/api/v1/monitor/admin/assets/"+asset).with(login("ssh-member")).with(csrf()).header("If-Match-Version",1)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/monitor/admin/assets/"+asset).with(login("ssh-admin")).with(csrf()).header("If-Match-Version",2)).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/monitor/admin/assets/"+asset).with(login("ssh-admin")).with(csrf()).header("If-Match-Version",1)).andExpect(status().isNoContent());
        jdbc.update("UPDATE server_connection_draft SET expires_at=now()-interval '1 second' WHERE id=?",UUID.fromString(id));
        mvc.perform(post(root+"/connections/"+id+"/save").with(login("ssh-admin")).with(csrf())).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id=? AND action='CONNECT_SERVER'",Integer.class,owner)).isEqualTo(1);
    }

    @Test void cancelledSshProbeCannotBeSavedAndConcurrentSaveIsIdempotent() throws Exception {
        UUID owner=member("ssh-cancel-admin","LAB_ADMIN");
        UUID id=jdbc.queryForObject("INSERT INTO server_connection_draft(owner_id,name,nodes,status,result) VALUES (?,'并发测试','[{\"host\":\"race.invalid\",\"user\":\"lab\",\"port\":22}]','CONNECTED','{\"keyVerified\":true,\"hardware\":{\"kind\":\"CPU\"}}') RETURNING id",UUID.class,owner);
        var service=new org.xjuarlab.lab.servers.application.ServerConnections(jdbc,new com.fasterxml.jackson.databind.ObjectMapper(),sshWorker,transactionManager);
        var saves=runConcurrently(()->service.save(owner,id),()->service.save(owner,id));
        assertThat(saves.get(0)).isEqualTo(saves.get(1));
        UUID cancelled=jdbc.queryForObject("INSERT INTO server_connection_draft(owner_id,name,nodes) VALUES (?,'取消测试','[]') RETURNING id",UUID.class,owner);
        service.cancel(owner,cancelled);
        mvc.perform(post("/api/v1/monitor/admin/ssh/connections/"+cancelled+"/connect").with(login("ssh-cancel-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/monitor/admin/ssh/connections/"+cancelled+"/save").with(login("ssh-cancel-admin")).with(csrf())).andExpect(status().isConflict());
    }

    @Test void sshPasswordsAreTransientAndCancellationWinsOverInflightResults() throws Exception {
        UUID owner=member("ssh-transient-admin","LAB_ADMIN");
        UUID id=jdbc.queryForObject("INSERT INTO server_connection_draft(owner_id,name,nodes,status,result) VALUES (?,'密码测试','[]','PASSWORD_REQUIRED','{\"host\":\"lab@fixture:22\"}') RETURNING id",UUID.class,owner);
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            var input=(com.fasterxml.jackson.databind.JsonNode)call.getArgument(0);
            assertThat(input.path("password").asText()).isEqualTo("transient-fixture-password");
            assertThat(input.path("passwordTarget").asText()).isEqualTo("lab@fixture:22");
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return mapper.readTree("{\"status\":\"CONNECTED\",\"keyVerified\":true,\"hardware\":{\"kind\":\"CPU\"}}");
        });
        String path="/api/v1/monitor/admin/ssh/connections/"+id;
        mvc.perform(post(path+"/connect").with(login("ssh-transient-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"transient-fixture-password\"}")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT row_to_json(d)::text FROM server_connection_draft d WHERE id=?",String.class,id)).doesNotContain("transient-fixture-password");
        reset(sshWorker);
        org.mockito.Mockito.when(sshWorker.run(any())).thenAnswer(call->{
            jdbc.update("UPDATE server_connection_draft SET status='CANCELLED' WHERE id=?",id);
            return mapper.readTree("{\"status\":\"CONNECTED\",\"keyVerified\":true}");
        });
        mvc.perform(post(path+"/connect").with(login("ssh-transient-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        mvc.perform(post(path+"/save").with(login("ssh-transient-admin")).with(csrf())).andExpect(status().isConflict());
        // A process restart can leave RUNNING; it becomes retryable after the worker's bound.
        jdbc.update("UPDATE server_connection_draft SET status='RUNNING',updated_at=now() WHERE id=?",id);
        mvc.perform(post(path+"/connect").with(login("ssh-transient-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        jdbc.update("UPDATE server_connection_draft SET updated_at=now()-interval '3 minutes' WHERE id=?",id);
        reset(sshWorker);
        org.mockito.Mockito.when(sshWorker.run(any())).thenReturn(mapper.readTree("{\"status\":\"PASSWORD_REQUIRED\",\"host\":\"lab@fixture:22\"}"));
        mvc.perform(post(path+"/connect").with(login("ssh-transient-admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PASSWORD_REQUIRED"));
    }

    private UUID member(String subject,String role){
        String studentNumber="t"+UUID.randomUUID().toString().replace("-","").substring(0,20);
        UUID id=jdbc.queryForObject("INSERT INTO member(display_name,real_name,student_number,class_name,cohort,directions,direction) VALUES (?,?,?,'计算机24-3',24,'[\"算法\"]'::jsonb,'算法') RETURNING id",UUID.class,subject,subject,studentNumber);
        jdbc.update("INSERT INTO external_identity(member_id,issuer,subject) VALUES (?, 'http://idp.invalid', ?)",id,subject);
        if(role!=null)jdbc.update("INSERT INTO role_assignment(member_id,role,source) VALUES (?,?,?)",id,role,role.equals("SUPER_ADMIN")?"bootstrap":"test-fixture");
        return id;
    }
    private UUID incompleteMember(String subject) {
        UUID id=jdbc.queryForObject("INSERT INTO member(display_name) VALUES (?) RETURNING id",UUID.class,subject);
        jdbc.update("INSERT INTO external_identity(member_id,issuer,subject) VALUES (?, 'http://idp.invalid', ?)",id,subject);
        jdbc.update("INSERT INTO role_assignment(member_id,role,source) VALUES (?,'MEMBER','oidc-admission')",id);
        return id;
    }
    private UsernamePasswordAuthenticationToken oidcAuthentication(String email, boolean verified, String subject) {
        return oidcAuthentication(email, verified, subject, "http://idp.invalid");
    }
    private UsernamePasswordAuthenticationToken oidcAuthentication(String email, boolean verified, String subject, String issuer) {
        Instant now = Instant.now();
        Map<String,Object> claims = new java.util.HashMap<>();
        claims.put("iss", issuer); claims.put("sub", subject); claims.put("aud", List.of("integration-test"));
        claims.put("iat", now); claims.put("exp", now.plusSeconds(300)); claims.put("email", email);
        claims.put("email_verified", verified); claims.put("name", "OIDC Test Member");
        var idToken = new OidcIdToken("test-token", now.minusSeconds(30), now.plusSeconds(300), claims);
        var user = new DefaultOidcUser(List.of(new SimpleGrantedAuthority("ROLE_USER")), idToken);
        return new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
    }
    private RequestPostProcessor login(String subject){return login("http://idp.invalid",subject);}
    private RequestPostProcessor login(String issuer,String subject){
        Instant now=Instant.now();
        return oidcLogin().idToken(token->token.claim("iss",issuer).claim("sub",subject).claim("aud",List.of("integration-test")).issuedAt(now.minusSeconds(30)).expiresAt(now.plusSeconds(300)));
    }
    private <T> List<T> runConcurrently(java.util.concurrent.Callable<T> first,java.util.concurrent.Callable<T> second) throws Exception {
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var ready=new java.util.concurrent.CountDownLatch(2);var start=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<T> gatedFirst=()->{ready.countDown();if(!start.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("Concurrent request start timed out");return first.call();};
        java.util.concurrent.Callable<T> gatedSecond=()->{ready.countDown();if(!start.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("Concurrent request start timed out");return second.call();};
        try {
            var firstResult=executor.submit(gatedFirst);var secondResult=executor.submit(gatedSecond);
            if(!ready.await(10,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("Concurrent requests did not reach the start barrier");
            start.countDown();
            return List.of(firstResult.get(30,java.util.concurrent.TimeUnit.SECONDS),secondResult.get(30,java.util.concurrent.TimeUnit.SECONDS));
        } finally { start.countDown();executor.shutdownNow(); }
    }
}
