package com.fitlog.post;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.AuditService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Req;
import com.fitlog.common.Settings;
import com.fitlog.common.TimeUtil;
import com.fitlog.media.BudgetService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final PostService posts;
    private final BudgetService budget;
    private final Settings settings;
    private final Db db;
    private final AuditService audit;

    public AdminController(PostService posts, BudgetService budget, Settings settings, Db db, AuditService audit) {
        this.posts = posts;
        this.budget = budget;
        this.settings = settings;
        this.db = db;
        this.audit = audit;
    }

    @GetMapping("/queue")
    public Map<String, Object> queue(HttpServletRequest request) {
        Auth.admin(request);
        return Api.ok(posts.queue());
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> post(@PathVariable String id, HttpServletRequest request) {
        Auth.admin(request);
        return Api.ok(posts.adminPost(id));
    }

    @PostMapping("/posts/{id}/review")
    public Map<String, Object> review(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        return Api.ok(posts.review(admin.id(), id, body));
    }

    @PostMapping("/reports/{id}/handle")
    public Map<String, Object> report(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        posts.handleReport(admin.id(), id, body);
        return Api.ok(Map.of("handled", true));
    }

    @PostMapping("/appeals/{id}/resolve")
    public Map<String, Object> appeal(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        boolean approve = Boolean.TRUE.equals(body.get("approve"));
        String resolution = body.get("resolution") == null ? "" : String.valueOf(body.get("resolution"));
        if (resolution.isBlank()) throw com.fitlog.common.ApiException.badRequest("请填写复核结论");
        posts.resolveAppeal(admin.id(), id, approve, resolution);
        return Api.ok(Map.of("resolved", true, "approved", approve));
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) {
        Auth.admin(request);
        Map<String, Object> result = posts.dashboard();
        result.put("budget", budget.status());
        result.put("costSeries", budget.costSeries(14));
        return Api.ok(result);
    }

    @GetMapping("/rules")
    public Map<String, Object> rules(HttpServletRequest request) {
        Auth.admin(request);
        return Api.ok(Map.of("items", posts.rules()));
    }

    @PutMapping("/rules/{code}")
    public Map<String, Object> rule(@PathVariable String code, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        Auth.admin(request);
        return Api.ok(Map.of("items", posts.upsertRule(code, body)));
    }

    @GetMapping("/audit-logs")
    public Map<String, Object> logs(HttpServletRequest request) {
        Auth.admin(request);
        List<Map<String, Object>> items = db.all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100").stream()
                .map(row -> M.of().put("id", Db.str(row, "id")).put("actorId", Db.str(row, "actor_id"))
                        .put("action", Db.str(row, "action")).put("targetType", Db.str(row, "target_type"))
                        .put("targetId", Db.str(row, "target_id")).put("detail", Db.str(row, "detail"))
                        .put("createdAt", Db.str(row, "created_at")).map()).toList();
        return Api.ok(Map.of("items", items));
    }

    @GetMapping("/users")
    public Map<String, Object> users(@RequestParam(required = false) String q, HttpServletRequest request) {
        Auth.admin(request);
        List<Map<String, Object>> rows = q == null || q.isBlank()
                ? db.all("SELECT * FROM users ORDER BY created_at DESC LIMIT 100")
                : db.all("SELECT * FROM users WHERE nickname LIKE ? OR phone LIKE ? ORDER BY created_at DESC LIMIT 100", "%" + q + "%", "%" + q + "%");
        List<Map<String, Object>> items = rows.stream().map(row -> M.of()
                .put("id", Db.str(row, "id")).put("nickname", Db.str(row, "nickname")).put("phone", Db.str(row, "phone"))
                .put("role", Db.str(row, "role")).put("status", Db.str(row, "status")).put("bannedUntil", Db.str(row, "banned_until"))
                .put("sessions", db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL", Db.str(row, "id")))
                .put("posts", db.count("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND deleted_at IS NULL", Db.str(row, "id")))
                .map()).toList();
        return Api.ok(Map.of("items", items));
    }

    @PostMapping("/users/{id}/unban")
    public Map<String, Object> unban(@PathVariable String id, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        db.update("UPDATE users SET banned_until = NULL WHERE id = ?", id);
        audit.audit(admin.id(), "user_unban", "user", id);
        return Api.ok(Map.of("unbanned", true));
    }

    @PutMapping("/quota")
    public Map<String, Object> quota(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        Integer quota = Req.integer(body.get("publicDailyQuota"), "每日公开名额", 0, 1000, true);
        String assignee = body.get("assignee") == null ? "" : String.valueOf(body.get("assignee"));
        settings.set("public_daily_quota", String.valueOf(quota));
        settings.set("review_assignee", assignee);
        audit.audit(admin.id(), "quota_update", "setting", "public_daily_quota", Map.of("quota", quota, "assignee", assignee));
        return Api.ok(M.of().put("publicDailyQuota", quota).put("assignee", assignee).map());
    }

    @PutMapping("/budget")
    public Map<String, Object> budgetCap(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        double cap = Req.number(body.get("capCny"), "预算上限", 1.0, 100000.0, true);
        settings.set("budget_cap_cny", String.valueOf(cap));
        audit.audit(admin.id(), "budget_update", "setting", "budget_cap_cny", Map.of("cap", cap));
        return Api.ok(budget.status());
    }

    @PutMapping("/features")
    public Map<String, Object> features(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser admin = Auth.admin(request);
        if (body.get("communityVisible") != null) {
            boolean visible = Boolean.TRUE.equals(body.get("communityVisible"));
            settings.set("community_visible", visible ? "1" : "0");
            audit.audit(admin.id(), "feature_update", "setting", "community_visible", Map.of("value", visible));
        }
        return Api.ok(Map.of("communityVisible", settings.bool("community_visible", true)));
    }

    @PostMapping("/maintenance/expire-deletions")
    public Map<String, Object> expireDeletions(HttpServletRequest request) {
        Auth.admin(request);
        int count = db.update("DELETE FROM users WHERE status = 'pending_deletion' AND delete_requested_at < ?", TimeUtil.ISO_MS.format(java.time.Instant.now().minusSeconds(30L * 86400)));
        return Api.ok(Map.of("purged", count));
    }
}
