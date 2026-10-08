package org.xjuarlab.lab.hongqingting.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.api.PageEnvelope;
import org.xjuarlab.lab.hongqingting.domain.RunnerContracts.*;
import org.xjuarlab.lab.hongqingting.infrastructure.RunnerClient;
import static org.springframework.http.HttpStatus.*;

@Service
public class RunnerBatches {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final RunnerClient client;
    public RunnerBatches(JdbcTemplate jdbc, PlatformTransactionManager manager, RunnerClient client) {
        this.jdbc=jdbc; this.tx=new TransactionTemplate(manager); this.client=client;
    }

    public Batch create(UUID owner, UUID key, BatchRequest request) {
        client.requireConfigured();
        return tx.execute(transaction -> {
            jdbc.queryForObject("SELECT id FROM member WHERE id=? FOR UPDATE",UUID.class,owner);
            List<UUID> existing=jdbc.query("SELECT id FROM hongqingting_batch WHERE created_by=? AND idempotency_key=?",
                (rs,row)->(UUID)rs.getObject(1),owner,key);
            if (!existing.isEmpty()) {
                Batch batch=read(owner,existing.getFirst());
                if (!batch.studentNo().equals(request.studentNo()) || !batch.track().equals(request.track())
                        || batch.days()!=request.days() || batch.dailyOffset().compareTo(request.dailyOffset())!=0)
                    throw new ResponseStatusException(CONFLICT,"同一请求标识不能用于不同任务");
                return batch;
            }
            if(jdbc.queryForObject("SELECT count(*) FROM hongqingting_batch WHERE created_by=? AND status IN ('QUEUED','RUNNING')",Integer.class,owner)>=3)
                throw new ResponseStatusException(CONFLICT,"最多同时保留三个进行中的任务");
            UUID id=jdbc.queryForObject("INSERT INTO hongqingting_batch(created_by,idempotency_key,student_no,track,days,daily_offset) VALUES (?,?,?,?,?,?) RETURNING id",
                UUID.class,owner,key,request.studentNo(),request.track(),request.days(),request.dailyOffset());
            jdbc.update("INSERT INTO hongqingting_run(batch_id,ordinal) SELECT ?,generate_series(0,?-1)",id,request.days());
            audit(owner,"HONGQINGTING_CREATE",id);
            return read(owner,id);
        });
    }

