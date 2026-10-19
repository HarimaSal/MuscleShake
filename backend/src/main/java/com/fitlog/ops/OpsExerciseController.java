package com.fitlog.ops;

import com.fitlog.common.Api;
import com.fitlog.common.M;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ops/exercises")
public class OpsExerciseController {
    private final OpsExerciseService service;

    public OpsExerciseController(OpsExerciseService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam(required = false) String q,
                                    @RequestParam(required = false) String muscle,
                                    @RequestParam(required = false) String equipment,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String source,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "50") int pageSize,
                                    HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator", "reviewer", "viewer");
        return Api.ok(service.list(q, muscle, equipment, type, source, page, pageSize));
    }

    @GetMapping("/meta")
    public Map<String, Object> meta(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.meta());
    }

    @GetMapping("/search-quality")
    public Map<String, Object> searchQuality(@RequestParam(defaultValue = "7") int days, HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator", "reviewer", "viewer");
        return Api.ok(service.searchQuality(days));
    }

    @GetMapping("/recommendations")
    public Map<String, Object> recommendations(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.recommendations());
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable String id, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.detail(id));
    }

    @GetMapping("/{id}/versions")
    public Map<String, Object> versions(@PathVariable String id, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(M.of().put("items", service.versions(id)).map());
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.create(String.valueOf(admin.get("id")), body));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.update(String.valueOf(admin.get("id")), id, body));
    }

    @PostMapping("/{id}/rollback/{version}")
    public Map<String, Object> rollback(@PathVariable String id, @PathVariable int version,
                                        @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        String reason = body == null || body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        return Api.ok(service.rollback(String.valueOf(admin.get("id")), id, version, reason));
    }

    @PostMapping("/{id}/archive")
    public Map<String, Object> archive(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        boolean restore = body != null && Boolean.TRUE.equals(body.get("restore"));
        String reason = body == null || body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        return Api.ok(service.archive(String.valueOf(admin.get("id")), id, restore, reason));
    }

    @PostMapping("/merge")
    public Map<String, Object> merge(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.merge(String.valueOf(admin.get("id")),
                String.valueOf(body.get("fromId")), String.valueOf(body.get("toId")),
                body.get("confirmName") == null ? "" : String.valueOf(body.get("confirmName")),
                body.get("reason") == null ? "" : String.valueOf(body.get("reason"))));
    }

    @PostMapping("/import/preview")
    public Map<String, Object> preview(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.previewImport(String.valueOf(admin.get("id")), String.valueOf(body.getOrDefault("csv", ""))));
    }

    @PostMapping("/import/confirm")
    public Map<String, Object> confirm(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.confirmImport(String.valueOf(admin.get("id")), String.valueOf(body.get("batchId"))));
    }

    @PostMapping("/{id}/promote")
    public Map<String, Object> promote(@PathVariable String id, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.promote(String.valueOf(admin.get("id")), id));
    }

    @GetMapping("/{id}/impact")
    public Map<String, Object> impact(@PathVariable String id, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.impact(id));
    }
}
