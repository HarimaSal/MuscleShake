package com.fitlog.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Repository
public class Db {
    private final JdbcTemplate jdbc;

    public Db(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> all(String sql, Object... args) {
        return jdbc.queryForList(sql, args);
    }

    public Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public long count(String sql, Object... args) {
        Map<String, Object> row = one(sql, args);
        return row == null ? 0 : lng(row, "n");
    }

    public int update(String sql, Object... args) {
        return jdbc.update(sql, args);
    }

    public static String str(Map<String, Object> row, String key) {
        if (row == null) return null;
        Object value = row.get(key);
        return value == null ? null : String.valueOf(value);
    }

    public static String str(Map<String, Object> row, String key, String fallback) {
        String value = str(row, key);
        return value == null ? fallback : value;
    }

    public static long lng(Map<String, Object> row, String key) {
        if (row == null) return 0;
        Object value = row.get(key);
        if (value instanceof Number number) return number.longValue();
        if (value == null) return 0;
        try { return Long.parseLong(String.valueOf(value)); } catch (Exception e) { return 0; }
    }

    public static int intVal(Map<String, Object> row, String key) {
        return (int) lng(row, key);
    }

    public static Double dbl(Map<String, Object> row, String key) {
        if (row == null) return null;
        Object value = row.get(key);
        if (value == null) return null;
        if (value instanceof Number number) return number.doubleValue();
        try { return Double.parseDouble(String.valueOf(value)); } catch (Exception e) { return null; }
    }

    public static double dbl(Map<String, Object> row, String key, double fallback) {
        Double value = dbl(row, key);
        return value == null ? fallback : value;
    }

    public static boolean bool(Map<String, Object> row, String key) {
        return lng(row, key) != 0;
    }

    public static String numeric(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal decimal) return decimal.stripTrailingZeros().toPlainString();
        return String.valueOf(value);
    }
}
