package com.fitlog.ops;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.TimeUtil;
import com.fitlog.media.BudgetService;
import com.fitlog.post.PostService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OpsPlatformService {
    private final Db db;
    private final ObjectMapper json;
    private final BudgetService budget;
    private final PostService posts;
    private final OpsAuditService audit;

    public OpsPlatformService(Db db, ObjectMapper json, BudgetService budget, PostService posts, OpsAuditService audit) {
        this.db = db;
        this.json = json;
        this.budget = budget;
        this.posts = posts;
        this.audit = audit;
    }

    public Map<String, Object> workbench() {
        String today = TimeUtil.todayForString(-480);
        long pending = db.count("SELECT COUNT(*) AS n FROM posts WHERE status='pending' AND deleted_at IS NULL");
        long reports = db.count("SELECT COUNT(*) AS n FROM reports WHERE status='open'");
        long appeals = db.count("SELECT COUNT(*) AS n FROM appeals WHERE status='open'");
        long officialPending = db.count("SELECT COUNT(*) AS n FROM official_contents WHERE status IN ('draft','pending','scheduled')");
        long spotcheck = db.count("SELECT COUNT(*) AS n FROM official_contents WHERE single_review=1 AND status='published'");
        long quotaUsed = db.count("SELECT COUNT(DISTINCT post_id) AS n FROM review_logs WHERE action='submit' AND created_at >= ?", today + "T00:00:00.000Z");
        long highRiskConfig = db.count("SELECT COUNT(*) AS n FROM config_change_logs WHERE risk_level='high' AND created_at >= ?", today);
        Map<String, Object> quota = M.of().put("used", quotaUsed)
                .put("limit", db.one("SELECT value FROM app_settings WHERE setting_key='public_daily_quota'") == null ? 20
                        : Db.lng(db.one("SELECT value FROM app_settings WHERE setting_key='public_daily_quota'"), "value")).map();
        List<Map<String, Object>> recent = db.all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8").stream().map(audit::dto).toList();
        List<Map<String, Object>> alerts = new ArrayList<>();
        if (pending > 50) alerts.add(M.of().put("level", "danger").put("title", "审核队列积压").put("detail", pending + " 条待审核，超过 50 条告警线").map());
        if (officialPending > 0) alerts.add(M.of().put("level", "warn").put("title", "官方内容待处理").put("detail", officialPending + " 条草稿或排期内容等待发布").map());
        if (spotcheck > 0) alerts.add(M.of().put("level", "warn").put("title", "抽查队列待处理").put("detail", spotcheck + " 条单人复核内容等待抽查").map());
        return M.of().put("pending", pending).put("reports", reports).put("appeals", appeals)
                .put("officialPending", officialPending).put("spotcheck", spotcheck)
                .put("quota", quota).put("highRiskConfig", highRiskConfig)
                .put("recentAudit", recent).put("alerts", alerts)
                .put("digest", dailyDigest()).map();
    }

    public Map<String, Object> analytics(int days) {
        int span = Math.min(90, Math.max(1, days));
        String from = TimeUtil.addDays(TimeUtil.todayForString(-480), -(span - 1));
        Map<String, Object> userCost = budget.status();
        Map<String, Object> official = officialCost();
        long users = db.count("SELECT COUNT(*) AS n FROM users WHERE role='user'");
        long sessions = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE deleted_at IS NULL AND local_date >= ?", from);
        long checkins = db.count("SELECT COUNT(*) AS n FROM checkins WHERE status='active' AND local_date >= ?", from);
        long contentCount = db.count("SELECT COUNT(*) AS n FROM posts WHERE deleted_at IS NULL AND author_type='user' AND created_at >= ?", from);
        long loginUsers = db.count("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE name='login_success' AND created_at >= ?", from);
        if (loginUsers == 0) loginUsers = db.count("SELECT COUNT(*) AS n FROM users WHERE role='user'");
        List<Map<String, Object>> funnel = List.of(
                M.of().put("step", "启动").put("value", users).put("note", "注册用户").map(),
                M.of().put("step", "登录").put("value", loginUsers).put("note", "登录用户（按活跃账号）").map(),
                M.of().put("step", "开始训练").put("value", sessions).put("note", "训练记录数").map(),
                M.of().put("step", "保存").put("value", sessions).put("note", "已保存训练").map(),
                M.of().put("step", "打卡").put("value", checkins).put("note", "有效打卡").map(),
                M.of().put("step", "次日回访")
                        .put("value", db.count("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE name='app_open' AND created_at >= ?", from))
                        .put("note", "启动埋点去重").map()
        );
        long builtin = db.count("SELECT COUNT(*) AS n FROM exercises WHERE is_builtin=1 AND archived=0");
        long covered = db.count("SELECT COUNT(DISTINCT exercise_id) AS n FROM workout_items");
        long searchTotal = db.count("SELECT COUNT(*) AS n FROM events WHERE name='exercise_search' AND created_at >= ?", from);
        long searchEmpty = db.count("SELECT COUNT(*) AS n FROM events WHERE name='exercise_search' AND created_at >= ? AND CAST(JSON_UNQUOTE(JSON_EXTRACT(props,'$.result_count')) AS UNSIGNED)=0", from);
        List<Map<String, Object>> topContent = db.all("""
                SELECT p.id,p.title,(SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id) AS views
                FROM posts p WHERE p.author_type='official' AND p.deleted_at IS NULL ORDER BY views DESC LIMIT 5
                """).stream().map(r -> M.of().put("id", Db.str(r, "id")).put("title", Db.str(r, "title")).put("views", Db.lng(r, "views")).map()).toList();
        return M.of().put("from", from).put("days", span)
                .put("funnel", funnel)
                .put("content", M.of().put("total", contentCount).put("official", db.count("SELECT COUNT(*) AS n FROM posts WHERE author_type='official' AND deleted_at IS NULL"))
                        .put("views", db.count("SELECT COUNT(*) AS n FROM post_views")).put("top", topContent))
                .put("exercise", M.of().put("coverage", builtin == 0 ? 0 : Metrics.round(covered * 100.0 / builtin, 1))
                        .put("builtin", builtin).put("covered", covered)
                        .put("noResultRate", searchTotal == 0 ? 0 : Metrics.round(searchEmpty * 100.0 / searchTotal, 1))
                        .put("noResultTerms", db.all("""
                                SELECT JSON_UNQUOTE(JSON_EXTRACT(props,'$.keyword')) AS keyword, COUNT(*) AS n
                                FROM events WHERE name='exercise_search' AND created_at >= ? AND CAST(JSON_UNQUOTE(JSON_EXTRACT(props,'$.result_count')) AS UNSIGNED)=0
                                GROUP BY keyword ORDER BY n DESC LIMIT 10
                                """, from).stream().map(r -> M.of().put("keyword", Db.str(r, "keyword")).put("count", Db.lng(r, "n")).map()).toList()))
                .put("cost", M.of().put("user", userCost).put("official", official))
                .put("posts", contentCount)
                .map();
    }

    public Map<String, Object> officialCost() {
        Map<String, Object> row = db.one("""
                SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM media_assets
                WHERE deleted_at IS NULL AND user_id='ops-official'
                """);
        double storageGb = Db.dbl(row, "bytes", 0) / Math.pow(1024, 3);
        long views = db.count("SELECT COUNT(*) AS n FROM post_views v JOIN posts p ON p.id=v.post_id WHERE p.author_type='official'");
        double trafficGb = views * 14.0 / 1024;
        double cost = storageGb * 0.12 + trafficGb * 0.20;
        double cap = 10;
        return M.of().put("storageGb", Metrics.round(storageGb, 3))
                .put("trafficGb", Metrics.round(trafficGb, 3))
                .put("costCny", Metrics.round(cost, 2))
                .put("capCny", cap)
                .put("ratio", Metrics.round(cost * 100 / cap, 1))
                .put("capacityGb", 100)
                .put("trafficAlertGb", 40)
                .put("note", "100GB 为容量上限，不是可用额度；超过 80% 需降级").map();
    }

    public Map<String, Object> users(String q) {
        String query = q == null ? "" : q.trim();
        List<Map<String, Object>> rows;
        if (query.isBlank()) {
            rows = db.all("SELECT * FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 100");
        } else if (query.matches("\\d{4}")) {
            rows = db.all("SELECT * FROM users WHERE phone LIKE ? ORDER BY created_at DESC LIMIT 100", "%" + query);
        } else {
            rows = db.all("SELECT * FROM users WHERE id LIKE ? OR nickname LIKE ? OR phone LIKE ? ORDER BY created_at DESC LIMIT 100",
                    "%" + query + "%", "%" + query + "%", "%" + query + "%");
        }
        List<Map<String, Object>> items = rows.stream().map(row -> M.of()
                .put("id", Db.str(row, "id")).put("nickname", Db.str(row, "nickname"))
                .put("phoneMasked", maskPhone(Db.str(row, "phone"))).put("role", Db.str(row, "role"))
                .put("status", Db.str(row, "status")).put("isTest", Db.bool(row, "is_test"))
                .put("bannedUntil", Db.str(row, "banned_until")).put("createdAt", Db.str(row, "created_at"))
                .put("deleteRequestedAt", Db.str(row, "delete_requested_at"))
                .put("sessions", db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id=? AND deleted_at IS NULL", Db.str(row, "id")))
                .put("posts", db.count("SELECT COUNT(*) AS n FROM posts WHERE user_id=? AND deleted_at IS NULL", Db.str(row, "id")))
                .map()).toList();
        return M.of().put("items", items).put("total", items.size()).map();
    }

    public Map<String, Object> punishment(String adminId, String userId, Map<String, Object> body) {
        Map<String, Object> user = db.one("SELECT * FROM users WHERE id = ?", userId);
        if (user == null) throw ApiException.notFound("用户不存在");
        String type = String.valueOf(body.getOrDefault("type", "ban_post_7"));
        String reason = body.get("reason") == null ? "" : String.valueOf(body.get("reason"));
        String rule = body.get("ruleCode") == null ? "" : String.valueOf(body.get("ruleCode"));
        if (reason.length() < 4) throw ApiException.badRequest("请填写处置理由");
        if (rule.isBlank()) throw ApiException.badRequest("请选择规则编号");
        String until = null;
        if ("ban_post_7".equals(type) || "ban_post_30".equals(type)) {
            until = TimeUtil.ISO_MS.format(Instant.now().plus("ban_post_7".equals(type) ? 7 : 30, ChronoUnit.DAYS));
            db.update("UPDATE users SET banned_until=? WHERE id=?", until, userId);
        } else if ("ban_account_permanent".equals(type)) {
            db.update("UPDATE users SET status='banned', banned_until=? WHERE id=?", TimeUtil.ISO_MS.format(Instant.now().plus(3650, ChronoUnit.DAYS)), userId);
        }
        db.update("""
                INSERT INTO notifications(id,user_id,kind,title,body,dedupe_key,created_at)
                VALUES(?,?, 'review','账号处置通知',?,?,?)
                """, UUID.randomUUID().toString(), userId,
                "处置类型：" + type + "；原因：" + reason + "；可在前台提交申诉。", "ops-punish:" + UUID.randomUUID(), TimeUtil.now());
        audit.log(adminId, "adm_user_punish", "user", userId, user, Map.of("type", type, "rule", rule), reason);
        return M.of().put("ok", true).put("bannedUntil", until).map();
    }

    public Map<String, Object> unban(String adminId, String userId) {
        Map<String, Object> user = db.one("SELECT * FROM users WHERE id = ?", userId);
        if (user == null) throw ApiException.notFound("用户不存在");
        db.update("UPDATE users SET banned_until=NULL, status='active' WHERE id=?", userId);
        audit.log(adminId, "adm_user_unban", "user", userId, user, null, "解除处置");
        return M.of().put("ok", true).map();
    }

    public Map<String, Object> deletionQueue() {
        List<Map<String, Object>> items = db.all("SELECT * FROM users WHERE status='pending_deletion' ORDER BY delete_requested_at ASC")
                .stream().map(row -> M.of().put("id", Db.str(row, "id")).put("nickname", Db.str(row, "nickname"))
                        .put("phoneMasked", maskPhone(Db.str(row, "phone"))).put("deleteRequestedAt", Db.str(row, "delete_requested_at"))
                        .put("purgeAt", purgeAt(Db.str(row, "delete_requested_at"))).map()).toList();
        return M.of().put("items", items).put("total", items.size()).map();
    }

    public Map<String, Object> purge(String adminId, String userId) {
        Map<String, Object> user = db.one("SELECT * FROM users WHERE id = ?", userId);
        if (user == null) throw ApiException.notFound("用户不存在");
        if (!"pending_deletion".equals(Db.str(user, "status"))) throw ApiException.badRequest("该用户不在注销冷静期");
        if (Db.str(user, "delete_requested_at") != null) {
            try {
                if (Instant.parse(Db.str(user, "delete_requested_at")).plus(30, ChronoUnit.DAYS).isAfter(Instant.now())) {
                    throw ApiException.badRequest("注销冷静期未满，不可提前删除");
                }
            } catch (ApiException e) { throw e; } catch (Exception ignored) {}
        }
        db.update("DELETE FROM users WHERE id=?", userId);
        audit.log(adminId, "adm_user_purge", "user", userId, user, null, "注销冷静期到期，彻底删除");
        return M.of().put("purged", true).map();
    }

    public Map<String, Object> auditLogs(String actor, String action, String from, String to, int page, int pageSize) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (actor != null && !actor.isBlank()) { where.append(" AND actor_id=?"); args.add(actor); }
        if (action != null && !action.isBlank()) { where.append(" AND action LIKE ?"); args.add("%" + action + "%"); }
        if (from != null && !from.isBlank()) { where.append(" AND created_at >= ?"); args.add(from); }
        if (to != null && !to.isBlank()) { where.append(" AND created_at <= ?"); args.add(to); }
        long total = db.count("SELECT COUNT(*) AS n FROM audit_logs" + where, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(Math.min(200, Math.max(10, pageSize)));
        pageArgs.add(Math.max(0, (page - 1) * Math.min(200, Math.max(10, pageSize))));
        List<Map<String, Object>> items = db.all("SELECT * FROM audit_logs" + where + " ORDER BY created_at DESC LIMIT ? OFFSET ?", pageArgs.toArray())
                .stream().map(audit::dto).toList();
        return M.of().put("items", items).put("total", total).put("page", page).put("pageSize", pageSize).map();
    }

    public Map<String, Object> postDetail(String id) {
        return posts.adminPost(id);
    }

    public Map<String, Object> reviewQueue() {
        List<Map<String, Object>> items = db.all("""
                SELECT p.*, u.nickname AS author FROM posts p JOIN users u ON u.id=p.user_id
                WHERE p.deleted_at IS NULL AND p.status IN ('pending','published')
                  AND (p.review_status IN ('pending','quota_deferred') OR p.status='pending')
                ORDER BY p.created_at ASC LIMIT 100
                """).stream().map(row -> {
                    long waited = minutesSince(Db.str(row, "created_at"));
                    long sla = 24 * 60;
                    return M.of().put("id", Db.str(row, "id")).put("title", Db.str(row, "title"))
                            .put("author", Db.str(row, "author")).put("createdAt", Db.str(row, "created_at"))
                            .put("status", Db.str(row, "status")).put("reviewStatus", Db.str(row, "review_status"))
                            .put("waitedMinutes", waited).put("remainingMinutes", Math.max(0, sla - waited))
                            .put("overdue", waited > sla).put("highRisk", false).map();
                }).toList();
        items = items.stream().sorted((a, b) -> Boolean.compare(Boolean.TRUE.equals(b.get("overdue")), Boolean.TRUE.equals(a.get("overdue")))).toList();
        return M.of().put("items", items).put("total", items.size())
                .put("reports", posts.queue().get("reports")).put("appeals", posts.queue().get("appeals")).map();
    }

    public Map<String, Object> rules() {
        return M.of().put("items", posts.rules()).map();
    }

    public Map<String, Object> upsertRule(String code, Map<String, Object> body) {
        return M.of().put("items", posts.upsertRule(code, body)).map();
    }

    public Map<String, Object> review(String adminId, String postId, Map<String, Object> body) {
        if (body.get("ruleCodes") == null) body.put("ruleCodes", List.of());
        return posts.review(adminId, postId, body);
    }

    public void handleReport(String adminId, String id, Map<String, Object> body) {
        posts.handleReport(adminId, id, body);
    }

    public void resolveAppeal(String adminId, String id, boolean approve, String resolution) {
        posts.resolveAppeal(adminId, id, approve, resolution);
    }

    public Map<String, Object> systemAccounts() {
        List<Map<String, Object>> items = db.all("SELECT id,username,role,status,last_login_at,created_at FROM admin_accounts ORDER BY created_at")
                .stream().map(row -> M.of().put("id", Db.str(row, "id")).put("username", Db.str(row, "username"))
                        .put("role", Db.str(row, "role")).put("status", Db.str(row, "status"))
                        .put("lastLoginAt", Db.str(row, "last_login_at")).put("createdAt", Db.str(row, "created_at"))
                        .put("daysSinceLogin", daysSince(Db.str(row, "last_login_at"))).map()).toList();
        long stale = items.stream().filter(item -> ((Number) item.get("daysSinceLogin")).longValue() >= 90).count();
        return M.of().put("items", items).put("stale", stale).put("reviewDue", stale > 0).map();
    }

    public Map<String, Object> createAccount(String adminId, Map<String, Object> body) {
        String username = String.valueOf(body.getOrDefault("username", "")).trim();
        String password = String.valueOf(body.getOrDefault("password", ""));
        String role = String.valueOf(body.getOrDefault("role", "operator"));
        if (username.length() < 3) throw ApiException.badRequest("账号至少 3 个字符");
        if (password.length() < 12) throw ApiException.badRequest("密码至少 12 位");
        if (!List.of("super_admin", "operator", "reviewer", "viewer").contains(role)) throw ApiException.badRequest("角色不正确");
        if (db.one("SELECT id FROM admin_accounts WHERE username=?", username) != null) throw ApiException.conflict("账号已存在");
        String salt = OpsCrypto.newSalt();
        String id = UUID.randomUUID().toString();
        String totpSecret = OpsCrypto.randomTotpSecret();
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 10; i++) codes.add(OpsCrypto.randomCode(10));
        db.update("INSERT INTO admin_accounts(id,username,password_hash,password_salt,totp_secret,role,status,recovery_codes,created_at) VALUES(?,?,?,?,?,?,'active',?,?)",
                id, username, OpsCrypto.passwordHash(password, salt), salt, totpSecret, role, toJson(codes), TimeUtil.now());
        audit.log(adminId, "adm_account_create", "admin", id, null, Map.of("username", username, "role", role), "创建后台账号");
        return M.of().put("id", id).put("totpSecret", totpSecret).put("recoveryCodes", codes).map();
    }

    public Map<String, Object> disableAccount(String adminId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM admin_accounts WHERE id=?", id);
        if (row == null) throw ApiException.notFound("账号不存在");
        if ("super_admin".equals(Db.str(row, "role"))) {
            long activeSupers = db.count("SELECT COUNT(*) AS n FROM admin_accounts WHERE role='super_admin' AND status='active' AND id != ?", id);
            if (activeSupers == 0) throw ApiException.badRequest("至少保留 1 个启用的超级管理员");
        }
        db.update("UPDATE admin_accounts SET status='disabled' WHERE id=?", id);
        db.update("UPDATE admin_sessions SET revoked_at=? WHERE admin_id=? AND revoked_at IS NULL", TimeUtil.now(), id);
        audit.log(adminId, "adm_account_disable", "admin", id, row, null, "停用后台账号");
        return M.of().put("ok", true).map();
    }

    public Map<String, Object> resetAccount(String adminId, String id, Map<String, Object> body) {
        String password = String.valueOf(body.getOrDefault("password", ""));
        if (password.length() < 12) throw ApiException.badRequest("密码至少 12 位");
        String salt = OpsCrypto.newSalt();
        db.update("UPDATE admin_accounts SET password_hash=?, password_salt=?, failed_attempts=0, locked_until=NULL WHERE id=?",
                OpsCrypto.passwordHash(password, salt), salt, id);
        db.update("UPDATE admin_sessions SET revoked_at=? WHERE admin_id=? AND revoked_at IS NULL", TimeUtil.now(), id);
        audit.log(adminId, "adm_account_reset", "admin", id, null, null, "重置后台密码并踢下线");
        return M.of().put("ok", true).map();
    }

    public Map<String, Object> recovery(String adminId) {
        Map<String, Object> row = db.one("SELECT recovery_codes FROM admin_accounts WHERE id=?", adminId);
        List<String> codes;
        try {
            codes = json.readValue(Db.str(row, "recovery_codes", "[]"), new TypeReference<>() {});
        } catch (Exception e) {
            codes = List.of();
        }
        return M.of().put("codes", codes).put("note", "一次性恢复码，离线保存；使用后立即失效").map();
    }

    public Map<String, Object> rotateRecovery(String adminId) {
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 10; i++) codes.add(OpsCrypto.randomCode(10));
        db.update("UPDATE admin_accounts SET recovery_codes=? WHERE id=?", toJson(codes), adminId);
        audit.log(adminId, "adm_recovery_rotate", "admin", adminId, null, null, "重新生成一次性恢复码");
        return M.of().put("codes", codes).map();
    }

    public Map<String, Object> testAccount() {
        List<Map<String, Object>> users = db.all("SELECT * FROM users WHERE is_test=1").stream()
                .map(row -> M.of().put("id", Db.str(row, "id")).put("nickname", Db.str(row, "nickname"))
                        .put("phoneMasked", maskPhone(Db.str(row, "phone"))).put("createdAt", Db.str(row, "created_at"))
                        .put("sessions", db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id=? AND deleted_at IS NULL", Db.str(row, "id")))
                        .put("posts", db.count("SELECT COUNT(*) AS n FROM posts WHERE user_id=? AND deleted_at IS NULL", Db.str(row, "id"))).map()).toList();
        String enabled = db.one("SELECT value FROM app_settings WHERE setting_key='test_account_enabled'") == null ? "1"
                : Db.str(db.one("SELECT value FROM app_settings WHERE setting_key='test_account_enabled'"), "value", "1");
        return M.of().put("enabled", "1".equals(enabled)).put("items", users).put("limit", 1).map();
    }

    public Map<String, Object> createTestAccount(String adminId) {
        if (db.count("SELECT COUNT(*) AS n FROM users WHERE is_test=1") >= 1) throw ApiException.conflict("测试号数量已达上限 1 个");
        Map<String, Object> existing = db.one("SELECT id FROM users WHERE phone = '13700000000'");
        if (existing != null) {
            db.update("UPDATE users SET is_test=1, nickname='FitLog 测试号' WHERE id=?", Db.str(existing, "id"));
            audit.log(adminId, "adm_test_create", "user", Db.str(existing, "id"), null, null, "复用已有手机号标记为测试号");
            return testAccount();
        }
        String id = UUID.randomUUID().toString();
        db.update("""
                INSERT INTO users(id,phone,nickname,role,status,tz_offset,weekly_goal,is_test,created_at)
                VALUES(?,'13700000000','FitLog 测试号','user','active',-480,3,1,?)
                """, id, TimeUtil.now());
        audit.log(adminId, "adm_test_create", "user", id, null, null, "创建测试号");
        return testAccount();
    }

    public Map<String, Object> toggleTestAccount(String adminId, boolean enabled) {
        db.update("""
                INSERT INTO app_settings(setting_key,value,risk_level,description,updated_by,updated_at)
                VALUES('test_account_enabled',?,'mid','前台测试号是否可用',?,?)
                ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)
                """, enabled ? "1" : "0", adminId, TimeUtil.now());
        audit.log(adminId, "adm_test_toggle", "config", "test_account_enabled", null, Map.of("enabled", enabled), "测试号开关");
        return testAccount();
    }

    @Transactional
    public Map<String, Object> resetTestAccount(String adminId, String userId) {
        Map<String, Object> user = db.one("SELECT * FROM users WHERE id=? AND is_test=1", userId);
        if (user == null) throw ApiException.notFound("测试号不存在");
        db.update("DELETE FROM media_assets WHERE user_id=?", userId);
        db.update("DELETE FROM posts WHERE user_id=?", userId);
        db.update("DELETE FROM checkins WHERE user_id=?", userId);
        db.update("DELETE FROM body_metrics WHERE user_id=?", userId);
        db.update("DELETE FROM workout_sessions WHERE user_id=?", userId);
        db.update("DELETE FROM templates WHERE user_id=?", userId);
        audit.log(adminId, "adm_test_reset", "user", userId, user, null, "测试号一键重置，保留账号");
        return M.of().put("reset", true).map();
    }

    public Map<String, Object> dailyDigest() {
        String from = TimeUtil.addDays(TimeUtil.todayForString(-480), -1);
        List<Map<String, Object>> items = db.all("SELECT * FROM audit_logs WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100", from)
                .stream().map(audit::dto).toList();
        List<Map<String, Object>> sensitive = items.stream().filter(item -> String.valueOf(item.get("action")).contains("config") || String.valueOf(item.get("action")).contains("merge") || String.valueOf(item.get("action")).contains("punish")).toList();
        return M.of().put("date", from).put("total", items.size()).put("sensitive", sensitive).put("items", items).map();
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) return phone == null ? "" : "***";
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    private String purgeAt(String requestedAt) {
        if (requestedAt == null) return null;
        try { return TimeUtil.ISO_MS.format(Instant.parse(requestedAt).plus(30, ChronoUnit.DAYS)); } catch (Exception e) { return null; }
    }

    private long minutesSince(String iso) {
        try { return Math.max(0, ChronoUnit.MINUTES.between(Instant.parse(TimeUtil.normalizeIso(iso)), Instant.now())); } catch (Exception e) { return 0; }
    }

    private long daysSince(String iso) {
        try { return Math.max(0, ChronoUnit.DAYS.between(Instant.parse(TimeUtil.normalizeIso(iso)), Instant.now())); } catch (Exception e) { return 999; }
    }

    private String toJson(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new ApiException(500, "OPS_SERIALIZE_ERROR", "序列化失败"); }
    }
}
