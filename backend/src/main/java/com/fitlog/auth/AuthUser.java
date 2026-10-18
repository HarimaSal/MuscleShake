package com.fitlog.auth;

import com.fitlog.common.Db;

import java.util.Map;

public record AuthUser(
        String id,
        String phone,
        String wechatOpenid,
        String nickname,
        String avatar,
        String role,
        String status,
        String deleteRequestedAt,
        int tzOffset,
        int weeklyGoal,
        String defaultSessionVisibility,
        String defaultPostVisibility,
        boolean notifyCheckin,
        boolean notifyWeekly,
        boolean notifyInteraction,
        String reminderTime,
        String bannedUntil,
        String privacyAcceptedAt,
        String createdAt
) {
    public static AuthUser from(Map<String, Object> row) {
        if (row == null) return null;
        return new AuthUser(
                Db.str(row, "id"),
                Db.str(row, "phone"),
                Db.str(row, "wechat_openid"),
                Db.str(row, "nickname", "训练者"),
                Db.str(row, "avatar"),
                Db.str(row, "role", "user"),
                Db.str(row, "status", "active"),
                Db.str(row, "delete_requested_at"),
                (int) Db.lng(row, "tz_offset"),
                (int) Db.lng(row, "weekly_goal"),
                Db.str(row, "default_session_visibility", "private"),
                Db.str(row, "default_post_visibility", "private"),
                Db.bool(row, "notify_checkin"),
                Db.bool(row, "notify_weekly"),
                Db.bool(row, "notify_interaction"),
                Db.str(row, "reminder_time", "19:30"),
                Db.str(row, "banned_until"),
                Db.str(row, "privacy_accepted_at"),
                Db.str(row, "created_at")
        );
    }

    public boolean isAdmin() {
        return "admin".equals(role);
    }
}
