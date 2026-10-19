package com.fitlog.ops;

import com.fitlog.common.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ops/auth")
public class OpsAuthController {
    private final OpsAuthService auth;

    public OpsAuthController(OpsAuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String username = body.get("username") == null ? "" : String.valueOf(body.get("username")).trim();
        String password = body.get("password") == null ? "" : String.valueOf(body.get("password"));
        String totp = body.get("totp") == null ? "" : String.valueOf(body.get("totp")).trim();
        if (username.isBlank() || password.isBlank() || totp.isBlank()) {
            throw com.fitlog.common.ApiException.badRequest("请输入后台账号、密码与动态验证码");
        }
        return Api.ok(auth.login(username, password, totp, ip(request), ua(request)));
    }

    @PostMapping("/demo")
    public Map<String, Object> demo(HttpServletRequest request) {
        return Api.ok(auth.demo(ip(request), ua(request)));
    }

    @GetMapping("/dev-code")
    public Map<String, Object> devCode() {
        return Api.ok(Map.of("totp", auth.devTotp() == null ? "" : auth.devTotp()));
    }

    @PostMapping("/recovery")
    public Map<String, Object> recovery(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String username = body.get("username") == null ? "admin" : String.valueOf(body.get("username"));
        String code = body.get("code") == null ? "" : String.valueOf(body.get("code")).trim();
        return Api.ok(auth.recoveryLogin(username, code, ip(request), ua(request)));
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request) {
        return Api.ok(auth.dto(OpsAuth.current(request)));
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        auth.logout(header == null ? null : header.replace("Bearer ", "").trim());
        return Api.ok(Map.of("loggedOut", true));
    }

    private String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }

    private String ua(HttpServletRequest request) {
        String value = request.getHeader("User-Agent");
        return value == null ? "" : value.substring(0, Math.min(value.length(), 280));
    }
}
