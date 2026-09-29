package org.xjuarlab.lab.printer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Component
public class AgentAuthenticator {
    private final JdbcTemplate jdbc;
    public AgentAuthenticator(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public AgentIdentity authenticate(String authorization){
        if(authorization==null||!authorization.startsWith("Bearer ")||authorization.length()<40)throw unauthorized();
        String token=authorization.substring(7);String tokenHash=sha256(token);
        var identities=jdbc.query("SELECT ai.id,ai.printer_id FROM agent_identity ai JOIN printer p ON p.id=ai.printer_id WHERE ai.token_hash=? AND ai.active=true AND p.enabled=true",(rs,row)->new AgentIdentity((UUID)rs.getObject(1),(UUID)rs.getObject(2)),tokenHash);
        if(identities.isEmpty())throw unauthorized();AgentIdentity identity=identities.getFirst();jdbc.update("UPDATE agent_identity SET last_seen_at=now() WHERE id=?",identity.id());return identity;
    }
    private static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private static ResponseStatusException unauthorized(){return new ResponseStatusException(UNAUTHORIZED,"打印代理凭据无效或已停用");}
    public record AgentIdentity(UUID id,UUID printerId){}
}
