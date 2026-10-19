package com.fitlog.ops;

import com.fitlog.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Arrays;
import java.util.Map;

public final class OpsAuth {
    public static final String ATTRIBUTE = "fitlog.ops.admin";

    private OpsAuth() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> current(HttpServletRequest request) {
        Object value = request.getAttribute(ATTRIBUTE);
        if (value instanceof Map<?, ?> map) return (Map<String, Object>) map;
        throw new ApiException(401, "OPS_UNAUTHORIZED", "后台登录已过期，请重新登录");
    }

    public static Map<String, Object> require(HttpServletRequest request, String... roles) {
        Map<String, Object> admin = current(request);
        String role = String.valueOf(admin.get("role"));
        if (roles.length > 0 && Arrays.stream(roles).noneMatch(role::equals)) {
            throw new ApiException(403, "OPS_FORBIDDEN", "当前后台角色无权执行此操作");
        }
        return admin;
    }

    public static String id(HttpServletRequest request) {
        return String.valueOf(require(request).get("id"));
    }

    public static String role(HttpServletRequest request) {
        return String.valueOf(require(request).get("role"));
    }

    public static boolean canWrite(HttpServletRequest request) {
        return !"viewer".equals(role(request));
    }
}
