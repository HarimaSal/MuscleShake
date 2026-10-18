package com.fitlog.workout;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/templates")
public class TemplateController {
    private final SessionService service;

    public TemplateController(SessionService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest request) {
        return Api.ok(Map.of("items", service.templates(Auth.current(request).id())));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String sessionId = String.valueOf(body.getOrDefault("sessionId", ""));
        String name = String.valueOf(body.getOrDefault("name", ""));
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.saveAsTemplate(Auth.current(request).id(), sessionId, name)));
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.template(Auth.current(request).id(), id));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<Map<String, Object>> start(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                                     HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        int tz = body != null && body.get("tzOffset") != null ? Integer.parseInt(String.valueOf(body.get("tzOffset"))) : user.tzOffset();
        return ResponseEntity.status(HttpStatus.CREATED).body(Api.ok(service.startFromTemplate(user.id(), id, tz, user.defaultSessionVisibility())));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id, HttpServletRequest request) {
        return Api.ok(service.deleteTemplate(Auth.current(request).id(), id));
    }
}
