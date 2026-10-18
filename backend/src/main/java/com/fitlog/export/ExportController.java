package com.fitlog.export;

import com.fitlog.auth.Auth;
import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Path;
import java.util.Map;

@RestController
@RequestMapping("/api/exports")
public class ExportController {
    private final ExportService service;

    public ExportController(ExportService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(HttpServletRequest request) {
        return ResponseEntity.status(201).body(Api.ok(service.create(Auth.current(request).id())));
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest request) {
        return Api.ok(service.list(Auth.current(request).id()));
    }

    @GetMapping("/{id}/download/{name}")
    public ResponseEntity<Resource> download(@PathVariable String id, @PathVariable String name, HttpServletRequest request) {
        Path path = service.file(Auth.current(request).id(), id, name);
        String contentType = name.endsWith(".json") ? "application/json;charset=UTF-8" : "text/csv;charset=UTF-8";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .body(new FileSystemResource(path));
    }
}
