package org.xjuarlab.lab.monitoring;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.xjuarlab.lab.servers.infrastructure.SshWorker;
import static org.xjuarlab.lab.monitoring.MonitoringController.*;

/** Bounded background reads over saved SSH connections. No network calls inside a database transaction. */
@Service
public class SshMonitoring {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final SshWorker worker;
    private final boolean enabled;
    private final java.util.concurrent.ExecutorService executor = Executors.newFixedThreadPool(2);
    private final Set<UUID> running = ConcurrentHashMap.newKeySet();
    public SshMonitoring(JdbcTemplate jdbc, ObjectMapper mapper, SshWorker worker,
            @Value("${lab.monitor.ssh-enabled:true}") boolean enabled) {
        this.jdbc=jdbc; this.mapper=mapper; this.worker=worker; this.enabled=enabled;
    }
    @PreDestroy void close() { executor.shutdownNow(); }

    public boolean supports(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT ssh_connection IS NOT NULL AND (prometheus_job IS NULL OR target_label IS NULL) FROM server_asset WHERE id=?",Boolean.class,id));
    }
    @Scheduled(fixedDelayString="${lab.monitor.ssh-poll-ms:30000}", initialDelayString="${lab.monitor.ssh-initial-delay-ms:5000}")
    public void poll() {
        if (!enabled) return;
        jdbc.update("DELETE FROM server_metric_sample WHERE sampled_at < now()-interval '25 hours'");
        for (UUID id : jdbc.query("SELECT s.id FROM server_asset s LEFT JOIN LATERAL (SELECT max(sampled_at) AS latest FROM server_metric_sample WHERE asset_id=s.id) m ON true WHERE enabled AND ssh_connection IS NOT NULL AND (prometheus_job IS NULL OR target_label IS NULL) AND (m.latest IS NULL OR m.latest < now()-interval '25 seconds') ORDER BY m.latest NULLS FIRST",(rs,row)->(UUID)rs.getObject(1))) request(id);
    }
    private synchronized void request(UUID id) {
        if (!enabled || running.size() >= 2 || !running.add(id)) return;
        executor.submit(() -> { try { collect(id); } finally { running.remove(id); } });
    }
    public void collect(UUID id) {
        var assets=jdbc.query("SELECT ssh_connection,gpu_supported FROM server_asset WHERE id=? AND enabled AND ssh_connection IS NOT NULL",(rs,row)->new Target(parse(rs.getString(1)),rs.getBoolean(2)),id);
        if(assets.isEmpty()) return;
        var target=assets.getFirst();
        var input=mapper.createObjectNode().put("action","metrics").put("gpuSupported",target.gpu());
        input.set("nodes",target.connection().path("nodes"));
        String state="SSH_UNAVAILABLE";
        JsonNode metrics=mapper.createArrayNode();
        try {
            JsonNode result=worker.run(input);
            if(result!=null && result.path("status").asText().equals("CONNECTED") && result.path("metrics").isArray()) {
                state="CONNECTED"; metrics=result.path("metrics");
            }
        } catch(RuntimeException ignored) { /* Persist unavailable, not fabricated samples or private connection errors. */ }
        // Re-check enabled after the remote read; deletion/disable wins over in-flight work.
        jdbc.update("INSERT INTO server_metric_sample(asset_id,state,metrics) SELECT id,?,?::jsonb FROM server_asset WHERE id=? AND enabled ON CONFLICT DO NOTHING",state,metrics.toString(),id);
    }
    public AssetMetrics metrics(UUID id, boolean gpu) {
        var samples=jdbc.query("SELECT sampled_at,state,metrics FROM server_metric_sample WHERE asset_id=? ORDER BY sampled_at DESC LIMIT 1",(rs,row)->new Sample(rs.getObject(1,OffsetDateTime.class),rs.getString(2),parse(rs.getString(3))),id);
        if(samples.isEmpty()) { request(id); return new AssetMetrics(id,"COLLECTING",unavailable("COLLECTING",gpu)); }
        Sample sample=samples.getFirst();
        boolean stale=sample.time().isBefore(OffsetDateTime.now().minusSeconds(90));
        if(stale) request(id);
        if(!sample.state().equals("CONNECTED")) return new AssetMetrics(id,"SSH_UNAVAILABLE",unavailable("SSH_UNAVAILABLE",gpu));
        List<MetricView> result=new ArrayList<>();
        for(JsonNode metric:sample.metrics()) {
            Double value=metric.path("value").isNumber()?metric.path("value").asDouble():null;
            String status=metric.path("status").asText("NO_DATA");
            result.add(new MetricView(metric.path("metric").asText(),metric.path("unit").asText(),value,stale&&value!=null?"STALE":status,sample.time(),sample.time().plusSeconds(90)));
        }
        return new AssetMetrics(id,stale?"STALE":"SSH_CONNECTED",List.copyOf(result));
    }
    public MetricSeries series(UUID id, String metric, String range, Duration duration) {
        var points=jdbc.query("SELECT s.sampled_at,(m.value->>'value')::double precision FROM server_metric_sample s CROSS JOIN LATERAL jsonb_array_elements(s.metrics) m(value) WHERE s.asset_id=? AND s.sampled_at>=? AND s.state='CONNECTED' AND m.value->>'metric'=? AND m.value->>'status'='AVAILABLE' AND jsonb_typeof(m.value->'value')='number' ORDER BY s.sampled_at",(rs,row)->new SeriesPoint(rs.getTimestamp(1).toInstant(),rs.getDouble(2),"AVAILABLE"),id,OffsetDateTime.now().minus(duration),metric);
        return new MetricSeries(id,metric,range,points.isEmpty()?"NO_DATA":"AVAILABLE",List.copyOf(points));
    }
    private List<MetricView> unavailable(String state, boolean gpu) {
        return List.of(new MetricView("CPU","%",null,state,null,null),new MetricView("MEMORY","%",null,state,null,null),new MetricView("DISK","%",null,state,null,null),new MetricView("LOAD","load",null,state,null,null),new MetricView("GPU","%",null,gpu?state:"UNSUPPORTED",null,null));
    }
    private JsonNode parse(String json) { try { return mapper.readTree(json); } catch(Exception ex) { throw new IllegalStateException(ex); } }
    private record Target(JsonNode connection,boolean gpu) {}
    private record Sample(OffsetDateTime time,String state,JsonNode metrics) {}
}
