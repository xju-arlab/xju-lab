package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/v1/printer-agent")
public class PrinterAgentController {
    private static final List<String> DEVICE_STATES = List.of("READY", "BUSY", "PAPER_OUT", "JAMMED", "ERROR", "UNKNOWN");
    private final JdbcTemplate jdbc;
    private final AgentAuthenticator authenticator;
    private final ObjectMapper mapper;

    public PrinterAgentController(JdbcTemplate jdbc, AgentAuthenticator authenticator, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.authenticator = authenticator;
        this.mapper = mapper;
    }

    @PostMapping("/heartbeat")
    @Transactional
    public HeartbeatResult heartbeat(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestBody HeartbeatInput input) {
        var agent = authenticator.authenticate(authorization);
        if (input.agentVersion() == null || input.agentVersion().isBlank() || input.agentVersion().length() > 80
            || input.deviceState() == null || !DEVICE_STATES.contains(input.deviceState())) {
            throw new ResponseStatusException(BAD_REQUEST, "打印机状态报告无效");
        }
        if (input.tonerSupported() && input.tonerPercent() != null
            && (input.tonerPercent() < 0 || input.tonerPercent() > 100)) {
            throw new ResponseStatusException(BAD_REQUEST, "耗材百分比无效");
        }
        if (!input.tonerSupported() && input.tonerPercent() != null) {
            throw new ResponseStatusException(BAD_REQUEST, "不支持耗材读取时百分比必须留空");
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("agentVersion", input.agentVersion());
        report.put("deviceState", input.deviceState());
        report.put("tonerSupported", input.tonerSupported());
        report.put("tonerPercent", input.tonerPercent());
        report.put("reportedAt", OffsetDateTime.now());
        jdbc.update("UPDATE agent_identity SET last_seen_at=now(),last_report=?::jsonb WHERE id=?", write(report), agent.id());
        return new HeartbeatResult(OffsetDateTime.now(), "OK");
    }

    private String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Printer status cannot be serialized", ex); }
    }

    public record HeartbeatInput(String agentVersion, String deviceState, boolean tonerSupported, Integer tonerPercent) {}
    public record HeartbeatResult(OffsetDateTime serverTime, String status) {}
}
