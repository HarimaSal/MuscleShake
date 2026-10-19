package com.fitlog.ops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.Db;
import com.fitlog.common.TimeUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;
import java.util.UUID;

@Service
public class OpsAuditService {
    private final Db db;
    private final ObjectMapper json;

    public OpsAuditService(Db db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    public void log(String adminId, String action, String targetType, String targetId, Object before, Object after, String reason) {
        String ip = null;
        String ua = null;
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest request = attrs.getRequest();
            String forwarded = request.getHeader("X-Forwarded-For");
            ip = forwarded == null ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
            String agent = request.getHeader("User-Agent");
            ua = agent == null ? null : agent.substring(0, Math.min(agent.length(), 280));
        }
        db.update("""
                INSERT INTO audit_logs(id,actor_id,actor_type,action,target_type,target_id,detail,before_json,after_json,reason,ip,ua,created_at)
                VALUES(?,?,'admin',?,?,?,?,?,?,?,?,?,?)
                """,
                UUID.randomUUID().toString(), adminId, action, targetType, targetId, reason == null ? action : reason,
                stringify(before), stringify(after), reason, ip, ua, TimeUtil.now());
    }

    private String stringify(Object value) {
        if (value == null) return null;
        if (value instanceof String text) return text;
        try {
            return json.writeValueAsString(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    public Map<String, Object> dto(Map<String, Object> row) {
        return com.fitlog.common.M.of()
                .put("id", Db.str(row, "id"))
                .put("actorId", Db.str(row, "actor_id"))
                .put("actorType", Db.str(row, "actor_type"))
                .put("action", Db.str(row, "action"))
                .put("targetType", Db.str(row, "target_type"))
                .put("targetId", Db.str(row, "target_id"))
                .put("detail", Db.str(row, "detail"))
                .put("before", Db.str(row, "before_json"))
                .put("after", Db.str(row, "after_json"))
                .put("reason", Db.str(row, "reason"))
                .put("ip", Db.str(row, "ip"))
                .put("ua", Db.str(row, "ua"))
                .put("createdAt", Db.str(row, "created_at"))
                .map();
    }
}
