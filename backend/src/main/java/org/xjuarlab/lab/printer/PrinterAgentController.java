package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.files.PrivateObjectStore;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE;

@RestController
@RequestMapping("/api/v1/printer-agent")
public class PrinterAgentController {
    private final JdbcTemplate jdbc;private final AgentAuthenticator authenticator;private final PrivateObjectStore store;private final ObjectMapper mapper;
    public PrinterAgentController(JdbcTemplate jdbc,AgentAuthenticator authenticator,PrivateObjectStore store,ObjectMapper mapper){this.jdbc=jdbc;this.authenticator=authenticator;this.store=store;this.mapper=mapper;}

    @PostMapping("/poll") @Transactional public PollResponse poll(@RequestHeader(value="Authorization",required=false) String authorization){
        var agent=authenticator.authenticate(authorization);List<UUID> uncertain=jdbc.query("UPDATE print_job SET status='UNKNOWN',version=version+1,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE printer_id=? AND status='SUBMITTING' AND lease_until<now() RETURNING id",(rs,row)->(UUID)rs.getObject(1),agent.printerId());
        for(UUID id:uncertain)event(id,"UNKNOWN",Map.of("reason","SUBMITTING_LEASE_EXPIRED"));
        List<CancelRequest> cancellations=jdbc.query("SELECT id,fencing_token,version FROM print_job WHERE printer_id=? AND lease_owner=? AND status='CANCEL_REQUESTED' ORDER BY updated_at,id",(rs,row)->new CancelRequest((UUID)rs.getObject(1),rs.getLong(2),rs.getLong(3)),agent.printerId(),agent.id());
        List<AgentJob> existing=jdbc.query("SELECT j.id,j.version,j.fencing_token,j.lease_until,j.options::text,f.id AS file_id,f.sha256,f.byte_size,f.page_count FROM print_job j JOIN file_object f ON f.id=j.file_id WHERE j.printer_id=? AND j.lease_owner=? AND j.status='LEASED' AND j.lease_until>now() ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j",(rs,row)->jobRow(rs),agent.printerId(),agent.id());
        AgentJob job=existing.isEmpty()?claim(agent.id(),agent.printerId()):existing.getFirst();
        if(job!=null&&existing.size()>0)jdbc.update("UPDATE print_job SET lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=? AND fencing_token=?",job.id(),job.fencingToken());
        return new PollResponse(job==null?null:leaseView(job),cancellations,OffsetDateTime.now());
    }

    @GetMapping("/jobs/{jobId}") public AgentJobStatus jobStatus(@RequestHeader(value="Authorization",required=false) String authorization,@PathVariable UUID jobId,@RequestParam long fencingToken){
        var agent=authenticator.authenticate(authorization);return jdbc.query("SELECT id,status,version,fencing_token,lease_until FROM print_job WHERE id=? AND printer_id=? AND lease_owner=? AND fencing_token=?",(rs,row)->new AgentJobStatus((UUID)rs.getObject(1),rs.getString(2),rs.getLong(3),rs.getLong(4),rs.getObject(5,OffsetDateTime.class)),jobId,agent.printerId(),agent.id(),fencingToken).stream().findFirst().orElseThrow(PrinterAgentController::hidden);
    }

