package com.fitlog.checkin;

import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.notification.NotificationService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BadgeService {
    public record Badge(String code, String name, String description, String icon) {}

    public static final List<Badge> DEFINITIONS = List.of(
            new Badge("first_session", "初次记录", "完成第一次训练记录", "①"),
            new Badge("sessions_20", "训练 20 次", "累计完成 20 次训练", "②"),
            new Badge("sessions_50", "训练 50 次", "累计完成 50 次训练", "③"),
            new Badge("sessions_100", "训练 100 次", "累计完成 100 次训练", "④"),
            new Badge("streak_7", "坚持 7 天", "连续打卡 7 天", "⑤"),
            new Badge("streak_30", "坚持 30 天", "连续打卡 30 天", "⑥"),
            new Badge("streak_100", "坚持 100 天", "连续打卡 100 天", "⑦"),
            new Badge("first_pr", "首个 PR", "第一次刷新个人纪录", "⑧")
    );

    private final Db db;
    private final NotificationService notifications;

    public BadgeService(Db db, NotificationService notifications) {
        this.db = db;
        this.notifications = notifications;
    }

    public Map<String, String> awarded(String userId) {
        Map<String, String> map = new LinkedHashMap<>();
        for (Map<String, Object> row : db.all("SELECT code, awarded_at FROM badges WHERE user_id = ?", userId)) {
            map.put(Db.str(row, "code"), Db.str(row, "awarded_at"));
        }
        return map;
    }

    public List<Map<String, Object>> list(String userId) {
        Map<String, String> owned = awarded(userId);
        List<Map<String, Object>> items = new ArrayList<>();
        for (Badge badge : DEFINITIONS) {
            items.add(M.of()
                    .put("code", badge.code())
                    .put("name", badge.name())
                    .put("description", badge.description())
                    .put("icon", badge.icon())
                    .put("unlocked", owned.containsKey(badge.code()))
                    .put("awardedAt", owned.get(badge.code()))
                    .map());
        }
        return items;
    }

    public List<Map<String, Object>> evaluate(String userId, int streak, boolean newPr) {
        long sessions = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL", userId);
        List<String> codes = new ArrayList<>();
        if (sessions >= 1) codes.add("first_session");
        if (sessions >= 20) codes.add("sessions_20");
        if (sessions >= 50) codes.add("sessions_50");
        if (sessions >= 100) codes.add("sessions_100");
        if (streak >= 7) codes.add("streak_7");
        if (streak >= 30) codes.add("streak_30");
        if (streak >= 100) codes.add("streak_100");
        if (newPr) codes.add("first_pr");

        Map<String, String> owned = awarded(userId);
        List<Map<String, Object>> unlocked = new ArrayList<>();
        for (String code : codes) {
            if (owned.containsKey(code)) continue;
            try {
                db.update("INSERT INTO badges(user_id,code,awarded_at) VALUES(?,?,?)", userId, code, TimeUtil.now());
                Badge def = DEFINITIONS.stream().filter(b -> b.code().equals(code)).findFirst().orElse(null);
                if (def != null) {
                    unlocked.add(M.of().put("code", def.code()).put("name", def.name()).put("icon", def.icon()).map());
                    notifications.notify(userId, "badge", "获得徽章：" + def.name(), def.description(), "badge:" + code);
                }
            } catch (DuplicateKeyException ignored) {
                // 并发下已发放
            }
        }
        return unlocked;
    }
}
