package org.xjuarlab.lab.printer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
public class PrinterController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final ObjectMapper mapper;
    private final int maxCopies;

    public PrinterController(JdbcTemplate jdbc, CurrentMember current, ObjectMapper mapper,
        @Value("${lab.upload.max-copies:10}") int maxCopies) {
        this.jdbc=jdbc;this.current=current;this.mapper=mapper;this.maxCopies=maxCopies;
    }

    @GetMapping("/api/v1/printers") public List<PrinterView> printers(Authentication auth) {
        UUID actor=current.id(auth);current.roles(actor);
        return jdbc.query("SELECT p.id,p.name,p.location,p.capabilities,CASE WHEN NOT p.enabled THEN 'DISABLED' WHEN ai.last_seen_at>now()-interval '90 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END AS state,ai.last_seen_at,ai.last_report FROM printer p LEFT JOIN agent_identity ai ON ai.id=p.agent_id WHERE p.enabled=true ORDER BY p.name,p.id",
            (rs,row)->new PrinterView((UUID)rs.getObject("id"),rs.getString("name"),rs.getString("location"),parse(rs.getString("capabilities")),rs.getString("state"),rs.getObject("last_seen_at",OffsetDateTime.class),parse(rs.getString("last_report"))));
    }

    @GetMapping("/api/v1/print/jobs") public PageEnvelope<PrintJobView> jobs(Authentication auth,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int pageSize) {
        UUID actor=current.id(auth);long offset=PageEnvelope.offset(page,pageSize);
        List<PrintJobView> rows=jdbc.query("SELECT j.id,j.printer_id,p.name AS printer_name,j.file_id,f.original_name,f.byte_size,f.page_count,f.sha256,j.options,j.status,j.version,j.fencing_token,j.created_at,j.updated_at FROM print_job j JOIN printer p ON p.id=j.printer_id JOIN file_object f ON f.id=j.file_id WHERE j.owner_id=? ORDER BY j.created_at DESC,j.id LIMIT ? OFFSET ?",(rs,row)->jobRow(rs),actor,pageSize,offset);
        Long total=jdbc.queryForObject("SELECT count(*) FROM print_job WHERE owner_id=?",Long.class,actor);return new PageEnvelope<>(rows,total==null?0:total,page,pageSize);
    }

    @GetMapping("/api/v1/print/jobs/{jobId}") public PrintJobView job(Authentication auth,@PathVariable UUID jobId) {
        UUID actor=current.id(auth);return job(jobId,actor);
    }

    @GetMapping("/api/v1/print/jobs/{jobId}/events") public List<PrintEventView> events(Authentication auth,@PathVariable UUID jobId) {
        UUID actor=current.id(auth);if(jdbc.query("SELECT 1 FROM print_job WHERE id=? AND owner_id=?",(rs,row)->rs.getInt(1),jobId,actor).isEmpty())throw hidden();
        return jdbc.query("SELECT status,detail,created_at FROM print_event WHERE job_id=? ORDER BY created_at,id",(rs,row)->new PrintEventView(rs.getString(1),parse(rs.getString(2)),rs.getObject(3,OffsetDateTime.class)),jobId);
    }

    @PostMapping("/api/v1/print/jobs") @Transactional public ResponseEntity<JsonNode> createJob(Authentication auth,@RequestHeader("Idempotency-Key") String idempotencyKey,@RequestBody CreatePrintJob input) {
        UUID actor=current.id(auth);if(idempotencyKey.isBlank()||idempotencyKey.length()>160)throw new ResponseStatusException(BAD_REQUEST,"Idempotency-Key 无效");
        FileRow file=jdbc.query("SELECT original_name,byte_size,page_count,sha256 FROM file_object WHERE id=? AND owner_id=? AND deleted_at IS NULL",(rs,row)->new FileRow(rs.getString(1),rs.getLong(2),rs.getInt(3),rs.getString(4)),input.fileId(),actor).stream().findFirst().orElseThrow(PrinterController::hidden);
        PrinterCaps printer=jdbc.query("SELECT id,name,enabled,capabilities::text FROM printer WHERE id=?",(rs,row)->new PrinterCaps((UUID)rs.getObject(1),rs.getString(2),rs.getBoolean(3),parse(rs.getString(4))),input.printerId()).stream().findFirst().orElseThrow(PrinterController::hidden);
        if(!printer.enabled())throw new ResponseStatusException(CONFLICT,"打印机已停用");
        NormalizedOptions options=normalize(input,file.pages(),printer.capabilities());String optionsJson=write(options);String hash=sha256(printer.id()+"|"+input.fileId()+"|"+optionsJson);
        jdbc.update("DELETE FROM idempotency_record WHERE actor_id=? AND scope='print-job-create' AND expires_at<now()",actor);
        jdbc.update("INSERT INTO idempotency_record(actor_id,scope,key,request_hash,expires_at) VALUES (?,'print-job-create',?,?,now()+interval '24 hours') ON CONFLICT (actor_id,scope,key) DO NOTHING",actor,idempotencyKey,hash);
        Idempotency existing=jdbc.query("SELECT request_hash,response_body::text FROM idempotency_record WHERE actor_id=? AND scope='print-job-create' AND key=? FOR UPDATE",(rs,row)->new Idempotency(rs.getString(1),rs.getString(2)),actor,idempotencyKey).getFirst();
        if(!MessageDigest.isEqual(existing.hash().getBytes(StandardCharsets.US_ASCII),hash.getBytes(StandardCharsets.US_ASCII)))throw new ResponseStatusException(CONFLICT,"相同幂等键不能用于不同打印请求");
        if(existing.responseBody()!=null)return ResponseEntity.ok(parse(existing.responseBody()));
        UUID id=jdbc.queryForObject("INSERT INTO print_job(owner_id,printer_id,file_id,options,status,idempotency_key,request_hash) VALUES (?,?,?,?::jsonb,'QUEUED',?,?) RETURNING id",UUID.class,actor,printer.id(),input.fileId(),optionsJson,idempotencyKey,hash);
        jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,'QUEUED',jsonb_build_object('actorId',?::text))",id,actor.toString());
        PrintJobView view=job(id,actor);String body=write(view);jdbc.update("UPDATE idempotency_record SET response_status=201,response_body=?::jsonb WHERE actor_id=? AND scope='print-job-create' AND key=?",body,actor,idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(parse(body));
    }

    @PostMapping("/api/v1/print/jobs/{jobId}/cancel") @Transactional public PrintJobView cancel(Authentication auth,@PathVariable UUID jobId,@RequestHeader("If-Match-Version") long version) {
        UUID actor=current.id(auth);PrintJobStatus currentJob=jdbc.query("SELECT status,version FROM print_job WHERE id=? AND owner_id=? FOR UPDATE",(rs,row)->new PrintJobStatus(rs.getString(1),rs.getLong(2)),jobId,actor).stream().findFirst().orElseThrow(PrinterController::hidden);
        if(currentJob.version()!=version)throw new ResponseStatusException(CONFLICT,"打印任务已变化，请刷新后重试");
        String next=switch(currentJob.status()){case "QUEUED"->"CANCELED";case "LEASED","SUBMITTING","SUBMITTED"->"CANCEL_REQUESTED";default->throw new ResponseStatusException(CONFLICT,"当前状态不能取消，请核对打印机实际状态");};
        jdbc.update("UPDATE print_job SET status=?,version=version+1,updated_at=now() WHERE id=? AND version=?",next,jobId,version);
        jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,?,jsonb_build_object('actorId',?::text))",jobId,next,actor.toString());return job(jobId,actor);
    }

    @GetMapping("/api/v1/admin/printers") public List<PrinterView> adminPrinters(Authentication auth) {
        requireAdmin(current.id(auth));return jdbc.query("SELECT p.id,p.name,p.location,p.capabilities,CASE WHEN NOT p.enabled THEN 'DISABLED' WHEN ai.last_seen_at>now()-interval '90 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END AS state,ai.last_seen_at,ai.last_report FROM printer p LEFT JOIN agent_identity ai ON ai.id=p.agent_id ORDER BY p.name,p.id",
            (rs,row)->new PrinterView((UUID)rs.getObject("id"),rs.getString("name"),rs.getString("location"),parse(rs.getString("capabilities")),rs.getString("state"),rs.getObject("last_seen_at",OffsetDateTime.class),parse(rs.getString("last_report"))));
    }

    @PostMapping("/api/v1/admin/printers") @Transactional public AgentCredential createPrinter(Authentication auth,@RequestBody CreatePrinter input) {
        UUID actor=current.id(auth);requireAdmin(actor);if(input.name()==null||input.name().isBlank()||input.name().length()>120)throw new ResponseStatusException(BAD_REQUEST,"打印机名称无效");
        JsonNode capabilities=input.capabilities()==null?mapper.createObjectNode():mapper.valueToTree(input.capabilities());String token=newToken();
        UUID printer=jdbc.queryForObject("INSERT INTO printer(name,location,capabilities) VALUES (?,?,?::jsonb) RETURNING id",UUID.class,input.name().trim(),input.location()==null?"":input.location().trim(),write(capabilities));
        UUID agent=jdbc.queryForObject("INSERT INTO agent_identity(printer_id,token_hash) VALUES (?,?) RETURNING id",UUID.class,printer,sha256(token));jdbc.update("UPDATE printer SET agent_id=? WHERE id=?",agent,printer);
        audit(actor,"CREATE_PRINTER",printer,Map.of("agentCredentialIssued",true));return new AgentCredential(printer,agent,token);
    }

    @PostMapping("/api/v1/admin/printers/{printerId}/rotate-agent-token") @Transactional public AgentCredential rotateToken(Authentication auth,@PathVariable UUID printerId) {
        UUID actor=current.id(auth);requireAdmin(actor);UUID agent=jdbc.query("SELECT id FROM agent_identity WHERE printer_id=? FOR UPDATE",(rs,row)->(UUID)rs.getObject(1),printerId).stream().findFirst().orElseThrow(PrinterController::hidden);String token=newToken();
        jdbc.update("UPDATE agent_identity SET token_hash=?,active=true WHERE id=?",sha256(token),agent);jdbc.update("UPDATE printer SET agent_id=? WHERE id=?",agent,printerId);audit(actor,"ROTATE_PRINTER_AGENT_TOKEN",printerId,Map.of("agentCredentialIssued",true));return new AgentCredential(printerId,agent,token);
    }

    @PatchMapping("/api/v1/admin/printers/{printerId}/enabled") @Transactional public PrinterView setPrinterEnabled(Authentication auth,@PathVariable UUID printerId,@RequestBody EnabledInput input) {
        UUID actor=current.id(auth);requireAdmin(actor);int changed=jdbc.update("UPDATE printer SET enabled=? WHERE id=?",input.enabled(),printerId);if(changed==0)throw hidden();
        audit(actor,"SET_PRINTER_ENABLED",printerId,Map.of("enabled",input.enabled()));return jdbc.query("SELECT p.id,p.name,p.location,p.capabilities,CASE WHEN NOT p.enabled THEN 'DISABLED' WHEN ai.last_seen_at>now()-interval '90 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END,ai.last_seen_at,ai.last_report FROM printer p LEFT JOIN agent_identity ai ON ai.id=p.agent_id WHERE p.id=?",(rs,row)->new PrinterView((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),parse(rs.getString(4)),rs.getString(5),rs.getObject(6,OffsetDateTime.class),parse(rs.getString(7))),printerId).getFirst();
    }

    private NormalizedOptions normalize(CreatePrintJob input,int totalPages,JsonNode capabilities) {
        if(totalPages<1)throw new ResponseStatusException(BAD_REQUEST,"文件页数不可用于打印");if(input.copies()<1||input.copies()>maxCopies)throw new ResponseStatusException(BAD_REQUEST,"份数超出实验室限制");
        String sides=input.sides()==null?"SIMPLEX":input.sides(),color=input.color()==null?"MONOCHROME":input.color();if(!List.of("SIMPLEX","DUPLEX_LONG_EDGE","DUPLEX_SHORT_EDGE").contains(sides)||!List.of("MONOCHROME","COLOR").contains(color))throw new ResponseStatusException(BAD_REQUEST,"打印选项无效");
        if(!capabilities.path("known").asBoolean(false)&&(!sides.equals("SIMPLEX")||!color.equals("MONOCHROME")||input.copies()>1))throw new ResponseStatusException(BAD_REQUEST,"打印机能力尚未确认，暂不能使用该打印选项");
        if(color.equals("COLOR")&&!capabilities.path("colorSupported").asBoolean(false))throw new ResponseStatusException(BAD_REQUEST,"该打印机不支持或尚未确认彩色打印");
        if(!sides.equals("SIMPLEX")&&!capabilities.path("duplexSupported").asBoolean(false))throw new ResponseStatusException(BAD_REQUEST,"该打印机不支持或尚未确认双面打印");
        int allowed=Math.min(maxCopies,capabilities.path("maxCopies").canConvertToInt()?capabilities.path("maxCopies").asInt():1);if(input.copies()>allowed)throw new ResponseStatusException(BAD_REQUEST,"份数超过打印机能力");
        TreeSet<Integer> pages=new TreeSet<>();String expression=input.pages();if(expression!=null&&!expression.isBlank()){
            for(String part:expression.split(",",-1)){String item=part.trim();if(item.isEmpty())throw new ResponseStatusException(BAD_REQUEST,"页码格式无效");String[] bounds=item.split("-",-1);try{int start=Integer.parseInt(bounds[0]),end=bounds.length==1?start:Integer.parseInt(bounds[1]);if(bounds.length>2||start<1||end<start||end>totalPages||end-start>200)throw new NumberFormatException();for(int page=start;page<=end;page++)pages.add(page);}catch(NumberFormatException ex){throw new ResponseStatusException(BAD_REQUEST,"页码必须在文件范围内且格式如 1,3-5");}}
        }
        if(pages.size()>totalPages)throw new ResponseStatusException(BAD_REQUEST,"页码范围无效");int logical=pages.isEmpty()?totalPages:pages.size();int sheets=(sides.equals("SIMPLEX")?logical:(logical+1)/2)*input.copies();
        return new NormalizedOptions(List.copyOf(pages),input.copies(),sides,color,logical,sheets);
    }
    private PrintJobView job(UUID jobId,UUID ownerId){return jdbc.query("SELECT j.id,j.printer_id,p.name AS printer_name,j.file_id,f.original_name,f.byte_size,f.page_count,f.sha256,j.options,j.status,j.version,j.fencing_token,j.created_at,j.updated_at FROM print_job j JOIN printer p ON p.id=j.printer_id JOIN file_object f ON f.id=j.file_id WHERE j.id=? AND j.owner_id=?",(rs,row)->jobRow(rs),jobId,ownerId).stream().findFirst().orElseThrow(PrinterController::hidden);}
    private PrintJobView jobRow(java.sql.ResultSet rs)throws java.sql.SQLException{return new PrintJobView((UUID)rs.getObject("id"),(UUID)rs.getObject("printer_id"),rs.getString("printer_name"),(UUID)rs.getObject("file_id"),rs.getString("original_name"),rs.getLong("byte_size"),rs.getInt("page_count"),rs.getString("sha256"),parse(rs.getString("options")),rs.getString("status"),rs.getLong("version"),rs.getLong("fencing_token"),rs.getObject("created_at",OffsetDateTime.class),rs.getObject("updated_at",OffsetDateTime.class));}
    private JsonNode parse(String value){try{return value==null?mapper.nullNode():mapper.readTree(value);}catch(Exception ex){throw new IllegalStateException("Stored printer JSON is invalid",ex);}}
    private String write(Object value){try{return mapper.writeValueAsString(value);}catch(Exception ex){throw new IllegalStateException("Printer data cannot be serialized",ex);}}
    private static String newToken(){byte[] bytes=new byte[32];RANDOM.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    private static String sha256(String value){try{return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private void requireAdmin(UUID actor){current.requireRole(actor,"LAB_ADMIN","SUPER_ADMIN");}
    private void audit(UUID actor,String action,UUID target,Object after){jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,?,'printer',?,?::jsonb)",actor,action,target.toString(),write(after));}
    private static ResponseStatusException hidden(){return new ResponseStatusException(NOT_FOUND,"打印资源不存在或无权访问");}

    public record PrinterView(UUID id,String name,String location,JsonNode capabilities,String status,OffsetDateTime lastSeenAt,JsonNode lastReport){}
    public record PrintJobView(UUID id,UUID printerId,String printerName,UUID fileId,String fileName,long byteSize,int pageCount,String sha256,JsonNode options,String status,long version,long fencingToken,OffsetDateTime createdAt,OffsetDateTime updatedAt){}
    public record PrintEventView(String status,JsonNode detail,OffsetDateTime createdAt){}
    public record AgentCredential(UUID printerId,UUID agentId,String token){}
    public record CreatePrinter(String name,String location,Map<String,Object> capabilities){}
    public record EnabledInput(boolean enabled){}
    public record CreatePrintJob(UUID printerId,UUID fileId,String pages,int copies,String sides,String color){}
    public record NormalizedOptions(List<Integer> pages,int copies,String sides,String color,int logicalPages,int estimatedSheets){}
    private record FileRow(String name,long bytes,int pages,String sha){}
    private record PrinterCaps(UUID id,String name,boolean enabled,JsonNode capabilities){}
    private record Idempotency(String hash,String responseBody){}
    private record PrintJobStatus(String status,long version){}
}
