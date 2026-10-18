package com.fitlog.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
public class AuditService {
    private final Db db;
    private final ObjectMapper json;

    public AuditService(Db db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    public void track(String userId, String name, Map<String, Object> props) {
        try {
            db.update("INSERT INTO events(id,user_id,name,props,created_at) VALUES(?,?,?,?,?)",
                    UUID.randomUUID().toString(), userId, name, json.writeValueAsString(props == null ? Map.of() : props), TimeUtil.now());
        } catch (Exception ignored) {
            // 埋点失败不影响主流程
        }
    }

    public void audit(String actorId, String action, String targetType, String targetId, Map<String, Object> detail) {
        try {
            db.update("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), actorId, action, targetType, targetId,
                    detail == null ? null : json.writeValueAsString(detail), TimeUtil.now());
        } catch (Exception ignored) {
            // 审计失败不影响业务
        }
    }

    public void audit(String actorId, String action, String targetType, String targetId) {
        audit(actorId, action, targetType, targetId, null);
    }
}
