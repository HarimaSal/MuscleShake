package com.fitlog.common;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class Settings {
    private final Db db;

    public Settings(Db db) {
        this.db = db;
    }

    public String get(String key, String fallback) {
        Map<String, Object> row = db.one("SELECT value FROM app_settings WHERE setting_key = ?", key);
        return row == null ? fallback : Db.str(row, "value", fallback);
    }

    public int intValue(String key, int fallback) {
        try { return Integer.parseInt(get(key, String.valueOf(fallback))); } catch (Exception e) { return fallback; }
    }

    public double doubleValue(String key, double fallback) {
        try { return Double.parseDouble(get(key, String.valueOf(fallback))); } catch (Exception e) { return fallback; }
    }

    public boolean bool(String key, boolean fallback) {
        String value = get(key, fallback ? "1" : "0");
        return "1".equals(value) || "true".equalsIgnoreCase(value);
    }

    public void set(String key, String value) {
        db.update("INSERT INTO app_settings(setting_key,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)", key, value);
    }
}
