package com.fitlog.stats;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.Db;
import com.fitlog.common.Req;
import com.fitlog.common.TimeUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/stats")
public class StatsController {
    private final StatsService stats;
    private final Db db;

    public StatsController(StatsService stats, Db db) {
        this.stats = stats;
        this.db = db;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(stats.overview(user.id(), user.tzOffset(), user.weeklyGoal()));
    }

    @GetMapping("/trend/{exerciseId}")
    public Map<String, Object> trend(@PathVariable String exerciseId, @RequestParam(defaultValue = "week") String granularity,
                                     HttpServletRequest request) {
        return Api.ok(stats.trend(Auth.current(request).id(), exerciseId, granularity));
    }

    @GetMapping("/prs")
    public Map<String, Object> prs(HttpServletRequest request) {
        return Api.ok(Map.of("items", stats.prList(Auth.current(request).id())));
    }

    @GetMapping("/muscles")
    public Map<String, Object> muscles(@RequestParam(defaultValue = "28") int days, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(stats.muscles(user.id(), user.tzOffset(), Math.min(90, Math.max(7, days))));
    }

    @GetMapping("/weekly-report")
    public Map<String, Object> report(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(stats.weeklyReport(user.id(), user.tzOffset(), user.weeklyGoal()));
    }

    @GetMapping("/frequency")
    public Map<String, Object> frequency(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(Map.of("weeks", stats.frequency(user.id(), user.tzOffset(), 8)));
    }

    @GetMapping("/month/{month}")
    public Map<String, Object> month(@PathVariable String month, HttpServletRequest request) {
        return Api.ok(stats.month(Auth.current(request).id(), month));
    }

    @GetMapping("/body")
    public Map<String, Object> body(HttpServletRequest request) {
        return Api.ok(stats.body(Auth.current(request).id()));
    }

    @PostMapping("/body")
    public Map<String, Object> saveBody(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> result = stats.saveBody(user.id(), body);
        result.put("series", stats.body(user.id()));
        return Api.ok(result);
    }

    @DeleteMapping("/body/{id}")
    public Map<String, Object> deleteBody(@PathVariable String id, HttpServletRequest request) {
        stats.deleteBody(Auth.current(request).id(), id);
        return Api.ok(Map.of("deleted", true));
    }

    @GetMapping("/exportable")
    public Map<String, Object> exportable(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(Map.of(
                "sessions", db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL", user.id()),
                "checkins", db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?", user.id()),
                "posts", db.count("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND deleted_at IS NULL", user.id()),
                "body", db.count("SELECT COUNT(*) AS n FROM body_metrics WHERE user_id = ?", user.id())
        ));
    }
}
