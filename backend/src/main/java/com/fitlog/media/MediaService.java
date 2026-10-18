package com.fitlog.media;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.auth.AuthUser;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.Settings;
import com.fitlog.common.TimeUtil;
import com.fitlog.config.AppProps;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MediaService {
    private static final int CHUNK_SIZE = 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 200L * 1024 * 1024;
    private static final long MAX_IMAGE_BYTES = 20L * 1024 * 1024;
    private static final long DAILY_UPLOAD_BYTES = 500L * 1024 * 1024;

    private final Db db;
    private final Settings settings;
    private final AppProps props;
    private final BudgetService budget;
    private final ObjectMapper json;

    public MediaService(Db db, Settings settings, AppProps props, BudgetService budget, ObjectMapper json) {
        this.db = db;
        this.settings = settings;
        this.props = props;
        this.budget = budget;
        this.json = json;
    }

    public Map<String, Object> mediaDto(Map<String, Object> row) {
        if (row == null) return null;
        String id = Db.str(row, "id");
        boolean deleted = Db.str(row, "deleted_at") != null;
        return M.of()
                .put("id", id)
                .put("type", Db.str(row, "type"))
                .put("originalName", Db.str(row, "original_name"))
                .put("mime", Db.str(row, "mime"))
                .put("sizeBytes", Db.lng(row, "size_bytes"))
                .put("durationSec", Db.dbl(row, "duration_sec") == null ? null : Db.lng(row, "duration_sec"))
                .put("width", Db.dbl(row, "width") == null ? null : Db.lng(row, "width"))
                .put("height", Db.dbl(row, "height") == null ? null : Db.lng(row, "height"))
                .put("status", Db.str(row, "status"))
                .put("reviewStatus", Db.str(row, "review_status"))
                .put("watermark", Db.bool(row, "watermark"))
                .put("watermarkText", Db.str(row, "watermark_text"))
                .put("createdAt", Db.str(row, "created_at"))
                .put("url", deleted ? null : sign(id, "file"))
                .put("thumbUrl", deleted ? null : sign(id, Db.str(row, "thumb_path") == null ? "file" : "thumb"))
                .map();
    }

    public String sign(String mediaId, String variant) {
        long exp = java.time.Instant.now().getEpochSecond() + props.getMediaSignTtlSeconds();
        String payload = mediaId + ":" + variant + ":" + exp;
        return "/api/media/" + mediaId + "/" + variant + "?exp=" + exp + "&sig=" + hmac(payload);
    }

    public Path verifyFile(String mediaId, String variant, Long exp, String sig) {
        if (exp == null || sig == null || exp < java.time.Instant.now().getEpochSecond()) {
            throw ApiException.forbidden("链接已过期");
        }
        String expected = hmac(mediaId + ":" + variant + ":" + exp);
        if (!java.security.MessageDigest.isEqual(expected.getBytes(), sig.getBytes())) throw ApiException.forbidden("签名无效");
        Map<String, Object> row = db.one("SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL", mediaId);
        if (row == null) throw ApiException.notFound("媒体不存在");
        String path = "thumb".equals(variant) && Db.str(row, "thumb_path") != null ? Db.str(row, "thumb_path") : Db.str(row, "stored_path");
        Path file = Paths.get(path);
        if (!Files.exists(file)) throw ApiException.notFound("媒体文件不存在");
        return file;
    }

    public Map<String, Object> mediaRow(String id) {
        return db.one("SELECT * FROM media_assets WHERE id = ?", id);
    }

    public Map<String, Object> owned(String userId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM media_assets WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, userId);
        if (row == null) throw ApiException.notFound("媒体不存在或已删除");
        return row;
    }

    public Map<String, Object> createUpload(AuthUser user, Map<String, Object> body) {
        String type = String.valueOf(body.getOrDefault("type", "image"));
        if (!List.of("image", "video").contains(type)) throw ApiException.badRequest("媒体类型不正确");
        String fileName = body.get("fileName") == null ? "upload" : String.valueOf(body.get("fileName"));
        String mime = body.get("mime") == null ? "application/octet-stream" : String.valueOf(body.get("mime"));
        long size = body.get("sizeBytes") == null ? 0 : Long.parseLong(String.valueOf(body.get("sizeBytes")));
        if (size <= 0) throw ApiException.badRequest("文件大小不正确");
        if ("video".equals(type)) {
            if (size > MAX_VIDEO_BYTES) throw ApiException.badRequest("视频请在 200MB 以内，或到电脑端上传");
            String gate = budget.videoGate(user.createdAt());
            if (gate != null) throw ApiException.forbidden(gate);
        } else if (size > MAX_IMAGE_BYTES) {
            throw ApiException.badRequest("图片请在 20MB 以内");
        }
        long used = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE deleted_at IS NULL");
        long quotaBytes = (long) settings.intValue("quota_gb", props.getQuotaGb()) * 1024L * 1024 * 1024;
        if (used + size > quotaBytes) throw ApiException.forbidden("存储配额不足，请先清理媒体或导出后删除");
        long todayUsed = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE user_id = ? AND created_at >= ? AND deleted_at IS NULL",
                user.id(), TimeUtil.todayForString(user.tzOffset()) + "T00:00:00.000Z");
        if (todayUsed + size > DAILY_UPLOAD_BYTES) throw ApiException.badRequest("单日上传已达 500MB 上限");

        String id = UUID.randomUUID().toString();
        int totalChunks = (int) Math.ceil(size / (double) CHUNK_SIZE);
        String meta = null;
        try {
            java.util.Map<String, Object> metaMap = new java.util.HashMap<>();
            metaMap.put("durationSec", body.get("durationSec") == null ? 0 : body.get("durationSec"));
            metaMap.put("width", body.get("width") == null ? 0 : body.get("width"));
            metaMap.put("height", body.get("height") == null ? 0 : body.get("height"));
            metaMap.put("watermark", Boolean.parseBoolean(String.valueOf(body.getOrDefault("watermark", false))));
            meta = json.writeValueAsString(metaMap);
        } catch (Exception ignored) {}
        db.update("INSERT INTO upload_sessions(id,user_id,file_name,mime,size_bytes,type,chunk_size,total_chunks,received,status,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?, 'uploading',?,?,?)",
                id, user.id(), fileName, mime, size, type, CHUNK_SIZE, totalChunks, "", meta, TimeUtil.now(), TimeUtil.now());
        return M.of().put("uploadId", id).put("chunkSize", CHUNK_SIZE).put("totalChunks", totalChunks).put("received", List.of()).map();
    }

    public void chunk(AuthUser user, String uploadId, int index, byte[] bytes) {
        Map<String, Object> session = uploadSession(user, uploadId);
        int total = (int) Db.lng(session, "total_chunks");
        if (index < 0 || index >= total) throw ApiException.badRequest("分片序号不正确");
        try {
            Path dir = Paths.get(props.getUploadDir(), ".chunks", uploadId);
            Files.createDirectories(dir);
            Files.write(dir.resolve(String.format("%05d.part", index)), bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new ApiException(500, "STORAGE_ERROR", "分片写入失败");
        }
        List<String> received = new ArrayList<>();
        String raw = Db.str(session, "received", "");
        if (!raw.isBlank()) received.addAll(List.of(raw.split(",")));
        String token = String.valueOf(index);
        if (!received.contains(token)) received.add(token);
        db.update("UPDATE upload_sessions SET received = ?, updated_at = ? WHERE id = ?", String.join(",", received), TimeUtil.now(), uploadId);
    }

    public Map<String, Object> complete(AuthUser user, String uploadId, Map<String, Object> body) {
        Map<String, Object> session = uploadSession(user, uploadId);
        String type = Db.str(session, "type");
        String mime = Db.str(session, "mime");
        String fileName = Db.str(session, "file_name");
        long size = Db.lng(session, "size_bytes");
        int total = (int) Db.lng(session, "total_chunks");
        Path chunkDir = Paths.get(props.getUploadDir(), ".chunks", uploadId);
        Path targetDir = Paths.get(props.getUploadDir(), user.id());
        String mediaId = UUID.randomUUID().toString();
        String ext = extension(fileName, mime);
        Path target = targetDir.resolve(mediaId + "." + ext);
        long written = 0;
        try {
            Files.createDirectories(targetDir);
            Files.deleteIfExists(target);
            for (int i = 0; i < total; i++) {
                Path part = chunkDir.resolve(String.format("%05d.part", i));
                if (!Files.exists(part)) throw ApiException.badRequest("分片缺失，请重新上传");
                byte[] bytes = Files.readAllBytes(part);
                Files.write(target, bytes, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                written += bytes.length;
            }
            if (written <= 0) throw ApiException.badRequest("未收到有效文件");
        } catch (IOException e) {
            throw new ApiException(500, "STORAGE_ERROR", "文件合并失败");
        }

        Path thumb = null;
        Object thumbRaw = body == null ? null : body.get("thumb");
        if (thumbRaw instanceof String dataUrl && dataUrl.startsWith("data:image/")) {
            try {
                String base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                thumb = targetDir.resolve(mediaId + ".thumb.jpg");
                Files.write(thumb, Base64.getDecoder().decode(base64));
            } catch (Exception ignored) {
                thumb = null;
            }
        }
        Map<String, Object> meta = Map.of();
        try {
            if (Db.str(session, "meta") != null) meta = json.readValue(Db.str(session, "meta"), Map.class);
        } catch (Exception ignored) {}
        Integer duration = meta.get("durationSec") == null ? null : ((Number) meta.get("durationSec")).intValue();
        Integer width = meta.get("width") == null ? null : ((Number) meta.get("width")).intValue();
        Integer height = meta.get("height") == null ? null : ((Number) meta.get("height")).intValue();
        boolean watermark = Boolean.TRUE.equals(meta.get("watermark"));
        String watermarkText = watermark ? settings.get("brand_watermark_text", "练迹") : null;
        long finalSize = Files.exists(target) ? size(target) : size;
        String now = TimeUtil.now();
        db.update("INSERT INTO media_assets(id,user_id,type,original_name,mime,size_bytes,stored_path,thumb_path,duration_sec,width,height,status,review_status,watermark,watermark_text,watermark_applied_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?, 'ready', 'approved', ?,?,?,?)",
                mediaId, user.id(), type, fileName, mime, finalSize, target.toString(), thumb == null ? null : thumb.toString(),
                duration, width, height, watermark ? 1 : 0, watermarkText, watermark ? now : null, now);
        db.update("UPDATE upload_sessions SET status = 'completed', media_id = ?, updated_at = ? WHERE id = ?", mediaId, now, uploadId);
        if ("video".equals(type) && duration != null) budget.recordTranscode(duration);
        try { deleteRecursively(chunkDir); } catch (Exception ignored) {}
        Map<String, Object> row = mediaRow(mediaId);
        return mediaDto(row);
    }

    public Map<String, Object> uploadSession(AuthUser user, String id) {
        Map<String, Object> row = db.one("SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?", id, user.id());
        if (row == null) throw ApiException.notFound("上传会话不存在");
        return row;
    }

    public void cancelUpload(AuthUser user, String id) {
        Map<String, Object> row = uploadSession(user, id);
        if ("completed".equals(Db.str(row, "status"))) throw ApiException.badRequest("上传已完成，不能取消");
        db.update("DELETE FROM upload_sessions WHERE id = ?", id);
        try { deleteRecursively(Paths.get(props.getUploadDir(), ".chunks", id)); } catch (Exception ignored) {}
    }

    public Map<String, Object> list(AuthUser user) {
        List<Map<String, Object>> items = db.all("SELECT * FROM media_assets WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100", user.id())
                .stream().map(this::mediaDto).toList();
        return M.of().put("items", items).put("usage", usage(user)).map();
    }

    public Map<String, Object> usage(AuthUser user) {
        long used = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE deleted_at IS NULL");
        long userUsed = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE user_id = ? AND deleted_at IS NULL", user.id());
        long images = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE user_id = ? AND type = 'image' AND deleted_at IS NULL", user.id());
        long videos = db.count("SELECT COALESCE(SUM(size_bytes),0) AS n FROM media_assets WHERE user_id = ? AND type = 'video' AND deleted_at IS NULL", user.id());
        int quotaGb = settings.intValue("quota_gb", props.getQuotaGb());
        long quotaBytes = (long) quotaGb * 1024 * 1024 * 1024;
        return M.of()
                .put("usedBytes", userUsed)
                .put("totalUsedBytes", used)
                .put("quotaGb", quotaGb)
                .put("quotaBytes", quotaBytes)
                .put("byType", Map.of("image", images, "video", videos))
                .put("dailyLimitBytes", DAILY_UPLOAD_BYTES)
                .put("budget", budget.status())
                .map();
    }

    public void delete(AuthUser user, String id) {
        Map<String, Object> row = owned(user.id(), id);
        db.update("UPDATE media_assets SET deleted_at = ? WHERE id = ?", TimeUtil.now(), id);
        db.update("DELETE FROM session_media WHERE media_id = ?", id);
        try { Files.deleteIfExists(Paths.get(Db.str(row, "stored_path"))); } catch (Exception ignored) {}
        try { if (Db.str(row, "thumb_path") != null) Files.deleteIfExists(Paths.get(Db.str(row, "thumb_path"))); } catch (Exception ignored) {}
    }

    public void watermarkUndo(AuthUser user, String id) {
        Map<String, Object> row = owned(user.id(), id);
        if (!"video".equals(Db.str(row, "type"))) throw ApiException.badRequest("仅视频支持水印撤销");
        if (!Db.bool(row, "watermark")) throw ApiException.badRequest("该视频没有水印");
        if (Db.str(row, "watermark_undone_at") != null) throw ApiException.badRequest("每个视频仅可撤销一次水印");
        db.update("UPDATE media_assets SET watermark = 0, watermark_applied_at = NULL, watermark_undone_at = ? WHERE id = ?", TimeUtil.now(), id);
    }

    public List<Map<String, Object>> listForSession(String sessionId) {
        return db.all("SELECT m.* FROM session_media sm JOIN media_assets m ON m.id = sm.media_id WHERE sm.session_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at", sessionId)
                .stream().map(this::mediaDto).toList();
    }

    public List<Map<String, Object>> attach(AuthUser user, String sessionId, List<String> ids) {
        for (String id : ids) {
            owned(user.id(), id);
            db.update("INSERT IGNORE INTO session_media(session_id,media_id) VALUES(?,?)", sessionId, id);
        }
        return listForSession(sessionId);
    }

    private String extension(String name, String mime) {
        int dot = name == null ? -1 : name.lastIndexOf('.');
        if (dot >= 0 && dot < name.length() - 1) return name.substring(dot + 1).toLowerCase();
        if (mime.contains("png")) return "png";
        if (mime.contains("webp")) return "webp";
        if (mime.contains("quicktime")) return "mov";
        if (mime.contains("video")) return "mp4";
        return "jpg";
    }

    private long size(Path path) {
        try { return Files.size(path); } catch (Exception e) { return 0; }
    }

    private void deleteRecursively(Path dir) throws IOException {
        if (!Files.exists(dir)) return;
        try (var stream = Files.walk(dir)) {
            stream.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) {}
            });
        }
    }

    private String hmac(String payload) {
        return com.fitlog.auth.TokenService.hmacHex(props.getSecret(), payload);
    }
}
