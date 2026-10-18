package com.fitlog.auth;

import com.fitlog.checkin.BadgeService;
import com.fitlog.checkin.CheckinService;
import com.fitlog.common.Api;
import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.RateLimiter;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import com.fitlog.content.Legal;
import com.fitlog.notification.NotificationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final Pattern PHONE = Pattern.compile("^1\\d{10}$");

    private final Db db;
    private final TokenService tokens;
    private final CheckinService checkins;
    private final NotificationService notifications;
    private final BadgeService badges;
    private final RateLimiter limiter;
    private final AuditService audit;
    private final AppProps props;

    public AuthController(Db db, TokenService tokens, CheckinService checkins, NotificationService notifications,
                          BadgeService badges, RateLimiter limiter, AuditService audit, AppProps props) {
        this.db = db;
        this.tokens = tokens;
        this.checkins = checkins;
        this.notifications = notifications;
        this.badges = badges;
        this.limiter = limiter;
        this.audit = audit;
        this.props = props;
    }

    @PostMapping("/sms/send")
    public Map<String, Object> sendSms(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        if (!limiter.allow("sms:" + request.getRemoteAddr(), 10, 60_000)) throw ApiException.tooMany("操作过于频繁，请稍后再试");
        String phone = phone(body == null ? null : body.get("phone"));
        String code = "123456";
        db.update("INSERT INTO auth_codes(id,phone,code,expires_at,used,created_at) VALUES(?,?,?,?,0,?)",
                UUID.randomUUID().toString(), phone, code, TimeUtil.ISO_MS.format(Instant.now().plusSeconds(300)), TimeUtil.now());
        String devCode = (!props.isProd() || props.isShowSmsCode()) ? code : null;
        return Api.ok(M.of()
                .put("sent", true)
                .put("expiresIn", 300)
                .put("devCode", devCode)
                .put("hint", devCode != null ? "开发环境验证码固定为 123456" : "短信通道未接入时，请联系管理员获取验证码")
                .map());
    }

    @PostMapping("/sms/login")
    public Map<String, Object> smsLogin(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        if (!limiter.allow("login:" + request.getRemoteAddr(), 10, 60_000)) throw ApiException.tooMany("登录尝试过于频繁，请稍后再试");
        String phone = phone(body == null ? null : body.get("phone"));
        String code = body == null || body.get("code") == null ? "" : String.valueOf(body.get("code")).trim();
        if (!code.matches("\\d{6}")) throw ApiException.badRequest("请输入 6 位验证码");
        Map<String, Object> record = db.one("SELECT * FROM auth_codes WHERE phone = ? AND used = 0 ORDER BY created_at DESC LIMIT 1", phone);
        boolean valid = false;
        if (record != null && code.equals(Db.str(record, "code"))) {
            try { valid = Instant.parse(Db.str(record, "expires_at")).isAfter(Instant.now()); } catch (Exception ignored) {}
        }
        if (!valid && !props.isProd() && "123456".equals(code)) valid = true;
        if (!valid) throw ApiException.unauthorized("验证码不正确或已过期");
        if (record != null) db.update("UPDATE auth_codes SET used = 1 WHERE id = ?", Db.str(record, "id"));
        AuthUser user = createOrGetUser(phone, body == null ? null : body.get("nickname"));
        audit.track(user.id(), "login_success", Map.of("method", "sms"));
        return Api.ok(M.of().put("user", TokenService.publicUser(user)).put("tokens", tokens.issue(user.id())).map());
    }

    @PostMapping("/wechat/login")
    public Map<String, Object> wechatLogin(@RequestBody(required = false) Map<String, Object> body) {
        String openid = body != null && body.get("openid") != null ? String.valueOf(body.get("openid")) : null;
        if (openid == null || openid.isBlank()) {
            openid = "wx_" + md5(body == null || body.get("code") == null ? String.valueOf(System.currentTimeMillis()) : String.valueOf(body.get("code"))).substring(0, 16);
        }
        String phone = body != null && body.get("phone") != null ? phone(body.get("phone")) : null;
        Map<String, Object> row = phone != null
                ? db.one("SELECT * FROM users WHERE phone = ?", phone)
                : db.one("SELECT * FROM users WHERE wechat_openid = ?", openid);
        if (phone != null && row != null && Db.str(row, "wechat_openid") == null) {
            db.update("UPDATE users SET wechat_openid = ? WHERE id = ? AND wechat_openid IS NULL", openid, Db.str(row, "id"));
            row = db.one("SELECT * FROM users WHERE id = ?", Db.str(row, "id"));
        }
        if (row == null) {
            String id = UUID.randomUUID().toString();
            String nickname = body != null && body.get("nickname") != null ? String.valueOf(body.get("nickname")).substring(0, Math.min(20, String.valueOf(body.get("nickname")).length())) : "微信训练者";
            db.update("INSERT INTO users(id,phone,wechat_openid,nickname,role,tz_offset,weekly_goal,default_session_visibility,default_post_visibility,created_at) VALUES(?,?,?,?, 'user',-480,3,'private','private',?)",
                    id, phone, openid, nickname.isBlank() ? "微信训练者" : nickname, TimeUtil.now());
            row = db.one("SELECT * FROM users WHERE id = ?", id);
        }
        AuthUser user = AuthUser.from(row);
        audit.track(user.id(), "login_success", Map.of("method", "wechat"));
        return Api.ok(M.of().put("user", TokenService.publicUser(user)).put("tokens", tokens.issue(user.id()))
                .put("needProfile", user.nickname() == null || user.nickname().isBlank()).map());
    }

    @PostMapping("/demo-login")
    public Map<String, Object> demoLogin() {
        return demoLoginFor("13800000000", "demo", "演示账号尚未初始化");
    }

    @PostMapping("/admin-login")
    public Map<String, Object> adminLogin() {
        return demoLoginFor("13900000000", "demo_admin", "审核账号尚未初始化");
    }

    private Map<String, Object> demoLoginFor(String phone, String method, String missing) {
        if (props.isProd() && !props.isEnableDemo()) throw ApiException.notFound("演示入口未开启");
        Map<String, Object> row = db.one("SELECT * FROM users WHERE phone = ?", phone);
        if (row == null) throw ApiException.notFound(missing);
        AuthUser user = AuthUser.from(row);
        audit.track(user.id(), "login_success", Map.of("method", method));
        return Api.ok(M.of().put("user", TokenService.publicUser(user)).put("tokens", tokens.issue(user.id())).map());
    }

    @PostMapping("/refresh")
    public Map<String, Object> refresh(@RequestBody(required = false) Map<String, Object> body) {
        String refresh = body == null ? null : String.valueOf(body.get("refreshToken"));
        if (refresh == null || refresh.isBlank() || "null".equals(refresh)) throw ApiException.unauthorized("缺少刷新令牌");
        Map<String, Object> result = tokens.rotate(refresh);
        AuthUser user = (AuthUser) result.get("user");
        return Api.ok(M.of().put("user", TokenService.publicUser(user)).put("tokens", result.get("tokens")).map());
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestBody(required = false) Map<String, Object> body) {
        tokens.revoke(body == null ? null : String.valueOf(body.get("refreshToken")));
        return Api.ok(Map.of("loggedOut", true));
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        String today = TimeUtil.todayForString(user.tzOffset());
        Map<String, Object> checkin = db.one("SELECT * FROM checkins WHERE user_id = ? AND local_date = ?", user.id(), today);
        long sessionsToday = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL", user.id(), today);
        notifications.generateDueReminders(user);
        M deletion = null;
        if ("pending_deletion".equals(user.status()) && user.deleteRequestedAt() != null) {
            try {
                String purgeAt = TimeUtil.ISO_MS.format(Instant.parse(user.deleteRequestedAt()).plusSeconds(30L * 86400));
                deletion = M.of().put("requestedAt", user.deleteRequestedAt()).put("purgeAt", purgeAt);
            } catch (Exception ignored) {}
        }
        return Api.ok(M.of()
                .put("user", TokenService.publicUser(user))
                .put("today", today)
                .put("todayCheckin", checkin != null && "active".equals(Db.str(checkin, "status"))
                        ? M.of().put("source", Db.str(checkin, "source")).put("workoutType", Db.str(checkin, "workout_type"))
                        .put("durationMin", Db.lng(checkin, "duration_min")).map() : null)
                .put("sessionsToday", sessionsToday)
                .put("streak", checkins.streak(user.id(), user.tzOffset()))
                .put("unreadNotifications", notifications.unread(user.id()))
                .put("deletion", deletion)
                .put("privacyAccepted", user.privacyAcceptedAt() != null)
                .map());
    }

    @PatchMapping("/me")
    public Map<String, Object> updateMe(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> b = body == null ? Map.of() : body;
        String nickname = b.get("nickname") != null ? String.valueOf(b.get("nickname")).trim() : user.nickname();
        if (nickname.isBlank()) throw ApiException.badRequest("昵称不能为空");
        if (nickname.length() > 20) nickname = nickname.substring(0, 20);
        int tz = b.get("tzOffset") != null ? clamp(Integer.parseInt(String.valueOf(b.get("tzOffset"))), -840, 840) : user.tzOffset();
        int goal = b.get("weeklyGoal") != null ? clamp(Integer.parseInt(String.valueOf(b.get("weeklyGoal"))), 1, 7) : user.weeklyGoal();
        String reminder = b.get("reminderTime") != null && String.valueOf(b.get("reminderTime")).matches("\\d{2}:\\d{2}")
                ? String.valueOf(b.get("reminderTime")) : user.reminderTime();
        String sessionVis = validVisibility(b.get("defaultSessionVisibility")) ? String.valueOf(b.get("defaultSessionVisibility")) : user.defaultSessionVisibility();
        String postVis = validVisibility(b.get("defaultPostVisibility")) ? String.valueOf(b.get("defaultPostVisibility")) : user.defaultPostVisibility();
        String avatar = b.get("avatar") != null ? String.valueOf(b.get("avatar")).substring(0, Math.min(500, String.valueOf(b.get("avatar")).length())) : user.avatar();
        boolean notifyCheckin = b.get("notifyCheckin") != null ? bool(b.get("notifyCheckin")) : user.notifyCheckin();
        boolean notifyWeekly = b.get("notifyWeekly") != null ? bool(b.get("notifyWeekly")) : user.notifyWeekly();
        boolean notifyInteraction = b.get("notifyInteraction") != null ? bool(b.get("notifyInteraction")) : user.notifyInteraction();
        boolean acceptPrivacy = bool(b.get("acceptPrivacy"));
        db.update("UPDATE users SET nickname=?,avatar=?,tz_offset=?,weekly_goal=?,reminder_time=?,default_session_visibility=?,default_post_visibility=?,notify_checkin=?,notify_weekly=?,notify_interaction=?,privacy_accepted_at=COALESCE(privacy_accepted_at,?) WHERE id=?",
                nickname, avatar, tz, goal, reminder, sessionVis, postVis, notifyCheckin ? 1 : 0, notifyWeekly ? 1 : 0,
                notifyInteraction ? 1 : 0, acceptPrivacy ? TimeUtil.now() : null, user.id());
        AuthUser updated = AuthUser.from(db.one("SELECT * FROM users WHERE id = ?", user.id()));
        return Api.ok(M.of().put("user", TokenService.publicUser(updated)).map());
    }

    @PostMapping("/me/delete")
    public Map<String, Object> requestDelete(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        String requestedAt = TimeUtil.now();
        db.update("UPDATE users SET status = 'pending_deletion', delete_requested_at = ? WHERE id = ?", requestedAt, user.id());
        db.update("DELETE FROM refresh_tokens WHERE user_id = ?", user.id());
        audit.audit(user.id(), "account_delete_request", "user", user.id(), Map.of("requestedAt", requestedAt));
        String purgeAt = TimeUtil.ISO_MS.format(Instant.parse(requestedAt).plusSeconds(30L * 86400));
        return Api.ok(M.of()
                .put("requestedAt", requestedAt)
                .put("purgeAt", purgeAt)
                .put("canCancelUntil", TimeUtil.addDays(TimeUtil.todayForString(user.tzOffset()), 30))
                .put("message", "注销申请已提交，30 天内可撤销；到期后将彻底删除账号与全部媒体")
                .map());
    }

    @PostMapping("/me/delete/cancel")
    public Map<String, Object> cancelDelete(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        db.update("UPDATE users SET status = 'active', delete_requested_at = NULL WHERE id = ?", user.id());
        audit.audit(user.id(), "account_delete_cancel", "user", user.id());
        AuthUser updated = AuthUser.from(db.one("SELECT * FROM users WHERE id = ?", user.id()));
        return Api.ok(M.of().put("user", TokenService.publicUser(updated)).put("message", "已撤销注销申请").map());
    }

    @GetMapping("/me/notifications")
    public Map<String, Object> notifications(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        List<Map<String, Object>> items = notifications.generateDueReminders(user);
        return Api.ok(M.of().put("items", items).put("unread", notifications.unread(user.id())).map());
    }

    @PostMapping("/me/notifications/read")
    public Map<String, Object> readNotifications(HttpServletRequest request) {
        notifications.markAllRead(Auth.current(request).id());
        return Api.ok(Map.of("ok", true));
    }

    @GetMapping("/privacy")
    public Map<String, Object> privacy() {
        return Api.ok(Legal.privacyPolicy());
    }

    @GetMapping("/me/export-hint")
    public Map<String, Object> exportHint(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        long sessions = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL", user.id());
        return Api.ok(M.of().put("sessions", sessions).put("formats", List.of("CSV", "JSON")).put("retention", "7 天").map());
    }

    private AuthUser createOrGetUser(String phone, Object nickname) {
        Map<String, Object> row = db.one("SELECT * FROM users WHERE phone = ?", phone);
        if (row != null) {
            if ("deleted".equals(Db.str(row, "status"))) throw ApiException.unauthorized("账号已注销");
            return AuthUser.from(row);
        }
        String id = UUID.randomUUID().toString();
        String name = nickname == null || String.valueOf(nickname).isBlank()
                ? "训练者" + phone.substring(7) : String.valueOf(nickname);
        if (name.length() > 20) name = name.substring(0, 20);
        db.update("INSERT INTO users(id,phone,nickname,role,tz_offset,weekly_goal,default_session_visibility,default_post_visibility,privacy_accepted_at,created_at) VALUES(?,?,?, 'user',-480,3,'private','private',NULL,?)",
                id, phone, name, TimeUtil.now());
        return AuthUser.from(db.one("SELECT * FROM users WHERE id = ?", id));
    }

    private String phone(Object raw) {
        String phone = raw == null ? "" : String.valueOf(raw).replaceAll("[\\s-]", "");
        if (!PHONE.matcher(phone).matches()) throw ApiException.badRequest("请输入正确的手机号");
        return phone;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static boolean validVisibility(Object value) {
        return value != null && List.of("private", "unlisted", "public").contains(String.valueOf(value));
    }

    private static boolean bool(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean b) return b;
        return "1".equals(String.valueOf(value)) || "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static String md5(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString().replace("-", "");
        }
    }
}
