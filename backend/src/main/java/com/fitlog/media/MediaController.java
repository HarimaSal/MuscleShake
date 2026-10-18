package com.fitlog.media;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.ApiException;
import com.fitlog.common.M;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final MediaService service;

    public MediaController(MediaService service) {
        this.service = service;
    }

    @PostMapping("/upload-sessions")
    public ResponseEntity<Map<String, Object>> createSession(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(Api.ok(service.createUpload(Auth.current(request), body)));
    }

    @PutMapping(value = "/upload/{id}/chunk", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public Map<String, Object> chunk(@PathVariable String id, @RequestParam int index,
                                     @RequestBody byte[] bytes, HttpServletRequest request) {
        service.chunk(Auth.current(request), id, index, bytes);
        return Api.ok(Map.of("received", true, "index", index));
    }

    @PostMapping("/upload/{id}/complete")
    public Map<String, Object> complete(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                        HttpServletRequest request) {
        return Api.ok(service.complete(Auth.current(request), id, body));
    }

    @DeleteMapping("/upload/{id}")
    public Map<String, Object> cancel(@PathVariable String id, HttpServletRequest request) {
        service.cancelUpload(Auth.current(request), id);
        return Api.ok(Map.of("cancelled", true));
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest request) {
        return Api.ok(service.list(Auth.current(request)));
    }

    @GetMapping("/usage")
    public Map<String, Object> usage(HttpServletRequest request) {
        return Api.ok(service.usage(Auth.current(request)));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id, HttpServletRequest request) {
        service.delete(Auth.current(request), id);
        return Api.ok(Map.of("deleted", true));
    }

    @PostMapping("/{id}/watermark-undo")
    public Map<String, Object> undoWatermark(@PathVariable String id, HttpServletRequest request) {
        service.watermarkUndo(Auth.current(request), id);
        return Api.ok(Map.of("watermark", false));
    }

    @GetMapping("/{id}/{variant}")
    public ResponseEntity<Resource> file(@PathVariable String id, @PathVariable String variant,
                                         @RequestParam(required = false) Long exp,
                                         @RequestParam(required = false) String sig) {
        Path path = service.verifyFile(id, variant, exp, sig);
        Map<String, Object> row = service.mediaRow(id);
        String mime = "thumb".equals(variant) ? "image/jpeg" : (String) row.get("mime");
        FileSystemResource resource = new FileSystemResource(path);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, mime == null ? "application/octet-stream" : mime)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(resource);
    }
}