    @GetMapping("/jobs/{jobId}/content") public ResponseEntity<byte[]> content(@RequestHeader(value="Authorization",required=false) String authorization,@PathVariable UUID jobId,@RequestParam long fencingToken){
        var agent=authenticator.authenticate(authorization);FileRow file=jdbc.query("SELECT f.storage_key,f.sha256,f.byte_size FROM print_job j JOIN file_object f ON f.id=j.file_id WHERE j.id=? AND j.printer_id=? AND j.lease_owner=? AND j.fencing_token=? AND j.status='LEASED' AND j.lease_until>now() AND f.deleted_at IS NULL",(rs,row)->new FileRow(rs.getString(1),rs.getString(2),rs.getLong(3)),jobId,agent.printerId(),agent.id(),fencingToken).stream().findFirst().orElseThrow(PrinterAgentController::hidden);
        byte[] bytes=store.get(file.key());if(bytes.length!=file.bytes()||!MessageDigest.isEqual(sha256(bytes).getBytes(StandardCharsets.US_ASCII),file.sha().getBytes(StandardCharsets.US_ASCII)))throw new ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,"打印文件完整性校验失败");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).contentLength(bytes.length).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=print-"+jobId+".pdf").header(HttpHeaders.CACHE_CONTROL,"no-store").body(bytes);
    }

    @PostMapping("/jobs/{jobId}/status") @Transactional public StatusResult status(@RequestHeader(value="Authorization",required=false) String authorization,@PathVariable UUID jobId,@RequestBody AgentStatusInput input){
        var agent=authenticator.authenticate(authorization);PrintState current=jdbc.query("SELECT status,version FROM print_job WHERE id=? AND printer_id=? AND lease_owner=? AND fencing_token=? FOR UPDATE",(rs,row)->new PrintState(rs.getString(1),rs.getLong(2)),jobId,agent.printerId(),agent.id(),input.fencingToken()).stream().findFirst().orElseThrow(PrinterAgentController::hidden);
        if(current.version()!=input.version())throw new ResponseStatusException(CONFLICT,"打印任务版本已变化，拒绝过期代理回报");String next=input.state();
        if(!allowed(current.status(),next))throw new ResponseStatusException(CONFLICT,"打印任务状态转移无效");Map<String,Object> detail=safeDetail(input.detail());String json=write(detail);
        int changed=jdbc.update("UPDATE print_job SET status=?,version=version+1,lease_until=CASE WHEN ?='SUBMITTING' THEN now()+interval '120 seconds' ELSE lease_until END,updated_at=now() WHERE id=? AND version=? AND fencing_token=? AND lease_owner=?",next,next,jobId,input.version(),input.fencingToken(),agent.id());
        if(changed==0)throw new ResponseStatusException(CONFLICT,"打印任务已被其他代理更新");jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,?,?::jsonb)",jobId,next,json);
        Long version=jdbc.queryForObject("SELECT version FROM print_job WHERE id=?",Long.class,jobId);return new StatusResult(jobId,next,version==null?0:version);
    }

    @PostMapping("/heartbeat") @Transactional public HeartbeatResult heartbeat(@RequestHeader(value="Authorization",required=false) String authorization,@RequestBody HeartbeatInput input){
        var agent=authenticator.authenticate(authorization);if(input.agentVersion()==null||input.agentVersion().isBlank()||input.agentVersion().length()>80||!List.of("READY","BUSY","PAPER_OUT","JAMMED","ERROR","UNKNOWN").contains(input.deviceState()))throw new ResponseStatusException(BAD_REQUEST,"打印机状态报告无效");
        if(input.tonerSupported()&&input.tonerPercent()!=null&&(input.tonerPercent()<0||input.tonerPercent()>100))throw new ResponseStatusException(BAD_REQUEST,"耗材百分比无效");if(!input.tonerSupported()&&input.tonerPercent()!=null)throw new ResponseStatusException(BAD_REQUEST,"不支持耗材读取时百分比必须留空");
        JsonNode capabilities=sanitizeCapabilities(input.capabilities());Map<String,Object> report=new LinkedHashMap<>();report.put("agentVersion",input.agentVersion());report.put("deviceState",input.deviceState());report.put("tonerSupported",input.tonerSupported());report.put("tonerPercent",input.tonerPercent());report.put("reportedAt",OffsetDateTime.now());
        jdbc.update("UPDATE agent_identity SET last_seen_at=now(),last_report=?::jsonb WHERE id=?",write(report),agent.id());jdbc.update("UPDATE printer SET capabilities=?::jsonb WHERE id=?",write(capabilities),agent.printerId());return new HeartbeatResult(OffsetDateTime.now(),"OK");
    }

    private AgentJob claim(UUID agentId,UUID printerId){
        return jdbc.query("UPDATE print_job SET status='LEASED',lease_owner=?,lease_until=now()+interval '60 seconds',fencing_token=fencing_token+1,version=version+1,updated_at=now() WHERE id=(SELECT id FROM print_job WHERE printer_id=? AND (status='QUEUED' OR (status='LEASED' AND lease_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,version,fencing_token,lease_until,options::text,file_id",(rs,row)->new ClaimedJob((UUID)rs.getObject(1),rs.getLong(2),rs.getLong(3),rs.getObject(4,OffsetDateTime.class),parse(rs.getString(5)),(UUID)rs.getObject(6)),agentId,printerId).stream().findFirst().map(claimed->{
            jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,'LEASED',jsonb_build_object('fencingToken',?,'agentId',?::text))",claimed.id(),claimed.fencingToken(),agentId.toString());
            return jdbc.query("SELECT j.id,j.version,j.fencing_token,j.lease_until,j.options::text,f.id AS file_id,f.sha256,f.byte_size,f.page_count FROM print_job j JOIN file_object f ON f.id=j.file_id WHERE j.id=?",(rs,row)->jobRow(rs),claimed.id()).getFirst();
        }).orElse(null);
    }
    private AgentJob jobRow(java.sql.ResultSet rs)throws java.sql.SQLException{return new AgentJob((UUID)rs.getObject("id"),rs.getLong("version"),rs.getLong("fencing_token"),rs.getObject("lease_until",OffsetDateTime.class),parse(rs.getString("options")),(UUID)rs.getObject("file_id"),rs.getString("sha256"),rs.getLong("byte_size"),rs.getInt("page_count"));}
    private LeasedJob leaseView(AgentJob job){return new LeasedJob(job.id(),job.version(),job.fencingToken(),job.leaseUntil(),"/api/v1/printer-agent/jobs/"+job.id()+"/content?fencingToken="+job.fencingToken(),job.sha(),job.bytes(),job.pageCount(),job.options());}
    private boolean allowed(String from,String to){return switch(from){case "LEASED"->List.of("SUBMITTING","FAILED","CANCELED","UNKNOWN").contains(to);case "SUBMITTING"->List.of("SUBMITTED","FAILED","CANCELED","UNKNOWN").contains(to);case "SUBMITTED"->List.of("COMPLETED","FAILED","CANCELED","UNKNOWN").contains(to);case "CANCEL_REQUESTED"->List.of("CANCELED","COMPLETED","FAILED","UNKNOWN").contains(to);default->false;};}
    private Map<String,Object> safeDetail(Map<String,Object> detail){Map<String,Object> safe=new LinkedHashMap<>();if(detail==null)return safe;for(String key:List.of("cupsJobId","resultCode","reasonCode","deviceState")){Object value=detail.get(key);if(value instanceof String text&&text.length()<=120)safe.put(key,text);}return safe;}
    private JsonNode sanitizeCapabilities(Map<String,Object> source){Map<String,Object> safe=new LinkedHashMap<>();if(source==null)return mapper.createObjectNode();Object known=source.get("known"),color=source.get("colorSupported"),duplex=source.get("duplexSupported"),copies=source.get("maxCopies"),papers=source.get("paperSizes");if(!(known instanceof Boolean)||!(color instanceof Boolean)||!(duplex instanceof Boolean))throw new ResponseStatusException(BAD_REQUEST,"打印机能力报告不完整");int max=1;if(copies instanceof Number number)max=number.intValue();if(max<1||max>20)throw new ResponseStatusException(BAD_REQUEST,"最大份数无效");safe.put("known",known);safe.put("colorSupported",color);safe.put("duplexSupported",duplex);safe.put("maxCopies",max);if(papers instanceof List<?> list)safe.put("paperSizes",list.stream().filter(String.class::isInstance).map(String.class::cast).filter(v->v.length()<=30).distinct().limit(20).toList());return mapper.valueToTree(safe);}
    private void event(UUID job,String status,Map<String,Object> detail){jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,?,?::jsonb)",job,status,write(detail));}
    private JsonNode parse(String value){try{return mapper.readTree(value);}catch(Exception ex){throw new IllegalStateException("Stored printer JSON is invalid",ex);}}
    private String write(Object value){try{return mapper.writeValueAsString(value);}catch(Exception ex){throw new IllegalStateException("Printer data cannot be serialized",ex);}}
    private static String sha256(byte[] bytes){try{return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private static ResponseStatusException hidden(){return new ResponseStatusException(NOT_FOUND,"打印作业不存在或租约已失效");}

    public record PollResponse(LeasedJob job,List<CancelRequest> cancelRequests,OffsetDateTime serverTime){}
    public record LeasedJob(UUID jobId,long version,long fencingToken,OffsetDateTime leaseUntil,String contentUrl,String sha256,long byteSize,int pageCount,JsonNode options){}
    public record CancelRequest(UUID jobId,long fencingToken,long version){}
    public record AgentStatusInput(String state,long fencingToken,long version,Map<String,Object> detail){}
    public record StatusResult(UUID jobId,String state,long version){}
    public record HeartbeatInput(String agentVersion,String deviceState,boolean tonerSupported,Integer tonerPercent,Map<String,Object> capabilities){}
    public record HeartbeatResult(OffsetDateTime serverTime,String status){}
    public record AgentJobStatus(UUID jobId,String status,long version,long fencingToken,OffsetDateTime leaseUntil){}
    private record AgentJob(UUID id,long version,long fencingToken,OffsetDateTime leaseUntil,JsonNode options,UUID fileId,String sha,long bytes,int pageCount){}
    private record ClaimedJob(UUID id,long version,long fencingToken,OffsetDateTime leaseUntil,JsonNode options,UUID fileId){}
    private record FileRow(String key,String sha,long bytes){}
    private record PrintState(String status,long version){}
}
