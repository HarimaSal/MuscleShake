package com.fitlog.config;

import com.fitlog.common.Api;
import com.fitlog.common.TimeUtil;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Api.ok(Map.of("ok", true, "service", "fitlog-spring", "time", TimeUtil.now()));
    }

    @RequestMapping("/feed")
    public Map<String, Object> feed() {
        throw new com.fitlog.common.ApiException(501, "NOT_IMPLEMENTED", "社区功能一期未开放，仅保留接口命名空间");
    }

    @RequestMapping("/follow")
    public Map<String, Object> follow() {
        throw new com.fitlog.common.ApiException(501, "NOT_IMPLEMENTED", "社区功能一期未开放，仅保留接口命名空间");
    }

    @RequestMapping("/comment")
    public Map<String, Object> comment() {
        throw new com.fitlog.common.ApiException(501, "NOT_IMPLEMENTED", "社区功能一期未开放，仅保留接口命名空间");
    }
}
