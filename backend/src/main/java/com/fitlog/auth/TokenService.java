package com.fitlog.auth;

import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class TokenService {
    private final AppProps props;
    private final Db db;
    private final SecureRandom random = new SecureRandom();

    public TokenService(AppProps props, Db db) {
        this.props = props;
        this.db = db;
    }

    public Map<String, Object> issue(String userId) {
        long exp = Instant.now().getEpochSecond() + props.getAccessTokenTtlSeconds();
        String nonce = UUID.randomUUID().toString().replace("-", "");
        String payload = userId + "|" + exp + "|" + nonce;
        String token = Base64.getUrlEncoder().withoutPadding()
                .encodeToString((payload + "|" + hmac(payload)).getBytes(StandardCharsets.UTF_8));
        String refresh = randomToken();
        db.update("INSERT INTO refresh_tokens(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
                UUID.randomUUID().toString(), userId, sha256(refresh),
                TimeUtil.ISO_MS.format(Instant.now().plusSeconds(props.getRefreshTokenTtlSeconds())), TimeUtil.now());
        return M.of()
                .put("accessToken", token)
                .put("refreshToken", refresh)
                .put("expiresIn", props.getAccessTokenTtlSeconds());
    }

    public String userIdFromAccess(String token) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|");
            if (parts.length != 4) throw new IllegalArgumentException();
            String payload = parts[0] + "|" + parts[1] + "|" + parts[2];
            if (!constantEquals(parts[3], hmac(payload))) throw new IllegalArgumentException();
            long exp = Long.parseLong(parts[1]);
            if (exp < Instant.now().getEpochSecond()) throw new ApiException(401, "TOKEN_EXPIRED", "登录已过期，请重新登录");
            return parts[0];
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.unauthorized("登录凭证无效");
        }
    }

    public Map<String, Object> rotate(String refreshToken) {
        Map<String, Object> row = db.one("SELECT * FROM refresh_tokens WHERE token_hash = ?", sha256(refreshToken));
        if (row == null) throw ApiException.unauthorized("刷新令牌无效");
        String expires = Db.str(row, "expires_at");
        if (expires != null && Instant.parse(expires).isBefore(Instant.now())) {
            db.update("DELETE FROM refresh_tokens WHERE id = ?", Db.str(row, "id"));
            throw ApiException.unauthorized("登录已过期，请重新登录");
        }
        String userId = Db.str(row, "user_id");
        Map<String, Object> userRow = db.one("SELECT * FROM users WHERE id = ?", userId);
        AuthUser user = AuthUser.from(userRow);
        if (user == null) throw ApiException.unauthorized("账号不存在");
        db.update("DELETE FROM refresh_tokens WHERE id = ?", Db.str(row, "id"));
        return M.of().put("user", user).put("tokens", issue(userId));
    }

    public void revoke(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) return;
        db.update("DELETE FROM refresh_tokens WHERE token_hash = ?", sha256(refreshToken));
    }

    public static Map<String, Object> publicUser(AuthUser user) {
        return M.of()
                .put("id", user.id())
                .put("phone", user.phone())
                .put("nickname", user.nickname())
                .put("avatar", user.avatar())
                .put("role", user.role())
                .put("tzOffset", user.tzOffset())
                .put("weeklyGoal", user.weeklyGoal())
                .put("defaultSessionVisibility", user.defaultSessionVisibility())
                .put("defaultPostVisibility", user.defaultPostVisibility())
                .put("notifyCheckin", user.notifyCheckin())
                .put("notifyWeekly", user.notifyWeekly())
                .put("notifyInteraction", user.notifyInteraction())
                .put("reminderTime", user.reminderTime())
                .put("privacyAcceptedAt", user.privacyAcceptedAt())
                .put("status", user.status())
                .put("deleteRequestedAt", user.deleteRequestedAt())
                .put("createdAt", user.createdAt());
    }

    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(props.getSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("token signing failed", e);
        }
    }

    private String randomToken() {
        byte[] bytes = new byte[36];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String hmacHex(String secret, String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private boolean constantEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
