package com.fitlog.ops;

import com.fitlog.common.Api;
import com.fitlog.common.M;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ops")
public class OpsPlatformController {
    private final OpsPlatformService service;

    public OpsPlatformController(OpsPlatformService service) {
        this.service = service;
    }

    @GetMapping("/workbench")
    public Map<String, Object> workbench(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.workbench());
    }

    @GetMapping("/analytics")
    public Map<String, Object> analytics(@RequestParam(defaultValue = "7") int days, HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.analytics(days));
    }

    @GetMapping("/users")
    public Map<String, Object> users(@RequestParam(required = false) String q, HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.users(q));
    }

    @PostMapping("/users/{id}/punish")
    public Map<String, Object> punish(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.punishment(String.valueOf(admin.get("id")), id, body));
    }

    @PostMapping("/users/{id}/unban")
    public Map<String, Object> unban(@PathVariable String id, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.unban(String.valueOf(admin.get("id")), id));
    }

    @GetMapping("/users/deletion-queue")
    public Map<String, Object> deletionQueue(HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.deletionQueue());
    }

    @PostMapping("/users/{id}/purge")
    public Map<String, Object> purge(@PathVariable String id, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.purge(String.valueOf(admin.get("id")), id));
    }

    @GetMapping("/audit")
    public Map<String, Object> audit(@RequestParam(required = false) String actor,
                                     @RequestParam(required = false) String action,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "30") int pageSize,
                                     HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.auditLogs(actor, action, from, to, page, pageSize));
    }

    @GetMapping("/daily-summary")
    public Map<String, Object> dailySummary(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.dailyDigest());
    }

    @GetMapping("/review/queue")
    public Map<String, Object> reviewQueue(HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.reviewQueue());
    }

    @GetMapping("/review/posts/{id}")
    public Map<String, Object> postDetail(@PathVariable String id, HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.postDetail(id));
    }

    @PostMapping("/review/posts/{id}")
    public Map<String, Object> review(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator", "reviewer");
        return Api.ok(service.review(String.valueOf(admin.get("id")), id, body));
    }

    @PostMapping("/review/reports/{id}")
    public Map<String, Object> report(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator", "reviewer");
        service.handleReport(String.valueOf(admin.get("id")), id, body);
        return Api.ok(M.of().put("handled", true).map());
    }

    @PostMapping("/review/appeals/{id}")
    public Map<String, Object> appeal(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        boolean approve = Boolean.TRUE.equals(body.get("approve"));
        String resolution = body.get("resolution") == null ? "" : String.valueOf(body.get("resolution"));
        if (resolution.isBlank()) throw com.fitlog.common.ApiException.badRequest("请填写复核结论");
        service.resolveAppeal(String.valueOf(admin.get("id")), id, approve, resolution);
        return Api.ok(M.of().put("resolved", true).put("approved", approve).map());
    }

    @GetMapping("/review/rules")
    public Map<String, Object> rules(HttpServletRequest request) {
        OpsAuth.require(request);
        return Api.ok(service.rules());
    }

    @PutMapping("/review/rules/{code}")
    public Map<String, Object> rule(@PathVariable String code, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.upsertRule(code, body));
    }

    @GetMapping("/system/accounts")
    public Map<String, Object> accounts(HttpServletRequest request) {
        OpsAuth.require(request, "super_admin");
        return Api.ok(service.systemAccounts());
    }

    @PostMapping("/system/accounts")
    public Map<String, Object> createAccount(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.createAccount(String.valueOf(admin.get("id")), body));
    }

    @PostMapping("/system/accounts/{id}/disable")
    public Map<String, Object> disableAccount(@PathVariable String id, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.disableAccount(String.valueOf(admin.get("id")), id));
    }

    @PostMapping("/system/accounts/{id}/reset")
    public Map<String, Object> resetAccount(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.resetAccount(String.valueOf(admin.get("id")), id, body));
    }

    @GetMapping("/system/recovery")
    public Map<String, Object> recovery(HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.recovery(String.valueOf(admin.get("id"))));
    }

    @PostMapping("/system/recovery/rotate")
    public Map<String, Object> rotateRecovery(HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin");
        return Api.ok(service.rotateRecovery(String.valueOf(admin.get("id"))));
    }

    @GetMapping("/system/permission-review")
    public Map<String, Object> permissionReview(HttpServletRequest request) {
        OpsAuth.require(request, "super_admin");
        return Api.ok(service.systemAccounts());
    }

    @GetMapping("/test-account")
    public Map<String, Object> testAccount(HttpServletRequest request) {
        OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.testAccount());
    }

    @PostMapping("/test-account/create")
    public Map<String, Object> createTestAccount(HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.createTestAccount(String.valueOf(admin.get("id"))));
    }

    @PostMapping("/test-account/toggle")
    public Map<String, Object> toggleTestAccount(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.toggleTestAccount(String.valueOf(admin.get("id")), Boolean.TRUE.equals(body.get("enabled"))));
    }

    @PostMapping("/test-account/{id}/reset")
    public Map<String, Object> resetTestAccount(@PathVariable String id, HttpServletRequest request) {
        Map<String, Object> admin = OpsAuth.require(request, "super_admin", "operator");
        return Api.ok(service.resetTestAccount(String.valueOf(admin.get("id")), id));
    }
}
