package com.fitlog.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ExportService {
    private final Db db;
    private final ObjectMapper json;
    private final AppProps props;

    public ExportService(Db db, ObjectMapper json, AppProps props) {
        this.db = db;
        this.json = json;
        this.props = props;
    }

    public Map<String, Object> create(String userId) {
        String id = UUID.randomUUID().toString();
        Path dir = Paths.get(props.getExportDir(), id);
        List<Map<String, Object>> files = new ArrayList<>();
        try {
            Files.createDirectories(dir);
            List<Map<String, Object>> sessions = db.all("SELECT * FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY local_date", userId);
            List<Map<String, Object>> sets = db.all("SELECT ws.*, e.name AS exercise_name FROM workout_sets ws JOIN workout_items wi ON wi.id = ws.item_id JOIN exercises e ON e.id = wi.exercise_id WHERE ws.session_id IN (SELECT id FROM workout_sessions WHERE user_id = ? AND deleted_at IS NULL) ORDER BY ws.session_id, ws.set_index", userId);
            List<Map<String, Object>> checkins = db.all("SELECT * FROM checkins WHERE user_id = ? ORDER BY local_date", userId);
            List<Map<String, Object>> body = db.all("SELECT * FROM body_metrics WHERE user_id = ? ORDER BY measured_on", userId);
            List<Map<String, Object>> posts = db.all("SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at", userId);
            List<Map<String, Object>> media = db.all("SELECT * FROM media_assets WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at", userId);
            Map<String, Object> profile = db.one("SELECT id,phone,nickname,role,tz_offset,weekly_goal,default_session_visibility,default_post_visibility,created_at FROM users WHERE id = ?", userId);

            files.add(write(dir, "workout_sessions.csv", csv(List.of("id", "local_date", "type", "title", "started_at", "ended_at", "duration_sec", "volume_kg", "notes", "feeling", "source", "visibility"), sessions, List.of("id", "local_date", "type", "title", "started_at", "ended_at", "duration_sec", "volume_kg", "notes", "feeling", "source", "visibility"))));
            files.add(write(dir, "workout_sets.csv", csv(List.of("session_id", "exercise_name", "set_index", "weight_kg", "reps", "duration_sec", "distance_km", "avg_hr", "rpe", "set_type", "note"), sets, List.of("session_id", "exercise_name", "set_index", "weight_kg", "reps", "duration_sec", "distance_km", "avg_hr", "rpe", "set_type", "note"))));
            files.add(write(dir, "checkins.csv", csv(List.of("local_date", "source", "workout_type", "duration_min", "status", "note"), checkins, List.of("local_date", "source", "workout_type", "duration_min", "status", "note"))));
            files.add(write(dir, "body_metrics.csv", csv(List.of("measured_on", "weight_kg", "body_fat", "chest_cm", "waist_cm", "hip_cm", "arm_cm", "thigh_cm", "note"), body, List.of("measured_on", "weight_kg", "body_fat", "chest_cm", "waist_cm", "hip_cm", "arm_cm", "thigh_cm", "note"))));
            files.add(write(dir, "posts.json", pretty(posts.stream().map(p -> M.of().put("id", Db.str(p, "id")).put("title", Db.str(p, "title"))
                    .put("status", Db.str(p, "status")).put("visibility", Db.str(p, "visibility")).put("blocks", Db.str(p, "blocks"))
                    .put("publishedAt", Db.str(p, "published_at")).put("createdAt", Db.str(p, "created_at")).map()).toList())));
            files.add(write(dir, "media.json", pretty(media.stream().map(m -> M.of().put("id", Db.str(m, "id")).put("type", Db.str(m, "type"))
                    .put("originalName", Db.str(m, "original_name")).put("sizeBytes", Db.lng(m, "size_bytes")).put("status", Db.str(m, "status"))
                    .put("createdAt", Db.str(m, "created_at")).map()).toList())));
            files.add(write(dir, "profile.json", pretty(profile)));
        } catch (Exception e) {
            throw new com.fitlog.common.ApiException(500, "EXPORT_ERROR", "导出失败，请稍后重试");
        }
        String expiresAt = TimeUtil.ISO_MS.format(Instant.now().plusSeconds(7 * 86400));
        String filesJson;
        try { filesJson = json.writeValueAsString(files); } catch (Exception e) { filesJson = "[]"; }
        db.update("INSERT INTO exports(id,user_id,status,files,expires_at,created_at) VALUES(?,?,'ready',?,?,?)", id, userId, filesJson, expiresAt, TimeUtil.now());
        return M.of().put("id", id).put("status", "ready").put("files", files).put("expiresAt", expiresAt)
                .put("message", "导出完成，下载链接 7 天内有效").map();
    }

    public Map<String, Object> list(String userId) {
        List<Map<String, Object>> items = db.all("SELECT * FROM exports WHERE user_id = ? ORDER BY created_at DESC", userId).stream().map(row -> {
            Object files;
            try { files = json.readValue(Db.str(row, "files"), Object.class); } catch (Exception e) { files = List.of(); }
            boolean expired = false;
            try { expired = Instant.parse(Db.str(row, "expires_at")).isBefore(Instant.now()); } catch (Exception ignored) {}
            return M.of().put("id", Db.str(row, "id")).put("status", Db.str(row, "status")).put("files", files)
                    .put("expiresAt", Db.str(row, "expires_at")).put("createdAt", Db.str(row, "created_at")).put("expired", expired).map();
        }).toList();
        return M.of().put("items", items).map();
    }

    public Path file(String userId, String exportId, String name) {
        Map<String, Object> row = db.one("SELECT * FROM exports WHERE id = ? AND user_id = ?", exportId, userId);
        if (row == null) throw com.fitlog.common.ApiException.notFound("导出记录不存在");
        try {
            if (Instant.parse(Db.str(row, "expires_at")).isBefore(Instant.now())) throw com.fitlog.common.ApiException.forbidden("下载链接已过期");
        } catch (com.fitlog.common.ApiException e) { throw e; } catch (Exception ignored) {}
        if (name.contains("/") || name.contains("\\") || name.contains("..")) throw com.fitlog.common.ApiException.badRequest("文件名不合法");
        Path file = Paths.get(props.getExportDir(), exportId, name);
        if (!Files.exists(file)) throw com.fitlog.common.ApiException.notFound("导出文件不存在");
        return file;
    }

    private Map<String, Object> write(Path dir, String name, String content) throws Exception {
        Path file = dir.resolve(name);
        Files.writeString(file, content, StandardCharsets.UTF_8);
        return M.of().put("name", name).put("size", Files.size(file)).map();
    }

    private String pretty(Object value) throws Exception {
        return json.writerWithDefaultPrettyPrinter().writeValueAsString(value);
    }

    private String csv(List<String> headers, List<Map<String, Object>> rows, List<String> keys) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.join(",", headers)).append("\n");
        for (Map<String, Object> row : rows) {
            List<String> values = new ArrayList<>();
            for (String key : keys) values.add(csvCell(row.get(key)));
            sb.append(String.join(",", values)).append("\n");
        }
        return sb.toString();
    }

    private String csvCell(Object value) {
        if (value == null) return "";
        String text = String.valueOf(value).replace("\r", " ").replace("\n", " ");
        if (text.contains(",") || text.contains("\"")) return "\"" + text.replace("\"", "\"\"") + "\"";
        return text;
    }
}
