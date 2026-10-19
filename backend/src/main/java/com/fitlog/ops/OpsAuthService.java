package com.fitlog.ops;

import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OpsAuthService {
    private final Db db;
    private final AppProps props;
    private final AuditService audit;

    public OpsAuthService(Db db, AppProps props, AuditService audit) {
        this.db = db;
        this.props = props;
        this.audit = audit;
    }

    public Map<String, Object> login(String username, String password, String totp, String ip, String ua) {
        Map<String, Object> admin = db.one("SELECT * FROM admin_accounts WHERE username = ?", username);
        if (admin == null) throw new ApiException(401, "OPS_LOGIN_FAILED", "账号或凭据不正确");
        if (!"active".equals(Db.str(admin, "status"))) throw new ApiException(403, "OPS_ACCOUNT_DISABLED", "后台账号已停用");
        if (Db.str(admin, "locked_until") != null) {
            try {
                if (Instant.parse(Db.str(admin, "locked_until")).isAfter(Instant.now())) {
                    throw new ApiException(423, "OPS_ACCOUNT_LOCKED", "账号已锁定，请稍后再试或使用恢复码");
                }
            } catch (ApiException e) {
                throw e;
            } catch (Exception ignored) {}
        }
        boolean ok = OpsCrypto.verifyPassword(password, Db.str(admin, "password_salt"), Db.str(admin, "password_hash"))
                && OpsCrypto.verifyTotp(Db.str(admin, "totp_secret"), totp);
        if (!ok) {
            long failures = Db.lng(admin, "failed_attempts") + 1;
            String lockedUntil = failures >= 5 ? TimeUtil.ISO_MS.format(Instant.now().plus(30, ChronoUnit.MINUTES)) : null;
            db.update("UPDATE admin_accounts SET failed_attempts = ?, locked_until = ? WHERE id = ?", failures, lockedUntil, Db.str(admin, "id"));
            audit.audit(Db.str(admin, "id"), "ops_login_failed", "admin", Db.str(admin, "id"), Map.of("ip", ip == null ? "" : ip));
            throw new ApiException(401, "OPS_LOGIN_FAILED", failures >= 5 ? "连续失败 5 次，账号已锁定 30 分钟" : "账号、密码或动态验证码不正确");
        }
        db.update("UPDATE admin_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?", TimeUtil.now(), Db.str(admin, "id"));
        return createSession(admin, ip, ua);
    }

    public Map<String, Object> demo(String ip, String ua) {
        if (!props.isEnableDemo() || props.isProd()) throw new ApiException(403, "OPS_DEMO_DISABLED", "演示登录已关闭");
        Map<String, Object> admin = db.one("SELECT * FROM admin_accounts WHERE username = 'admin'");
        if (admin == null) throw new ApiException(404, "OPS_ADMIN_MISSING", "后台账号尚未初始化");
        return createSession(admin, ip, ua);
    }

    public String devTotp() {
        if (!props.isShowSmsCode() || props.isProd()) return null;
        Map<String, Object> admin = db.one("SELECT totp_secret FROM admin_accounts WHERE username = 'admin'");
        return admin == null ? null : OpsCrypto.totp(Db.str(admin, "totp_secret"));
    }

    public Map<String, Object> recoveryLogin(String username, String code, String ip, String ua) {
        Map<String, Object> admin = db.one("SELECT * FROM admin_accounts WHERE username = ?", username);
        if (admin == null) throw new ApiException(401, "OPS_RECOVERY_FAILED", "恢复码无效");
        String raw = Db.str(admin, "recovery_codes", "[]");
        try {
            List<String> codes = new java.util.ArrayList<>(new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {}));
            if (!codes.remove(code)) throw new ApiException(401, "OPS_RECOVERY_FAILED", "恢复码无效或已使用");
            db.update("UPDATE admin_accounts SET recovery_codes = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(codes), Db.str(admin, "id"));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(401, "OPS_RECOVERY_FAILED", "恢复码无效或已使用");
        }
        return createSession(admin, ip, ua);
    }

    private Map<String, Object> createSession(Map<String, Object> admin, String ip, String ua) {
        String token = OpsCrypto.randomToken();
        String now = TimeUtil.now();
        String expires = TimeUtil.ISO_MS.format(Instant.now().plus(8, ChronoUnit.HOURS));
        db.update("INSERT INTO admin_sessions(id,admin_id,token_hash,ip,ua,last_seen_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), Db.str(admin, "id"), OpsCrypto.sha256(token), ip, ua, now, expires, now);
        audit.audit(Db.str(admin, "id"), "adm_login", "admin", Db.str(admin, "id"), Map.of("role", Db.str(admin, "role"), "ip", ip == null ? "" : ip));
        return M.of().put("token", token).put("expiresAt", expires).put("admin", dto(admin)).map();
    }

    public Map<String, Object> session(String token) {
        if (token == null || token.isBlank()) return null;
        Map<String, Object> row = db.one("""
                SELECT s.id AS session_id, s.last_seen_at, s.expires_at, a.*
                FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id
                WHERE s.token_hash = ? AND s.revoked_at IS NULL
                """, OpsCrypto.sha256(token));
        if (row == null) return null;
        try {
            if (Instant.parse(Db.str(row, "expires_at")).isBefore(Instant.now())) return null;
            Instant lastSeen = Instant.parse(Db.str(row, "last_seen_at", Db.str(row, "created_at")));
            if (lastSeen.isBefore(Instant.now().minus(30, ChronoUnit.MINUTES))) {
                db.update("UPDATE admin_sessions SET revoked_at = ? WHERE id = ?", TimeUtil.now(), Db.str(row, "session_id"));
                return null;
            }
        } catch (Exception ignored) {}
        if (!"active".equals(Db.str(row, "status"))) return null;
        db.update("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?", TimeUtil.now(), Db.str(row, "session_id"));
        return row;
    }

    public void logout(String token) {
        if (token == null) return;
        db.update("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?", TimeUtil.now(), OpsCrypto.sha256(token));
    }

    public Map<String, Object> dto(Map<String, Object> admin) {
        return M.of().put("id", Db.str(admin, "id")).put("username", Db.str(admin, "username"))
                .put("role", Db.str(admin, "role")).put("status", Db.str(admin, "status"))
                .put("lastLoginAt", Db.str(admin, "last_login_at"))
                .put("recoveryCodes", parseCodes(Db.str(admin, "recovery_codes", "[]"))).map();
    }

    private List<String> parseCodes(String raw) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
