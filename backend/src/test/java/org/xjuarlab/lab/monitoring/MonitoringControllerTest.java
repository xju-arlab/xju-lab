package org.xjuarlab.lab.monitoring;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MonitoringControllerTest {
    @Test
    void exporterDownIsOnlyReportedWhenPrometheusHasAnExplicitZeroUpSample() {
        var down = new PrometheusClient.QueryResult(List.of(new PrometheusClient.Series(
                Map.of("job", "node"), List.of(new PrometheusClient.Sample(Instant.now(), 0d)))));
        var up = new PrometheusClient.QueryResult(List.of(new PrometheusClient.Series(
                Map.of("job", "node"), List.of(new PrometheusClient.Sample(Instant.now(), 1d)))));
        var missing = new PrometheusClient.QueryResult(List.of());

        assertTrue(MonitoringController.targetUnreachable(down));
        assertFalse(MonitoringController.targetUnreachable(up));
        assertFalse(MonitoringController.targetUnreachable(missing));
    }
}
