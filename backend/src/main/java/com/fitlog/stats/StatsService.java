package com.fitlog.stats;

import com.fitlog.checkin.CheckinService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.TimeUtil;
import com.fitlog.exercise.ExerciseService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class StatsService {
    private final Db db;
    private final CheckinService checkins;
    private final ExerciseService exercises;

    public StatsService(Db db, CheckinService checkins, ExerciseService exercises) {
        this.db = db;
        this.checkins = checkins;
        this.exercises = exercises;
    }

    private Map<String, Object> aggregate(String userId, String from, String to) {
        Map<String, Object> row = db.one(
                "SELECT COUNT(*) AS sessions, COALESCE(SUM(volume_kg),0) AS volume, COALESCE(SUM(duration_sec),0) AS duration FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL AND local_date >= ? AND local_date <= ?",
                userId, from, to);
        return M.of().put("sessions", Db.lng(row, "sessions")).put("volumeKg", Metrics.round(Db.dbl(row, "volume", 0), 1))
                .put("durationSec", Db.lng(row, "duration")).map();
    }

    public Map<String, Object> overview(String userId, int tzOffset, int weeklyGoal) {
        String today = TimeUtil.todayForString(tzOffset);
        String weekStart = TimeUtil.startOfWeek(today);
        String weekEnd = TimeUtil.addDays(weekStart, 6);
        String lastStart = TimeUtil.addDays(weekStart, -7);
        String lastEnd = TimeUtil.addDays(weekStart, -1);
        Map<String, Object> current = aggregate(userId, weekStart, weekEnd);
        Map<String, Object> previous = aggregate(userId, lastStart, lastEnd);
        long checkinDays = db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND status = 'active' AND local_date >= ? AND local_date <= ?", userId, weekStart, weekEnd);
        List<Map<String, Object>> recent = db.all(
                "SELECT * FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY local_date DESC, started_at DESC LIMIT 4", userId)
                .stream().map(row -> M.of().put("id", Db.str(row, "id")).put("type", Db.str(row, "type"))
                        .put("title", Db.str(row, "title")).put("localDate", Db.str(row, "local_date"))
                        .put("volumeKg", Metrics.round(Db.dbl(row, "volume_kg", 0), 1)).put("durationSec", Db.lng(row, "duration_sec"))
                        .put("itemCount", db.count("SELECT COUNT(*) AS n FROM workout_items WHERE session_id = ?", Db.str(row, "id"))).map()).toList();
        Map<String, Object> lastBody = db.one("SELECT * FROM body_metrics WHERE user_id = ? ORDER BY measured_on DESC LIMIT 1", userId);
        long total = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL", userId);
        double curVolume = Db.dbl(current, "volumeKg", 0);
        double prevVolume = Db.dbl(previous, "volumeKg", 0);
        long curDuration = Db.lng(current, "durationSec");
        long prevDuration = Db.lng(previous, "durationSec");
        return M.of()
                .put("weekStart", weekStart)
                .put("current", current)
                .put("previous", previous)
                .put("delta", M.of()
                        .put("sessions", Db.lng(current, "sessions") - Db.lng(previous, "sessions"))
                        .put("volumePct", prevVolume > 0 ? Metrics.round((curVolume - prevVolume) / prevVolume * 100, 1) : null)
                        .put("durationPct", prevDuration > 0 ? Metrics.round((curDuration - prevDuration) * 100.0 / prevDuration, 1) : null))
                .put("checkinDays", checkinDays)
                .put("streak", checkins.streak(userId, tzOffset))
                .put("weekly", checkins.weekly(userId, tzOffset, weeklyGoal))
                .put("totalSessions", total)
                .put("recentSessions", recent)
                .put("lastBody", lastBody == null ? null : M.of().put("measuredOn", Db.str(lastBody, "measured_on"))
                        .put("weightKg", Db.dbl(lastBody, "weight_kg")).put("bodyFat", Db.dbl(lastBody, "body_fat"))
                        .put("waistCm", Db.dbl(lastBody, "waist_cm")).map())
                .put("empty", total == 0)
                .map();
    }

    public Map<String, Object> trend(String userId, String exerciseId, String granularity) {
        Map<String, Object> exercise = db.one("SELECT id,name,primary_muscle,equipment FROM exercises WHERE id = ?", exerciseId);
        if (exercise == null) return null;
        List<Map<String, Object>> rows = db.all(
                "SELECT s.local_date, ws.weight_kg, ws.reps, ws.set_type, ws.set_index FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = ? AND wi.exercise_id = ? AND s.deleted_at IS NULL ORDER BY s.local_date",
                userId, exerciseId);
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        Map<String, String> dates = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String date = Db.str(row, "local_date");
            String key = "year".equals(granularity) ? date.substring(0, 4) : "month".equals(granularity) ? date.substring(0, 7) : TimeUtil.isoWeekKey(date);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
            dates.merge(key, date, (a, b) -> a.compareTo(b) > 0 ? a : b);
        }
        List<Map<String, Object>> points = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : groups.entrySet()) {
            List<Map<String, Object>> working = entry.getValue().stream().filter(s -> !"warmup".equals(Db.str(s, "set_type"))).toList();
            double maxWeight = 0, bestE1rm = 0, volume = 0;
            Map<String, Object> bestSet = null;
            for (Map<String, Object> set : working) {
                Double weight = Db.dbl(set, "weight_kg");
                int reps = (int) Db.lng(set, "reps");
                maxWeight = Math.max(maxWeight, weight == null ? 0 : weight);
                Double e1 = Metrics.estimated1RM(weight, reps);
                if (e1 != null && e1 > bestE1rm) {
                    bestE1rm = e1;
                    bestSet = M.of().put("weight", weight).put("reps", reps).map();
                }
                if (weight != null && reps > 0) volume += weight * reps;
            }
            points.add(M.of().put("key", entry.getKey()).put("label", entry.getKey()).put("date", dates.get(entry.getKey()))
                    .put("maxWeight", Metrics.round(maxWeight, 1)).put("estimated1RM", Metrics.round(bestE1rm, 1))
                    .put("bestSet", bestSet).put("volume", Metrics.round(volume, 1)).put("sets", entry.getValue().size()).map());
        }
        return M.of().put("exercise", M.of().put("id", Db.str(exercise, "id")).put("name", Db.str(exercise, "name"))
                .put("primaryMuscle", Db.str(exercise, "primary_muscle")).put("equipment", Db.str(exercise, "equipment")))
                .put("granularity", granularity).put("points", points).map();
    }

    public List<Map<String, Object>> prList(String userId) {
        List<Map<String, Object>> rows = db.all(
                "SELECT wi.exercise_id,e.name,e.primary_muscle,e.equipment,ws.weight_kg,ws.reps,ws.set_type,s.local_date FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id JOIN exercises e ON e.id = wi.exercise_id WHERE s.user_id = ? AND s.deleted_at IS NULL",
                userId);
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        Map<String, Map<String, Object>> meta = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String id = Db.str(row, "exercise_id");
            groups.computeIfAbsent(id, k -> new ArrayList<>()).add(row);
            meta.putIfAbsent(id, row);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : groups.entrySet()) {
            Map<String, Object> m = meta.get(entry.getKey());
            Map<String, Object> prs = Metrics.computePRs(entry.getValue());
            if (prs.get("maxWeight") == null && prs.get("maxE1RM") == null) continue;
            String lastDate = entry.getValue().stream().map(r -> Db.str(r, "local_date")).max(String::compareTo).orElse(null);
            result.add(M.of().put("exerciseId", entry.getKey()).put("exerciseName", Db.str(m, "name"))
                    .put("primaryMuscle", Db.str(m, "primary_muscle")).put("equipment", Db.str(m, "equipment"))
                    .put("lastDate", lastDate).put("maxWeight", prs.get("maxWeight")).put("maxE1RM", prs.get("maxE1RM"))
                    .put("maxReps", prs.get("maxReps")).map());
        }
        result.sort((a, b) -> {
            Map<String, Object> ea = (Map<String, Object>) a.get("maxE1RM");
            Map<String, Object> eb = (Map<String, Object>) b.get("maxE1RM");
            return Double.compare(eb == null ? 0 : Db.dbl(eb, "value", 0), ea == null ? 0 : Db.dbl(ea, "value", 0));
        });
        return result;
    }

    public Map<String, Object> muscles(String userId, int tzOffset, int days) {
        String today = TimeUtil.todayForString(tzOffset);
        String from = TimeUtil.addDays(today, -(days - 1));
        List<Map<String, Object>> rows = db.all(
                "SELECT e.primary_muscle AS muscle, COUNT(*) AS sets, SUM(ws.weight_kg * ws.reps) AS volume FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id JOIN exercises e ON e.id = wi.exercise_id WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.local_date >= ? AND s.local_date <= ? AND ws.set_type != 'warmup' GROUP BY e.primary_muscle ORDER BY sets DESC",
                userId, from, today);
        long total = rows.stream().mapToLong(r -> Db.lng(r, "sets")).sum();
        List<Map<String, Object>> items = rows.stream().map(row -> M.of().put("muscle", Db.str(row, "muscle"))
                .put("sets", Db.lng(row, "sets")).put("volume", Metrics.round(Db.dbl(row, "volume", 0), 1))
                .put("ratio", total > 0 ? Metrics.round(Db.lng(row, "sets") * 100.0 / total, 1) : 0).map()).toList();
        return M.of().put("from", from).put("to", today).put("totalSets", total).put("items", items).map();
    }

    public Map<String, Object> weeklyReport(String userId, int tzOffset, int weeklyGoal) {
        String today = TimeUtil.todayForString(tzOffset);
        String weekStart = TimeUtil.startOfWeek(today);
        String weekEnd = TimeUtil.addDays(weekStart, 6);
        String lastStart = TimeUtil.addDays(weekStart, -7);
        Map<String, Object> current = aggregate(userId, weekStart, weekEnd);
        Map<String, Object> previous = aggregate(userId, lastStart, TimeUtil.addDays(weekStart, -1));
        long checkinDays = db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND status = 'active' AND local_date >= ? AND local_date <= ?", userId, weekStart, weekEnd);
        List<Map<String, Object>> weekSets = db.all(
                "SELECT wi.exercise_id,e.name,ws.weight_kg,ws.reps,ws.set_type FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id JOIN exercises e ON e.id = wi.exercise_id WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.local_date >= ? AND s.local_date <= ?",
                userId, weekStart, weekEnd);
        List<Map<String, Object>> priorSets = db.all(
                "SELECT wi.exercise_id,ws.weight_kg,ws.reps,ws.set_type FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.local_date < ?",
                userId, weekStart);
        List<Map<String, Object>> highlights = new ArrayList<>();
        for (String exerciseId : weekSets.stream().map(s -> Db.str(s, "exercise_id")).distinct().toList()) {
            String name = weekSets.stream().filter(s -> exerciseId.equals(Db.str(s, "exercise_id"))).map(s -> Db.str(s, "name")).findFirst().orElse("");
            double priorBest = priorSets.stream().filter(s -> exerciseId.equals(Db.str(s, "exercise_id")) && !"warmup".equals(Db.str(s, "set_type")))
                    .mapToDouble(s -> {
                        Double e = Metrics.estimated1RM(Db.dbl(s, "weight_kg"), (int) Db.lng(s, "reps"));
                        return e == null ? 0 : e;
                    }).max().orElse(0);
            double weekBest = weekSets.stream().filter(s -> exerciseId.equals(Db.str(s, "exercise_id")) && !"warmup".equals(Db.str(s, "set_type")))
                    .mapToDouble(s -> {
                        Double e = Metrics.estimated1RM(Db.dbl(s, "weight_kg"), (int) Db.lng(s, "reps"));
                        return e == null ? 0 : e;
                    }).max().orElse(0);
            if (weekBest > 0 && (priorBest == 0 || weekBest > priorBest)) {
                highlights.add(M.of().put("exerciseName", name).put("estimated1RM", Metrics.round(weekBest, 1)).put("previous", Metrics.round(priorBest, 1)).map());
            }
        }
        double curVolume = Db.dbl(current, "volumeKg", 0);
        double prevVolume = Db.dbl(previous, "volumeKg", 0);
        return M.of().put("weekStart", weekStart).put("weekEnd", weekEnd)
                .put("sessions", Db.lng(current, "sessions")).put("volumeKg", curVolume).put("durationSec", Db.lng(current, "durationSec"))
                .put("checkinDays", checkinDays).put("goal", weeklyGoal).put("goalAchieved", checkinDays >= weeklyGoal)
                .put("previous", previous).put("volumeDeltaPct", prevVolume > 0 ? Metrics.round((curVolume - prevVolume) * 100 / prevVolume, 1) : null)
                .put("highlights", highlights.stream().limit(5).toList()).put("empty", Db.lng(current, "sessions") == 0).map();
    }

    public List<Map<String, Object>> frequency(String userId, int tzOffset, int weeks) {
        String today = TimeUtil.todayForString(tzOffset);
        String currentWeek = TimeUtil.startOfWeek(today);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < weeks; i++) {
            String start = TimeUtil.addDays(currentWeek, -(weeks - 1 - i) * 7);
            String end = TimeUtil.addDays(start, 6);
            Map<String, Object> row = db.one("SELECT COUNT(*) AS n, COALESCE(SUM(volume_kg),0) AS volume FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL AND local_date >= ? AND local_date <= ?", userId, start, end);
            out.add(M.of().put("weekStart", start).put("sessions", Db.lng(row, "n")).put("volumeKg", Metrics.round(Db.dbl(row, "volume", 0), 1)).map());
        }
        return out;
    }

    public Map<String, Object> body(String userId) {
        List<Map<String, Object>> rows = db.all("SELECT * FROM body_metrics WHERE user_id = ? ORDER BY measured_on ASC", userId);
        List<Map<String, Object>> items = rows.stream().map(row -> M.of().put("id", Db.str(row, "id"))
                .put("measuredOn", Db.str(row, "measured_on")).put("weightKg", Db.dbl(row, "weight_kg")).put("bodyFat", Db.dbl(row, "body_fat"))
                .put("chestCm", Db.dbl(row, "chest_cm")).put("waistCm", Db.dbl(row, "waist_cm")).put("hipCm", Db.dbl(row, "hip_cm"))
                .put("armCm", Db.dbl(row, "arm_cm")).put("thighCm", Db.dbl(row, "thigh_cm")).put("note", Db.str(row, "note")).map()).toList();
        Double delta = null;
        if (rows.size() >= 2) {
            delta = Metrics.round(Db.dbl(rows.get(rows.size() - 1), "weight_kg", 0) - Db.dbl(rows.get(0), "weight_kg", 0), 1);
        }
        return M.of().put("disclaimer", "身体数据为用户自填，仅供参考，不作为健康或医疗结论。")
                .put("items", items).put("latest", rows.isEmpty() ? null : items.get(items.size() - 1)).put("deltaWeight", delta).map();
    }

    public Map<String, Object> saveBody(String userId, Map<String, Object> body) {
        String measuredOn = body.get("measuredOn") == null ? TimeUtil.todayForString(-480) : String.valueOf(body.get("measuredOn"));
        if (!TimeUtil.validDate(measuredOn)) throw com.fitlog.common.ApiException.badRequest("日期格式不正确");
        Map<String, Object> existing = db.one("SELECT id FROM body_metrics WHERE user_id = ? AND measured_on = ?", userId, measuredOn);
        Object[] values = new Object[]{
                optional(body.get("weightKg")), optional(body.get("bodyFat")), optional(body.get("chestCm")),
                optional(body.get("waistCm")), optional(body.get("hipCm")), optional(body.get("armCm")),
                optional(body.get("thighCm")), body.get("note") == null ? null : String.valueOf(body.get("note"))
        };
        if (existing != null) {
            db.update("UPDATE body_metrics SET weight_kg=?,body_fat=?,chest_cm=?,waist_cm=?,hip_cm=?,arm_cm=?,thigh_cm=?,note=? WHERE id=?",
                    values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], Db.str(existing, "id"));
            return M.of().put("id", Db.str(existing, "id")).put("updated", true).map();
        }
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO body_metrics(id,user_id,measured_on,weight_kg,body_fat,chest_cm,waist_cm,hip_cm,arm_cm,thigh_cm,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                id, userId, measuredOn, values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], TimeUtil.now());
        return M.of().put("id", id).put("updated", false).map();
    }

    public void deleteBody(String userId, String id) {
        db.update("DELETE FROM body_metrics WHERE id = ? AND user_id = ?", id, userId);
    }

    public Map<String, Object> month(String userId, String month) {
        Map<String, Object> row = db.one("SELECT COUNT(*) AS n, COALESCE(SUM(volume_kg),0) AS volume, COALESCE(SUM(duration_sec),0) AS duration FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL AND local_date LIKE ?", userId, month + "-%");
        long checkinDays = db.count("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND status = 'active' AND local_date LIKE ?", userId, month + "-%");
        return M.of().put("month", month).put("sessions", Db.lng(row, "n")).put("volumeKg", Metrics.round(Db.dbl(row, "volume", 0), 1))
                .put("durationSec", Db.lng(row, "duration")).put("checkinDays", checkinDays).map();
    }

    private Object optional(Object value) {
        if (value == null || String.valueOf(value).isBlank()) return null;
        try { return Double.parseDouble(String.valueOf(value)); } catch (Exception e) { return null; }
    }
}
