package com.fitlog.ops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OpsConfigService {
    private static final List<String> MANAGED = List.of(
            "public_daily_quota", "budget_cap_cny", "official_budget_cny", "official_storage_gb",
            "official_traffic_alert_gb", "official_review_mode", "test_account_enabled", "budget_alert_threshold",
            "community_visible", "public_listing_enabled", "brand_watermark_text", "watermark_default_enabled",
            "daily_upload_mb", "max_file_mb", "review_sample_rate", "checkin_backfill_hours", "deletion_cooling_days"
    );

    private final Db db;
    private final OpsAuditService audit;

    public OpsConfigService(Db db, OpsAuditService audit) {
        this.db = db;
        this.audit = audit;
    }

    public Map<String, Object> list() {
        List<Map<String, Object>> items = db.all("SELECT * FROM app_settings ORDER BY risk_level DESC, setting_key").stream()
                .filter(row -> MANAGED.contains(Db.str(row, "setting_key")))
                .map(this::dto).toList();
        List<Map<String, Object>> features = db.all("SELECT * FROM app_settings WHERE setting_key IN ('community_visible','public_listing_enabled')")
                .stream().map(row -> M.of().put("key", Db.str(row, "setting_key")).put("value", Db.str(row, "value"))
                        .put("webKey", Db.str(row, "setting_key") + "_web").put("mpKey", Db.str(row, "setting_key") + "_mp")
                        .put("web", setting(Db.str(row, "setting_key") + "_web", Db.str(row, "value")))
                        .put("mp", setting(Db.str(row, "setting_key") + "_mp", Db.str(row, "value"))).map()).toList();
        return M.of().put("items", items)
                .put("groups", groups(items))
                .put("features", features)
                .put("acks", db.all("SELECT JSON_UNQUOTE(JSON_EXTRACT(props,'$.config_key')) AS config_key, COUNT(*) AS n FROM events WHERE name='config_effective_ack' GROUP BY config_key"))
                .map();
    }

    public Map<String, Object> detail(String key) {
        Map<String, Object> row = db.one("SELECT * FROM app_settings WHERE setting_key = ?", key);
        if (row == null) throw ApiException.notFound("配置项不存在");
        Map<String, Object> result = dto(row);
        result.put("history", history(key));
        return result;
    }

    public List<Map<String, Object>> history(String key) {
        return db.all("SELECT * FROM config_change_logs WHERE config_key = ? ORDER BY created_at DESC LIMIT 50", key)
                .stream().map(row -> M.of().put("id", Db.str(row, "id")).put("oldValue", Db.str(row, "old_value"))
                        .put("newValue", Db.str(row, "new_value")).put("riskLevel", Db.str(row, "risk_level"))
                        .put("reason", Db.str(row, "reason")).put("operatorId", Db.str(row, "operator_id"))
                        .put("reviewerId", Db.str(row, "reviewer_id")).put("status", Db.str(row, "status"))
                        .put("effectiveAt", Db.str(row, "effective_at")).put("createdAt", Db.str(row, "created_at")).map()).toList();
    }

    @Transactional
    public Map<String, Object> update(String adminId, String key, Map<String, Object> body) {
        Map<String, Object> row = db.one("SELECT * FROM app_settings WHERE setting_key = ?", key);
        if (row == null) throw ApiException.notFound("配置项不存在");
        String value = body.get("value") == null ? "" : String.valueOf(body.get("value")).trim();
        validate(key, value);
        String risk = Db.str(row, "risk_level", "mid");
        String reason = body.get("reason") == null ? "" : String.valueOf(body.get("reason")).trim();
        if (reason.length() < 5) throw ApiException.badRequest("请填写至少 5 个字的变更原因");
        if (!Boolean.TRUE.equals(body.get("confirm"))) throw ApiException.badRequest("请二次确认本次配置变更");
        String oldValue = Db.str(row, "value");
        String now = TimeUtil.now();
        db.update("UPDATE app_settings SET value=?, updated_by=?, updated_at=? WHERE setting_key=?", value, adminId, now, key);
        String logId = UUID.randomUUID().toString();
        db.update("""
                INSERT INTO config_change_logs(id,config_key,old_value,new_value,risk_level,reason,operator_id,reviewer_id,effective_at,status,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,'effective',?)
                """, logId, key, oldValue, value, risk, reason, adminId, adminId, now, now);
        audit.log(adminId, "adm_config_change", "config", key, Map.of("value", oldValue), Map.of("value", value),
                "risk=" + risk + "; " + reason);
        return detail(key);
    }

    public Map<String, Object> rollback(String adminId, String key, Map<String, Object> body) {
        Map<String, Object> row = db.one("SELECT * FROM app_settings WHERE setting_key = ?", key);
        if (row == null) throw ApiException.notFound("配置项不存在");
        Map<String, Object> target = db.one("SELECT * FROM config_change_logs WHERE config_key = ? AND id = ?", key,
                String.valueOf(body.get("logId")));
        if (target == null) throw ApiException.notFound("变更记录不存在");
        body.put("value", Db.str(target, "old_value"));
        if (body.get("reason") == null) body.put("reason", "回滚到 " + Db.str(target, "old_value"));
        body.put("confirm", true);
        return update(adminId, key, body);
    }

    public Map<String, Object> features(String adminId, Map<String, Object> body) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (String base : List.of("community_visible", "public_listing_enabled")) {
            for (String end : List.of("web", "mp")) {
                String key = base + "_" + end;
                String value = body.get(key) == null ? null : String.valueOf(body.get(key));
                if (value != null) {
                    db.update("""
                            INSERT INTO app_settings(setting_key,value,risk_level,description,updated_by,updated_at)
                            VALUES(?,?,'mid','分端 feature flag',?,?)
                            ON DUPLICATE KEY UPDATE value=VALUES(value), updated_by=VALUES(updated_by), updated_at=VALUES(updated_at)
                            """, key, value, adminId, TimeUtil.now());
                    audit.log(adminId, "adm_feature_change", "config", key, null, Map.of("value", value), "分端开关");
                }
                result.add(M.of().put("key", key).put("value", setting(key, setting(base, "0"))).map());
            }
        }
        return M.of().put("items", result).map();
    }

    private void validate(String key, String value) {
        if (value.isBlank()) throw ApiException.badRequest("配置值不能为空");
        switch (key) {
            case "public_daily_quota" -> range(key, value, 0, 500);
            case "budget_cap_cny", "official_budget_cny" -> rangeDouble(key, value, 1, 100000);
            case "official_storage_gb" -> range(key, value, 1, 1000);
            case "official_traffic_alert_gb", "budget_alert_threshold" -> {
                if (!value.matches("\\d+\\/\\d+")) throw ApiException.badRequest("请使用 40/45 这样的阈值格式");
            }
            case "official_review_mode" -> {
                if (!List.of("single", "dual").contains(value)) throw ApiException.badRequest("复核模式必须是 single 或 dual");
            }
            case "test_account_enabled", "community_visible", "public_listing_enabled", "watermark_default_enabled" -> {
                if (!List.of("0", "1", "true", "false").contains(value)) throw ApiException.badRequest("开关只接受 0/1");
            }
            case "daily_upload_mb" -> range(key, value, 1, 10000);
            case "max_file_mb" -> range(key, value, 1, 1000);
            case "review_sample_rate" -> range(key, value, 0, 100);
            case "checkin_backfill_hours" -> range(key, value, 0, 168);
            case "deletion_cooling_days" -> range(key, value, 0, 90);
            default -> {
                if (value.length() > 300) throw ApiException.badRequest("配置值过长");
            }
        }
    }

    private void range(String key, String value, int min, int max) {
        try {
            int number = Integer.parseInt(value);
            if (number < min || number > max) throw ApiException.badRequest(key + " 必须在 " + min + "-" + max);
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(key + " 必须是整数");
        }
    }

    private void rangeDouble(String key, String value, double min, double max) {
        try {
            double number = Double.parseDouble(value);
            if (number < min || number > max) throw ApiException.badRequest(key + " 必须在 " + min + "-" + max);
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(key + " 必须是数字");
        }
    }

    private Map<String, Object> dto(Map<String, Object> row) {
        String key = Db.str(row, "setting_key");
        return M.of().put("key", key).put("value", Db.str(row, "value"))
                .put("defaultValue", Db.str(row, "default_value", ""))
                .put("riskLevel", Db.str(row, "risk_level", "mid"))
                .put("description", Db.str(row, "description", ""))
                .put("refPrd", Db.str(row, "ref_prd", ""))
                .put("group", group(key)).put("updatedBy", Db.str(row, "updated_by"))
                .put("updatedAt", Db.str(row, "updated_at"))
                .put("valueType", valueType(key)).map();
    }

    private List<Map<String, Object>> groups(List<Map<String, Object>> items) {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (String group : List.of("quota", "budget", "official", "review", "feature", "media", "checkin", "account")) {
            List<Map<String, Object>> rows = items.stream().filter(item -> group.equals(item.get("group"))).toList();
            if (!rows.isEmpty()) groups.add(M.of().put("key", group).put("label", groupLabel(group)).put("items", rows).map());
        }
        return groups;
    }

    private String group(String key) {
        if (key.contains("quota") || key.contains("名额")) return "quota";
        if (key.contains("budget")) return "budget";
        if (key.startsWith("official")) return "official";
        if (key.contains("review") || key.contains("复核")) return "review";
        if (key.contains("community") || key.contains("listing") || key.contains("watermark")) return "feature";
        if (key.contains("upload") || key.contains("file") || key.contains("max_")) return "media";
        if (key.contains("checkin")) return "checkin";
        return "account";
    }

    private String groupLabel(String group) {
        return switch (group) {
            case "quota" -> "名额与审核负荷";
            case "budget" -> "预算与告警";
            case "official" -> "官方内容";
            case "review" -> "复核与抽查";
            case "feature" -> "Feature Flag";
            case "media" -> "媒体与上传";
            case "checkin" -> "打卡与账号";
            default -> "其他";
        };
    }

    private String valueType(String key) {
        if (key.contains("mode") || key.contains("watermark_text")) return "string";
        if (key.contains("enabled") || key.contains("visible") || key.contains("listing")) return "boolean";
        if (key.contains("threshold") || key.contains("alert_gb")) return "range";
        if (key.contains("_cny")) return "money";
        return "number";
    }

    private String setting(String key, String fallback) {
        Map<String, Object> row = db.one("SELECT value FROM app_settings WHERE setting_key = ?", key);
        return row == null ? fallback : Db.str(row, "value", fallback);
    }
}
