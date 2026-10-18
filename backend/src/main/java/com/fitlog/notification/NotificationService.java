package com.fitlog.notification;

import com.fitlog.auth.AuthUser;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class NotificationService {
    private final Db db;

    public NotificationService(Db db) {
        this.db = db;
    }

    public void notify(String userId, String kind, String title, String body, String dedupeKey) {
        try {
            db.update("INSERT INTO notifications(id,user_id,kind,title,body,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), userId, kind, title, body, dedupeKey, TimeUtil.now());
        } catch (DuplicateKeyException ignored) {
            // 同一提醒每天/每事件只发一次
        }
    }

    public long unread(String userId) {
        return db.count("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId);
    }

    public void markAllRead(String userId) {
        db.update("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", TimeUtil.now(), userId);
    }

    public List<Map<String, Object>> list(String userId) {
        return db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", userId).stream()
                .map(row -> M.of()
                        .put("id", Db.str(row, "id"))
                        .put("kind", Db.str(row, "kind"))
                        .put("title", Db.str(row, "title"))
                        .put("body", Db.str(row, "body"))
                        .put("readAt", Db.str(row, "read_at"))
                        .put("createdAt", Db.str(row, "created_at"))
                        .map())
                .toList();
    }

    public List<Map<String, Object>> generateDueReminders(AuthUser user) {
        LocalDate today = TimeUtil.todayFor(user.tzOffset());
        String date = today.toString();
        if (user.notifyCheckin()) {
            long checkins = db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND local_date = ? AND status = 'active'", user.id(), date);
            LocalTime now = LocalTime.now(java.time.ZoneOffset.ofTotalSeconds(-user.tzOffset() * 60));
            LocalTime reminder = parseTime(user.reminderTime());
            if (checkins == 0 && now.isAfter(reminder)) {
                notify(user.id(), "checkin", "今天还没有打卡", "练完记得记录，有训练记录会自动完成打卡。", "checkin:" + date);
            }
        }
        if (user.notifyWeekly() && today.getDayOfWeek().getValue() == 1) {
            notify(user.id(), "weekly", "新的一周开始了", "上周训练已汇总，可以先看一眼周报再安排本周。", "weekly:" + date);
        }
        return list(user.id());
    }

    private LocalTime parseTime(String value) {
        try {
            return LocalTime.parse(value == null ? "19:30" : value);
        } catch (Exception e) {
            return LocalTime.of(19, 30);
        }
    }
}
