package org.xjuarlab.lab.files;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.xjuarlab.lab.security.CurrentMember;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/v1/files")
public class FileController {
    private final JdbcTemplate jdbc;
    private final CurrentMember current;
    private final PrivateObjectStore store;
    private final long maxBytes;
    private final int maxPages;

    public FileController(JdbcTemplate jdbc, CurrentMember current, PrivateObjectStore store,
        @Value("${lab.upload.max-bytes:20971520}") long maxBytes, @Value("${lab.upload.max-pages:200}") int maxPages) {
        this.jdbc = jdbc; this.current = current; this.store = store; this.maxBytes = maxBytes; this.maxPages = maxPages;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public FileView upload(Authentication auth, @RequestPart("file") MultipartFile upload) {
        UUID owner = current.id(auth);
        if (upload == null || upload.isEmpty() || upload.getSize() > maxBytes) throw new ResponseStatusException(BAD_REQUEST, "文件为空或超过大小限制");
        byte[] content;
        try { content = upload.getBytes(); }
        catch (Exception ex) { throw new ResponseStatusException(BAD_REQUEST, "无法读取上传文件"); }
        if (content.length < 8 || content[0] != '%' || content[1] != 'P' || content[2] != 'D' || content[3] != 'F' || content[4] != '-') throw new ResponseStatusException(BAD_REQUEST, "仅接受有效 PDF 文件");
        int pages;
        try (PDDocument document = Loader.loadPDF(content)) {
            if (document.isEncrypted()) throw new ResponseStatusException(BAD_REQUEST, "不接受加密 PDF");
            pages = document.getNumberOfPages();
        } catch (ResponseStatusException ex) { throw ex; }
        catch (Exception ex) { throw new ResponseStatusException(BAD_REQUEST, "PDF 内容无法解析"); }
        if (pages < 1 || pages > maxPages) throw new ResponseStatusException(BAD_REQUEST, "PDF 页数超出允许范围");
        String originalName = safeName(upload.getOriginalFilename());
        UUID id = UUID.randomUUID(); String key = "private/" + id;
        String sha = sha256(content);
        jdbc.update("INSERT INTO file_object(id,owner_id,storage_key,original_name,mime_type,byte_size,page_count,sha256) VALUES (?,?,?,?,'application/pdf',?,?,?)",
            id, owner, key, originalName, content.length, pages, sha);
        store.put(key, content);
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id,after_summary) VALUES (?,'UPLOAD_PRIVATE_FILE','file',?,jsonb_build_object('bytes',?,'pages',?))", owner, id.toString(), content.length, pages);
        return new FileView(id, originalName, content.length, pages, sha);
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<byte[]> download(Authentication auth, @PathVariable UUID id, @RequestHeader(value=HttpHeaders.RANGE, required=false) String range) {
        UUID actor = current.id(auth);
        FileMetadata file = jdbc.query("SELECT storage_key,original_name,byte_size FROM file_object WHERE id=? AND owner_id=? AND deleted_at IS NULL",
            (rs,row)->new FileMetadata(rs.getString(1),rs.getString(2),rs.getLong(3)), id, actor).stream().findFirst().orElseThrow(FileController::hidden);
        byte[] content = store.get(file.key());
        if (content.length != file.size()) throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "私有文件内容校验失败");
        HttpHeaders headers = new HttpHeaders(); headers.setContentType(MediaType.APPLICATION_PDF); headers.setContentLength(content.length);
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + asciiName(file.name()) + "\""); headers.set("X-Content-Type-Options", "nosniff"); headers.setCacheControl("private, no-store");
        if (range == null) return ResponseEntity.ok().headers(headers).body(content);
        ByteRange parsed;
        try { parsed = parseRange(range, content.length); }
        catch (InvalidRangeException ex) { headers.set(HttpHeaders.CONTENT_RANGE, "bytes */" + content.length); return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).headers(headers).build(); }
        byte[] slice = java.util.Arrays.copyOfRange(content, (int)parsed.start(), (int)parsed.end() + 1);
        headers.setContentLength(slice.length); headers.set(HttpHeaders.CONTENT_RANGE, "bytes " + parsed.start() + "-" + parsed.end() + "/" + content.length); headers.set("Accept-Ranges", "bytes");
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT).headers(headers).body(slice);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(Authentication auth, @PathVariable UUID id) {
        UUID actor = current.id(auth);
        int changed = jdbc.update("UPDATE file_object SET deleted_at=now() WHERE id=? AND owner_id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM print_job WHERE file_id=file_object.id AND status NOT IN ('COMPLETED','FAILED','CANCELED'))", id, actor);
        if (changed == 0) throw new ResponseStatusException(NOT_FOUND, "文件不存在、无权删除或仍被打印任务使用");
        jdbc.update("INSERT INTO audit_event(actor_id,action,target_type,target_id) VALUES (?,'DELETE_PRIVATE_FILE','file',?)", actor, id.toString());
        return ResponseEntity.noContent().build();
    }

    private static String safeName(String value) {
        if (value == null || value.isBlank()) return "document.pdf";
        String basename = value.replace('\\','/'); basename = basename.substring(basename.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"]", "_").trim();
        if (basename.isBlank()) basename = "document.pdf";
        if (!basename.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) basename += ".pdf";
        return basename.length() > 160 ? basename.substring(0, 160) : basename;
    }
    private static String asciiName(String name) { return name.replaceAll("[^A-Za-z0-9._-]", "_").replace('"','_'); }
    private static String sha256(byte[] value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (Exception ex) { throw new IllegalStateException(ex); } }
    private static ResponseStatusException hidden() { return new ResponseStatusException(NOT_FOUND, "文件不存在或无权访问"); }
    private static ByteRange parseRange(String value, int length) {
        if (!value.startsWith("bytes=") || value.indexOf(',') >= 0) throw rangeError(length);
        String[] parts = value.substring(6).split("-", -1);
        try {
            long start, end;
            if (parts.length != 2) throw rangeError(length);
            if (parts[0].isEmpty()) { long suffix = Long.parseLong(parts[1]); if (suffix < 1) throw rangeError(length); start = Math.max(0, length - suffix); end = length - 1L; }
            else { start = Long.parseLong(parts[0]); end = parts[1].isEmpty() ? length - 1L : Long.parseLong(parts[1]); }
            if (start < 0 || start >= length || end < start) throw rangeError(length);
            return new ByteRange(start, Math.min(end, length - 1L));
        } catch (NumberFormatException ex) { throw rangeError(length); }
    }
    private static InvalidRangeException rangeError(int length) { return new InvalidRangeException(); }
    private static final class InvalidRangeException extends RuntimeException {}
    private record FileMetadata(String key, String name, long size) {}
    private record ByteRange(long start, long end) {}
    public record FileView(UUID id, String name, long byteSize, int pageCount, String sha256) {}
}
