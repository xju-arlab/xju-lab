package org.xjuarlab.lab.integrations.oj;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Fixed-purpose connector. It never accepts a URL from a browser or follows redirects. */
@Component
public class OjIntegrationClient {
    private final String baseUrl;
    private final String token;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public OjIntegrationClient(@Value("${lab.oj.base-url:}") String baseUrl,
            @Value("${lab.oj.service-token:}") String token, ObjectMapper mapper) {
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        this.token = token == null ? "" : token;
        this.mapper = mapper;
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    public boolean configured() { return !baseUrl.isBlank() && !token.isBlank(); }

    public ContestResults results(String contestId) {
        if (!configured()) throw new OjConnectorException("OJ_CONNECTOR_NOT_CONFIGURED");
        List<JsonNode> rows = new ArrayList<>();
        String sourceVersion = null;
        String snapshotVersion = null;
        String title = null;
        String endedAt = null;
        int total = -1;
        String ruleType = null;
        boolean finalRanking = false;
        for (int offset = 0; offset < 100_000; offset += 500) {
            JsonNode page = get("/api/integrations/labos/contests/" + contestId + "/results?limit=500&offset=" + offset);
            String nextSource = page.path("sourceVersion").asText("");
            String nextSnapshot = page.path("snapshotVersion").asText("");
            int nextTotal = page.path("total").asInt(-1);
            if (nextSource.isBlank() || nextSnapshot.isBlank() || nextTotal < 0 || !page.path("items").isArray()) throw new OjConnectorException("OJ_RESPONSE_INVALID");
            if (page.path("items").size() > 500) throw new OjConnectorException("OJ_RESPONSE_PAGE_TOO_LARGE");
            if (offset == 0) {
                sourceVersion = nextSource; snapshotVersion = nextSnapshot; total = nextTotal;
                title = page.path("title").asText(""); endedAt = page.path("endedAt").asText("");
                ruleType = page.path("ruleType").asText(""); finalRanking = page.path("finalRanking").asBoolean(false);
            } else if (!sourceVersion.equals(nextSource) || !snapshotVersion.equals(nextSnapshot) || total != nextTotal
                    || !title.equals(page.path("title").asText("")) || !endedAt.equals(page.path("endedAt").asText(""))
                    || !ruleType.equals(page.path("ruleType").asText("")) || finalRanking != page.path("finalRanking").asBoolean(false)) {
                throw new OjConnectorException("OJ_SNAPSHOT_CHANGED_DURING_PAGING");
            }
            page.path("items").forEach(rows::add);
            if (rows.size() >= total || page.path("items").isEmpty()) break;
        }
        if (total < 0 || rows.size() != total) throw new OjConnectorException("OJ_RESULT_INCOMPLETE");
        return new ContestResults(contestId, title, ruleType, endedAt, sourceVersion, snapshotVersion, finalRanking, total, List.copyOf(rows));
    }

    public RoleSyncResult setLabosAdmin(String accountId, UUID eventId, long version, boolean enabled) {
        if (!configured()) throw new OjConnectorException("OJ_CONNECTOR_NOT_CONFIGURED");
        try {
            String path = "/api/integrations/labos/role-grants/" + URLEncoder.encode(accountId, StandardCharsets.UTF_8);
            var payload = mapper.createObjectNode().put("eventId", eventId.toString()).put("version", version)
                .put("enabled", enabled).put("source", "xju-lab").put("role", "Admin").put("problemPermission", "Own");
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(Duration.ofSeconds(5))
                .header("Accept", "application/json").header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token).PUT(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload))).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new OjConnectorException("OJ_ROLE_SYNC_HTTP_" + response.statusCode());
            JsonNode body = mapper.readTree(response.body());
            if (!body.path("accepted").asBoolean(false) || body.path("acceptedVersion").asLong(-1) != version
                    || body.path("enabled").asBoolean(!enabled) != enabled) throw new OjConnectorException("OJ_ROLE_SYNC_ACK_INVALID");
            return new RoleSyncResult(version, enabled);
        } catch (OjConnectorException ex) { throw ex; }
        catch (Exception ex) { throw new OjConnectorException("OJ_ROLE_SYNC_UNAVAILABLE"); }
    }

    private JsonNode get(String path) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json").header("Authorization", "Bearer " + token).GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new OjConnectorException("OJ_RESULTS_HTTP_" + response.statusCode());
            return mapper.readTree(response.body());
        } catch (OjConnectorException ex) { throw ex; }
        catch (Exception ex) { throw new OjConnectorException("OJ_RESULTS_UNAVAILABLE"); }
    }

    public record ContestResults(String contestId, String title, String ruleType, String endedAt, String sourceVersion,
            String snapshotVersion, boolean finalRanking, int total, List<JsonNode> items) { }
    public record RoleSyncResult(long version, boolean enabled) { }
    public static class OjConnectorException extends RuntimeException {
        private final String code;
        public OjConnectorException(String code) { super(code); this.code = code; }
        public String code() { return code; }
    }
}
