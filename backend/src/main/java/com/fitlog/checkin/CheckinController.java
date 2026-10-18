package com.fitlog.checkin;

import com.fitlog.auth.Auth;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.Api;
import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Req;
import com.fitlog.common.TimeUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/checkins")
public class CheckinController {
    private final CheckinService checkins;
    private final BadgeService badges;
    private final AuditService audit;
    private final Db db;

    public CheckinController(CheckinService checkins, BadgeService badges, AuditService audit, Db db) {
        this.checkins = checkins;
        this.badges = badges;
        this.audit = audit;
        this.db = db;
    }

    @GetMapping
    public Map<String, Object> month(@RequestParam(required = false) String month, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        String target = month == null || month.isBlank() ? TimeUtil.todayForString(user.tzOffset()).substring(0, 7) : month;
        if (!target.matches("\\d{4}-\\d{2}")) throw ApiException.badRequest("月份格式不正确");
        return Api.ok(M.of()
                .put("month", target)
                .put("days", checkins.monthView(user.id(), target, user.tzOffset()).get("days"))
                .put("summary", checkins.summary(user.id(), user.tzOffset(), user.weeklyGoal()))
                .map());
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        return Api.ok(checkins.summary(user.id(), user.tzOffset(), user.weeklyGoal()));
    }

    @PostMapping("/manual")
    public ResponseEntity<Map<String, Object>> manual(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        Map<String, Object> checkin = checkins.manual(user.id(), user.tzOffset(), body);
        boolean duplicated = Boolean.TRUE.equals(checkin.get("duplicated"));
        var newBadges = badges.evaluate(user.id(), checkins.streak(user.id(), user.tzOffset()), false);
        if (!duplicated) audit.track(user.id(), "checkin_created", Map.of("source", "manual"));
        return ResponseEntity.status(duplicated ? HttpStatus.OK : HttpStatus.CREATED).body(Api.ok(M.of()
                .put("checkin", checkin).put("duplicated", duplicated).put("newBadges", newBadges)
                .put("summary", checkins.summary(user.id(), user.tzOffset(), user.weeklyGoal())).map()));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> revoke(@PathVariable String id, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        checkins.revoke(user.id(), id);
        return Api.ok(M.of().put("revoked", true).put("summary", checkins.summary(user.id(), user.tzOffset(), user.weeklyGoal())).map());
    }

    @PutMapping("/goal")
    public Map<String, Object> goal(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        int goal = Req.integer(body.get("weeklyGoal"), "每周目标", 1, 7, true);
        db.update("UPDATE users SET weekly_goal = ? WHERE id = ?", goal, user.id());
        return Api.ok(checkins.summary(user.id(), user.tzOffset(), goal));
    }

    @GetMapping("/day/{date}")
    public Map<String, Object> day(@PathVariable String date, HttpServletRequest request) {
        AuthUser user = Auth.current(request);
        if (!TimeUtil.validDate(date)) throw ApiException.badRequest("日期格式不正确");
        return Api.ok(checkins.day(user.id(), date, user.tzOffset()));
    }
}
