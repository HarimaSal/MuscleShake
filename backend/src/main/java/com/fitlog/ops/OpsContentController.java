package com.fitlog.ops;

import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ops/official")
public class OpsContentController {
    private final OpsContentService service;

    public OpsContentController(OpsContentService service) {
        this.service = service;
    }

    @GetMapping("/contents")
    public Map<String, Object> contents(@RequestParam(required = false) String type,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "30") int pageSize,
                                        HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.list(type, status, page, pageSize));
    }

    @PostMapping("/contents")
    public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.create(String.valueOf(admin.get("id")), body));
    }

    @GetMapping("/contents/{id}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.detail(id));
    }

    @PatchMapping("/contents/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.update(String.valueOf(admin.get("id")), id, body));
    }

    @PostMapping("/contents/{id}/publish")
    public Map<String, Object> publish(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.publish(String.valueOf(admin.get("id")), id, body));
    }

    @PostMapping("/contents/{id}/offline")
    public Map<String, Object> offline(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        String reason = body == null || body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        return Api.ok(service.offline(String.valueOf(admin.get("id")), id, reason));
    }

    @GetMapping("/spotcheck")
    public Map<String, Object> spotcheckQueue(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.spotcheckQueue());
    }

    @PostMapping("/spotcheck/{id}")
    public Map<String, Object> spotcheck(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.spotcheck(String.valueOf(admin.get("id")), id,
                String.valueOf(body.get("result")), body.get("note") == null ? "" : String.valueOf(body.get("note"))));
    }

    @GetMapping("/templates")
    public Map<String, Object> templates(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.templates());
    }

    @PostMapping("/templates")
    public Map<String, Object> createTemplate(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.saveTemplate(String.valueOf(admin.get("id")), null, body));
    }

    @PutMapping("/templates/{id}")
    public Map<String, Object> saveTemplate(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.saveTemplate(String.valueOf(admin.get("id")), id, body));
    }
}
