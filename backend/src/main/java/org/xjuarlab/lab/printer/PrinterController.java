package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1")
public class PrinterController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final ObjectMapper mapper;

    public PrinterController(JdbcTemplate jdbc, CurrentMember current, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.current = current;
        this.mapper = mapper;
    }

    @GetMapping("/printers")
    public List<PrinterView> printers(Authentication auth) {
        UUID actor = current.id(auth);
        current.roles(actor);
        return listPrinters("WHERE p.enabled=true");
    }

    @GetMapping("/admin/printers")
    public List<PrinterView> adminPrinters(Authentication auth) {
        requireAdmin(current.id(auth));
        return listPrinters("");
    }

    private List<PrinterView> listPrinters(String filter, Object... parameters) {
        String sql = "SELECT p.*,CASE WHEN NOT p.enabled THEN 'DISABLED' WHEN ai.last_seen_at>now()-interval '90 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END AS state,ai.last_seen_at,ai.last_report FROM printer p LEFT JOIN agent_identity ai ON ai.id=p.agent_id "
            + filter + " ORDER BY p.name,p.id";
        return jdbc.query(sql, (rs, row) -> {
            boolean external="HP_STATUS".equals(rs.getString("status_source"));
            JsonNode report=parse(rs.getString(external?"source_report":"last_report"));
            OffsetDateTime observed=rs.getObject(external?"source_observed_at":"last_seen_at",OffsetDateTime.class);
            String state=rs.getString("state");
            if(external && rs.getBoolean("enabled")) {
                OffsetDateTime checked=rs.getObject("source_checked_at",OffsetDateTime.class), now=OffsetDateTime.now();
                if(!report.path("sourceAvailable").asBoolean()) state="UNAVAILABLE";
                else if(checked==null || checked.isBefore(now.minusSeconds(90)) || observed==null || observed.isBefore(now.minusSeconds(90)) || observed.isAfter(now.plusSeconds(30)) || report.path("stale").asBoolean()) state="STALE";
                else state=report.path("online").asBoolean()?"ONLINE":"OFFLINE";
            }
            return new PrinterView((UUID)rs.getObject("id"),rs.getString("name"),rs.getString("location"),state,observed,report,external?"HP_STATUS":"AGENT");
        }, parameters);
    }

    @PostMapping("/admin/printers")
    @Transactional
    public AgentCredential createPrinter(Authentication auth, @RequestBody CreatePrinter input) {
        UUID actor = current.id(auth);
        requireAdmin(actor);
        if (input.name() == null || input.name().isBlank() || input.name().length() > 120) {
            throw new ResponseStatusException(BAD_REQUEST, "打印机名称无效");
        }
        String token = newToken();
        UUID printer = jdbc.queryForObject(
            "INSERT INTO printer(name,location) VALUES (?,?) RETURNING id",
            UUID.class, input.name().trim(), input.location() == null ? "" : input.location().trim());
        UUID agent = jdbc.queryForObject(
            "INSERT INTO agent_identity(printer_id,token_hash) VALUES (?,?) RETURNING id",
            UUID.class, printer, sha256(token));
        jdbc.update("UPDATE printer SET agent_id=? WHERE id=?", agent, printer);
        audit(actor, "CREATE_PRINTER", printer, Map.of("agentCredentialIssued", true));
        return new AgentCredential(printer, agent, token);
    }

    @PostMapping("/admin/printers/{printerId}/rotate-agent-token")
    @Transactional
    public AgentCredential rotateToken(Authentication auth, @PathVariable UUID printerId) {
        UUID actor = current.id(auth);
        requireAdmin(actor);
        UUID agent = jdbc.query("SELECT id FROM agent_identity WHERE printer_id=? FOR UPDATE",
            (rs, row) -> (UUID) rs.getObject(1), printerId)
            .stream().findFirst().orElseThrow(PrinterController::hidden);
        String token = newToken();
        jdbc.update("UPDATE agent_identity SET token_hash=?,active=true WHERE id=?", sha256(token), agent);
        jdbc.update("UPDATE printer SET agent_id=? WHERE id=?", agent, printerId);
        audit(actor, "ROTATE_PRINTER_AGENT_TOKEN", printerId, Map.of("agentCredentialIssued", true));
        return new AgentCredential(printerId, agent, token);
    }

    @PatchMapping("/admin/printers/{printerId}/enabled")
    @Transactional
    public PrinterView setPrinterEnabled(Authentication auth, @PathVariable UUID printerId, @RequestBody EnabledInput input) {
        UUID actor = current.id(auth);
        requireAdmin(actor);
        int changed = jdbc.update("UPDATE printer SET enabled=? WHERE id=?", input.enabled(), printerId);
        if (changed == 0) throw hidden();
        audit(actor, "SET_PRINTER_ENABLED", printerId, Map.of("enabled", input.enabled()));
        return listPrinters("WHERE p.id=?", printerId).stream().findFirst().orElseThrow(PrinterController::hidden);
    }

    private JsonNode parse(String value) {
        try { return value == null ? mapper.nullNode() : mapper.readTree(value); }
        catch (Exception ex) { throw new IllegalStateException("Stored printer status is invalid", ex); }
    }

    private String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Printer data cannot be serialized", ex); }
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) { throw new IllegalStateException(ex); }
    }

    private void requireAdmin(UUID actor) { current.requireRole(actor, "LAB_ADMIN", "SUPER_ADMIN"); }

    private void audit(UUID actor, String action, UUID target, Object after) {
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?,'printer',?,?::jsonb)",
            actor, action, target.toString(), write(after));
    }

    private static ResponseStatusException hidden() {
        return new ResponseStatusException(NOT_FOUND, "打印机不存在或无权访问");
    }

    public record PrinterView(UUID id, String name, String location, String status,
                              OffsetDateTime lastSeenAt, JsonNode lastReport, String source) {}
    public record AgentCredential(UUID printerId, UUID agentId, String token) {}
    public record CreatePrinter(String name, String location) {}
    public record EnabledInput(boolean enabled) {}
}
