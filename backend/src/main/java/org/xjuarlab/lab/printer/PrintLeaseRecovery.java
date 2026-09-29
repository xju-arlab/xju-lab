package org.xjuarlab.lab.printer;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PrintLeaseRecovery {
    private final JdbcTemplate jdbc;
    public PrintLeaseRecovery(JdbcTemplate jdbc){this.jdbc=jdbc;}

    @Scheduled(fixedDelayString="${lab.print.recovery-poll-ms:5000}")
    @Transactional public void markAmbiguousSubmissionsUnknown(){
        var ids=jdbc.query("UPDATE print_job SET status='UNKNOWN',version=version+1,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE status='SUBMITTING' AND lease_until<now() RETURNING id",(rs,row)->(UUID)rs.getObject(1));
        for(UUID id:ids)jdbc.update("INSERT INTO print_event(job_id,status,detail) VALUES (?,'UNKNOWN',jsonb_build_object('reason','SUBMITTING_LEASE_EXPIRED'))",id);
    }
}
