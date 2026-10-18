package com.fitlog.auth;

import com.fitlog.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;

public final class Auth {
    public static final String ATTR = "fitlog.currentUser";
    private Auth() {}

    public static AuthUser current(HttpServletRequest request) {
        Object user = request.getAttribute(ATTR);
        if (user instanceof AuthUser authUser) return authUser;
        throw ApiException.unauthorized("请先登录");
    }

    public static AuthUser optional(HttpServletRequest request) {
        Object user = request.getAttribute(ATTR);
        return user instanceof AuthUser authUser ? authUser : null;
    }

    public static AuthUser admin(HttpServletRequest request) {
        AuthUser user = current(request);
        if (!user.isAdmin()) throw ApiException.forbidden("需要审核权限");
        return user;
    }
}
