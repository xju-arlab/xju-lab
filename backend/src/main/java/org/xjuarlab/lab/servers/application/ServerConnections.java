package org.xjuarlab.lab.servers.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.servers.infrastructure.SshWorker;
import static org.springframework.http.HttpStatus.*;

@Service
public class ServerConnections {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final SshWorker worker;
    private final TransactionTemplate tx;
    public ServerConnections(JdbcTemplate jdbc, ObjectMapper mapper, SshWorker worker, PlatformTransactionManager manager) {
        this.jdbc=jdbc; this.mapper=mapper; this.worker=worker; this.tx=new TransactionTemplate(manager);
    }
    public JsonNode config(String config) {
        return checked(worker.run(config == null ? Map.of("action", "catalog") : Map.of("action", "parse", "config", config)));
    }
    public ObjectNode create(UUID owner, String name, String config, String alias) {
        JsonNode resolved = checked(worker.run(Map.of("action", "resolve", "config", config, "alias", alias)));
        jdbc.update("DELETE FROM server_connection_draft WHERE expires_at < now() - interval '1 day'");
        UUID id = tx.execute(status -> {
            // Serialize per-member quota checks without retaining a lock during network calls.
            jdbc.queryForObject("SELECT id FROM member WHERE id=? FOR UPDATE", UUID.class, owner);
            if (jdbc.queryForObject("SELECT count(*) FROM server_connection_draft WHERE owner_id=? AND expires_at>now() AND status NOT IN ('CANCELLED','SAVED')", Integer.class, owner) >= 8)
                throw new ResponseStatusException(TOO_MANY_REQUESTS, "未完成的连接过多，请取消旧连接或稍后再试");
            return jdbc.queryForObject("INSERT INTO server_connection_draft(owner_id,name,nodes) VALUES (?,?,?::jsonb) RETURNING id", UUID.class, owner, name.trim(), resolved.path("nodes").toString());
        });
        return mapper.createObjectNode().put("id", id.toString()).put("status", "READY");
    }
    public JsonNode connect(UUID owner, UUID id, String password, boolean trustHost) {
        Draft draft = tx.execute(status -> {
            Draft d = find(owner,id,true);
            if (d.status().equals("CANCELLED") || d.status().equals("SAVED")) throw new ResponseStatusException(CONFLICT,"连接已结束");
            if (d.status().equals("RUNNING") && !d.recoverable()) throw new ResponseStatusException(CONFLICT,"连接正在进行");
            if (trustHost && !d.status().equals("HOST_KEY_REQUIRED")) throw new ResponseStatusException(CONFLICT,"当前没有待确认的主机指纹");
            jdbc.update("UPDATE server_connection_draft SET status='RUNNING',updated_at=now() WHERE id=?",id);
            return d;
        });
        ObjectNode approved = (ObjectNode) draft.approved().deepCopy();
        if (trustHost) approved.put(draft.result().path("host").asText(),draft.result().path("fingerprint").asText());
        ObjectNode input=mapper.createObjectNode().put("action","connect");
        input.set("nodes",draft.nodes()); input.set("approved",approved);
        if (password != null && draft.status().equals("PASSWORD_REQUIRED")) {
            input.put("password",password); input.put("passwordTarget",draft.result().path("host").asText());
        }
        JsonNode result;
        try { result = worker.run(input); }
        catch (RuntimeException ex) {
            jdbc.update("UPDATE server_connection_draft SET status='FAILED',result='{}',updated_at=now() WHERE id=? AND status='RUNNING'",id);
            throw ex;
        } finally { input.remove("password"); }
        String state=result.path("status").asText();
        if (!java.util.Set.of("CONNECTED","PASSWORD_REQUIRED","HOST_KEY_REQUIRED","FAILED").contains(state)) state="FAILED";
        int changed=jdbc.update("UPDATE server_connection_draft SET status=?,result=?::jsonb,approved=?::jsonb,updated_at=now() WHERE id=? AND status='RUNNING' AND expires_at>now()",state,result.toString(),approved.toString(),id);
        if(changed==0)throw new ResponseStatusException(CONFLICT,"连接已取消或过期，请重新添加");
        return result;
    }
    public Map<String,UUID> save(UUID owner, UUID id) {
        return tx.execute(status -> {
            Draft d=find(owner,id,true);
            if(d.status().equals("SAVED") && d.assetId()!=null)return Map.of("assetId",d.assetId());
            if(!d.status().equals("CONNECTED") || !d.result().path("keyVerified").asBoolean())throw new ResponseStatusException(CONFLICT,"请先连接成功并完成公钥登录验证");
            JsonNode last=d.nodes().get(d.nodes().size()-1);
            ObjectNode connection=mapper.createObjectNode(); connection.set("nodes",d.nodes());
            connection.put("identity",last.path("user").asText()+"@"+last.path("host").asText()+":"+last.path("port").asInt());
            JsonNode hardware=d.result().path("hardware");
            UUID asset=jdbc.queryForObject("INSERT INTO server_asset(name,gpu_supported,hardware,ssh_connection,discovered_at) VALUES (?,?,?::jsonb,?::jsonb,now()) RETURNING id",UUID.class,d.name(),hardware.path("kind").asText().equals("GPU"),hardware.toString(),connection.toString());
            jdbc.update("UPDATE server_connection_draft SET status='SAVED',asset_id=?,updated_at=now() WHERE id=?",asset,id);
            jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'CONNECT_SERVER','server_asset',?,?::jsonb)",owner,asset.toString(),mapper.createObjectNode().put("kind",hardware.path("kind").asText()).toString());
            return Map.of("assetId",asset);
        });
    }
    public void cancel(UUID owner,UUID id) {
        jdbc.update("UPDATE server_connection_draft SET status='CANCELLED',result='{}',approved='{}',updated_at=now() WHERE id=? AND owner_id=? AND status<>'SAVED'",id,owner);
    }
    private Draft find(UUID owner,UUID id,boolean lock) {
        return jdbc.query("SELECT *, updated_at < now()-interval '2 minutes' AS recoverable FROM server_connection_draft WHERE id=? AND owner_id=? AND expires_at>now()"+(lock?" FOR UPDATE":""),(rs,row)->new Draft(rs.getString("name"),rs.getString("status"),parse(rs.getString("nodes")),parse(rs.getString("approved")),parse(rs.getString("result")),(UUID)rs.getObject("asset_id"),rs.getBoolean("recoverable")),id,owner).stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"连接不存在或已过期，请重新添加"));
    }
    private JsonNode checked(JsonNode value) { if(value.path("status").asText().equals("FAILED"))throw new ResponseStatusException(BAD_REQUEST,value.path("message").asText("配置无效")); return value; }
    private JsonNode parse(String json) { try{return mapper.readTree(json);}catch(Exception ex){throw new IllegalStateException(ex);} }
    private record Draft(String name,String status,JsonNode nodes,JsonNode approved,JsonNode result,UUID assetId,boolean recoverable){}
}