    public PageEnvelope<Batch> list(UUID owner,int page,int pageSize) {
        long offset=PageEnvelope.offset(page,pageSize);
        List<Batch> items=jdbc.query("SELECT id FROM hongqingting_batch WHERE created_by=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
            (rs,row)->(UUID)rs.getObject(1),owner,pageSize,offset).stream().map(id->read(owner,id)).toList();
        long total=jdbc.queryForObject("SELECT count(*) FROM hongqingting_batch WHERE created_by=?",Long.class,owner);
        return new PageEnvelope<>(items,total,page,pageSize);
    }
    public Batch read(UUID owner,UUID id) {
        return jdbc.query("SELECT * FROM hongqingting_batch WHERE id=? AND created_by=?",(rs,row)->new Batch(
            id,rs.getString("student_no"),rs.getString("track"),rs.getInt("days"),rs.getBigDecimal("daily_offset"),
            rs.getString("status"),rs.getLong("version"),rs.getBoolean("cancel_requested"),rs.getObject("created_at",OffsetDateTime.class),
            jdbc.query("SELECT id,ordinal,status,message FROM hongqingting_run WHERE batch_id=? ORDER BY ordinal",
                (run,n)->new Run((UUID)run.getObject(1),run.getInt(2),run.getString(3),run.getString(4)),id)),id,owner)
            .stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"任务不存在"));
    }
    public Batch cancel(UUID owner,UUID id,long version) {
        return tx.execute(transaction -> {
            lock(id,owner);
            Batch batch=read(owner,id);
            if(batch.version()!=version) throw new ResponseStatusException(CONFLICT,"任务进度已变化，请刷新后停止");
            if(!List.of("QUEUED","RUNNING").contains(batch.status())) return batch;
            jdbc.update("UPDATE hongqingting_batch SET cancel_requested=true,version=version+1,updated_at=now() WHERE id=?",id);
            jdbc.update("UPDATE hongqingting_run SET status='CANCELLED',finished_at=now() WHERE batch_id=? AND status='PENDING'",id);
            settle(id);
            audit(owner,"HONGQINGTING_CANCEL",id);
            return read(owner,id);
        });
    }
    private void lock(UUID id,UUID owner) {
        if(jdbc.query("SELECT id FROM hongqingting_batch WHERE id=? AND created_by=? FOR UPDATE",
                (rs,row)->rs.getObject(1),id,owner).isEmpty()) throw new ResponseStatusException(NOT_FOUND,"任务不存在");
    }
    private void audit(UUID owner,String action,UUID id) {
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,?,'hongqingting_batch',?)",owner,action,id.toString());
    }

    /** Claims one committed outbox item globally. An interrupted send must never be claimed again. */
    public Attempt claim() {
        return tx.execute(transaction -> {
            jdbc.execute("SELECT pg_advisory_xact_lock(10755016)");
            List<UUID> expired=jdbc.query("SELECT b.id FROM hongqingting_batch b WHERE EXISTS (SELECT 1 FROM hongqingting_run r WHERE r.batch_id=b.id AND r.status='SENDING' AND r.started_at<now()-interval '2 minutes') FOR UPDATE",
                (rs,row)->(UUID)rs.getObject(1));
            for(UUID id:expired) {
                jdbc.update("UPDATE hongqingting_run SET status='UNKNOWN',finished_at=now(),message='服务中断，提交结果待核实，未自动重试' WHERE batch_id=? AND status='SENDING'",id);
                stopPending(id); settle(id);
            }
            // Also rate limits across application instances; requests are never retried by this worker.
            if(jdbc.queryForObject("SELECT count(*) FROM hongqingting_run WHERE status='SENDING' OR finished_at>now()-interval '2 seconds'",Integer.class)>0) return null;
            List<UUID> candidates=jdbc.query("SELECT id FROM hongqingting_batch WHERE status IN ('QUEUED','RUNNING') AND cancel_requested=false ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
                (rs,row)->(UUID)rs.getObject(1));
            if(candidates.isEmpty()) return null;
            UUID id=candidates.getFirst();
            boolean allowed=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM hongqingting_batch b JOIN member m ON m.id=b.created_by WHERE b.id=? AND m.active AND m.real_name IS NOT NULL AND m.student_number IS NOT NULL AND EXISTS(SELECT 1 FROM external_identity x WHERE x.member_id=m.id AND x.active) AND EXISTS(SELECT 1 FROM role_assignment r WHERE r.member_id=m.id AND r.revoked_at IS NULL AND r.role IN ('LAB_ADMIN','SUPER_ADMIN')))",Boolean.class,id));
            if(!allowed) {
                jdbc.update("UPDATE hongqingting_batch SET cancel_requested=true WHERE id=?",id);
                stopPending(id); settle(id); return null;
            }
            List<Attempt> work=jdbc.query("SELECT r.id,b.student_no,r.ordinal-b.daily_offset,b.created_at FROM hongqingting_run r JOIN hongqingting_batch b ON b.id=r.batch_id WHERE b.id=? AND r.status='PENDING' ORDER BY r.ordinal LIMIT 1",
                (rs,row)->new Attempt((UUID)rs.getObject(1),id,rs.getString(2),rs.getDouble(3),rs.getObject(4,OffsetDateTime.class).toEpochSecond()),id);
            if(work.isEmpty()) { settle(id); return null; }
            Attempt attempt=work.getFirst();
            jdbc.update("UPDATE hongqingting_run SET status='SENDING',started_at=now() WHERE id=?",attempt.id());
            jdbc.update("UPDATE hongqingting_batch SET status='RUNNING',version=version+1,updated_at=now() WHERE id=?",id);
            return attempt;
        });
    }
    public void finish(Attempt attempt,Outcome result) {
        if(!List.of("RECEIVED","FAILED","UNKNOWN").contains(result.status())) throw new IllegalArgumentException("Invalid outcome");
        tx.executeWithoutResult(transaction -> {
            jdbc.queryForObject("SELECT id FROM hongqingting_batch WHERE id=? FOR UPDATE",UUID.class,attempt.batchId());
            int changed=jdbc.update("UPDATE hongqingting_run SET status=?,message=?,finished_at=now() WHERE id=? AND status='SENDING'",
                result.status(),result.message(),attempt.id());
            if(changed==0) return; // A recovered UNKNOWN result cannot be overwritten by a late response.
            if(!result.status().equals("RECEIVED")) stopPending(attempt.batchId());
            settle(attempt.batchId());
        });
    }
    private void stopPending(UUID id) {
        jdbc.update("UPDATE hongqingting_run SET status='CANCELLED',finished_at=now() WHERE batch_id=? AND status='PENDING'",id);
    }
    private void settle(UUID id) {
        jdbc.update("""
            UPDATE hongqingting_batch b SET status=CASE
              WHEN EXISTS(SELECT 1 FROM hongqingting_run r WHERE r.batch_id=b.id AND r.status='SENDING') THEN 'RUNNING'
              WHEN EXISTS(SELECT 1 FROM hongqingting_run r WHERE r.batch_id=b.id AND r.status='UNKNOWN') THEN 'UNKNOWN'
              WHEN EXISTS(SELECT 1 FROM hongqingting_run r WHERE r.batch_id=b.id AND r.status='FAILED') THEN 'FAILED'
              WHEN cancel_requested THEN 'CANCELLED'
              WHEN EXISTS(SELECT 1 FROM hongqingting_run r WHERE r.batch_id=b.id AND r.status='PENDING') THEN 'RUNNING'
              ELSE 'COMPLETED' END,version=version+1,updated_at=now() WHERE b.id=?
            """,id);
    }
}
