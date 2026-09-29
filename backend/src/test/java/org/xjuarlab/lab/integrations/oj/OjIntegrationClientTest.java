package org.xjuarlab.lab.integrations.oj;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OjIntegrationClientTest {
    @Test void resultPagingRequiresOneStableFinalSnapshotAndRoleAcknowledgesTheExactVersion() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/integrations/labos/contests/7/results", exchange -> {
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer oj-test-token");
            int offset = Integer.parseInt(exchange.getRequestURI().getQuery().replaceAll(".*offset=", ""));
            int count = offset == 0 ? 500 : 1;
            StringBuilder items = new StringBuilder("[");
            for (int i = 0; i < count; i++) {
                if (i > 0) items.append(',');
                items.append("{\"sourceUserId\":\"u-").append(offset + i).append("\",\"accountId\":\"12345678\",\"rank\":1,\"acceptedCount\":1,\"penaltySeconds\":60}");
            }
            items.append(']');
            byte[] body = ("{\"sourceVersion\":\"v1\",\"snapshotVersion\":\"s1\",\"total\":501,\"title\":\"Contest\",\"endedAt\":\"2026-09-29T18:00:00+08:00\",\"ruleType\":\"ACM\",\"finalRanking\":true,\"items\":" + items + "}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json"); exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/api/integrations/labos/role-grants/12345678", exchange -> {
            assertThat(exchange.getRequestMethod()).isEqualTo("PUT");
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer oj-test-token");
            var body = new ObjectMapper().readTree(exchange.getRequestBody());
            assertThat(body.path("role").asText()).isEqualTo("Admin");
            assertThat(body.path("problemPermission").asText()).isEqualTo("Own");
            String response = "{\"accepted\":true,\"acceptedVersion\":" + body.path("version").asLong() + ",\"enabled\":" + body.path("enabled").asBoolean() + "}";
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8); exchange.getResponseHeaders().add("Content-Type", "application/json"); exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            var client = new OjIntegrationClient("http://127.0.0.1:" + server.getAddress().getPort(), "oj-test-token", new ObjectMapper());
            var contest = client.results("7");
            assertThat(contest.items()).hasSize(501);
            assertThat(contest.finalRanking()).isTrue();
            UUID eventId = UUID.randomUUID();
            assertThat(client.setLabosAdmin("12345678", eventId, 9, false).version()).isEqualTo(9);
        } finally { server.stop(0); }
    }

    @Test void connectorWithoutExternalCredentialsIsExplicitlyUnavailable() {
        var client = new OjIntegrationClient("", "", new ObjectMapper());
        assertThat(client.configured()).isFalse();
        assertThatThrownBy(() -> client.results("7")).isInstanceOf(OjIntegrationClient.OjConnectorException.class)
            .hasMessageContaining("OJ_CONNECTOR_NOT_CONFIGURED");
    }
}
