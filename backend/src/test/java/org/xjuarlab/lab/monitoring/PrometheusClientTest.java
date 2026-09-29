package org.xjuarlab.lab.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PrometheusClientTest {
    @Test void instantQueriesUseTheConfiguredCredentialAndDropNonFiniteSamples() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/query", exchange -> {
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer test-token");
            assertThat(exchange.getRequestURI().getRawQuery()).contains("query=");
            byte[] body = ("{\"status\":\"success\",\"data\":{\"resultType\":\"vector\",\"result\":["
                + "{\"metric\":{\"job\":\"node\"},\"value\":[1760000000,\"NaN\"]},"
                + "{\"metric\":{\"job\":\"node\"},\"value\":[1760000015,\"42.5\"]}]}}")
                .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json"); exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var client = new PrometheusClient("http://127.0.0.1:" + server.getAddress().getPort(), "test-token", new ObjectMapper());
            var response = client.instant("up{job=\"node\"}");
            assertThat(response.series()).hasSize(2);
            assertThat(response.series().get(0).samples()).isEmpty();
            assertThat(response.series().get(1).samples()).hasSize(1);
            assertThat(response.series().get(1).samples().getFirst().value()).isEqualTo(42.5d);
        } finally { server.stop(0); }
    }

    @Test void upstreamFailuresBecomeServiceUnavailableWithoutLeakingBodies() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/query", exchange -> { byte[] body = "credential details".getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(503, body.length); exchange.getResponseBody().write(body); exchange.close(); });
        server.start();
        try {
            var client = new PrometheusClient("http://127.0.0.1:" + server.getAddress().getPort(), "", new ObjectMapper());
            assertThatThrownBy(() -> client.instant("up")).isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503").hasMessageNotContaining("credential");
        } finally { server.stop(0); }
    }
}
