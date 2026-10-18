package com.fitlog.post;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.checkin.CheckinService;
import com.fitlog.common.ApiException;
import com.fitlog.common.AuditService;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.Metrics;
import com.fitlog.common.Req;
import com.fitlog.common.Settings;
import com.fitlog.common.TimeUtil;
import com.fitlog.content.ModerationService;
import com.fitlog.exercise.ExerciseService;
import com.fitlog.media.MediaService;
import com.fitlog.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class PostService {
    public static final List<String> BLOCK_TYPES = List.of("paragraph", "heading", "image", "gallery", "video", "quote", "list", "divider", "todo", "embed");
    public static final List<String> VISIBILITIES = List.of("private", "unlisted", "public");

    private final Db db;
    private final ObjectMapper json;
    private final MediaService media;
    private final ExerciseService exercises;
    private final CheckinService checkins;
    private final NotificationService notifications;
    private final ModerationService moderation;
    private final Settings settings;
    private final AuditService audit;

    public PostService(Db db, ObjectMapper json, MediaService media, ExerciseService exercises, CheckinService checkins,
                       NotificationService notifications, ModerationService moderation, Settings settings, AuditService audit) {
        this.db = db;
        this.json = json;
        this.media = media;
        this.exercises = exercises;
        this.checkins = checkins;
        this.notifications = notifications;
        this.moderation = moderation;
        this.settings = settings;
        this.audit = audit;
    }

    public List<Map<String, Object>> parseBlocks(String raw) {
        try {
            return json.readValue(raw == null ? "[]" : raw, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    public String writeBlocks(List<Map<String, Object>> blocks) {
        try { return json.writeValueAsString(blocks); } catch (Exception e) { throw new ApiException(500, "SERIALIZE_ERROR", "正文保存失败"); }
    }

    public String plainText(List<Map<String, Object>> blocks) {
        List<String> parts = new ArrayList<>();
        for (Map<String, Object> block : blocks) {
            String type = Db.str(block, "type");
            Map<String, Object> props = Req.map(block.get("props"));
            if (List.of("paragraph", "heading", "quote").contains(type) && props.get("text") != null) parts.add(String.valueOf(props.get("text")));
            if ("list".equals(type) && props.get("items") instanceof List<?> items) parts.add(String.join(" ", items.stream().map(String::valueOf).toList()));
            if ("todo".equals(type) && props.get("items") instanceof List<?> items) {
                parts.add(items.stream().map(i -> Req.map(i).get("text") == null ? "" : String.valueOf(Req.map(i).get("text"))).reduce("", (a, b) -> a + " " + b));
            }
        }
        return String.join("\n", parts);
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> normalizeBlocks(Object raw, String userId, boolean strict) {
        List<Map<String, Object>> input = Req.list(raw);
        if (input.size() > 200) throw ApiException.badRequest("单篇文章最多 200 个块");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> block : input) {
            String type = Db.str(block, "type");
            if (type == null || !BLOCK_TYPES.contains(type)) throw ApiException.badRequest("存在不支持的块类型");
            String id = Db.str(block, "id") == null || Db.str(block, "id").isBlank() ? UUID.randomUUID().toString() : Db.str(block, "id");
            Map<String, Object> p = Req.map(block.get("props"));
            Map<String, Object> props;
            switch (type) {
                case "paragraph" -> props = M.of().put("text", text(p.get("text"), 20_000)).map();
                case "heading" -> props = M.of().put("level", "3".equals(String.valueOf(p.get("level"))) ? 3 : 2).put("text", text(p.get("text"), 200)).map();
                case "quote" -> props = M.of().put("text", text(p.get("text"), 2000)).put("cite", text(p.get("cite"), 80)).map();
                case "list" -> {
                    List<String> items = textList(p.get("items"), 50);
                    if (items.isEmpty()) throw ApiException.badRequest("列表块至少需要一项内容");
                    props = M.of().put("ordered", Boolean.TRUE.equals(p.get("ordered"))).put("items", items).map();
                }
                case "todo" -> {
                    List<Map<String, Object>> items = new ArrayList<>();
                    if (p.get("items") instanceof List<?> list) {
                        for (Object item : list.subList(0, Math.min(50, list.size()))) {
                            Map<String, Object> im = Req.map(item);
                            items.add(M.of().put("text", text(im.get("text"), 500)).put("done", Boolean.TRUE.equals(im.get("done"))).map());
                        }
                    }
                    props = M.of().put("items", items).map();
                }
                case "divider" -> props = Map.of();
                case "image" -> {
                    String mediaId = text(p.get("mediaId"), 60);
                    if (mediaId.isBlank() && strict) throw ApiException.badRequest("图片块缺少图片");
                    if (!mediaId.isBlank()) media.owned(userId, mediaId);
                    props = M.of().put("mediaId", mediaId).put("caption", text(p.get("caption"), 200))
                            .put("alt", text(p.get("alt"), 200)).put("ratio", List.of("original", "1:1", "4:3", "16:9").contains(String.valueOf(p.get("ratio"))) ? p.get("ratio") : "original").map();
                }
                case "gallery" -> {
                    List<String> ids = new ArrayList<>();
                    if (p.get("mediaIds") instanceof List<?> list) {
                        for (Object v : list.subList(0, Math.min(9, list.size()))) {
                            String mid = text(v, 60);
                            if (!mid.isBlank()) ids.add(mid);
                        }
                    }
                    if (ids.isEmpty() && strict) throw ApiException.badRequest("相册块至少需要一张图片");
                    for (String mid : ids) media.owned(userId, mid);
                    props = M.of().put("mediaIds", ids).put("caption", text(p.get("caption"), 200)).map();
                }
                case "video" -> {
                    String mediaId = text(p.get("mediaId"), 60);
                    if (mediaId.isBlank() && strict) throw ApiException.badRequest("视频块缺少视频");
                    if (!mediaId.isBlank()) {
                        Map<String, Object> row = media.owned(userId, mediaId);
                        if (!"video".equals(Db.str(row, "type"))) throw ApiException.badRequest("该媒体不是视频");
                    }
                    props = M.of().put("mediaId", mediaId).put("caption", text(p.get("caption"), 200)).put("cover", text(p.get("cover"), 300)).map();
                }
                case "embed" -> {
                    String embedType = String.valueOf(p.get("embedType"));
                    if (!List.of("session", "checkin", "exercise").contains(embedType)) throw ApiException.badRequest("嵌入卡片类型不正确");
                    String refId = text(p.get("refId"), 60);
                    if (refId.isBlank() && strict) throw ApiException.badRequest("嵌入卡片缺少引用对象");
                    props = M.of().put("embedType", embedType).put("refId", refId).map();
                }
                default -> throw ApiException.badRequest("存在不支持的块类型");
            }
            out.add(M.of().put("id", id).put("type", type).put("version", 1).put("props", props).map());
        }
        return out;
    }

    public Map<String, Object> postDto(Map<String, Object> row, List<Map<String, Object>> blocks, Map<String, Object> extra) {
        Map<String, Object> result = M.of()
                .put("id", Db.str(row, "id"))
                .put("title", Db.str(row, "title"))
                .put("blocks", blocks)
                .put("blocksVersion", Db.lng(row, "blocks_version"))
                .put("status", Db.str(row, "status"))
                .put("visibility", Db.str(row, "visibility"))
                .put("coverUrl", coverUrl(row, blocks))
                .put("summary", Db.str(row, "summary"))
                .put("allowShare", Db.bool(row, "allow_share"))
                .put("allowIndex", Db.bool(row, "allow_index"))
                .put("reviewStatus", Db.str(row, "review_status"))
                .put("reviewReason", Db.str(row, "review_reason"))
                .put("publishedAt", Db.str(row, "published_at"))
                .put("createdAt", Db.str(row, "created_at"))
                .put("updatedAt", Db.str(row, "updated_at"))
                .put("likeCount", Db.lng(row, "like_count"))
                .put("commentCount", Db.lng(row, "comment_count"))
                .put("topicIds", Db.str(row, "topic_ids", "").isBlank() ? List.of() : List.of(Db.str(row, "topic_ids").split(",")))
                .map();
        if (extra != null) result.putAll(extra);
        return result;
    }

    private String coverUrl(Map<String, Object> row, List<Map<String, Object>> blocks) {
        String explicit = Db.str(row, "cover_url");
        if (explicit != null && !explicit.isBlank()) {
            if (explicit.startsWith("http")) return explicit;
            return media.sign(explicit, "thumb");
        }
        for (Map<String, Object> block : blocks) {
            String type = Db.str(block, "type");
            Map<String, Object> props = Req.map(block.get("props"));
            String id = "image".equals(type) ? Db.str(props, "mediaId") : "gallery".equals(type) && props.get("mediaIds") instanceof List<?> list && !list.isEmpty() ? String.valueOf(list.get(0)) : null;
            if (id != null && !id.isBlank()) return media.sign(id, "thumb");
        }
        return null;
    }

    public Map<String, Object> listMyPosts(String userId, String status) {
        String sql = "SELECT * FROM posts WHERE user_id = ? AND deleted_at IS NULL" + (status != null && !status.isBlank() && !"all".equals(status) ? " AND status = ?" : "") + " ORDER BY updated_at DESC";
        List<Map<String, Object>> rows = status != null && !status.isBlank() && !"all".equals(status)
                ? db.all(sql, userId, status) : db.all(sql, userId);
        Map<String, Object> counts = M.of().put("draft", 0).put("pending", 0).put("published", 0).put("rejected", 0).put("offline", 0).map();
        for (Map<String, Object> row : db.all("SELECT status FROM posts WHERE user_id = ? AND deleted_at IS NULL", userId)) {
            String key = Db.str(row, "status");
            counts.put(key, Db.lng(counts, key) + 1);
        }
        List<Map<String, Object>> items = rows.stream().map(row -> {
            List<Map<String, Object>> blocks = parseBlocks(Db.str(row, "blocks"));
            Map<String, Object> extra = M.of().put("viewCount", db.count("SELECT COUNT(*) AS n FROM post_views WHERE post_id = ?", Db.str(row, "id")))
                    .put("wordCount", plainText(blocks).length()).map();
            return postDto(row, blocks, extra);
        }).toList();
        return M.of().put("items", items).put("counts", counts).map();
    }

    public Map<String, Object> myPost(String userId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, userId);
        if (row == null) throw ApiException.notFound("文章不存在");
        List<Map<String, Object>> blocks = parseBlocks(Db.str(row, "blocks"));
        Map<String, Object> lock = db.one("SELECT * FROM post_locks WHERE post_id = ?", id);
        Map<String, Object> appeal = db.one("SELECT * FROM appeals WHERE post_id = ? ORDER BY created_at DESC LIMIT 1", id);
        Map<String, Object> extra = M.of()
                .put("viewCount", db.count("SELECT COUNT(*) AS n FROM post_views WHERE post_id = ?", id))
                .put("wordCount", plainText(blocks).length())
                .put("lock", lock == null ? null : M.of().put("device", Db.str(lock, "device")).put("lockedAt", Db.str(lock, "locked_at"))
                        .put("isMine", userId.equals(Db.str(lock, "user_id"))).map())
                .put("appeal", appeal == null ? null : M.of().put("id", Db.str(appeal, "id")).put("status", Db.str(appeal, "status"))
                        .put("reason", Db.str(appeal, "reason")).put("resolution", Db.str(appeal, "resolution")).map())
                .map();
        return postDto(row, blocks, extra);
    }

    public Map<String, Object> create(String userId, Map<String, Object> input) {
        String visibility = VISIBILITIES.contains(String.valueOf(input.get("visibility"))) ? String.valueOf(input.get("visibility")) : "private";
        String id = UUID.randomUUID().toString();
        String template = input.get("template") == null ? null : String.valueOf(input.get("template"));
        List<Map<String, Object>> blocks = new ArrayList<>();
        if ("session-review".equals(template)) {
            blocks.add(block("heading", M.of().put("level", 2).put("text", "本次训练")));
            blocks.add(block("embed", M.of().put("embedType", "session").put("refId", "")));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "感受与发现")));
            blocks.add(block("paragraph", M.of().put("text", "")));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "下次调整")));
            blocks.add(block("paragraph", M.of().put("text", "")));
        } else if ("cycle-summary".equals(template)) {
            blocks.add(block("heading", M.of().put("level", 2).put("text", "周期概览")));
            blocks.add(block("paragraph", M.of().put("text", "")));
            blocks.add(block("embed", M.of().put("embedType", "checkin").put("refId", TimeUtil.todayForString(-480))));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "数据变化")));
            blocks.add(block("paragraph", M.of().put("text", "")));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "下一周期计划")));
            blocks.add(block("list", M.of().put("ordered", false).put("items", List.of(""))));
        } else if ("exercise-guide".equals(template)) {
            blocks.add(block("paragraph", M.of().put("text", "")));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "动作要点")));
            blocks.add(block("list", M.of().put("ordered", true).put("items", List.of(""))));
            blocks.add(block("embed", M.of().put("embedType", "exercise").put("refId", "")));
            blocks.add(block("heading", M.of().put("level", 2).put("text", "常见错误")));
            blocks.add(block("paragraph", M.of().put("text", "")));
        }
        String title = input.get("title") == null ? "未命名文章" : String.valueOf(input.get("title"));
        if (title.length() > 60) title = title.substring(0, 60);
        db.update("INSERT INTO posts(id,user_id,title,blocks,blocks_version,status,visibility,summary,allow_share,allow_index,review_status,created_at,updated_at) VALUES(?,?,?,?,1,'draft',?,'',1,0,'none',?,?)",
                id, userId, title, writeBlocks(blocks), visibility, TimeUtil.now(), TimeUtil.now());
        audit.track(userId, "post_create", Map.of("template", template == null ? "" : template));
        return myPost(userId, id);
    }

    public Map<String, Object> update(String userId, String id, Map<String, Object> input) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("文章不存在");
        Map<String, Object> lock = db.one("SELECT * FROM post_locks WHERE post_id = ?", id);
        String device = input.get("device") == null ? null : String.valueOf(input.get("device"));
        if (lock != null) {
            boolean fresh = false;
            try { fresh = Instant.parse(Db.str(lock, "locked_at")).isAfter(Instant.now().minus(3, ChronoUnit.MINUTES)); } catch (Exception ignored) {}
            if (!userId.equals(Db.str(lock, "user_id"))) throw ApiException.forbidden("该文正在另一设备编辑");
            if (device != null && !device.equals(Db.str(lock, "device")) && fresh) throw ApiException.conflict("该文章正在另一设备编辑");
        }
        List<Map<String, Object>> blocks = input.containsKey("blocks")
                ? normalizeBlocks(input.get("blocks"), userId, false) : parseBlocks(Db.str(row, "blocks"));
        String title = input.containsKey("title") ? String.valueOf(input.get("title")) : Db.str(row, "title");
        if (title.length() > 60) title = title.substring(0, 60);
        String visibility = input.containsKey("visibility") && VISIBILITIES.contains(String.valueOf(input.get("visibility")))
                ? String.valueOf(input.get("visibility")) : Db.str(row, "visibility");
        boolean changed = !title.equals(Db.str(row, "title")) || !writeBlocks(blocks).equals(Db.str(row, "blocks")) || !visibility.equals(Db.str(row, "visibility"));
        Map<String, Object> lastVersion = db.one("SELECT created_at FROM post_versions WHERE post_id = ? ORDER BY created_at DESC LIMIT 1", id);
        boolean snapshot = lastVersion == null || Instant.parse(Db.str(lastVersion, "created_at")).isBefore(Instant.now().minus(5, ChronoUnit.MINUTES));
        if (snapshot && (!Db.str(row, "title", "").isBlank() || !parseBlocks(Db.str(row, "blocks")).isEmpty())) saveVersion(id, row, "auto");
        boolean recheck = changed && "published".equals(Db.str(row, "status")) && List.of("public", "unlisted").contains(visibility);
        String status = recheck ? "pending" : Db.str(row, "status");
        String reviewStatus = recheck ? "pending" : Db.str(row, "review_status");
        String summary = input.containsKey("summary") ? text(input.get("summary"), 200) : Db.str(row, "summary");
        int allowShare = input.containsKey("allowShare") ? (Boolean.TRUE.equals(input.get("allowShare")) ? 1 : 0) : (int) Db.lng(row, "allow_share");
        int allowIndex = input.containsKey("allowIndex") ? (Boolean.TRUE.equals(input.get("allowIndex")) ? 1 : 0) : (int) Db.lng(row, "allow_index");
        db.update("UPDATE posts SET title=?,blocks=?,visibility=?,allow_share=?,allow_index=?,summary=?,status=?,review_status=?,updated_at=? WHERE id=?",
                title, writeBlocks(blocks), visibility, allowShare, allowIndex, summary, status, reviewStatus, TimeUtil.now(), id);
        syncEmbeds(id, blocks);
        if (recheck) notifications.notify(userId, "review", "内容已进入审核", "已发布内容修改后需重新审核，审核通过前仅自己可见。", "recheck:" + id + ":" + TimeUtil.now());
        return myPost(userId, id);
    }

    public void syncEmbeds(String postId, List<Map<String, Object>> blocks) {
        db.update("DELETE FROM post_embeds WHERE post_id = ?", postId);
        for (Map<String, Object> block : blocks) {
            if (!"embed".equals(Db.str(block, "type"))) continue;
            Map<String, Object> p = Req.map(block.get("props"));
            String ref = Db.str(p, "refId");
            if (ref == null || ref.isBlank()) continue;
            db.update("INSERT INTO post_embeds(id,post_id,block_id,embed_type,ref_id) VALUES(?,?,?,?,?)",
                    UUID.randomUUID().toString(), postId, Db.str(block, "id"), Db.str(p, "embedType"), ref);
        }
    }

    private void saveVersion(String postId, Map<String, Object> row, String kind) {
        db.update("INSERT INTO post_versions(id,post_id,title,blocks,blocks_version,kind,created_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), postId, Db.str(row, "title"), Db.str(row, "blocks"), Db.lng(row, "blocks_version"), kind, TimeUtil.now());
        for (Map<String, Object> old : db.all("SELECT id FROM post_versions WHERE post_id = ? ORDER BY created_at DESC LIMIT 21 OFFSET 20", postId)) {
            db.update("DELETE FROM post_versions WHERE id = ?", Db.str(old, "id"));
        }
    }

    public Map<String, Object> publish(String userId, String id, Map<String, Object> input) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("文章不存在");
        Map<String, Object> user = db.one("SELECT banned_until FROM users WHERE id = ?", userId);
        if (user != null && Db.str(user, "banned_until") != null) {
            try {
                if (Instant.parse(Db.str(user, "banned_until")).isAfter(Instant.now())) {
                    throw ApiException.forbidden("账号因违规被限制发布，解除时间：" + Db.str(user, "banned_until").substring(0, 10));
                }
            } catch (ApiException e) { throw e; } catch (Exception ignored) {}
        }
        long publishToday = db.count("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND published_at >= ? AND id != ?", userId,
                LocalDate.now().toString() + "T00:00:00.000Z", id);
        if (publishToday >= 20) throw ApiException.tooMany("今日发布次数已达上限（20 篇），请明天再试");
        List<Map<String, Object>> blocks = normalizeBlocks(parseBlocks(Db.str(row, "blocks")), userId, true);
        String title = Db.str(row, "title", "").trim();
        if (title.isBlank()) throw ApiException.badRequest("请填写标题");
        if (blocks.isEmpty()) throw ApiException.badRequest("正文不能为空");
        if (plainText(blocks).isBlank() && blocks.stream().allMatch(b -> List.of("divider", "image", "gallery", "video").contains(Db.str(b, "type")))) {
            throw ApiException.badRequest("正文不能为空");
        }
        String visibility = input.containsKey("visibility") && VISIBILITIES.contains(String.valueOf(input.get("visibility")))
                ? String.valueOf(input.get("visibility")) : Db.str(row, "visibility");
        boolean isPublic = "public".equals(visibility) || "unlisted".equals(visibility);
        for (Map<String, Object> block : blocks) {
            if (!"embed".equals(Db.str(block, "type"))) continue;
            Map<String, Object> p = Req.map(block.get("props"));
            String type = Db.str(p, "embedType");
            String ref = Db.str(p, "refId");
            if ("session".equals(type) && db.one("SELECT id FROM workout_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL", ref, userId) == null) {
                throw ApiException.badRequest("嵌入的训练记录不存在或已删除");
            }
            if ("exercise".equals(type) && db.one("SELECT id FROM exercises WHERE id = ? AND archived = 0 AND (is_builtin = 1 OR owner_id = ?)", ref, userId) == null) {
                throw ApiException.badRequest("嵌入的动作不存在");
            }
        }
        String text = title + "\n" + plainText(blocks);
        ModerationService.Result review = moderation.review(text);
        if (!review.passed() && (isPublic || review.highRisk())) {
            String message = "内容命中安全规则：" + review.hits().stream().map(ModerationService.Hit::category).distinct().reduce((a, b) -> a + "、" + b).orElse("");
            db.update("UPDATE posts SET status='rejected',review_status='rejected',review_reason=?,updated_at=? WHERE id=?", message, TimeUtil.now(), id);
            db.update("INSERT INTO review_logs(id,post_id,actor_id,action,reason,rule_codes,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), id, null, "machine_reject", message,
                    review.hits().stream().map(ModerationService.Hit::ruleCode).distinct().reduce((a, b) -> a + "," + b).orElse(""),
                    "发布时文本机审命中", TimeUtil.now());
            notifications.notify(userId, "review", "内容未通过安全审核", message, "reject:" + id + ":" + TimeUtil.now());
            throw new ApiException(422, "MODERATION_REJECTED", message, Map.of("hits", moderation.hitDetails(text, review)));
        }
        String status = "published", reviewStatus = "approved", reason = null;
        boolean deferred = false;
        Map<String, Object> quotaInfo = null;
        if (isPublic) {
            int limit = settings.intValue("public_daily_quota", 20);
            long used = db.count("SELECT COUNT(DISTINCT post_id) AS n FROM review_logs WHERE action = 'submit' AND created_at >= ?",
                    LocalDate.now().toString() + "T00:00:00.000Z");
            quotaInfo = M.of().put("used", used).put("limit", limit).map();
            db.update("INSERT INTO review_logs(id,post_id,actor_id,action,reason,rule_codes,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), id, null, "submit", null, null, "用户提交公开发布", TimeUtil.now());
            if (used >= limit) {
                status = "pending";
                reviewStatus = "quota_deferred";
                reason = "今日公开名额已用完，已保存为仅自己可见，明日优先处理";
                deferred = true;
                notifications.notify(userId, "review", "公开名额已用完", reason, "quota:" + id + ":" + TimeUtil.now());
            } else {
                status = "pending";
                reviewStatus = "pending";
            }
        }
        int allowShare = input.containsKey("allowShare") ? (Boolean.TRUE.equals(input.get("allowShare")) ? 1 : 0) : (int) Db.lng(row, "allow_share");
        int allowIndex = input.containsKey("allowIndex") ? (Boolean.TRUE.equals(input.get("allowIndex")) ? 1 : 0) : ("public".equals(visibility) ? 1 : 0);
        String summary = input.containsKey("summary") ? text(input.get("summary"), 200) : Db.str(row, "summary");
        String cover = input.get("coverMediaId") == null ? Db.str(row, "cover_url") : text(input.get("coverMediaId"), 60);
        db.update("UPDATE posts SET title=?,status=?,visibility=?,allow_share=?,allow_index=?,summary=?,cover_url=?,review_status=?,review_reason=?,published_at=?,updated_at=? WHERE id=?",
                title, status, visibility, allowShare, allowIndex, summary, cover, reviewStatus, reason, TimeUtil.now(), TimeUtil.now(), id);
        audit.track(userId, "post_publish", Map.of("visibility", visibility, "block_count", blocks.size(),
                "has_video", blocks.stream().anyMatch(b -> "video".equals(Db.str(b, "type"))),
                "has_embed", blocks.stream().anyMatch(b -> "embed".equals(Db.str(b, "type"))), "review_result", reviewStatus));
        return M.of().put("post", myPost(userId, id)).put("deferred", deferred).put("quota", quotaInfo)
                .put("message", deferred ? "今日公开名额已用完，已保存为仅自己可见，明日优先处理" : null).map();
    }

    public Map<String, Object> unpublish(String userId, String id) {
        if (db.one("SELECT id FROM posts WHERE id = ? AND user_id = ?", id, userId) == null) throw ApiException.notFound("文章不存在");
        db.update("UPDATE posts SET status='offline',updated_at=? WHERE id=?", TimeUtil.now(), id);
        return myPost(userId, id);
    }

    public void delete(String userId, String id) {
        if (db.one("SELECT id FROM posts WHERE id = ? AND user_id = ?", id, userId) == null) throw ApiException.notFound("文章不存在");
        db.update("UPDATE posts SET deleted_at=? WHERE id=?", TimeUtil.now(), id);
        db.update("DELETE FROM post_locks WHERE post_id = ?", id);
    }

    public List<Map<String, Object>> versions(String userId, String id) {
        if (db.one("SELECT id FROM posts WHERE id = ? AND user_id = ?", id, userId) == null) throw ApiException.notFound("文章不存在");
        return db.all("SELECT id,kind,created_at,title,blocks FROM post_versions WHERE post_id = ? ORDER BY created_at DESC LIMIT 20", id)
                .stream().map(v -> {
                    List<Map<String, Object>> blocks = parseBlocks(Db.str(v, "blocks"));
                    String preview = plainText(blocks);
                    return M.of().put("id", Db.str(v, "id")).put("kind", Db.str(v, "kind")).put("createdAt", Db.str(v, "created_at"))
                            .put("title", Db.str(v, "title")).put("blockCount", blocks.size())
                            .put("preview", preview.length() > 80 ? preview.substring(0, 80) : preview).map();
                }).toList();
    }

    public List<Map<String, Object>> snapshot(String userId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("文章不存在");
        saveVersion(id, row, "manual");
        return versions(userId, id);
    }

    public Map<String, Object> restore(String userId, String id, String versionId) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ?", id, userId);
        if (row == null) throw ApiException.notFound("文章不存在");
        Map<String, Object> version = db.one("SELECT * FROM post_versions WHERE id = ? AND post_id = ?", versionId, id);
        if (version == null) throw ApiException.notFound("版本不存在");
        saveVersion(id, row, "auto");
        db.update("UPDATE posts SET title=?,blocks=?,updated_at=?,status=CASE WHEN status='published' THEN 'pending' ELSE status END WHERE id=?",
                Db.str(version, "title"), Db.str(version, "blocks"), TimeUtil.now(), id);
        syncEmbeds(id, parseBlocks(Db.str(version, "blocks")));
        return myPost(userId, id);
    }

    public Map<String, Object> lock(String userId, String id, String device) {
        if (db.one("SELECT id FROM posts WHERE id = ? AND user_id = ?", id, userId) == null) throw ApiException.notFound("文章不存在");
        Map<String, Object> lock = db.one("SELECT * FROM post_locks WHERE post_id = ?", id);
        if (lock != null && !device.equals(Db.str(lock, "device"))) {
            try {
                if (Instant.parse(Db.str(lock, "locked_at")).isAfter(Instant.now().minus(3, ChronoUnit.MINUTES))) {
                    return M.of().put("locked", true).put("holder", M.of().put("device", Db.str(lock, "device")).put("lockedAt", Db.str(lock, "locked_at")))
                            .put("message", "该文章正在另一设备编辑").map();
                }
            } catch (Exception ignored) {}
        }
        db.update("INSERT INTO post_locks(post_id,user_id,device,locked_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),device=VALUES(device),locked_at=VALUES(locked_at)",
                id, userId, device, TimeUtil.now());
        return M.of().put("locked", false).put("holder", null).put("message", null).map();
    }

    public Map<String, Object> takeover(String userId, String id, String device) {
        return lock(userId, id, device);
    }

    public void unlock(String userId, String id, String device) {
        db.update("DELETE FROM post_locks WHERE post_id = ? AND user_id = ? AND device = ?", id, userId, device);
    }

    public Map<String, Object> publicPost(String id, String viewerId, String deviceId, boolean skipView) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", id);
        if (row == null) throw ApiException.notFound("内容不存在");
        boolean owner = viewerId != null && viewerId.equals(Db.str(row, "user_id"));
        if (!owner) {
            if (!"published".equals(Db.str(row, "status")) || !"approved".equals(Db.str(row, "review_status"))) {
                throw new ApiException(403, "NOT_PUBLIC", "内容暂不可见（审核中或未公开）");
            }
            if (!List.of("public", "unlisted").contains(Db.str(row, "visibility"))) throw ApiException.forbidden("无权访问该内容");
        }
        Map<String, Object> author = db.one("SELECT id,nickname,avatar FROM users WHERE id = ?", Db.str(row, "user_id"));
        if (!skipView && deviceId != null && !owner) {
            db.update("INSERT IGNORE INTO post_views(id,post_id,device_id,view_date,created_at) VALUES(?,?,?,?,?)",
                    UUID.randomUUID().toString(), id, deviceId, TimeUtil.todayForString(-480), TimeUtil.now());
        }
        long views = db.count("SELECT COUNT(*) AS n FROM post_views WHERE post_id = ?", id);
        List<Map<String, Object>> blocks = enrichBlocks(row, parseBlocks(Db.str(row, "blocks")), viewerId);
        Map<String, Object> extra = M.of()
                .put("author", author == null ? null : M.of().put("id", Db.str(author, "id")).put("nickname", Db.str(author, "nickname")).put("avatar", Db.str(author, "avatar")).map())
                .put("viewCount", owner ? views : null).put("isOwner", owner).put("shareUrl", "/p/" + id).map();
        return postDto(row, blocks, extra);
    }

    private List<Map<String, Object>> enrichBlocks(Map<String, Object> row, List<Map<String, Object>> blocks, String viewerId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> block : blocks) {
            String type = Db.str(block, "type");
            Map<String, Object> props = new HashMap<>(Req.map(block.get("props")));
            if (List.of("image", "gallery", "video").contains(type)) {
                List<String> ids = new ArrayList<>();
                if ("gallery".equals(type) && props.get("mediaIds") instanceof List<?> list) list.forEach(v -> ids.add(String.valueOf(v)));
                else if (props.get("mediaId") != null && !String.valueOf(props.get("mediaId")).isBlank()) ids.add(String.valueOf(props.get("mediaId")));
                List<Map<String, Object>> medias = new ArrayList<>();
                for (String mediaId : ids) {
                    Map<String, Object> m = db.one("SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL", mediaId);
                    if (m != null) medias.add(media.mediaDto(m));
                }
                props.put("media", medias);
                if (props.get("cover") == null && !medias.isEmpty()) props.put("cover", medias.get(0).get("thumbUrl"));
            }
            if ("embed".equals(type)) {
                props.put("data", resolveEmbed(Db.str(row, "user_id"), props, viewerId));
            }
            out.add(M.of().put("id", Db.str(block, "id")).put("type", type).put("version", Db.lng(block, "version")).put("props", props).map());
        }
        return out;
    }

    private Map<String, Object> resolveEmbed(String authorId, Map<String, Object> props, String viewerId) {
        String type = Db.str(props, "embedType");
        String ref = Db.str(props, "refId");
        if ("session".equals(type)) {
            Map<String, Object> s = db.one("SELECT * FROM workout_sessions WHERE id = ? AND deleted_at IS NULL", ref);
            if (s == null) return M.of().put("type", "session").put("deleted", true).put("message", "该训练记录已删除").map();
            long items = db.count("SELECT COUNT(*) AS n FROM workout_items WHERE session_id = ?", ref);
            long sets = db.count("SELECT COUNT(*) AS n FROM workout_sets WHERE session_id = ?", ref);
            List<String> names = db.all("SELECT e.name FROM workout_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.session_id = ? ORDER BY i.sort_order", ref)
                    .stream().map(r -> Db.str(r, "name")).toList();
            return M.of().put("type", "session").put("deleted", false).put("id", ref).put("title", Db.str(s, "title"))
                    .put("localDate", Db.str(s, "local_date")).put("durationSec", Db.lng(s, "duration_sec"))
                    .put("volumeKg", Metrics.round(Db.dbl(s, "volume_kg", 0), 1)).put("itemCount", items).put("setCount", sets)
                    .put("exerciseNames", names).put("typeLabel", Db.str(s, "type")).map();
        }
        if ("checkin".equals(type)) {
            if (ref == null || !ref.matches("\\d{4}-\\d{2}-\\d{2}")) return M.of().put("type", "checkin").put("deleted", true).put("message", "打卡数据不可用").map();
            String month = ref.substring(0, 7);
            Map<String, Object> user = db.one("SELECT id,tz_offset FROM users WHERE id = ?", authorId);
            List<Map<String, Object>> days = db.all("SELECT local_date,source FROM checkins WHERE user_id = ? AND local_date LIKE ? AND status='active'", authorId, month + "-%");
            int streak = user == null ? 0 : checkins.streak(authorId, (int) Db.lng(user, "tz_offset"));
            return M.of().put("type", "checkin").put("deleted", false).put("date", ref).put("month", month)
                    .put("days", days.stream().map(d -> M.of().put("date", Db.str(d, "local_date")).put("source", Db.str(d, "source")).map()).toList())
                    .put("streak", streak).map();
        }
        if ("exercise".equals(type)) {
            Map<String, Object> exercise = db.one("SELECT id,name,primary_muscle,equipment FROM exercises WHERE id = ? AND archived = 0", ref);
            if (exercise == null) return M.of().put("type", "exercise").put("deleted", true).put("message", "该动作已归档").map();
            return M.of().put("type", "exercise").put("deleted", false).put("id", Db.str(exercise, "id")).put("name", Db.str(exercise, "name"))
                    .put("primaryMuscle", Db.str(exercise, "primary_muscle")).put("equipment", Db.str(exercise, "equipment"))
                    .put("prs", viewerId == null ? null : exercises.prSummary(viewerId, Db.str(exercise, "id"))).map();
        }
        return M.of().put("type", "embed").put("deleted", true).put("message", "引用内容不可用").map();
    }

    public Map<String, Object> shareCard(String id, String origin) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", id);
        if (row == null) throw ApiException.notFound("内容不存在");
        if (!Db.bool(row, "allow_share")) throw ApiException.forbidden("作者已关闭分享");
        if (!"published".equals(Db.str(row, "status")) || !"approved".equals(Db.str(row, "review_status"))
                || !List.of("public", "unlisted").contains(Db.str(row, "visibility"))) throw ApiException.forbidden("内容不可访问");
        Map<String, Object> author = db.one("SELECT nickname,tz_offset FROM users WHERE id = ?", Db.str(row, "user_id"));
        List<Map<String, Object>> blocks = parseBlocks(Db.str(row, "blocks"));
        Double volume = null;
        for (Map<String, Object> block : blocks) {
            Map<String, Object> p = Req.map(block.get("props"));
            if ("embed".equals(Db.str(block, "type")) && "session".equals(Db.str(p, "embedType"))) {
                Map<String, Object> s = db.one("SELECT volume_kg FROM workout_sessions WHERE id = ? AND deleted_at IS NULL", Db.str(p, "refId"));
                if (s != null) volume = Metrics.round(Db.dbl(s, "volume_kg", 0), 1);
                break;
            }
        }
        int streak = author == null ? 0 : checkins.streak(Db.str(row, "user_id"), (int) Db.lng(author, "tz_offset"));
        return M.of().put("id", id).put("title", Db.str(row, "title")).put("summary", Db.str(row, "summary"))
                .put("coverUrl", coverUrl(row, blocks)).put("author", author == null ? "" : Db.str(author, "nickname"))
                .put("publishedAt", Db.str(row, "published_at")).put("volumeKg", volume).put("streak", streak)
                .put("url", origin + "/p/" + id).map();
    }

    public Map<String, Object> report(String postId, String reporterId, Map<String, Object> body) {
        if (db.one("SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL", postId) == null) throw ApiException.notFound("内容不存在");
        String reason = text(body.get("reason"), 50);
        if (reason.isBlank()) throw ApiException.badRequest("请选择举报原因");
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO reports(id,post_id,reporter_id,reason,detail,status,created_at) VALUES(?,?,?,?,?,'open',?)",
                id, postId, reporterId, reason, text(body.get("detail"), 500), TimeUtil.now());
        audit.audit(reporterId, "report_create", "post", postId, Map.of("reason", reason));
        return M.of().put("id", id).put("status", "open").put("message", "举报已提交，我们将在 24 小时内响应").map();
    }

    public Map<String, Object> appeal(String userId, String postId, String reason) {
        Map<String, Object> post = db.one("SELECT * FROM posts WHERE id = ? AND user_id = ?", postId, userId);
        if (post == null) throw ApiException.notFound("文章不存在");
        if (!List.of("rejected", "offline").contains(Db.str(post, "status")) && !"restricted".equals(Db.str(post, "review_status"))) {
            throw ApiException.badRequest("当前内容无需申诉");
        }
        if (db.one("SELECT 1 FROM appeals WHERE post_id = ? AND user_id = ?", postId, userId) != null) throw ApiException.conflict("每条内容仅可申诉一次");
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO appeals(id,post_id,user_id,reason,status,created_at) VALUES(?,?,?,?,'open',?)", id, postId, userId, reason.substring(0, Math.min(500, reason.length())), TimeUtil.now());
        return M.of().put("id", id).put("status", "open").put("message", "申诉已提交，48 小时内答复").map();
    }

    public Map<String, Object> adminPost(String id) {
        Map<String, Object> row = db.one("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", id);
        if (row == null) throw ApiException.notFound("文章不存在");
        Map<String, Object> author = db.one("SELECT id,nickname,avatar FROM users WHERE id = ?", Db.str(row, "user_id"));
        List<Map<String, Object>> blocks = parseBlocks(Db.str(row, "blocks"));
        return postDto(row, enrichBlocks(row, blocks, null), M.of()
                .put("author", author == null ? null : M.of().put("id", Db.str(author, "id")).put("nickname", Db.str(author, "nickname")).put("avatar", Db.str(author, "avatar")).map())
                .put("isOwner", false).put("reviewLogs", reviewLogs(id)).map());
    }

    public Map<String, Object> queue() {
        List<Map<String, Object>> posts = db.all("SELECT p.*,u.nickname AS author_nickname FROM posts p JOIN users u ON u.id=p.user_id WHERE p.deleted_at IS NULL AND (p.status='pending' OR p.review_status='quota_deferred') ORDER BY p.published_at ASC")
                .stream().map(row -> {
                    List<Map<String, Object>> blocks = parseBlocks(Db.str(row, "blocks"));
                    return postDto(row, blocks, M.of().put("author", Db.str(row, "author_nickname"))
                            .put("preview", plainText(blocks).substring(0, Math.min(180, plainText(blocks).length())))
                            .put("blockCount", blocks.size()).put("hasVideo", blocks.stream().anyMatch(b -> "video".equals(Db.str(b, "type"))))
                            .put("highRisk", false).map());
                }).toList();
        List<Map<String, Object>> reports = db.all("SELECT r.*,p.title AS post_title,p.user_id AS post_owner,u.nickname AS reporter FROM reports r JOIN posts p ON p.id=r.post_id LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.created_at ASC")
                .stream().map(r -> M.of().put("id", Db.str(r, "id")).put("postId", Db.str(r, "post_id")).put("postTitle", Db.str(r, "post_title"))
                        .put("postOwner", Db.str(r, "post_owner")).put("reporter", Db.str(r, "reporter")).put("reason", Db.str(r, "reason"))
                        .put("detail", Db.str(r, "detail")).put("createdAt", Db.str(r, "created_at")).map()).toList();
        List<Map<String, Object>> appeals = db.all("SELECT a.*,p.title AS post_title FROM appeals a JOIN posts p ON p.id=a.post_id WHERE a.status='open' ORDER BY a.created_at ASC")
                .stream().map(a -> M.of().put("id", Db.str(a, "id")).put("postId", Db.str(a, "post_id")).put("postTitle", Db.str(a, "post_title"))
                        .put("userId", Db.str(a, "user_id")).put("reason", Db.str(a, "reason")).put("createdAt", Db.str(a, "created_at")).map()).toList();
        return M.of().put("posts", posts).put("reports", reports).put("appeals", appeals).put("assignee", settings.get("review_assignee", "")).map();
    }

    public Map<String, Object> review(String adminId, String postId, Map<String, Object> input) {
        Map<String, Object> post = db.one("SELECT * FROM posts WHERE id = ?", postId);
        if (post == null) throw ApiException.notFound("文章不存在");
        String action = String.valueOf(input.getOrDefault("action", "approve"));
        String reason = input.get("reason") == null ? null : text(input.get("reason"), 200);
        String message;
        if ("approve".equals(action)) {
            db.update("UPDATE posts SET status='published',review_status='approved',review_reason=NULL,published_at=?,updated_at=? WHERE id=?", TimeUtil.now(), TimeUtil.now(), postId);
            message = "内容审核通过，已公开";
        } else if ("limit".equals(action)) {
            db.update("UPDATE posts SET status='published',visibility='private',review_status='restricted',review_reason=?,updated_at=? WHERE id=?",
                    reason == null ? "仅自己可见：内容存在轻度风险" : reason, TimeUtil.now(), postId);
            message = "内容已被限流，仅自己可见";
        } else if ("takedown".equals(action)) {
            db.update("UPDATE posts SET status='offline',review_status='rejected',review_reason=?,updated_at=? WHERE id=?",
                    reason == null ? "内容违规，已下架" : reason, TimeUtil.now(), postId);
            message = "内容已下架";
        } else {
            String until = TimeUtil.addDays(TimeUtil.todayForString(-480), 7) + "T00:00:00.000Z";
            db.update("UPDATE users SET banned_until=? WHERE id=?", until, Db.str(post, "user_id"));
            db.update("UPDATE posts SET status='offline',review_status='rejected',review_reason=?,updated_at=? WHERE id=?",
                    reason == null ? "账号违规，内容下架并限制发布 7 天" : reason, TimeUtil.now(), postId);
            message = "已下架内容并限制账号发布 7 天";
        }
        db.update("INSERT INTO review_logs(id,post_id,actor_id,action,reason,rule_codes,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), postId, adminId, action, reason == null ? message : reason,
                input.get("ruleCodes") instanceof List<?> list ? list.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("") : "",
                input.get("note") == null ? null : text(input.get("note"), 500), TimeUtil.now());
        audit.audit(adminId, "review_" + action, "post", postId, Map.of("reason", reason == null ? "" : reason));
        notifications.notify(Db.str(post, "user_id"), "review", message, reason == null ? "可在文章列表查看处理结果，如有异议可提交申诉。" : reason, "review:" + postId + ":" + TimeUtil.now());
        return M.of().put("post", publicPost(postId, Db.str(post, "user_id"), null, true)).put("message", message).map();
    }

    public void handleReport(String adminId, String reportId, Map<String, Object> input) {
        Map<String, Object> report = db.one("SELECT * FROM reports WHERE id = ?", reportId);
        if (report == null) throw ApiException.notFound("举报工单不存在");
        String result = String.valueOf(input.getOrDefault("result", "dismiss"));
        db.update("UPDATE reports SET status='resolved',result=?,handled_at=?,handled_by=? WHERE id=?", result, TimeUtil.now(), adminId, reportId);
        if ("takedown".equals(result)) {
            db.update("UPDATE posts SET status='offline',review_status='rejected',review_reason=?,updated_at=? WHERE id=?",
                    "因举报核实违规，内容已下架", TimeUtil.now(), Db.str(report, "post_id"));
            Map<String, Object> post = db.one("SELECT user_id FROM posts WHERE id = ?", Db.str(report, "post_id"));
            if (post != null) notifications.notify(Db.str(post, "user_id"), "review", "内容因举报下架", "可在文章详情提交一次申诉。", "report:" + reportId);
        }
        audit.audit(adminId, "report_handle", "report", reportId, Map.of("result", result));
    }

    public void resolveAppeal(String adminId, String appealId, boolean approve, String resolution) {
        Map<String, Object> appeal = db.one("SELECT * FROM appeals WHERE id = ?", appealId);
        if (appeal == null) throw ApiException.notFound("申诉不存在");
        db.update("UPDATE appeals SET status=?,resolution=?,resolved_at=?,resolved_by=? WHERE id=?",
                approve ? "approved" : "rejected", text(resolution, 300), TimeUtil.now(), adminId, appealId);
        if (approve) {
            db.update("UPDATE posts SET status='published',review_status='approved',review_reason=NULL,visibility=CASE WHEN visibility='private' THEN 'public' ELSE visibility END,updated_at=? WHERE id=?",
                    TimeUtil.now(), Db.str(appeal, "post_id"));
            db.update("INSERT INTO review_logs(id,post_id,actor_id,action,reason,rule_codes,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), Db.str(appeal, "post_id"), adminId, "appeal_approved", resolution, null, "申诉成功，标记误判，不计入违规", TimeUtil.now());
        }
        notifications.notify(Db.str(appeal, "user_id"), "appeal", approve ? "申诉已通过" : "申诉未通过", resolution, "appeal:" + appealId);
        audit.audit(adminId, "appeal_resolve", "appeal", appealId, Map.of("approve", approve, "resolution", resolution));
    }

    public Map<String, Object> dashboard() {
        long total = db.count("SELECT COUNT(*) AS n FROM review_logs WHERE action='submit'");
        long machineRejects = db.count("SELECT COUNT(*) AS n FROM review_logs WHERE action='machine_reject'");
        long approved = db.count("SELECT COUNT(*) AS n FROM review_logs WHERE action='approve'");
        long appeals = db.count("SELECT COUNT(*) AS n FROM appeals");
        long appealApproved = db.count("SELECT COUNT(*) AS n FROM appeals WHERE status='approved'");
        long openReports = db.count("SELECT COUNT(*) AS n FROM reports WHERE status='open'");
        long handled = db.count("SELECT COUNT(*) AS n FROM reports WHERE status='resolved'");
        List<Map<String, Object>> published = db.all("SELECT created_at,published_at FROM posts WHERE status='published' AND published_at IS NOT NULL");
        double avgHours = 0;
        int count = 0;
        for (Map<String, Object> p : published) {
            try {
                avgHours += java.time.Duration.between(Instant.parse(Db.str(p, "created_at")), Instant.parse(Db.str(p, "published_at"))).toMinutes() / 60.0;
                count++;
            } catch (Exception ignored) {}
        }
        if (count > 0) avgHours /= count;
        long communityClicks = db.count("SELECT COUNT(*) AS n FROM events WHERE name='reserved_entry_click'");
        long activeUsers = db.count("SELECT COUNT(DISTINCT user_id) AS n FROM events");
        long platformUsers = db.count("SELECT COUNT(*) AS n FROM users");
        long sessions = db.count("SELECT COUNT(*) AS n FROM workout_sessions WHERE deleted_at IS NULL");
        long mediaCount = db.count("SELECT COUNT(*) AS n FROM media_assets WHERE deleted_at IS NULL");
        long postViews = db.count("SELECT COUNT(*) AS n FROM post_views");
        return M.of()
                .put("review", M.of().put("dailyVolume", total)
                        .put("machineHitRate", total > 0 ? Metrics.round(machineRejects * 100.0 / total, 1) : 0)
                        .put("humanApprovalRate", total > 0 ? Metrics.round(approved * 100.0 / Math.max(1, total - machineRejects), 1) : 0)
                        .put("avgHandleHours", Metrics.round(avgHours, 1))
                        .put("appealRate", total > 0 ? Metrics.round(appeals * 100.0 / total, 1) : 0)
                        .put("misjudgeRate", appeals > 0 ? Metrics.round(appealApproved * 100.0 / appeals, 1) : 0)
                        .put("openReports", openReports).put("handledReports", handled)
                        .put("pending", db.count("SELECT COUNT(*) AS n FROM posts WHERE status='pending'"))
                        .put("communityClickRate", activeUsers > 0 ? Metrics.round(communityClicks * 100.0 / activeUsers, 1) : 0)
                        .put("alert", total > 0 && machineRejects * 1.0 / total > 0.3 ? "机审拦截率突增，请排查规则与词库" : null))
                .put("platform", M.of().put("users", platformUsers).put("sessions", sessions).put("mediaCount", mediaCount).put("postViews", postViews))
                .put("quota", M.of().put("publicDailyQuota", settings.intValue("public_daily_quota", 20))
                        .put("usedToday", db.count("SELECT COUNT(DISTINCT post_id) AS n FROM review_logs WHERE action='submit' AND created_at >= ?", LocalDate.now().toString() + "T00:00:00.000Z"))
                        .put("assignee", settings.get("review_assignee", "")))
                .put("communityVisible", settings.bool("community_visible", true))
                .map();
    }

    public List<Map<String, Object>> reviewLogs(String postId) {
        return db.all("SELECT r.*,u.nickname AS actor FROM review_logs r LEFT JOIN users u ON u.id=r.actor_id " +
                        (postId == null ? "" : "WHERE r.post_id = ? ") + "ORDER BY r.created_at DESC LIMIT 100",
                        postId == null ? new Object[]{} : new Object[]{postId})
                .stream().map(r -> M.of().put("id", Db.str(r, "id")).put("postId", Db.str(r, "post_id"))
                        .put("actor", Db.str(r, "actor", "系统")).put("action", Db.str(r, "action")).put("reason", Db.str(r, "reason"))
                        .put("ruleCodes", Db.str(r, "rule_codes")).put("note", Db.str(r, "note")).put("createdAt", Db.str(r, "created_at")).map()).toList();
    }

    public List<Map<String, Object>> rules() {
        return db.all("SELECT * FROM review_rules ORDER BY code").stream().map(r -> M.of().put("code", Db.str(r, "code"))
                .put("title", Db.str(r, "title")).put("level", Db.str(r, "level")).put("description", Db.str(r, "description"))
                .put("active", Db.bool(r, "active")).put("version", Db.lng(r, "version")).map()).toList();
    }

    public List<Map<String, Object>> upsertRule(String code, Map<String, Object> input) {
        Map<String, Object> existing = db.one("SELECT * FROM review_rules WHERE code = ?", code);
        String title = String.valueOf(input.getOrDefault("title", ""));
        String level = String.valueOf(input.getOrDefault("level", "limit"));
        String description = String.valueOf(input.getOrDefault("description", ""));
        boolean active = Boolean.TRUE.equals(input.get("active"));
        if (existing == null) {
            db.update("INSERT INTO review_rules(code,title,level,description,active,version,created_at) VALUES(?,?,?,?,?,1,?)",
                    code, title, level, description, active ? 1 : 0, TimeUtil.now());
        } else {
            db.update("UPDATE review_rules SET title=?,level=?,description=?,active=?,version=version+1 WHERE code=?",
                    title, level, description, active ? 1 : 0, code);
        }
        return rules();
    }

    private Map<String, Object> block(String type, Map<String, Object> props) {
        return M.of().put("id", UUID.randomUUID().toString()).put("type", type).put("version", 1).put("props", props).map();
    }

    private String text(Object value, int max) {
        if (value == null) return "";
        String s = String.valueOf(value);
        return s.length() > max ? s.substring(0, max) : s;
    }

    private List<String> textList(Object raw, int max) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) for (Object o : list.subList(0, Math.min(max, list.size()))) out.add(text(o, 500));
        return out;
    }
}
