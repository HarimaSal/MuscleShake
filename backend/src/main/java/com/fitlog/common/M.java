package com.fitlog.common;

import java.util.LinkedHashMap;
import java.util.Map;

/** 轻量 Map 构造器，保持与前端约定的 camelCase JSON 字段。 */
public class M extends LinkedHashMap<String, Object> {
    public static M of() { return new M(); }
    public M put(String key, Object value) { super.put(key, value); return this; }
    public M add(String key, Object value) { super.put(key, value); return this; }
    public Map<String, Object> map() { return this; }
}
