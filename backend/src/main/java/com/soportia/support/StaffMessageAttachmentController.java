package com.soportia.support;

import com.soportia.config.SecurityConfig.UserPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff-messages/{messageId}/attachments")
@PreAuthorize("hasAnyRole('EMPLOYEE','SUPPORT_AGENT','ADMIN')")
public class StaffMessageAttachmentController {
    private static final long MAX_BYTES = 10 * 1024 * 1024;
    private static final Set<String> TYPES = Set.of(
            "image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain",
            "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final JdbcClient db;
    private final StaffMessageController messages;
    private final Path root;

    public StaffMessageAttachmentController(JdbcClient db, StaffMessageController messages,
                                            @Value("${soportia.attachments.dir:./data/attachments}") String dir) {
        this.db = db;
        this.messages = messages;
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @PreAuthorize("hasAnyRole('SUPPORT_AGENT','ADMIN')")
    public Map<String,Object> upload(@PathVariable UUID messageId, @RequestParam("file") MultipartFile file,
                                     @AuthenticationPrincipal UserPrincipal p) throws IOException {
        messages.authorizeMessage(messageId, p);
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty file");
        if (file.getSize() > MAX_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds 10 MB");
        String contentType = normalizeType(file);
        if (!TYPES.contains(contentType)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File type not allowed");
        Files.createDirectories(root);
        UUID id = UUID.randomUUID();
        String stored = id + extension(file.getOriginalFilename(), contentType);
        Path target = root.resolve(stored).normalize();
        if (!target.startsWith(root.toAbsolutePath().normalize())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid path");
        file.transferTo(target);
        String original = safeName(file.getOriginalFilename());
        db.sql("""
                insert into staff_message_attachments(id,message_id,uploaded_by,stored_name,original_name,content_type,size_bytes)
                values(:id,:mid,:uid,:stored,:original,:type,:size)
                """).param("id", id).param("mid", messageId).param("uid", p.id())
                .param("stored", stored).param("original", original)
                .param("type", contentType).param("size", file.getSize()).update();
        Map<String,Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("fileName", original);
        row.put("contentType", contentType);
        row.put("sizeBytes", file.getSize());
        return row;
    }

    @GetMapping("/{attachmentId}")
    public ResponseEntity<Resource> download(@PathVariable UUID messageId, @PathVariable UUID attachmentId,
                                             @AuthenticationPrincipal UserPrincipal p) {
        messages.authorizeMessage(messageId, p);
        Map<String,Object> row = db.sql("""
                select stored_name, original_name, content_type
                from staff_message_attachments where id=:id and message_id=:mid
                """).param("id", attachmentId).param("mid", messageId).query().listOfRows().stream()
                .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        Path file = root.resolve(String.valueOf(row.get("stored_name"))).normalize();
        if (!file.startsWith(root.toAbsolutePath().normalize()) || !Files.exists(file)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(String.valueOf(row.get("original_name"))).build().toString())
                .contentType(MediaType.parseMediaType(String.valueOf(row.get("content_type"))))
                .body(new FileSystemResource(file));
    }

    private static String normalizeType(MultipartFile file) {
        String type = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        if (TYPES.contains(type)) return type;
        String name = String.valueOf(file.getOriginalFilename()).toLowerCase(Locale.ROOT);
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".doc")) return "application/msword";
        if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (name.endsWith(".xls")) return "application/vnd.ms-excel";
        if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return type;
    }

    private static String extension(String name, String type) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot > 0 && dot < lower.length() - 1) return lower.substring(dot);
        return switch (type) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "application/pdf" -> ".pdf";
            default -> "";
        };
    }

    private static String safeName(String name) {
        String base = name == null || name.isBlank() ? "archivo" : Path.of(name).getFileName().toString();
        base = base.replaceAll("[\\r\\n\\\\/]", "_");
        return base.length() > 200 ? base.substring(0, 200) : base;
    }
}
