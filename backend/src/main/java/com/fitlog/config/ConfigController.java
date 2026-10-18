package com.fitlog.config;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.M;
import com.fitlog.common.Settings;
import com.fitlog.content.Legal;
import com.fitlog.media.BudgetService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/config")
public class ConfigController {
    private static final Pattern EVENT = Pattern.compile("^[a-z0-9_]+$");

    private final Settings settings;
    private final BudgetService budget;
    private final AuditService audit;
    private final AppProps props;

    public ConfigController(Settings settings, BudgetService budget, AuditService audit, AppProps props) {
        this.settings = settings;
        this.budget = budget;
        this.audit = audit;
        this.props = props;
    }

    @GetMapping
    public Map<String, Object> config() {
        Map<String, Object> status = budget.status();
        return Api.ok(M.of()
                .put("productName", "练迹 FitLog")
                .put("communityVisible", settings.bool("community_visible", true))
                .put("communityNote", settings.get("community_note", "社区功能正在规划中，暂未开放"))
                .put("quotaGb", settings.intValue("quota_gb", props.getQuotaGb()))
                .put("publicDailyQuota", settings.intValue("public_daily_quota", props.getPublicDailyQuota()))
                .put("publicListingEnabled", settings.bool("public_listing_enabled", false))
                .put("brandWatermarkText", settings.get("brand_watermark_text", "练迹"))
                .put("budget", M.of()
                        .put("level", status.get("level")).put("ratio", status.get("ratio"))
                        .put("capCny", status.get("capCny")).put("spentCny", status.get("spentCny"))
                        .put("videoUploadAllowed", status.get("videoUploadAllowed")).put("message", status.get("message")))
                .put("reviewPolicy", Legal.reviewPolicy())
                .put("features", Map.of("offlineDraft", true, "chunkUpload", true, "videoWatermark", true, "communityPlaceholder", true, "adminReview", true))
                .map());
    }

    @GetMapping("/community")
    public Map<String, Object> community() {
        boolean visible = settings.bool("community_visible", true);
        return Api.ok(M.of()
                .put("visible", visible)
                .put("title", "社区 · 敬请期待")
                .put("description", visible ? settings.get("community_note", "社区功能正在规划中，暂未开放") : "社区入口未开放")
                .put("open", false)
                .map());
    }

    @PostMapping("/events")
    public Map<String, Object> event(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        String name = body != null && body.get("name") != null ? String.valueOf(body.get("name")) : "";
        if (!EVENT.matcher(name).matches()) throw ApiException.badRequest("事件名不合法");
        AuthUser user = Auth.optional(request);
        Object rawProps = body.get("props");
        @SuppressWarnings("unchecked")
        Map<String, Object> eventProps = rawProps instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
        audit.track(user == null ? null : user.id(), name, eventProps);
        return Api.ok(Map.of("recorded", true));
    }

    @GetMapping("/review-policy")
    public Map<String, Object> reviewPolicy(HttpServletRequest request) {
        Auth.current(request);
        return Api.ok(Legal.reviewPolicy());
    }
}
