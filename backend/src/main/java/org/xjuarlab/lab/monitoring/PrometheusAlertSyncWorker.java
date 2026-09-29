package org.xjuarlab.lab.monitoring;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class PrometheusAlertSyncWorker {
    private final JdbcTemplate jdbc;
    private final PrometheusClient prometheus;
    private final ObjectMapper mapper;
    private final TransactionTemplate transactions;

    public PrometheusAlertSyncWorker(JdbcTemplate jdbc, PrometheusClient prometheus, ObjectMapper mapper, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.prometheus = prometheus;
        this.mapper = mapper;
        this.transactions = new TransactionTemplate(manager);
    }

    @Scheduled(fixedDelayString = "${lab.monitor.alert-poll-ms:30000}")
    public void poll() {
        if (!prometheus.configured()) return;
        List<PrometheusClient.Alert> alerts;
        try {
            alerts = prometheus.alerts();
        } catch (RuntimeException unavailable) {
            return; // A source outage must never turn every active alert into RESOLVED.
        }
        transactions.executeWithoutResult(status -> synchronize(alerts));
    }

    private void synchronize(List<PrometheusClient.Alert> alerts) {
        Map<String, ActiveAlert> active = new LinkedHashMap<>();
        for (PrometheusClient.Alert alert : alerts) {
            if (!"firing".equalsIgnoreCase(alert.state())) continue;
            String job = alert.labels().get("job");
            String instance = alert.labels().get("instance");
            if (job == null || instance == null) continue;
            List<UUID> assets = jdbc.query("SELECT id FROM server_asset WHERE enabled=true AND prometheus_job=? AND target_label=?",
                (rs, row) -> (UUID) rs.getObject(1), job, instance);
            if (assets.size() != 1) continue;
            String fingerprint = fingerprint(alert.labels());
            String name = safe(alert.labels().getOrDefault("alertname", "设备告警"), 100);
            String summary = safe(alert.annotations().getOrDefault("summary", alert.annotations().getOrDefault("description", "")), 300);
            active.put(fingerprint, new ActiveAlert(assets.getFirst(), fingerprint, name, summary));
        }

        for (ActiveAlert alert : active.values()) {
            String payload = json(Map.of("alertName", alert.name(), "summary", alert.summary()));
            if ("FIRING".equals(latestState(alert.fingerprint()))) continue;
            jdbc.update("INSERT INTO alert_event(asset_id,fingerprint,state,payload) VALUES (?,?,'FIRING',?::jsonb)", alert.assetId(), alert.fingerprint(), payload);
            notifyAdmins(alert, "FIRING");
        }

        List<ActiveAlert> previous = jdbc.query("SELECT DISTINCT ON (fingerprint) asset_id,fingerprint,payload::text FROM alert_event WHERE state='FIRING' ORDER BY fingerprint,changed_at DESC,id DESC",
            (rs, row) -> {
                try {
                    var payload = mapper.readTree(rs.getString(3));
                    return new ActiveAlert((UUID) rs.getObject(1), rs.getString(2), payload.path("alertName").asText("设备告警"), payload.path("summary").asText(""));
                } catch (Exception ex) { throw new IllegalStateException("Stored alert payload is invalid", ex); }
            });
        for (ActiveAlert old : previous) {
            if (active.containsKey(old.fingerprint()) || !"FIRING".equals(latestState(old.fingerprint()))) continue;
            String payload = json(Map.of("alertName", old.name(), "summary", old.summary()));
            jdbc.update("INSERT INTO alert_event(asset_id,fingerprint,state,payload) VALUES (?,?,'RESOLVED',?::jsonb)", old.assetId(), old.fingerprint(), payload);
            notifyAdmins(old, "RESOLVED");
        }
    }

    private String latestState(String fingerprint) {
        return jdbc.query("SELECT state FROM alert_event WHERE fingerprint=? ORDER BY changed_at DESC,id DESC LIMIT 1",
            (rs, row) -> rs.getString(1), fingerprint).stream().findFirst().orElse(null);
    }

    private void notifyAdmins(ActiveAlert alert, String state) {
        String kind = "SERVER_ALERT_" + state;
        List<UUID> recipients = jdbc.query("SELECT DISTINCT m.id FROM member m JOIN role_assignment r ON r.member_id=m.id WHERE m.active=true AND r.role IN ('LAB_ADMIN','SUPER_ADMIN') AND r.revoked_at IS NULL",
            (rs, row) -> (UUID) rs.getObject(1));
        for (UUID recipient : recipients) {
            UUID notification = jdbc.queryForObject("INSERT INTO notification(recipient_id,kind,payload) VALUES (?,?,?::jsonb) RETURNING id", UUID.class,
                recipient, kind, json(Map.of("assetId", alert.assetId(), "alertName", alert.name(), "summary", alert.summary(), "state", state)));
            jdbc.update("INSERT INTO outbox_event(event_type,aggregate_id,payload) VALUES ('NOTIFICATION_EMAIL',?,jsonb_build_object('notificationId',?::text))", notification, notification);
        }
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Could not encode alert payload", ex); }
    }

    private static String safe(String value, int max) {
        if (value == null) return "";
        return value.replaceAll("[\\p{Cntrl}]", " ").substring(0, Math.min(value.length(), max));
    }

    private static String fingerprint(Map<String, String> labels) {
        try {
            String canonical = labels.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue()).reduce((a, b) -> a + "\n" + b).orElse("");
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) { throw new IllegalStateException("SHA-256 is unavailable", ex); }
    }

    private record ActiveAlert(UUID assetId, String fingerprint, String name, String summary) { }
}
