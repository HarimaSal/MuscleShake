package com.fitlog.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** 生产环境由 Spring Boot 托管前端构建产物，深链接回退到 index.html。 */
@Controller
public class SpaController {
    @GetMapping({"/", "/login", "/data", "/checkin", "/settings", "/community", "/admin"})
    public String index() {
        return "forward:/index.html";
    }

    @GetMapping({"/sessions/**", "/posts/**", "/exercises/**", "/p/**"})
    public String deepLinks() {
        return "forward:/index.html";
    }

    /** 运营后台是独立 SPA，构建产物位于 dist/web/admin。 */
    @GetMapping({"/ops", "/ops/**"})
    public String ops() {
        return "forward:/admin/index.html";
    }
}
