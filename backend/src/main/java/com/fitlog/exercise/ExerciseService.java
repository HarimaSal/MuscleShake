package com.fitlog.exercise;

import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.TimeUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ExerciseService {
    public static final List<String> MUSCLES = List.of("胸", "背", "腿", "臀", "肩", "手臂", "核心", "有氧", "全身");
    public static final List<String> EQUIPMENTS = List.of("杠铃", "哑铃", "器械", "绳索", "自重", "壶铃", "弹力带", "有氧器械", "其他");
    public static final List<String> TYPES = List.of("strength", "cardio", "stretch");

    private final Db db;

    public ExerciseService(Db db) {
        this.db = db;
    }

    public Map<String, Object> dto(Map<String, Object> row, boolean favorite) {
        String aliases = Db.str(row, "aliases", "");
        String secondary = Db.str(row, "secondary_muscles", "");
        return M.of()
                .put("id", Db.str(row, "id"))
                .put("name", Db.str(row, "name"))
                .put("aliases", aliases.isBlank() ? List.of() : List.of(aliases.split(",")))
                .put("primaryMuscle", Db.str(row, "primary_muscle"))
                .put("secondaryMuscles", secondary.isBlank() ? List.of() : List.of(secondary.split(",")))
                .put("equipment", Db.str(row, "equipment"))
                .put("type", Db.str(row, "type"))
                .put("isBuiltin", Db.bool(row, "is_builtin"))
                .put("isFavorite", favorite)
                .put("createdAt", Db.str(row, "created_at"))
                .map();
    }

    public List<Map<String, Object>> list(String userId, String q, String muscle, String equipment, String type, boolean favorite) {
        StringBuilder sql = new StringBuilder(
                "SELECT e.*, f.user_id AS favorite_id FROM exercises e LEFT JOIN exercise_favorites f ON f.exercise_id = e.id AND f.user_id = ? WHERE e.archived = 0 AND (e.is_builtin = 1 OR e.owner_id = ?)");
        List<Object> args = new ArrayList<>(List.of(userId, userId));
        if (q != null && !q.isBlank()) {
            sql.append(" AND (e.name LIKE ? OR e.aliases LIKE ?)");
            args.add("%" + q + "%");
            args.add("%" + q + "%");
        }
        if (muscle != null && !muscle.isBlank()) {
            sql.append(" AND (e.primary_muscle = ? OR e.secondary_muscles LIKE ?)");
            args.add(muscle);
            args.add("%" + muscle + "%");
        }
        if (equipment != null && !equipment.isBlank()) {
            sql.append(" AND e.equipment = ?");
            args.add(equipment);
        }
        if (type != null && !type.isBlank()) {
            sql.append(" AND e.type = ?");
            args.add(type);
        }
        if (favorite) sql.append(" AND f.user_id IS NOT NULL");
        sql.append(" ORDER BY CASE WHEN f.user_id IS NULL THEN 1 ELSE 0 END, e.is_builtin DESC, e.name LIMIT 500");
        return db.all(sql.toString(), args.toArray()).stream()
                .map(row -> dto(row, Db.str(row, "favorite_id") != null))
                .toList();
    }

    public List<Map<String, Object>> recent(String userId) {
        List<Map<String, Object>> rows = db.all(
                "SELECT e.id, MAX(s.local_date) AS last_date, COUNT(DISTINCT s.id) AS sessions FROM workout_items i JOIN workout_sessions s ON s.id = i.session_id JOIN exercises e ON e.id = i.exercise_id WHERE s.user_id = ? AND s.deleted_at IS NULL AND e.archived = 0 GROUP BY e.id ORDER BY last_date DESC LIMIT 12",
                userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            try {
                Map<String, Object> item = get(userId, Db.str(row, "id"));
                item.put("lastDate", Db.str(row, "last_date"));
                item.put("sessionCount", Db.lng(row, "sessions"));
                out.add(item);
            } catch (Exception ignored) {}
        }
        return out;
    }

    public Map<String, Object> get(String userId, String id) {
        Map<String, Object> row = db.one(
                "SELECT e.*, f.user_id AS favorite_id FROM exercises e LEFT JOIN exercise_favorites f ON f.exercise_id = e.id AND f.user_id = ? WHERE e.id = ? AND (e.is_builtin = 1 OR e.owner_id = ?)",
                userId, id, userId);
        if (row == null) throw ApiException.notFound("动作不存在");
        List<Map<String, Object>> history = db.all(
                "SELECT s.id AS session_id, s.local_date, s.type AS session_type, MAX(ws.weight_kg) AS max_weight, MAX(ws.reps) AS max_reps, SUM(CASE WHEN ws.set_type != 'warmup' THEN ws.weight_kg * ws.reps ELSE 0 END) AS volume, COUNT(ws.id) AS set_count FROM workout_items i JOIN workout_sessions s ON s.id = i.session_id JOIN workout_sets ws ON ws.item_id = i.id WHERE i.exercise_id = ? AND s.user_id = ? AND s.deleted_at IS NULL GROUP BY s.id ORDER BY s.local_date DESC LIMIT 20",
                id, userId).stream().map(h -> M.of()
                .put("sessionId", Db.str(h, "session_id"))
                .put("localDate", Db.str(h, "local_date"))
                .put("sessionType", Db.str(h, "session_type"))
                .put("maxWeight", Db.dbl(h, "max_weight", 0))
                .put("maxReps", Db.lng(h, "max_reps"))
                .put("volume", Metrics.round(Db.dbl(h, "volume", 0), 1))
                .put("setCount", Db.lng(h, "set_count"))
                .map()).toList();
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = history.size() - 1; i >= 0 && trend.size() < 12; i--) {
            Map<String, Object> h = history.get(i);
            Double maxWeight = Db.dbl(h, "maxWeight", 0);
            Long maxReps = Db.lng(h, "maxReps");
            trend.add(M.of()
                    .put("date", Db.str(h, "localDate"))
                    .put("maxWeight", maxWeight)
                    .put("volume", h.get("volume"))
                    .put("estimated1RM", Metrics.estimated1RM(maxWeight, maxReps == null ? null : maxReps.intValue()) == null ? 0 : Metrics.estimated1RM(maxWeight, maxReps.intValue()))
                    .map());
        }
        Map<String, Object> result = M.of();
        result.putAll(dto(row, Db.str(row, "favorite_id") != null));
        result.put("prs", prSummary(userId, id));
        result.put("last", prefill(userId, id, null));
        result.put("history", history);
        result.put("trend", trend);
        return result;
    }

    public Map<String, Object> prefill(String userId, String exerciseId, String excludeSessionId) {
        String sql = "SELECT ws.*, s.local_date FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = ? AND wi.exercise_id = ? AND s.deleted_at IS NULL AND ws.set_type != 'warmup' AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL"
                + (excludeSessionId != null ? " AND s.id != ?" : "")
                + " ORDER BY s.local_date DESC, ws.set_index DESC LIMIT 1";
        Map<String, Object> row = excludeSessionId != null
                ? db.one(sql, userId, exerciseId, excludeSessionId)
                : db.one(sql, userId, exerciseId);
        if (row == null) return null;
        return M.of()
                .put("weightKg", Db.dbl(row, "weight_kg"))
                .put("reps", Db.lng(row, "reps"))
                .put("rpe", Db.dbl(row, "rpe"))
                .put("setType", Db.str(row, "set_type"))
                .put("localDate", Db.str(row, "local_date"))
                .map();
    }

    public Map<String, Object> prSummary(String userId, String exerciseId) {
        List<Map<String, Object>> rows = db.all(
                "SELECT ws.weight_kg, ws.reps, ws.set_type, s.local_date FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = ? AND wi.exercise_id = ? AND s.deleted_at IS NULL",
                userId, exerciseId);
        return Metrics.computePRs(rows);
    }

    public Map<String, Object> create(String userId, Map<String, Object> body) {
        String name = body.get("name") == null ? "" : String.valueOf(body.get("name")).trim();
        if (name.isBlank()) throw ApiException.badRequest("请填写动作名称");
        if (name.length() > 30) throw ApiException.badRequest("动作名称不能超过 30 个字");
        String primary = String.valueOf(body.getOrDefault("primaryMuscle", ""));
        String equipment = String.valueOf(body.getOrDefault("equipment", ""));
        String type = String.valueOf(body.getOrDefault("type", "strength"));
        if (!MUSCLES.contains(primary)) throw ApiException.badRequest("主要肌群取值不正确");
        if (!EQUIPMENTS.contains(equipment)) throw ApiException.badRequest("器械取值不正确");
        if (!TYPES.contains(type)) throw ApiException.badRequest("动作类型取值不正确");
        if (db.count("SELECT COUNT(*) AS n FROM exercises WHERE name = ? AND (owner_id = ? OR is_builtin = 1) AND archived = 0", name, userId) > 0) {
            throw ApiException.conflict("已存在同名动作");
        }
        String id = UUID.randomUUID().toString();
        List<String> aliases = stringList(body.get("aliases"), 20);
        List<String> secondary = stringList(body.get("secondaryMuscles"), 20);
        db.update("INSERT INTO exercises(id,name,aliases,primary_muscle,secondary_muscles,equipment,type,is_builtin,owner_id,archived,created_at) VALUES(?,?,?,?,?,?,?,0,?,0,?)",
                id, name, String.join(",", aliases), primary, String.join(",", secondary), equipment, type, userId, TimeUtil.now());
        return get(userId, id);
    }

    public Map<String, Object> toggleFavorite(String userId, String exerciseId) {
        Map<String, Object> exercise = db.one("SELECT id,is_builtin,owner_id FROM exercises WHERE id = ?", exerciseId);
        if (exercise == null) throw ApiException.notFound("动作不存在");
        if (!Db.bool(exercise, "is_builtin") && !userId.equals(Db.str(exercise, "owner_id"))) throw ApiException.forbidden("无权收藏该动作");
        Map<String, Object> existing = db.one("SELECT 1 FROM exercise_favorites WHERE user_id = ? AND exercise_id = ?", userId, exerciseId);
        if (existing != null) {
            db.update("DELETE FROM exercise_favorites WHERE user_id = ? AND exercise_id = ?", userId, exerciseId);
            return Map.of("favorite", false);
        }
        db.update("INSERT INTO exercise_favorites(user_id,exercise_id,created_at) VALUES(?,?,?)", userId, exerciseId, TimeUtil.now());
        return Map.of("favorite", true);
    }

    @Transactional
    public Map<String, Object> merge(String userId, String sourceId, String targetId) {
        if (sourceId.equals(targetId)) throw ApiException.badRequest("不能合并到自身");
        Map<String, Object> source = db.one("SELECT * FROM exercises WHERE id = ? AND owner_id = ?", sourceId, userId);
        if (source == null) throw ApiException.notFound("自建动作不存在");
        Map<String, Object> target = db.one("SELECT * FROM exercises WHERE id = ? AND archived = 0 AND (is_builtin = 1 OR owner_id = ?)", targetId, userId);
        if (target == null) throw ApiException.notFound("目标动作不存在");
        List<Map<String, Object>> items = db.all("SELECT id, session_id FROM workout_items WHERE exercise_id = ?", sourceId);
        for (Map<String, Object> item : items) {
            Map<String, Object> existing = db.one("SELECT id FROM workout_items WHERE session_id = ? AND exercise_id = ?", Db.str(item, "session_id"), targetId);
            if (existing != null) {
                db.update("UPDATE workout_sets SET item_id = ? WHERE item_id = ?", Db.str(existing, "id"), Db.str(item, "id"));
                db.update("DELETE FROM workout_items WHERE id = ?", Db.str(item, "id"));
            } else {
                db.update("UPDATE workout_items SET exercise_id = ? WHERE id = ?", targetId, Db.str(item, "id"));
            }
        }
        db.update("UPDATE exercises SET archived = 1 WHERE id = ?", sourceId);
        db.update("DELETE FROM exercise_favorites WHERE exercise_id = ?", sourceId);
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id IN (SELECT DISTINCT session_id FROM workout_items)", TimeUtil.now());
        return Map.of("merged", true, "sourceId", sourceId, "targetId", targetId);
    }

    private List<String> stringList(Object raw, int max) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (out.size() >= max) break;
                if (item != null) {
                    String text = String.valueOf(item).trim();
                    if (!text.isEmpty()) out.add(text.length() > max ? text.substring(0, max) : text);
                }
            }
        }
        return out;
    }
}
