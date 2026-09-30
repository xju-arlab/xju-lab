package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class HpPrinterStatusSync {
    private final JdbcTemplate jdbc;
    private final HpPrinterStatusClient client;
    private final ObjectMapper mapper;
    private final boolean enabled;
    public HpPrinterStatusSync(JdbcTemplate jdbc,HpPrinterStatusClient client,ObjectMapper mapper,@Value("${lab.printer.hp-status-enabled:false}") boolean enabled) {
        this.jdbc=jdbc;this.client=client;this.mapper=mapper;this.enabled=enabled;
    }
    @Scheduled(fixedDelay=15000,initialDelay=1000)
    public synchronized void sync() {
        if(!enabled) return;
        jdbc.update("INSERT INTO printer(name,status_source) VALUES ('惠普打印机','HP_STATUS') ON CONFLICT(status_source) DO NOTHING");
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT enabled FROM printer WHERE status_source='HP_STATUS'",Boolean.class))) return;
        try {
            // The network read intentionally runs outside a database transaction.
            var snapshot=client.fetch();
            jdbc.update("UPDATE printer SET name=?,source_checked_at=now(),source_observed_at=?,source_report=?::jsonb WHERE status_source='HP_STATUS' AND enabled",snapshot.name(),snapshot.observedAt(),snapshot.report().toString());
        } catch(RuntimeException ex) {
            var unavailable=mapper.createObjectNode().put("agentVersion","hp-status-v1").put("deviceState","UNKNOWN").put("tonerSupported",false).putNull("tonerPercent").put("reportedAt",java.time.OffsetDateTime.now().toString());
            jdbc.update("UPDATE printer SET source_checked_at=now(),source_report=COALESCE(source_report,?::jsonb) || '{\"sourceAvailable\":false,\"stale\":true}'::jsonb WHERE status_source='HP_STATUS' AND enabled",unavailable.toString());
        }
    }
}
