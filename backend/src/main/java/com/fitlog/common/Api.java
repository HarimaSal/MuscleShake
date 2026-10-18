package com.fitlog.common;

import java.util.Map;

public final class Api {
    private Api() {}

    public static Map<String, Object> ok(Object data) {
        return M.of().put("data", data);
    }
}
