package com.fitlog.common;

import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Req {
    private Req() {}

    public static String str(Object value, String label, int max) {
        if (value == null) throw ApiException.badRequest("请填写" + label);
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) throw ApiException.badRequest("请填写" + label);
        return text.length() > max ? text.substring(0, max) : text;
    }

    public static String optStr(Object value, String label, int max) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) return null;
        return text.length() > max ? text.substring(0, max) : text;
    }

    public static Integer integer(Object value, String label, Integer min, Integer max, boolean required) {
        if (value == null || String.valueOf(value).isBlank()) {
            if (required) throw ApiException.badRequest("请填写" + label);
            return null;
        }
        try {
            double raw = Double.parseDouble(String.valueOf(value));
            int n = (int) raw;
            if (min != null && n < min || max != null && n > max) {
                throw ApiException.badRequest(label + "需在 " + min + "–" + max + " 之间");
            }
            return n;
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(label + "格式不正确");
        }
    }

    public static Double number(Object value, String label, Double min, Double max, boolean required) {
        if (value == null || String.valueOf(value).isBlank()) {
            if (required) throw ApiException.badRequest("请填写" + label);
            return null;
        }
        try {
            double n = Double.parseDouble(String.valueOf(value));
            if (Double.isNaN(n) || Double.isInfinite(n)) throw new NumberFormatException();
            if (min != null && n < min || max != null && n > max) {
                throw ApiException.badRequest(label + "需在 " + min + "–" + max + " 之间");
            }
            return n;
        } catch (NumberFormatException e) {
            throw ApiException.badRequest(label + "格式不正确");
        }
    }

    @SuppressWarnings("unchecked")
    public static <T> T enumOf(Object value, String label, List<T> allowed, T fallback) {
        if (value == null) {
            if (fallback != null) return fallback;
            throw ApiException.badRequest("请选择" + label);
        }
        String text = String.valueOf(value);
        for (T item : allowed) if (String.valueOf(item).equals(text)) return item;
        throw ApiException.badRequest(label + "取值不正确");
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> list(Object value) {
        if (value instanceof List<?> list) return (List<Map<String, Object>>) (List<?>) list;
        return List.of();
    }

    public static boolean bool(Object value, boolean fallback) {
        if (value == null) return fallback;
        if (value instanceof Boolean b) return b;
        String text = String.valueOf(value).toLowerCase(Locale.ROOT);
        return text.equals("1") || text.equals("true") || text.equals("yes");
    }
}
