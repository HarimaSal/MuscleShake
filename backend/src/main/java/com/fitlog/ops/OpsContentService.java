package com.fitlog.ops;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OpsContentService {
    public static final List<String> TYPES = List.of("announcement", "article", "help", "banner");
    public static final List<String> OFFICIAL_USER = List.of("ops-official");

    private final Db db;
    private final ObjectMapper json;
    private final OpsAuditService audit;

    public OpsContentService(Db db, ObjectMapper json, OpsAuditService audit) {
        this.db = db;
        this.json = json;
        this.audit = audit;
    }

    public Map<String, Object> list(String type, String status, int page, int pageSize) {
        processDue();
        StringBuilder where = new StringBuilder(" WHERE p.deleted_at IS NULL AND oc.official_type IS NOT NULL");
        List<Object> args = new ArrayList<>();
        if (type != null && !type.isBlank()) {
            where.append(" AND oc.official_type = ?");
            args.add(type);
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND oc.status = ?");
            args.add(status);
        }
        long total = db.count("SELECT COUNT(*) AS n FROM official_contents oc JOIN posts p ON p.id=oc.post_id" + where, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(Math.min(100, Math.max(10, pageSize)));
        pageArgs.add(Math.max(0, (page - 1) * Math.min(100, Math.max(10, pageSize))));
        List<Map<String, Object>> rows = db.all("""
                SELECT oc.*, p.title, p.summary, p.status AS post_status, p.visibility, p.published_at, p.updated_at,
                  (SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id) AS views
                FROM official_contents oc JOIN posts p ON p.id=oc.post_id
                """ + where + " ORDER BY oc.updated_at DESC LIMIT ? OFFSET ?", pageArgs.toArray());
        return M.of().put("items", rows.stream().map(this::dto).toList()).put("total", total).put("page", page).put("pageSize", pageSize).map();
    }

    public Map<String, Object> detail(String id) {
        processDue();
        Map<String, Object> row = db.one("""
                SELECT oc.*, p.title, p.summary, p.blocks, p.status AS post_status, p.visibility, p.published_at,
                  (SELECT COUNT(*) FROM post_views v WHERE v.post_id=p.id) AS views
                FROM official_contents oc JOIN posts p ON p.id=oc.post_id WHERE oc.id = ?
                """, id);
        if (row == null) throw ApiException.notFound("官方内容不存在");
        Map<String, Object> result = dto(row);
        String draftBlocks = Db.str(row, "draft_blocks");
        boolean hasDraft = draftBlocks != null && !draftBlocks.isBlank();
        try {
            result.put("blocks", json.readValue(hasDraft ? draftBlocks : Db.str(row, "blocks", "[]"), new TypeReference<List<Map<String, Object>>>() {}));
        } catch (Exception e) {
            result.put("blocks", List.of());
        }
        result.put("hasDraft", hasDraft);
        result.put("draftTitle", Db.str(row, "draft_title"));
        result.put("draftSummary", Db.str(row, "draft_summary"));
        result.put("publishedTitle", Db.str(row, "title"));
        if (hasDraft && !Db.str(row, "draft_title", "").isBlank()) result.put("title", Db.str(row, "draft_title"));
        if (hasDraft && !Db.str(row, "draft_summary", "").isBlank()) result.put("summary", Db.str(row, "draft_summary"));
        result.put("checklist", parseChecklist(Db.str(row, "checklist_json", "[]")));
        result.put("stats", M.of().put("views", Db.lng(row, "views"))
                .put("exposures", db.count("SELECT COUNT(*) AS n FROM events WHERE name='official_content_view' AND JSON_UNQUOTE(JSON_EXTRACT(props,'$.content_id'))=?", id))
                .put("templateUses", db.count("SELECT COUNT(*) AS n FROM events WHERE name='template_use' AND JSON_UNQUOTE(JSON_EXTRACT(props,'$.template_id'))=?", id)).map());
        return result;
    }

    @Transactional
    public Map<String, Object> create(String adminId, Map<String, Object> body) {
        processDue();
        String type = String.valueOf(body.getOrDefault("type", "article"));
        if (!TYPES.contains(type)) throw ApiException.badRequest("官方内容类型不正确");
        String title = text(body.get("title"), 100);
        if (title.isBlank()) throw ApiException.badRequest("请填写标题");
        String blocks = normalizeBlocks(body.get("blocks"));
        String id = UUID.randomUUID().toString();
        String postId = "official-" + UUID.randomUUID();
        String now = TimeUtil.now();
        String publishAt = text(body.get("publishAt"), 40);
        String offlineAt = text(body.get("offlineAt"), 40);
        if ("banner".equals(type)) {
            if (title.length() > 60) throw ApiException.badRequest("横幅标题不能超过 60 字");
            if (offlineAt.isBlank()) throw ApiException.badRequest("横幅必须设置下线时间");
            ensureBannerLimit(now);
        }
        db.update("""
                INSERT INTO posts(id,user_id,title,blocks,blocks_version,status,visibility,summary,allow_share,allow_index,
                  review_status,created_at,updated_at,author_type,official_type)
                VALUES(?, 'ops-official', ?,?,1,'draft','private',?,1,1,'none',?,?, 'official',?)
                """, postId, title, blocks, text(body.get("summary"), 300), now, now, type);
        db.update("""
                INSERT INTO official_contents(id,post_id,official_type,status,publish_at,offline_at,created_by,created_at,updated_at)
                VALUES(?,?,?,'draft',?,?,?,?,?)
                """, id, postId, type, emptyNull(publishAt), emptyNull(offlineAt), adminId, now, now);
        audit.log(adminId, "adm_official_create", "official_content", id, null, Map.of("title", title, "type", type), text(body.get("reason"), 300));
        return detail(id);
    }

    @Transactional
    public Map<String, Object> update(String adminId, String id, Map<String, Object> body) {
        Map<String, Object> oc = db.one("SELECT * FROM official_contents WHERE id = ?", id);
        if (oc == null) throw ApiException.notFound("官方内容不存在");
        Map<String, Object> post = db.one("SELECT * FROM posts WHERE id = ?", Db.str(oc, "post_id"));
        boolean live = "published".equals(Db.str(oc, "status")) || "editing".equals(Db.str(oc, "status"));
        String title = body.containsKey("title") ? text(body.get("title"), 100) : Db.str(post, "title");
        String blocks = body.containsKey("blocks") ? normalizeBlocks(body.get("blocks")) : Db.str(post, "blocks");
        String summary = body.containsKey("summary") ? text(body.get("summary"), 300) : Db.str(post, "summary");
        String now = TimeUtil.now();
        if (live) {
            // 线上旧版保持 published；编辑内容先写入 draft_*，不触碰公开页。
            String draftTitle = body.containsKey("title") ? title : Db.str(oc, "draft_title", title);
            String draftBlocks = body.containsKey("blocks") ? blocks : Db.str(oc, "draft_blocks", blocks);
            String draftSummary = body.containsKey("summary") ? summary : Db.str(oc, "draft_summary", summary);
            db.update("""
                    UPDATE official_contents SET status='editing',draft_title=?,draft_blocks=?,draft_summary=?,draft_updated_at=?,
                      publish_at=?,offline_at=?,updated_at=?
                    WHERE id=?
                    """, draftTitle, draftBlocks, draftSummary, now,
                    body.containsKey("publishAt") ? emptyNull(text(body.get("publishAt"), 40)) : Db.str(oc, "publish_at"),
                    body.containsKey("offlineAt") ? emptyNull(text(body.get("offlineAt"), 40)) : Db.str(oc, "offline_at"),
                    now, id);
        } else {
            db.update("UPDATE posts SET title=?,blocks=?,summary=?,updated_at=?,official_type=? WHERE id=?",
                    title, blocks, summary, now, Db.str(oc, "official_type"), Db.str(oc, "post_id"));
            db.update("UPDATE official_contents SET publish_at=?,offline_at=?,updated_at=? WHERE id=?",
                    body.containsKey("publishAt") ? emptyNull(text(body.get("publishAt"), 40)) : Db.str(oc, "publish_at"),
                    body.containsKey("offlineAt") ? emptyNull(text(body.get("offlineAt"), 40)) : Db.str(oc, "offline_at"),
                    now, id);
        }
        audit.log(adminId, "adm_official_update", "official_content", id, post, null, text(body.get("reason"), 300));
        return detail(id);
    }

    @Transactional
    public Map<String, Object> publish(String adminId, String id, Map<String, Object> body) {
        processDue();
        Map<String, Object> oc = db.one("SELECT * FROM official_contents WHERE id = ?", id);
        if (oc == null) throw ApiException.notFound("官方内容不存在");
        List<Object> checklist = body.get("checklist") instanceof List<?> list ? new ArrayList<>(list) : List.of();
        if (checklist.size() < 8 || checklist.stream().anyMatch(v -> !Boolean.TRUE.equals(v))) {
            throw ApiException.badRequest("请完成 8 项发布检查清单后发布");
        }
        if (!Boolean.TRUE.equals(body.get("cooldownConfirmed"))) throw ApiException.badRequest("发布前需完成 10 秒冷却并确认");
        String mode = db.one("SELECT value FROM app_settings WHERE setting_key='official_review_mode'") == null
                ? "single" : Db.str(db.one("SELECT value FROM app_settings WHERE setting_key='official_review_mode'"), "value", "single");
        if ("dual".equals(mode)) {
            String reviewer = text(body.get("reviewerId"), 64);
            if (reviewer.isBlank() || reviewer.equals(adminId)) throw ApiException.forbidden("双人复核模式下提交人不能自审，请选择另一名复核人");
        }
        Map<String, Object> post = db.one("SELECT * FROM posts WHERE id = ?", Db.str(oc, "post_id"));
        if (post == null) throw ApiException.notFound("内容不存在");
        String publishAt = text(body.get("publishAt"), 40);
        if (publishAt.isBlank()) publishAt = Db.str(oc, "publish_at");
        boolean scheduled = publishAt != null && !publishAt.isBlank() && parseInstant(publishAt).isAfter(Instant.now());
        String now = TimeUtil.now();
        String status = scheduled ? "scheduled" : "published";
        boolean hasDraft = Db.str(oc, "draft_blocks") != null && !Db.str(oc, "draft_blocks").isBlank();
        if (!scheduled && hasDraft) {
            db.update("UPDATE posts SET title=?,blocks=?,summary=?,updated_at=? WHERE id=?",
                    Db.str(oc, "draft_title", Db.str(post, "title")), Db.str(oc, "draft_blocks"),
                    Db.str(oc, "draft_summary", Db.str(post, "summary")), now, Db.str(oc, "post_id"));
        }
        db.update("""
                UPDATE official_contents SET status=?,single_review=?,checklist_json=?,checklist_at=?,reviewed_by=?,
                  publish_at=?,published_at=?,updated_at=?,
                  draft_title=IF(?, draft_title, NULL),draft_blocks=IF(?, draft_blocks, NULL),
                  draft_summary=IF(?, draft_summary, NULL),draft_updated_at=IF(?, draft_updated_at, NULL)
                WHERE id=?
                """, status, "single".equals(mode) ? 1 : 0, toJson(checklist), now,
                "dual".equals(mode) ? text(body.get("reviewerId"), 64) : adminId,
                emptyNull(publishAt), scheduled ? null : now, now,
                scheduled ? 1 : 0, scheduled ? 1 : 0, scheduled ? 1 : 0, scheduled ? 1 : 0, id);
        if (!scheduled) {
            db.update("UPDATE posts SET status='published',visibility='public',review_status='approved',published_at=?,updated_at=? WHERE id=?",
                    now, now, Db.str(oc, "post_id"));
        }
        audit.log(adminId, "adm_official_publish", "official_content", id, oc, Map.of("status", status, "reviewMode", mode), text(body.get("reason"), 300));
        return detail(id);
    }

    public Map<String, Object> offline(String adminId, String id, String reason) {
        Map<String, Object> oc = db.one("SELECT * FROM official_contents WHERE id = ?", id);
        if (oc == null) throw ApiException.notFound("官方内容不存在");
        String now = TimeUtil.now();
        db.update("UPDATE official_contents SET status='offline',updated_at=? WHERE id=?", now, id);
        db.update("UPDATE posts SET status='offline',updated_at=? WHERE id=?", now, Db.str(oc, "post_id"));
        audit.log(adminId, "adm_official_offline", "official_content", id, oc, null, reason);
        return detail(id);
    }

    public Map<String, Object> spotcheckQueue() {
        processDue();
        List<Map<String, Object>> items = db.all("""
                SELECT oc.*,p.title FROM official_contents oc JOIN posts p ON p.id=oc.post_id
                WHERE oc.single_review=1 AND oc.status='published' AND p.deleted_at IS NULL
                ORDER BY oc.published_at ASC LIMIT 100
                """).stream().map(this::dto).toList();
        return M.of().put("items", items).put("total", items.size())
                .put("rate", db.one("SELECT value FROM app_settings WHERE setting_key='review_sample_rate'") == null ? "20" : Db.str(db.one("SELECT value FROM app_settings WHERE setting_key='review_sample_rate'"), "value", "20"))
                .map();
    }

    public Map<String, Object> spotcheck(String adminId, String id, String result, String note) {
        if (!List.of("pass", "revise", "offline").contains(result)) throw ApiException.badRequest("抽查结论不正确");
        Map<String, Object> oc = db.one("SELECT * FROM official_contents WHERE id = ?", id);
        if (oc == null) throw ApiException.notFound("官方内容不存在");
        String status = "pass".equals(result) ? "published" : "revise".equals(result) ? "needs_revision" : "offline";
        db.update("UPDATE official_contents SET status=?,updated_at=? WHERE id=?", status, TimeUtil.now(), id);
        if (!"pass".equals(result)) db.update("UPDATE posts SET status='draft',updated_at=? WHERE id=?", TimeUtil.now(), Db.str(oc, "post_id"));
        audit.log(adminId, "adm_official_spotcheck", "official_content", id, oc, Map.of("result", result, "note", note == null ? "" : note), note);
        return detail(id);
    }

    public Map<String, Object> templates() {
        List<Map<String, Object>> items = db.all("""
                SELECT t.*, u.nickname AS author FROM templates t LEFT JOIN users u ON u.id=t.user_id
                WHERE t.is_official=1 ORDER BY t.updated_at DESC
                """).stream().map(row -> M.of().put("id", Db.str(row, "id")).put("name", Db.str(row, "name"))
                .put("type", Db.str(row, "type")).put("version", Db.lng(row, "version"))
                .put("payload", Db.str(row, "payload")).put("publishedAt", Db.str(row, "published_at"))
                .put("updatedAt", Db.str(row, "updated_at")).map()).toList();
        return M.of().put("items", items).map();
    }

    @Transactional
    public Map<String, Object> saveTemplate(String adminId, String id, Map<String, Object> body) {
        String name = text(body.get("name"), 100);
        if (name.isBlank()) throw ApiException.badRequest("请填写模板名称");
        String type = ExerciseServiceType.value(body.get("type"));
        String payload = toJson(body.getOrDefault("items", List.of()));
        String now = TimeUtil.now();
        if (id == null || id.isBlank()) {
            String templateId = UUID.randomUUID().toString();
            db.update("""
                    INSERT INTO templates(id,user_id,name,type,payload,created_at,updated_at,is_official,version,published_at)
                    VALUES(?, 'ops-official', ?,?,?,?,?,1,1,?)
                    """, templateId, name, type, payload, now, now, now);
            audit.log(adminId, "adm_template_create", "template", templateId, null, Map.of("name", name), "");
            return M.of().put("id", templateId).map();
        }
        Map<String, Object> old = db.one("SELECT * FROM templates WHERE id = ? AND is_official = 1", id);
        if (old == null) throw ApiException.notFound("官方模板不存在");
        int version = (int) Db.lng(old, "version") + 1;
        db.update("UPDATE templates SET name=?,type=?,payload=?,version=?,published_at=?,updated_at=? WHERE id=?",
                name, type, payload, version, now, now, id);
        audit.log(adminId, "adm_template_update", "template", id, old, Map.of("name", name, "version", version), "");
        return M.of().put("id", id).put("version", version).map();
    }

    @Scheduled(fixedDelay = 30_000)
    public void processDue() {
        String now = TimeUtil.now();
        for (Map<String, Object> row : db.all("SELECT * FROM official_contents WHERE status='scheduled' AND publish_at IS NOT NULL AND publish_at <= ?", now)) {
            Map<String, Object> post = db.one("SELECT * FROM posts WHERE id = ?", Db.str(row, "post_id"));
            boolean hasDraft = Db.str(row, "draft_blocks") != null && !Db.str(row, "draft_blocks").isBlank();
            if (hasDraft && post != null) {
                db.update("UPDATE posts SET title=?,blocks=?,summary=?,updated_at=? WHERE id=?",
                        Db.str(row, "draft_title", Db.str(post, "title")), Db.str(row, "draft_blocks"),
                        Db.str(row, "draft_summary", Db.str(post, "summary")), now, Db.str(row, "post_id"));
            }
            db.update("""
                    UPDATE official_contents SET status='published',published_at=?,updated_at=?,
                      draft_title=NULL,draft_blocks=NULL,draft_summary=NULL,draft_updated_at=NULL WHERE id=?
                    """, now, now, Db.str(row, "id"));
            db.update("UPDATE posts SET status='published',visibility='public',published_at=?,updated_at=? WHERE id=?", now, now, Db.str(row, "post_id"));
        }
        for (Map<String, Object> row : db.all("SELECT * FROM official_contents WHERE status='published' AND offline_at IS NOT NULL AND offline_at <= ?", now)) {
            db.update("UPDATE official_contents SET status='offline',updated_at=? WHERE id=?", now, Db.str(row, "id"));
            db.update("UPDATE posts SET status='offline',updated_at=? WHERE id=?", now, Db.str(row, "post_id"));
        }
    }

    private Map<String, Object> dto(Map<String, Object> row) {
        return M.of().put("id", Db.str(row, "id")).put("postId", Db.str(row, "post_id"))
                .put("type", Db.str(row, "official_type")).put("status", Db.str(row, "status"))
                .put("postStatus", Db.str(row, "post_status")).put("title", Db.str(row, "title"))
                .put("summary", Db.str(row, "summary")).put("publishAt", Db.str(row, "publish_at"))
                .put("offlineAt", Db.str(row, "offline_at")).put("publishedAt", Db.str(row, "published_at"))
                .put("singleReview", Db.bool(row, "single_review")).put("views", Db.lng(row, "views"))
                .put("createdAt", Db.str(row, "created_at")).put("updatedAt", Db.str(row, "updated_at")).map();
    }

    private String normalizeBlocks(Object value) {
        if (!(value instanceof List<?> list)) throw ApiException.badRequest("正文必须是块数组");
        if (list.size() > 200) throw ApiException.badRequest("正文最多 200 个块");
        List<String> allowed = List.of("paragraph", "heading", "image", "gallery", "video", "quote", "list", "divider", "todo", "embed");
        for (Object item : list) {
            Map<String, Object> block = com.fitlog.common.Req.map(item);
            if (!allowed.contains(String.valueOf(block.get("type")))) throw ApiException.badRequest("存在不支持的块类型");
        }
        return toJson(list);
    }

    private void ensureBannerLimit(String now) {
        long active = db.count("SELECT COUNT(*) AS n FROM official_contents oc JOIN posts p ON p.id=oc.post_id WHERE oc.official_type='banner' AND oc.status='published' AND p.status='published'");
        if (active >= 1) throw ApiException.conflict("同一时间仅允许 1 条横幅，请先下线");
        long recent = db.count("SELECT COUNT(*) AS n FROM official_contents WHERE official_type='banner' AND published_at >= ?", TimeUtil.ISO_MS.format(Instant.now().minusSeconds(7 * 86400)));
        if (recent >= 2) throw ApiException.conflict("7 天内最多发布 2 次横幅");
    }

    private List<Boolean> parseChecklist(String raw) {
        try {
            return json.readValue(raw == null ? "[]" : raw, new TypeReference<List<Boolean>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private String toJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception e) {
            throw new ApiException(500, "OPS_SERIALIZE_ERROR", "内容序列化失败");
        }
    }

    private String text(Object value, int max) {
        if (value == null) return "";
        String text = String.valueOf(value).trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private String emptyNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private Instant parseInstant(String value) {
        try {
            return Instant.parse(TimeUtil.normalizeIso(value));
        } catch (Exception e) {
            throw ApiException.badRequest("时间格式不正确");
        }
    }

    static class ExerciseServiceType {
        static String value(Object raw) {
            String value = raw == null ? "strength" : String.valueOf(raw);
            return List.of("strength", "cardio", "stretch").contains(value) ? value : "strength";
        }
    }
}
