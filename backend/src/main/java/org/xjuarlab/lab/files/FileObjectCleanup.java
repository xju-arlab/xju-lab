package org.xjuarlab.lab.files;

import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public class FileObjectCleanup {
    private final JdbcTemplate jdbc; private final PrivateObjectStore store;
    public FileObjectCleanup(JdbcTemplate jdbc,PrivateObjectStore store){this.jdbc=jdbc;this.store=store;}
    @Scheduled(cron="0 30 3 * * *")
    public void purgeDeletedObjects(){
        List<DeletedFile> files=jdbc.query("SELECT f.id,f.storage_key FROM file_object f WHERE f.deleted_at<now()-interval '30 days' AND f.object_purged_at IS NULL AND NOT EXISTS(SELECT 1 FROM print_job p WHERE p.file_id=f.id)",(rs,row)->new DeletedFile(rs.getObject(1,java.util.UUID.class),rs.getString(2)));
        for(DeletedFile file:files)try{store.delete(file.key());jdbc.update("UPDATE file_object SET object_purged_at=now() WHERE id=? AND object_purged_at IS NULL",file.id());}catch(Exception ignored){/* Retry on the next scheduled pass. */}
    }
    private record DeletedFile(java.util.UUID id,String key){}
}
