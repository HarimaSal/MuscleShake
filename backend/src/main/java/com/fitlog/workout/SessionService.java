package com.fitlog.workout;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.checkin.CheckinService;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.Req;
import com.fitlog.common.TimeUtil;
import com.fitlog.exercise.ExerciseService;
import com.fitlog.media.MediaService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class SessionService {
    public static final List<String> SESSION_TYPES = List.of("strength", "cardio", "stretch", "other");
    public static final List<String> SET_TYPES = List.of("normal", "warmup", "drop", "superset");
    public static final List<String> VISIBILITIES = List.of("private", "unlisted", "public");

    private final Db db;
    private final ExerciseService exercises;
    private final CheckinService checkins;
    private final MediaService media;
    private final ObjectMapper json;

    public SessionService(Db db, ExerciseService exercises, CheckinService checkins, MediaService media, ObjectMapper json) {
        this.db = db;
        this.exercises = exercises;
        this.checkins = checkins;
        this.media = media;
        this.json = json;
    }

    public Map<String, Object> owned(String userId, String id, boolean includeDeleted) {
        Map<String, Object> row = db.one("SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("训练记录不存在");
        if (!includeDeleted && Db.str(row, "deleted_at") != null) throw ApiException.notFound("训练记录已删除");
        return row;
    }

    public Map<String, Object> summary(Map<String, Object> row) {
        long items = db.count("SELECT COUNT(*) AS n FROM workout_items WHERE session_id = ?", Db.str(row, "id"));
        long sets = db.count("SELECT COUNT(*) AS n FROM workout_sets WHERE session_id = ?", Db.str(row, "id"));
        long mediaCount = db.count("SELECT COUNT(*) AS n FROM session_media WHERE session_id = ?", Db.str(row, "id"));
        List<String> names = db.all("SELECT e.name FROM workout_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.session_id = ? ORDER BY i.sort_order", Db.str(row, "id"))
                .stream().map(r -> Db.str(r, "name")).toList();
        return M.of()
                .put("id", Db.str(row, "id"))
                .put("type", Db.str(row, "type"))
                .put("title", Db.str(row, "title"))
                .put("startedAt", Db.str(row, "started_at"))
                .put("endedAt", Db.str(row, "ended_at"))
                .put("localDate", Db.str(row, "local_date"))
                .put("tzOffset", Db.lng(row, "tz_offset"))
                .put("durationSec", Db.lng(row, "duration_sec"))
                .put("volumeKg", Metrics.round(Db.dbl(row, "volume_kg", 0), 1))
                .put("notes", Db.str(row, "notes"))
                .put("feeling", Db.dbl(row, "feeling") == null ? null : Db.lng(row, "feeling"))
                .put("source", Db.str(row, "source"))
                .put("visibility", Db.str(row, "visibility"))
                .put("itemCount", items)
                .put("setCount", sets)
                .put("mediaCount", mediaCount)
                .put("exerciseNames", names)
                .put("deletedAt", Db.str(row, "deleted_at"))
                .put("createdAt", Db.str(row, "created_at"))
                .put("updatedAt", Db.str(row, "updated_at"))
                .map();
    }

    public Map<String, Object> setDto(Map<String, Object> row) {
        return M.of()
                .put("id", Db.str(row, "id"))
                .put("setIndex", Db.lng(row, "set_index"))
                .put("weightKg", Db.dbl(row, "weight_kg"))
                .put("reps", Db.dbl(row, "reps") == null ? null : Db.lng(row, "reps"))
                .put("durationSec", Db.dbl(row, "duration_sec") == null ? null : Db.lng(row, "duration_sec"))
                .put("distanceKm", Db.dbl(row, "distance_km"))
                .put("avgHr", Db.dbl(row, "avg_hr") == null ? null : Db.lng(row, "avg_hr"))
                .put("rpe", Db.dbl(row, "rpe"))
                .put("setType", Db.str(row, "set_type"))
                .put("note", Db.str(row, "note"))
                .put("clientOpId", Db.str(row, "client_op_id"))
                .put("estimated1RM", Metrics.estimated1RM(Db.dbl(row, "weight_kg"), (int) Db.lng(row, "reps")))
                .map();
    }

    public Map<String, Object> detail(String userId, String id, boolean includeDeleted) {
        Map<String, Object> row = owned(userId, id, includeDeleted);
        List<Map<String, Object>> items = db.all(
                "SELECT i.*, e.name AS exercise_name, e.primary_muscle, e.equipment, e.type AS exercise_type, e.aliases FROM workout_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.session_id = ? ORDER BY i.sort_order",
                id).stream().map(item -> {
            List<Map<String, Object>> sets = db.all("SELECT * FROM workout_sets WHERE item_id = ? ORDER BY set_index", Db.str(item, "id"))
                    .stream().map(this::setDto).toList();
            double volume = Metrics.totalVolume(db.all("SELECT weight_kg,reps,set_type FROM workout_sets WHERE item_id = ?", Db.str(item, "id")));
            return M.of()
                    .put("id", Db.str(item, "id"))
                    .put("exerciseId", Db.str(item, "exercise_id"))
                    .put("exerciseName", Db.str(item, "exercise_name"))
                    .put("primaryMuscle", Db.str(item, "primary_muscle"))
                    .put("equipment", Db.str(item, "equipment"))
                    .put("exerciseType", Db.str(item, "exercise_type"))
                    .put("aliases", Db.str(item, "aliases"))
                    .put("note", Db.str(item, "note"))
                    .put("sortOrder", Db.lng(item, "sort_order"))
                    .put("sets", sets)
                    .put("volume", volume)
                    .put("last", exercises.prefill(userId, Db.str(item, "exercise_id"), id))
                    .put("prs", exercises.prSummary(userId, Db.str(item, "exercise_id")))
                    .map();
        }).toList();
        Map<String, Object> result = summary(row);
        result.put("items", items);
        result.put("media", media.listForSession(id));
        result.put("prs", detectNewPRs(userId, id));
        return result;
    }

    public double recomputeVolume(String sessionId) {
        List<Map<String, Object>> sets = db.all("SELECT weight_kg,reps,set_type FROM workout_sets WHERE session_id = ?", sessionId);
        double volume = Metrics.totalVolume(sets);
        db.update("UPDATE workout_sessions SET volume_kg = ? WHERE id = ?", volume, sessionId);
        return volume;
    }

    @Transactional
    public Map<String, Object> create(String userId, Map<String, Object> input) {
        String type = Req.enumOf(input.get("type"), "训练类型", SESSION_TYPES, "strength");
        String startedAt = input.get("startedAt") == null ? null : String.valueOf(input.get("startedAt"));
        if (startedAt == null) throw ApiException.badRequest("请填写有效的开始时间");
        String normalizedStart = TimeUtil.normalizeIso(startedAt);
        int tzOffset = input.get("tzOffset") == null ? -480 : Integer.parseInt(String.valueOf(input.get("tzOffset")));
        String computed = TimeUtil.localDateOf(normalizedStart, tzOffset);
        String localDate = input.get("localDate") == null ? computed : String.valueOf(input.get("localDate"));
        if (!TimeUtil.validDate(localDate)) throw ApiException.badRequest("归属日期格式不正确");
        if (Math.abs(TimeUtil.diffDays(localDate, computed)) > 1) throw ApiException.badRequest("归属日期最多可前后调整 1 天");
        int duration = input.get("durationSec") != null ? Integer.parseInt(String.valueOf(input.get("durationSec")))
                : (int) Math.max(0, Math.round(((input.get("endedAt") == null ? System.currentTimeMillis() : Instant.parse(TimeUtil.normalizeIso(String.valueOf(input.get("endedAt")))).toEpochMilli()) - Instant.parse(normalizedStart).toEpochMilli()) / 1000.0));
        String clientOpId = input.get("clientOpId") == null ? null : String.valueOf(input.get("clientOpId"));
        if (clientOpId != null) {
            Map<String, Object> existing = db.one("SELECT * FROM workout_sessions WHERE user_id = ? AND client_op_id = ?", userId, clientOpId);
            if (existing != null) return M.of().put("session", detail(userId, Db.str(existing, "id"), true)).put("prs", List.of()).put("duplicated", true).map();
        }
        String title = input.get("title") == null ? null : String.valueOf(input.get("title"));
        if (title != null && title.length() > 60) throw ApiException.badRequest("标题不能超过 60 个字");
        String notes = input.get("notes") == null ? null : String.valueOf(input.get("notes"));
        Integer feeling = input.get("feeling") == null ? null : Integer.parseInt(String.valueOf(input.get("feeling")));
        if (feeling != null && (feeling < 1 || feeling > 5)) throw ApiException.badRequest("体感评分需在 1–5 之间");
        String visibility = Req.enumOf(input.get("visibility"), "可见性", VISIBILITIES, "private");
        String id = UUID.randomUUID().toString();
        String now = TimeUtil.now();
        db.update("INSERT INTO workout_sessions(id,user_id,type,title,started_at,ended_at,local_date,tz_offset,duration_sec,volume_kg,notes,feeling,source,visibility,client_op_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)",
                id, userId, type, title, normalizedStart,
                input.get("endedAt") == null ? null : TimeUtil.normalizeIso(String.valueOf(input.get("endedAt"))),
                localDate, tzOffset, duration, notes, feeling, input.get("source") == null ? "manual" : String.valueOf(input.get("source")),
                visibility, clientOpId, now, now);
        List<Map<String, Object>> items = Req.list(input.get("items"));
        for (int i = 0; i < items.size(); i++) {
            Map<String, Object> item = items.get(i);
            String exerciseId = String.valueOf(item.get("exerciseId"));
            Map<String, Object> exercise = assertExercise(userId, exerciseId);
            String itemId = UUID.randomUUID().toString();
            db.update("INSERT INTO workout_items(id,session_id,exercise_id,sort_order,note,created_at) VALUES(?,?,?,?,?,?)",
                    itemId, id, exerciseId, i, item.get("note") == null ? null : String.valueOf(item.get("note")), now);
            List<Map<String, Object>> sets = Req.list(item.get("sets"));
            for (int j = 0; j < sets.size(); j++) {
                insertSet(id, itemId, normalizeSet(sets.get(j), Db.str(exercise, "type"), j), false);
            }
        }
        recomputeVolume(id);
        List<Map<String, Object>> prs = detectNewPRs(userId, id);
        checkins.syncAuto(userId, localDate);
        return M.of().put("session", detail(userId, id, false)).put("prs", prs).put("duplicated", false).map();
    }

    public Map<String, Object> update(String userId, String id, Map<String, Object> input) {
        Map<String, Object> session = owned(userId, id, false);
        String type = input.get("type") == null ? Db.str(session, "type") : Req.enumOf(input.get("type"), "训练类型", SESSION_TYPES, Db.str(session, "type"));
        int tz = input.get("tzOffset") == null ? (int) Db.lng(session, "tz_offset") : Integer.parseInt(String.valueOf(input.get("tzOffset")));
        String startedAt = input.get("startedAt") == null ? Db.str(session, "started_at") : TimeUtil.normalizeIso(String.valueOf(input.get("startedAt")));
        String endedAt = input.get("endedAt") == null ? Db.str(session, "ended_at") : TimeUtil.normalizeIso(String.valueOf(input.get("endedAt")));
        String localDate = input.get("localDate") == null ? Db.str(session, "local_date") : String.valueOf(input.get("localDate"));
        if (input.get("startedAt") != null || input.get("localDate") != null) {
            String computed = TimeUtil.localDateOf(startedAt, tz);
            if (Math.abs(TimeUtil.diffDays(localDate, computed)) > 1) throw ApiException.badRequest("归属日期最多可前后调整 1 天");
        }
        int duration = input.get("durationSec") == null ? (int) Db.lng(session, "duration_sec") : Integer.parseInt(String.valueOf(input.get("durationSec")));
        if (duration < 0 || duration > 86400) throw ApiException.badRequest("请输入 0–24 小时之间的时长");
        Integer feeling = input.get("feeling") == null ? (Db.dbl(session, "feeling") == null ? null : (int) Db.lng(session, "feeling"))
                : Integer.parseInt(String.valueOf(input.get("feeling")));
        String visibility = input.get("visibility") == null ? Db.str(session, "visibility") : Req.enumOf(input.get("visibility"), "可见性", VISIBILITIES, Db.str(session, "visibility"));
        String title = input.get("title") == null ? Db.str(session, "title") : (String.valueOf(input.get("title")).isBlank() ? null : String.valueOf(input.get("title")));
        String notes = input.get("notes") == null ? Db.str(session, "notes") : (String.valueOf(input.get("notes")).isBlank() ? null : String.valueOf(input.get("notes")));
        db.update("UPDATE workout_sessions SET type=?,title=?,started_at=?,ended_at=?,local_date=?,tz_offset=?,duration_sec=?,notes=?,feeling=?,visibility=?,updated_at=? WHERE id=?",
                type, title, startedAt, endedAt, localDate, tz, duration, notes, feeling, visibility, TimeUtil.now(), id);
        recomputeVolume(id);
        checkins.syncAuto(userId, Db.str(session, "local_date"));
        checkins.syncAuto(userId, localDate);
        return detail(userId, id, false);
    }

    public Map<String, Object> quick(String userId, int tzOffset, Map<String, Object> body) {
        String type = Req.enumOf(body.get("type"), "训练类型", SESSION_TYPES, "strength");
        int minutes = Req.integer(body.get("durationMin"), "时长", 1, 1440, true);
        String localDate = body.get("localDate") == null ? TimeUtil.todayForString(tzOffset) : String.valueOf(body.get("localDate"));
        Map<String, Object> input = new java.util.HashMap<>();
        input.put("type", type);
        input.put("title", "快速补记");
        input.put("startedAt", localDate + "T12:00:00.000Z");
        input.put("localDate", localDate);
        input.put("tzOffset", tzOffset);
        input.put("durationSec", minutes * 60);
        input.put("notes", body.get("note") == null ? null : String.valueOf(body.get("note")));
        input.put("source", "quick");
        input.put("items", List.of());
        return create(userId, input);
    }

    @Transactional
    public Map<String, Object> delete(String userId, String id) {
        Map<String, Object> session = owned(userId, id, false);
        db.update("UPDATE workout_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?", TimeUtil.now(), TimeUtil.now(), id);
        checkins.syncAuto(userId, Db.str(session, "local_date"));
        return M.of().put("deleted", true).put("recoverUntil", TimeUtil.ISO_MS.format(Instant.now().plusSeconds(7 * 86400))).map();
    }

    public Map<String, Object> restore(String userId, String id) {
        Map<String, Object> session = owned(userId, id, true);
        if (Db.str(session, "deleted_at") == null) return detail(userId, id, false);
        db.update("UPDATE workout_sessions SET deleted_at = NULL, updated_at = ? WHERE id = ?", TimeUtil.now(), id);
        checkins.syncAuto(userId, Db.str(session, "local_date"));
        return detail(userId, id, false);
    }

    public Map<String, Object> purge(String userId, String id) {
        owned(userId, id, true);
        db.update("DELETE FROM workout_sessions WHERE id = ? AND user_id = ?", id, userId);
        return Map.of("purged", true);
    }

    public Map<String, Object> list(String userId, int page, int pageSize, String type, String month, String q) {
        page = Math.max(1, page);
        pageSize = Math.min(100, Math.max(1, pageSize));
        StringBuilder where = new StringBuilder("s.user_id = ? AND s.deleted_at IS NULL");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if (type != null && !type.isBlank() && !"all".equals(type)) {
            where.append(" AND s.type = ?");
            args.add(type);
        }
        if (month != null && !month.isBlank()) {
            where.append(" AND s.local_date LIKE ?");
            args.add(month + "-%");
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (s.title LIKE ? OR s.notes LIKE ? OR EXISTS (SELECT 1 FROM workout_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.session_id = s.id AND e.name LIKE ?))");
            String like = "%" + q + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        long total = db.count("SELECT COUNT(*) AS n FROM workout_sessions s WHERE " + where, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageSize);
        pageArgs.add((page - 1) * pageSize);
        List<Map<String, Object>> items = db.all("SELECT s.* FROM workout_sessions s WHERE " + where + " ORDER BY s.local_date DESC, s.started_at DESC LIMIT ? OFFSET ?", pageArgs.toArray())
                .stream().map(this::summary).toList();
        return M.of().put("items", items).put("page", page).put("pageSize", pageSize).put("total", total).put("hasMore", (long) page * pageSize < total).map();
    }

    public List<Map<String, Object>> trash(String userId) {
        return db.all("SELECT * FROM workout_sessions WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", userId).stream()
                .map(row -> {
                    Map<String, Object> item = summary(row);
                    try {
                        item.put("canRestoreUntil", TimeUtil.ISO_MS.format(Instant.parse(Db.str(row, "deleted_at")).plusSeconds(7 * 86400)));
                    } catch (Exception ignored) {}
                    return item;
                }).toList();
    }

    public Map<String, Object> addItem(String userId, String sessionId, String exerciseId, String note) {
        Map<String, Object> session = owned(userId, sessionId, false);
        assertExercise(userId, exerciseId);
        long order = db.count("SELECT COUNT(*) AS n FROM workout_items WHERE session_id = ?", sessionId);
        db.update("INSERT INTO workout_items(id,session_id,exercise_id,sort_order,note,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID().toString(), sessionId, exerciseId, order, note, TimeUtil.now());
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id = ?", TimeUtil.now(), sessionId);
        return detail(userId, sessionId, false);
    }

    public Map<String, Object> updateItem(String userId, String itemId, String note) {
        Map<String, Object> item = db.one("SELECT id,session_id FROM workout_items WHERE id = ?", itemId);
        if (item == null) throw ApiException.notFound("动作条目不存在");
        owned(userId, Db.str(item, "session_id"), false);
        db.update("UPDATE workout_items SET note = ? WHERE id = ?", note == null || note.isBlank() ? null : note, itemId);
        return detail(userId, Db.str(item, "session_id"), false);
    }

    public Map<String, Object> removeItem(String userId, String itemId) {
        Map<String, Object> item = db.one("SELECT id,session_id FROM workout_items WHERE id = ?", itemId);
        if (item == null) throw ApiException.notFound("动作条目不存在");
        Map<String, Object> session = owned(userId, Db.str(item, "session_id"), false);
        db.update("DELETE FROM workout_sets WHERE item_id = ?", itemId);
        db.update("DELETE FROM workout_items WHERE id = ?", itemId);
        recomputeVolume(Db.str(session, "id"));
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id = ?", TimeUtil.now(), Db.str(session, "id"));
        return detail(userId, Db.str(session, "id"), false);
    }

    public Map<String, Object> addSet(String userId, String itemId, Map<String, Object> body) {
        Map<String, Object> item = db.one("SELECT i.id,i.session_id,i.exercise_id,e.type AS exercise_type FROM workout_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.id = ?", itemId);
        if (item == null) throw ApiException.notFound("动作条目不存在");
        Map<String, Object> session = owned(userId, Db.str(item, "session_id"), false);
        Map<String, Object> set = normalizeSet(body, Db.str(item, "exercise_type"), 0);
        String opId = Db.str(set, "client_op_id");
        if (opId != null) {
            Map<String, Object> dup = db.one("SELECT * FROM workout_sets WHERE client_op_id = ?", opId);
            if (dup != null) {
                return M.of().put("set", setDto(dup)).put("session", detail(userId, Db.str(session, "id"), false)).put("duplicated", true).put("prs", List.of()).map();
            }
        }
        insertSet(Db.str(session, "id"), itemId, set, false);
        recomputeVolume(Db.str(session, "id"));
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id = ?", TimeUtil.now(), Db.str(session, "id"));
        Map<String, Object> newSet = db.one("SELECT * FROM workout_sets WHERE item_id = ? ORDER BY set_index DESC LIMIT 1", itemId);
        return M.of().put("set", setDto(newSet)).put("session", detail(userId, Db.str(session, "id"), false))
                .put("prs", detectNewPRs(userId, Db.str(session, "id"))).put("duplicated", false).map();
    }

    public Map<String, Object> updateSet(String userId, String setId, Map<String, Object> body) {
        Map<String, Object> set = db.one("SELECT ws.id,ws.session_id,ws.item_id,e.type AS exercise_type FROM workout_sets ws JOIN workout_items i ON i.id = ws.item_id JOIN exercises e ON e.id = i.exercise_id WHERE ws.id = ?", setId);
        if (set == null) throw ApiException.notFound("组记录不存在");
        Map<String, Object> session = owned(userId, Db.str(set, "session_id"), false);
        Map<String, Object> n = normalizeSet(body, Db.str(set, "exercise_type"), 0);
        db.update("UPDATE workout_sets SET weight_kg=?,reps=?,duration_sec=?,distance_km=?,avg_hr=?,rpe=?,set_type=?,note=? WHERE id=?",
                n.get("weight_kg"), n.get("reps"), n.get("duration_sec"), n.get("distance_km"), n.get("avg_hr"), n.get("rpe"), n.get("set_type"), n.get("note"), setId);
        recomputeVolume(Db.str(session, "id"));
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id = ?", TimeUtil.now(), Db.str(session, "id"));
        return detail(userId, Db.str(session, "id"), false);
    }

    public Map<String, Object> deleteSet(String userId, String setId) {
        Map<String, Object> set = db.one("SELECT id,session_id FROM workout_sets WHERE id = ?", setId);
        if (set == null) throw ApiException.notFound("组记录不存在");
        Map<String, Object> session = owned(userId, Db.str(set, "session_id"), false);
        db.update("DELETE FROM workout_sets WHERE id = ?", setId);
        recomputeVolume(Db.str(session, "id"));
        db.update("UPDATE workout_sessions SET updated_at = ? WHERE id = ?", TimeUtil.now(), Db.str(session, "id"));
        return detail(userId, Db.str(session, "id"), false);
    }

    public Map<String, Object> assertExercise(String userId, String exerciseId) {
        Map<String, Object> row = db.one("SELECT id,owner_id,is_builtin,archived,type FROM exercises WHERE id = ?", exerciseId);
        if (row == null) throw ApiException.notFound("动作不存在");
        if (Db.bool(row, "archived")) throw ApiException.badRequest("该动作已归档，不能继续使用");
        if (!Db.bool(row, "is_builtin") && !userId.equals(Db.str(row, "owner_id"))) throw ApiException.forbidden("该动作为其他用户自建，无法使用");
        return row;
    }

    public Map<String, Object> normalizeSet(Map<String, Object> input, String type, int index) {
        String setType = Req.enumOf(input.get("setType"), "组类型", SET_TYPES, "normal");
        Double weight = Req.number(input.get("weightKg"), "重量", 0.0, 1000.0, false);
        if (weight != null) weight = Math.round(weight * 2) / 2.0;
        Integer reps = Req.integer(input.get("reps"), "次数", 1, 1000, false);
        Integer duration = Req.integer(input.get("durationSec"), "时长", 0, 86400, false);
        Double distance = Req.number(input.get("distanceKm"), "距离", 0.0, 1000.0, false);
        Integer avgHr = Req.integer(input.get("avgHr"), "平均心率", 30, 250, false);
        Double rpe = Req.number(input.get("rpe"), "RPE", 6.0, 10.0, false);
        if ("strength".equals(type) && (weight == null || reps == null)) throw ApiException.badRequest("力量训练的每组需要填写重量与次数");
        if ("cardio".equals(type) && (duration == null || duration <= 0)) throw ApiException.badRequest("有氧训练需要填写时长");
        return M.of()
                .put("weight_kg", weight).put("reps", reps).put("duration_sec", duration).put("distance_km", distance)
                .put("avg_hr", avgHr).put("rpe", rpe).put("set_type", setType)
                .put("note", input.get("note") == null ? null : String.valueOf(input.get("note")))
                .put("client_op_id", input.get("clientOpId") == null ? null : String.valueOf(input.get("clientOpId")))
                .put("set_index", index)
                .map();
    }

    private String insertSet(String sessionId, String itemId, Map<String, Object> set, boolean skipDuplicate) {
        String opId = Db.str(set, "client_op_id");
        if (skipDuplicate && opId != null) {
            Map<String, Object> dup = db.one("SELECT id FROM workout_sets WHERE client_op_id = ?", opId);
            if (dup != null) return Db.str(dup, "id");
        }
        int index = (int) db.count("SELECT COUNT(*) AS n FROM workout_sets WHERE item_id = ?", itemId);
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO workout_sets(id,session_id,item_id,set_index,weight_kg,reps,duration_sec,distance_km,avg_hr,rpe,set_type,note,client_op_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id, sessionId, itemId, index, set.get("weight_kg"), set.get("reps"), set.get("duration_sec"), set.get("distance_km"),
                set.get("avg_hr"), set.get("rpe"), set.get("set_type"), set.get("note"), set.get("client_op_id"), TimeUtil.now());
        return id;
    }

    public List<Map<String, Object>> detectNewPRs(String userId, String sessionId) {
        List<Map<String, Object>> rows = db.all("SELECT wi.exercise_id, e.name, ws.weight_kg, ws.reps, ws.set_type FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN exercises e ON e.id = wi.exercise_id WHERE ws.session_id = ?", sessionId);
        Set<String> exerciseIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) exerciseIds.add(Db.str(row, "exercise_id"));
        List<Map<String, Object>> results = new ArrayList<>();
        for (String exerciseId : exerciseIds) {
            String name = rows.stream().filter(r -> exerciseId.equals(Db.str(r, "exercise_id"))).map(r -> Db.str(r, "name")).findFirst().orElse("");
            List<Map<String, Object>> previous = db.all(
                    "SELECT ws.weight_kg,ws.reps FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = ? AND wi.exercise_id = ? AND s.id != ? AND s.deleted_at IS NULL AND ws.set_type != 'warmup' AND ws.weight_kg IS NOT NULL AND ws.reps IS NOT NULL",
                    userId, exerciseId, sessionId);
            if (previous.isEmpty()) continue;
            double prevE1rm = 0, prevWeight = 0;
            long prevReps = 0;
            for (Map<String, Object> p : previous) {
                Double e1 = Metrics.estimated1RM(Db.dbl(p, "weight_kg"), (int) Db.lng(p, "reps"));
                prevE1rm = Math.max(prevE1rm, e1 == null ? 0 : e1);
                prevWeight = Math.max(prevWeight, Db.dbl(p, "weight_kg", 0));
                prevReps = Math.max(prevReps, Db.lng(p, "reps"));
            }
            double bestE1rm = 0, bestWeight = 0;
            long bestReps = 0;
            for (Map<String, Object> r : rows) {
                if (!exerciseId.equals(Db.str(r, "exercise_id")) || "warmup".equals(Db.str(r, "set_type"))) continue;
                Double e1 = Metrics.estimated1RM(Db.dbl(r, "weight_kg"), (int) Db.lng(r, "reps"));
                bestE1rm = Math.max(bestE1rm, e1 == null ? 0 : e1);
                bestWeight = Math.max(bestWeight, Db.dbl(r, "weight_kg", 0));
                bestReps = Math.max(bestReps, Db.lng(r, "reps"));
            }
            if (bestE1rm > prevE1rm + 0.05) results.add(M.of().put("exerciseId", exerciseId).put("exerciseName", name).put("metric", "estimated1RM").put("value", Metrics.round(bestE1rm, 1)).put("previous", Metrics.round(prevE1rm, 1)).put("label", "估算 1RM").map());
            if (bestWeight > prevWeight) results.add(M.of().put("exerciseId", exerciseId).put("exerciseName", name).put("metric", "maxWeight").put("value", bestWeight).put("previous", prevWeight).put("label", "单组最大重量").map());
            if (bestReps > prevReps) results.add(M.of().put("exerciseId", exerciseId).put("exerciseName", name).put("metric", "maxReps").put("value", bestReps).put("previous", prevReps).put("label", "单组最大次数").map());
        }
        return results;
    }

    /* ---------------------------- 模板 ---------------------------- */
    public Map<String, Object> saveAsTemplate(String userId, String sessionId, String name) {
        Map<String, Object> session = owned(userId, sessionId, false);
        if (name == null || name.isBlank()) throw ApiException.badRequest("请填写模板名称");
        List<Map<String, Object>> items = db.all(
                "SELECT i.exercise_id,i.note,e.name,COUNT(ws.id) AS set_count FROM workout_items i JOIN exercises e ON e.id = i.exercise_id LEFT JOIN workout_sets ws ON ws.item_id = i.id WHERE i.session_id = ? GROUP BY i.id ORDER BY i.sort_order",
                sessionId);
        List<Map<String, Object>> payloadItems = new ArrayList<>();
        for (Map<String, Object> item : items) {
            int setCount = Math.max(1, Db.intVal(item, "set_count"));
            List<Map<String, Object>> sets = new ArrayList<>();
            for (int i = 0; i < setCount; i++) sets.add(M.of().put("setType", "normal").put("weightKg", null).put("reps", null).put("setIndex", i).map());
            payloadItems.add(M.of().put("exerciseId", Db.str(item, "exercise_id")).put("exerciseName", Db.str(item, "name"))
                    .put("note", Db.str(item, "note")).put("setCount", setCount).put("sets", sets).map());
        }
        Map<String, Object> payload = M.of().put("type", Db.str(session, "type")).put("items", payloadItems).map();
        String id = UUID.randomUUID().toString();
        String now = TimeUtil.now();
        try {
            db.update("INSERT INTO templates(id,user_id,name,type,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                    id, userId, name.substring(0, Math.min(30, name.length())), Db.str(session, "type"), json.writeValueAsString(payload), now, now);
        } catch (Exception e) {
            throw new ApiException(500, "SERIALIZE_ERROR", "模板保存失败");
        }
        return template(userId, id);
    }

    public Map<String, Object> template(String userId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM templates WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("模板不存在");
        return templateDto(row);
    }

    public List<Map<String, Object>> templates(String userId) {
        return db.all("SELECT * FROM templates WHERE user_id = ? ORDER BY updated_at DESC", userId).stream().map(this::templateDto).toList();
    }

    private Map<String, Object> templateDto(Map<String, Object> row) {
        Object payload;
        try { payload = json.readValue(Db.str(row, "payload"), Object.class); } catch (Exception e) { payload = Map.of(); }
        return M.of().put("id", Db.str(row, "id")).put("name", Db.str(row, "name")).put("type", Db.str(row, "type"))
                .put("payload", payload).put("createdAt", Db.str(row, "created_at")).put("updatedAt", Db.str(row, "updated_at")).map();
    }

    public Map<String, Object> deleteTemplate(String userId, String id) {
        Map<String, Object> row = db.one("SELECT id FROM templates WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("模板不存在");
        db.update("DELETE FROM templates WHERE id = ?", id);
        return Map.of("deleted", true);
    }

    public Map<String, Object> startFromTemplate(String userId, String id, int tzOffset, String visibility) {
        Map<String, Object> template = template(userId, id);
        Object payload = template.get("payload");
        List<Map<String, Object>> items = Req.list(((Map<?, ?>) payload).get("items"));
        Map<String, Object> input = new java.util.HashMap<>();
        input.put("type", template.get("type"));
        input.put("title", template.get("name"));
        input.put("startedAt", TimeUtil.now());
        input.put("localDate", TimeUtil.todayForString(tzOffset));
        input.put("tzOffset", tzOffset);
        input.put("source", "template");
        input.put("visibility", visibility);
        input.put("items", items.stream().map(item -> Map.of("exerciseId", item.get("exerciseId"))).toList());
        Map<String, Object> created = create(userId, input);
        created.put("template", template);
        return created;
    }
}
