package org.xjuarlab.lab.leave;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE;

@Component
public class LeaveAttachments {
    public static final int MAX_FILE_BYTES=10*1024*1024, MAX_TOTAL_BYTES=25*1024*1024, MAX_FILES=5;
    private static final Set<String> EXTENSIONS=Set.of("jpg","jpeg","png","gif","webp","bmp","tif","tiff","heic","heif","avif","pdf","doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","rtf","wps","et","dps","txt","csv","md","zip","7z","rar");
    private final JdbcTemplate jdbc;
    public LeaveAttachments(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public List<Upload> validate(List<MultipartFile> files) {
        if(files==null) return List.of();
        if(files.size()>MAX_FILES) throw new ResponseStatusException(BAD_REQUEST,"最多添加 5 个附件");
        long total=0;
        List<Upload> result=new ArrayList<>();
        for(var file:files) {
            total+=file.getSize();
            if(file.isEmpty()) throw new ResponseStatusException(BAD_REQUEST,"附件不能为空文件");
            if(file.getSize()>MAX_FILE_BYTES || total>MAX_TOTAL_BYTES) throw new ResponseStatusException(PAYLOAD_TOO_LARGE,"单个附件最多 10 MB，合计最多 25 MB");
            String original=file.getOriginalFilename();
            String name=original==null?"":original.replace('\\','/');
            name=name.substring(name.lastIndexOf('/')+1).trim();
            if(name.isBlank() || name.length()>200 || name.codePoints().anyMatch(c->Character.isISOControl(c)||c==0x202e)) throw new ResponseStatusException(BAD_REQUEST,"附件文件名无效或过长");
            String extension=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
            if(!name.contains(".") || !EXTENSIONS.contains(extension)) throw new ResponseStatusException(BAD_REQUEST,"请上传图片、PDF、Office 文档、文本或压缩包");
            try { result.add(new Upload(name,file.getBytes())); }
            catch(IOException ex){throw new ResponseStatusException(BAD_REQUEST,"附件读取失败，请重新选择文件");}
        }
        return result;
    }
    public void save(UUID application,List<Upload> uploads) {
        for(var upload:uploads) jdbc.update("INSERT INTO leave_attachment(application_id,filename,byte_size,content) VALUES (?,?,?,?)",application,upload.filename(),upload.content().length,upload.content());
    }
    public List<AttachmentView> list(UUID application) {
        return jdbc.query("SELECT id,filename,byte_size FROM leave_attachment WHERE application_id=? ORDER BY created_at,id",(rs,row)->new AttachmentView(rs.getObject(1,UUID.class),rs.getString(2),rs.getInt(3)),application);
    }
    public Upload read(UUID application,UUID attachment) {
        return jdbc.query("SELECT filename,content FROM leave_attachment WHERE application_id=? AND id=?",(rs,row)->new Upload(rs.getString(1),rs.getBytes(2)),application,attachment)
            .stream().findFirst().orElseThrow(()->new ResponseStatusException(NOT_FOUND,"附件不存在或无权访问"));
    }
    public record Upload(String filename,byte[] content){}
    public record AttachmentView(UUID id,String filename,int byteSize){}
}
