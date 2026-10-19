package com.fitlog.config;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.auth.TokenService;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;
import java.util.Set;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    private final Db db;
    private final TokenService tokens;

    public AuthInterceptor(Db db, TokenService tokens) {
        this.db = db;
        this.tokens = tokens;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        if (!(handler instanceof HandlerMethod)) return true;
        String path = request.getRequestURI();
        if (path.startsWith("/api/ops/")) return true;
        String method = request.getMethod();
        boolean optional = optional(path, method);

        AuthUser user = null;
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                String userId = tokens.userIdFromAccess(header.substring(7).trim());
                Map<String, Object> row = db.one("SELECT * FROM users WHERE id = ?", userId);
                user = AuthUser.from(row);
                if (user != null && "deleted".equals(user.status())) user = null;
            } catch (ApiException e) {
                if (!optional) throw e;
            }
        }
        if (user != null) request.setAttribute(Auth.ATTR, user);
        if (user != null || optional) return true;
        throw ApiException.unauthorized("请先登录");
    }

    private boolean optional(String path, String method) {
        if (path.equals("/api/health")) return true;
        if (path.equals("/api/feed") || path.equals("/api/follow") || path.equals("/api/comment") || path.equals("/api/topics")) return true;
        if (path.equals("/api/config") || path.equals("/api/config/community")) return true;
        if (path.equals("/api/config/events") && "POST".equals(method)) return true;
        if (path.equals("/api/auth/sms/send") || path.equals("/api/auth/sms/login")
                || path.equals("/api/auth/wechat/login") || path.equals("/api/auth/refresh")
                || path.equals("/api/auth/logout") || path.equals("/api/auth/demo-login")
                || path.equals("/api/auth/admin-login")) return true;
        if (path.equals("/api/auth/privacy")) return true;
        if (path.startsWith("/api/public/posts/")) return true;
        if ("GET".equals(method) && path.matches("^/api/media/[^/]+/(file|thumb)$")) return true;
        return false;
    }
}
