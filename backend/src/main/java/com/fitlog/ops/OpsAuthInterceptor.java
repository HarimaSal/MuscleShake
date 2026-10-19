package com.fitlog.ops;

import com.fitlog.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;

@Component
public class OpsAuthInterceptor implements HandlerInterceptor {
    private final OpsAuthService auth;

    public OpsAuthInterceptor(OpsAuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        if (path.equals("/api/ops/auth/login") || path.equals("/api/ops/auth/demo")
                || path.equals("/api/ops/auth/dev-code") || path.equals("/api/ops/auth/recovery")) return true;
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
        Map<String, Object> admin = auth.session(token);
        if (admin == null) throw new ApiException(401, "OPS_UNAUTHORIZED", "后台登录已过期，请重新登录");
        request.setAttribute(OpsAuth.ATTRIBUTE, admin);
        return true;
    }
}
