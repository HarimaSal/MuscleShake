package com.fitlog.ops;

import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ops/configs")
public class OpsConfigController {
    private final OpsConfigService service;

    public OpsConfigController(OpsConfigService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.list());
    }

    @GetMapping("/{key}")
    public Map<String, Object> detail(@PathVariable String key, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.detail(key));
    }

    @PutMapping("/{key}")
    public Map<String, Object> update(@PathVariable String key, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.update(String.valueOf(admin.get("id")), key, body));
    }

    @PostMapping("/{key}/rollback")
    public Map<String, Object> rollback(@PathVariable String key, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.rollback(String.valueOf(admin.get("id")), key, body));
    }

    @PutMapping("/features/save")
    public Map<String, Object> features(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.features(String.valueOf(admin.get("id")), body));
    }
}
