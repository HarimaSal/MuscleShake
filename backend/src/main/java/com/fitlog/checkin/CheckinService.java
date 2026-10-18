package com.fitlog.checkin;

import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.notification.NotificationService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class CheckinService {
    public static final List<String> TYPES = List.of("strength", "cardio", "stretch", "other");

    private final Db db;
    private final BadgeService badges;
    private final NotificationService notifications;

    public CheckinService(Db db, BadgeService badges, NotificationService notifications) {
        this.db = db;
        this.badges = badges;
        this.notifications = notifications;
    }

    public boolean syncAuto(String userId, String localDate) {
        long active = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL", userId, localDate);
        Map<String, Object> checkin = db.one("SELECT * FROM checkins WHERE user_id = ? AND local_date = ?", userId, localDate);
        if (active > 0) {
            if (checkin == null) {
                db.update("INSERT INTO checkins(id,user_id,local_date,source,status,created_at) VALUES(?,?,?,'auto','active',?)",
                        UUID.randomUUID().toString(), userId, localDate, TimeUtil.now());
            } else if (!"active".equals(Db.str(checkin, "status")) || !"auto".equals(Db.str(checkin, "source"))) {
                db.update("UPDATE checkins SET status = 'active', source = 'auto', revoked_at = NULL WHERE id = ?", Db.str(checkin, "id"));
            }
            return true;
        }
        if (checkin != null && "active".equals(Db.str(checkin, "status")) && "auto".equals(Db.str(checkin, "source"))) {
            db.update("UPDATE checkins SET status = 'revoked', revoked_at = ? WHERE id = ?", TimeUtil.now(), Db.str(checkin, "id"));
        }
        return false;
    }

    public int streak(String userId, int tzOffset) {
        String today = TimeUtil.todayForString(tzOffset);
        List<Map<String, Object>> rows = db.all("SELECT local_date FROM checkins WHERE user_id = ? AND status = 'active' ORDER BY local_date DESC", userId);
        if (rows.isEmpty()) return 0;
        String latest = Db.str(rows.get(0), "local_date");
        if (TimeUtil.diffDays(today, latest) > 1) return 0;
        Set<String> dates = new HashSet<>();
        for (Map<String, Object> row : rows) dates.add(Db.str(row, "local_date"));
        int count = 0;
        String cursor = latest;
        while (dates.contains(cursor)) {
            count++;
            cursor = TimeUtil.addDays(cursor, -1);
        }
        return count;
    }

    public Map<String, Object> weekly(String userId, int tzOffset, int goal) {
        String today = TimeUtil.todayForString(tzOffset);
        String weekStart = TimeUtil.startOfWeek(today);
        long done = db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND status = 'active' AND local_date >= ? AND local_date <= ?",
                userId, weekStart, TimeUtil.addDays(weekStart, 6));
        return M.of().put("weekStart", weekStart).put("done", done).put("goal", goal).put("achieved", done >= goal).map();
    }

    public Map<String, Object> summary(String userId, int tzOffset, int goal) {
        return M.of()
                .put("streak", streak(userId, tzOffset))
                .put("weekly", weekly(userId, tzOffset, goal))
                .put("badges", badges.list(userId))
                .map();
    }

    public Map<String, Object> monthView(String userId, String month, int tzOffset) {
        List<Map<String, Object>> checkins = db.all("SELECT * FROM checkins WHERE user_id = ? AND local_date LIKE ? ORDER BY local_date", userId, month + "-%");
        List<Map<String, Object>> counts = db.all(
                "SELECT local_date, COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND local_date LIKE ? AND deleted_at IS NULL GROUP BY local_date",
                userId, month + "-%");
        String today = TimeUtil.todayForString(tzOffset);
        List<Map<String, Object>> days = new ArrayList<>();
        for (String date : TimeUtil.monthDays(month)) {
            Map<String, Object> active = null;
            for (Map<String, Object> row : checkins) {
                if (date.equals(Db.str(row, "local_date")) && "active".equals(Db.str(row, "status"))) {
                    active = row;
                    break;
                }
            }
            long count = 0;
            for (Map<String, Object> row : counts) if (date.equals(Db.str(row, "local_date"))) count = Db.lng(row, "n");
            days.add(M.of()
                    .put("date", date)
                    .put("status", active == null ? "none" : ("auto".equals(Db.str(active, "source")) ? "auto" : "manual"))
                    .put("isToday", date.equals(today))
                    .put("isFuture", date.compareTo(today) > 0)
                    .put("sessionCount", count)
                    .put("checkin", active == null ? null : M.of()
                            .put("id", Db.str(active, "id"))
                            .put("source", Db.str(active, "source"))
                            .put("workoutType", Db.str(active, "workout_type"))
                            .put("durationMin", Db.lng(active, "duration_min"))
                            .put("note", Db.str(active, "note"))
                            .map())
                    .map());
        }
        return M.of().put("month", month).put("days", days).put("summary", summary(userId, tzOffset, 3)).map();
    }

    public Map<String, Object> manual(String userId, int tzOffset, Map<String, Object> body) {
        String today = TimeUtil.todayForString(tzOffset);
        String date = body.get("localDate") == null ? today : String.valueOf(body.get("localDate"));
        if (!TimeUtil.validDate(date)) throw ApiException.badRequest("归属日期格式不正确");
        if (date.compareTo(today) > 0) throw ApiException.badRequest("不能为未来日期打卡");
        if (TimeUtil.diffDays(today, date) > 1) throw ApiException.badRequest("只能补记 48 小时内的打卡");
        String workoutType = body.get("workoutType") == null ? "strength" : String.valueOf(body.get("workoutType"));
        if (!TYPES.contains(workoutType)) throw ApiException.badRequest("训练类型取值不正确");
        int duration = body.get("durationMin") == null ? 30 : Integer.parseInt(String.valueOf(body.get("durationMin")));
        if (duration < 1 || duration > 1440) throw ApiException.badRequest("时长需在 1–1440 分钟之间");
        String note = body.get("note") == null ? null : String.valueOf(body.get("note"));

        Map<String, Object> existing = db.one("SELECT * FROM checkins WHERE user_id = ? AND local_date = ?", userId, date);
        if (existing != null && "active".equals(Db.str(existing, "status"))) {
            if ("auto".equals(Db.str(existing, "source"))) throw ApiException.badRequest("当日已有训练记录，已自动打卡");
            existing.put("duplicated", true);
            return existing;
        }
        if (existing != null) {
            db.update("UPDATE checkins SET source = 'manual', workout_type = ?, duration_min = ?, note = ?, status = 'active', revoked_at = NULL, created_at = ? WHERE id = ?",
                    workoutType, duration, note, TimeUtil.now(), Db.str(existing, "id"));
            return db.one("SELECT * FROM checkins WHERE id = ?", Db.str(existing, "id"));
        }
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO checkins(id,user_id,local_date,source,workout_type,duration_min,note,status,created_at) VALUES(?,?,?,'manual',?,?,?, 'active',?)",
                id, userId, date, workoutType, duration, note, TimeUtil.now());
        return db.one("SELECT * FROM checkins WHERE id = ?", id);
    }

    public Map<String, Object> checkinDto(Map<String, Object> row) {
        if (row == null) return null;
        return M.of()
                .put("id", Db.str(row, "id"))
                .put("source", Db.str(row, "source"))
                .put("workoutType", Db.str(row, "workout_type"))
                .put("durationMin", Db.lng(row, "duration_min"))
                .put("note", Db.str(row, "note"))
                .map();
    }

    public void revoke(String userId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM checkins WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.badRequest("打卡记录不存在");
        if (!"manual".equals(Db.str(row, "source"))) throw ApiException.badRequest("自动打卡不可手动撤销，请删除当日训练记录");
        db.update("UPDATE checkins SET status = 'revoked', revoked_at = ? WHERE id = ?", TimeUtil.now(), id);
    }

    public Map<String, Object> day(String userId, String date, int tzOffset) {
        Map<String, Object> checkin = db.one("SELECT * FROM checkins WHERE user_id = ? AND local_date = ? AND status = 'active'", userId, date);
        List<Map<String, Object>> sessions = db.all(
                "SELECT id,type,title,local_date,duration_sec,volume_kg FROM workout_sessions WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL",
                userId, date).stream().map(row -> M.of()
                .put("id", Db.str(row, "id"))
                .put("type", Db.str(row, "type"))
                .put("title", Db.str(row, "title"))
                .put("localDate", Db.str(row, "local_date"))
                .put("durationSec", Db.lng(row, "duration_sec"))
                .put("volumeKg", Db.dbl(row, "volume_kg", 0))
                .map()).toList();
        return M.of().put("date", date).put("checkin", checkinDto(checkin)).put("sessions", sessions)
                .put("streak", streak(userId, tzOffset)).map();
    }
}
