package com.fitlog.ops;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.ApiException;
import com.fitlog.common.Db;
import com.fitlog.common.M;
import com.fitlog.common.TimeUtil;
import com.fitlog.exercise.ExerciseService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OpsExerciseService {
    private final Db db;
    private final ObjectMapper json;
    private final OpsAuditService audit;

    public OpsExerciseService(Db db, ObjectMapper json, OpsAuditService audit) {
        this.db = db;
        this.json = json;
        this.audit = audit;
    }

    public Map<String, Object> list(String q, String muscle, String equipment, String type, String source, int page, int pageSize) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            where.append(" AND (e.name LIKE ? OR e.aliases LIKE ? OR e.id = ?)");
            args.add("%" + q + "%");
            args.add("%" + q + "%");
            args.add(q);
        }
        if (muscle != null && !muscle.isBlank()) {
            where.append(" AND (e.primary_muscle = ? OR e.secondary_muscles LIKE ?)");
            args.add(muscle);
            args.add("%" + muscle + "%");
        }
        if (equipment != null && !equipment.isBlank()) {
            where.append(" AND e.equipment = ?");
            args.add(equipment);
        }
        if (type != null && !type.isBlank()) {
            where.append(" AND e.type = ?");
            args.add(type);
        }
        if ("builtin".equals(source)) where.append(" AND e.is_builtin = 1");
        if ("custom".equals(source)) where.append(" AND e.is_builtin = 0");
        if ("archived".equals(source)) where.append(" AND e.archived = 1");
        if ("merged".equals(source)) where.append(" AND e.redirect_to IS NOT NULL");
        long total = db.count("SELECT COUNT(*) AS n FROM exercises e" + where, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(Math.min(200, Math.max(10, pageSize)));
        pageArgs.add(Math.max(0, (page - 1) * Math.min(200, Math.max(10, pageSize))));
        List<Map<String, Object>> rows = db.all("""
                SELECT e.*,
                  (SELECT COUNT(*) FROM workout_items wi WHERE wi.exercise_id = e.id) AS usage_count,
                  (SELECT COUNT(*) FROM workout_items wi JOIN workout_sessions s ON s.id = wi.session_id
                    WHERE wi.exercise_id = e.id AND s.local_date >= ? AND s.deleted_at IS NULL) AS usage_30d
                FROM exercises e
                """ + where + " ORDER BY usage_count DESC, e.sort_weight DESC, e.name LIMIT ? OFFSET ?",
                prepend(TimeUtil.addDays(TimeUtil.todayForString(-480), -30), pageArgs).toArray());
        List<Map<String, Object>> items = rows.stream().map(this::dto).toList();
        return M.of().put("items", items).put("total", total).put("page", page).put("pageSize", pageSize).map();
    }

    public Map<String, Object> detail(String id) {
        Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
        if (row == null) throw ApiException.notFound("动作不存在");
        Map<String, Object> result = dto(row);
        result.put("impact", impact(id));
        result.put("versions", versions(id));
        result.put("redirect", db.one("SELECT * FROM exercise_redirects WHERE from_id = ?", id));
        return result;
    }

    public Map<String, Object> impact(String id) {
        Map<String, Object> record = db.one("""
                SELECT COUNT(*) AS records, COUNT(DISTINCT s.user_id) AS users
                FROM workout_items wi JOIN workout_sessions s ON s.id = wi.session_id
                WHERE wi.exercise_id = ? AND s.deleted_at IS NULL
                """, id);
        long users = Db.lng(record, "users");
        long records = Db.lng(record, "records");
        List<Map<String, Object>> muscles = db.all("""
                SELECT e.primary_muscle AS muscle, COUNT(*) AS n FROM workout_items wi
                JOIN workout_sessions s ON s.id = wi.session_id JOIN exercises e ON e.id = wi.exercise_id
                WHERE wi.exercise_id = ? AND s.deleted_at IS NULL GROUP BY e.primary_muscle
                """, id).stream().map(r -> M.of().put("muscle", Db.str(r, "muscle")).put("count", Db.lng(r, "n")).map()).toList();
        return M.of().put("records", records).put("users", users).put("prs", users)
                .put("muscles", muscles).put("note", "PR 数按有记录的用户数估算，发布前可继续核对").map();
    }

    public List<Map<String, Object>> versions(String id) {
        return db.all("SELECT * FROM exercise_versions WHERE exercise_id = ? ORDER BY version DESC LIMIT 20", id)
                .stream().map(row -> M.of().put("id", Db.str(row, "id")).put("version", Db.lng(row, "version"))
                        .put("changeType", Db.str(row, "change_type")).put("changedFields", Db.str(row, "changed_fields"))
                        .put("effectivePolicy", Db.str(row, "effective_policy")).put("reason", Db.str(row, "reason"))
                        .put("createdBy", Db.str(row, "created_by")).put("createdAt", Db.str(row, "created_at"))
                        .put("payload", Db.str(row, "payload_json")).map()).toList();
    }

    public Map<String, Object> meta() {
        return M.of().put("muscles", ExerciseService.MUSCLES).put("equipments", ExerciseService.EQUIPMENTS)
                .put("types", ExerciseService.TYPES).put("statuses", List.of("active", "archived", "merged"))
                .put("licenses", List.of("self_owned", "authorized", "public_domain")).map();
    }

    @Transactional
    public Map<String, Object> create(String adminId, Map<String, Object> body) {
        String name = text(body.get("name"), 30);
        if (name.isBlank()) throw ApiException.badRequest("动作名称不能为空");
        String equipment = text(body.get("equipment"), 30);
        ensureExists("SELECT id FROM exercises WHERE name = ? AND equipment = ? AND owner_id IS NULL", name, equipment);
        String id = "ops-" + UUID.randomUUID();
        Map<String, Object> values = normalize(body, null);
        db.update("""
                INSERT INTO exercises(id,name,aliases,primary_muscle,secondary_muscles,equipment,type,is_builtin,owner_id,archived,
                  created_at,status,version,updated_by,description,instructions,media_ids,sort_weight,source_license)
                VALUES(?,?,?,?,?,?,?,1,NULL,0,?,'active',1,?,?,?,?,?,?)
                """,
                id, name, values.get("aliases"), values.get("primaryMuscle"), values.get("secondaryMuscles"),
                equipment, values.get("type"), TimeUtil.now(), adminId, values.get("description"),
                values.get("instructions"), values.get("mediaIds"), values.get("sortWeight"), values.get("sourceLicense"));
        Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
        writeVersion(id, 1, row, "create", "name,primaryMuscle,equipment,type", "none", text(body.get("reason"), 300), adminId);
        audit.log(adminId, "adm_exercise_publish", "exercise", id, null, row, text(body.get("reason"), 300));
        return detail(id);
    }

    @Transactional
    public Map<String, Object> update(String adminId, String id, Map<String, Object> body) {
        Map<String, Object> old = db.one("SELECT * FROM exercises WHERE id = ?", id);
        if (old == null) throw ApiException.notFound("动作不存在");
        if (old.get("redirect_to") != null) throw ApiException.badRequest("已合并动作不能直接编辑");
        Map<String, Object> values = normalize(body, old);
        String name = text(body.get("name"), 30);
        if (name.isBlank()) name = Db.str(old, "name");
        String equipment = text(body.get("equipment"), 30);
        if (equipment.isBlank()) equipment = Db.str(old, "equipment");
        List<String> changed = new ArrayList<>();
        for (String[] pair : new String[][]{{"name", "name"}, {"aliases", "aliases"}, {"primaryMuscle", "primary_muscle"},
                {"secondaryMuscles", "secondary_muscles"}, {"equipment", "equipment"}, {"type", "type"},
                {"description", "description"}, {"instructions", "instructions"}, {"mediaIds", "media_ids"},
                {"sortWeight", "sort_weight"}, {"sourceLicense", "source_license"}}) {
            if (body.containsKey(pair[0]) && !String.valueOf(values.get(pair[0])).equals(Db.str(old, pair[1], ""))) {
                changed.add(pair[0]);
            }
        }
        boolean sensitive = changed.contains("primaryMuscle") || changed.contains("type");
        String policy = text(body.get("effectivePolicy"), 30);
        if (sensitive && !List.of("none", "recalculate").contains(policy)) {
            throw ApiException.badRequest("请选择敏感字段生效策略：不追溯 / 全量重算");
        }
        if (!sensitive) policy = "none";
        int version = (int) Db.lng(old, "version") + 1;
        db.update("""
                UPDATE exercises SET name=?,aliases=?,primary_muscle=?,secondary_muscles=?,equipment=?,type=?,
                  version=?,updated_by=?,description=?,instructions=?,media_ids=?,sort_weight=?,source_license=?
                WHERE id=?
                """,
                name, values.get("aliases"), values.get("primaryMuscle"), values.get("secondaryMuscles"), equipment,
                values.get("type"), version, adminId, values.get("description"), values.get("instructions"),
                values.get("mediaIds"), values.get("sortWeight"), values.get("sourceLicense"), id);
        Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
        writeVersion(id, version, row, "update", String.join(",", changed), policy, text(body.get("reason"), 300), adminId);
        audit.log(adminId, "adm_exercise_publish", "exercise", id, old, row,
                "changed=" + String.join(",", changed) + "; policy=" + policy + "; " + text(body.get("reason"), 300));
        Map<String, Object> result = detail(id);
        result.put("sensitive", sensitive);
        result.put("effectivePolicy", policy);
        return result;
    }

    @Transactional
    public Map<String, Object> rollback(String adminId, String id, int version, String reason) {
        Map<String, Object> old = db.one("SELECT * FROM exercises WHERE id = ?", id);
        if (old == null) throw ApiException.notFound("动作不存在");
        Map<String, Object> target = db.one("SELECT * FROM exercise_versions WHERE exercise_id = ? AND version = ?", id, version);
        if (target == null) throw ApiException.notFound("目标版本不存在");
        try {
            Map<String, Object> payload = json.readValue(Db.str(target, "payload_json"), new TypeReference<>() {});
            int next = (int) Db.lng(old, "version") + 1;
            db.update("""
                    UPDATE exercises SET name=?,aliases=?,primary_muscle=?,secondary_muscles=?,equipment=?,type=?,
                      description=?,instructions=?,media_ids=?,sort_weight=?,source_license=?,version=?,updated_by=?
                    WHERE id=?
                    """,
                    Db.str(payload, "name"), Db.str(payload, "aliases"), Db.str(payload, "primary_muscle"),
                    Db.str(payload, "secondary_muscles"), Db.str(payload, "equipment"), Db.str(payload, "type"),
                    Db.str(payload, "description"), Db.str(payload, "instructions"), Db.str(payload, "media_ids"),
                    Db.lng(payload, "sort_weight"), Db.str(payload, "source_license"), next, adminId, id);
            Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
            writeVersion(id, next, row, "rollback", "", "none", reason, adminId);
            audit.log(adminId, "adm_exercise_rollback", "exercise", id, old, row, reason);
            return detail(id);
        } catch (Exception e) {
            if (e instanceof ApiException api) throw api;
            throw new ApiException(500, "OPS_ROLLBACK_FAILED", "版本回滚失败");
        }
    }

    public Map<String, Object> archive(String adminId, String id, boolean restore, String reason) {
        Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
        if (row == null) throw ApiException.notFound("动作不存在");
        int version = (int) Db.lng(row, "version") + 1;
        db.update("UPDATE exercises SET archived=?,status=?,version=?,updated_by=? WHERE id=?",
                restore ? 0 : 1, restore ? "active" : "archived", version, adminId, id);
        Map<String, Object> after = db.one("SELECT * FROM exercises WHERE id = ?", id);
        writeVersion(id, version, after, restore ? "restore" : "archive", "status,archived", "none", reason, adminId);
        audit.log(adminId, restore ? "adm_exercise_restore" : "adm_exercise_archive", "exercise", id, row, after, reason);
        return detail(id);
    }

    @Transactional
    public Map<String, Object> merge(String adminId, String fromId, String toId, String confirmName, String reason) {
        Map<String, Object> from = db.one("SELECT * FROM exercises WHERE id = ?", fromId);
        Map<String, Object> to = db.one("SELECT * FROM exercises WHERE id = ?", toId);
        if (from == null || to == null) throw ApiException.notFound("动作不存在");
        if (fromId.equals(toId)) throw ApiException.badRequest("不能合并到自身");
        if (Db.bool(from, "is_builtin") == false || Db.bool(to, "is_builtin") == false) {
            throw ApiException.badRequest("仅内置动作可以合并");
        }
        if (Db.bool(from, "archived") || Db.bool(to, "archived")) throw ApiException.badRequest("目标动作已归档，请先恢复");
        if (from.get("redirect_to") != null) {
            if (toId.equals(Db.str(from, "redirect_to"))) return detail(fromId);
            throw ApiException.badRequest("该动作已合并到其他动作，不能链式合并");
        }
        if (!Db.str(to, "name", "").equals(confirmName == null ? "" : confirmName.trim())) {
            throw ApiException.badRequest("请输入目标动作名称以确认合并");
        }
        db.update("UPDATE exercises SET archived=1,status='merged',redirect_to=?,updated_by=? WHERE id=?", toId, adminId, fromId);
        db.update("INSERT INTO exercise_redirects(from_id,to_id,created_by,reason,created_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE to_id=VALUES(to_id), reason=VALUES(reason)",
                fromId, toId, adminId, reason, TimeUtil.now());
        Map<String, Object> after = db.one("SELECT * FROM exercises WHERE id = ?", fromId);
        writeVersion(fromId, (int) Db.lng(from, "version") + 1, after, "merge", "status,redirect_to", "none", reason, adminId);
        audit.log(adminId, "adm_exercise_merge", "exercise", fromId, from, after, "to=" + toId + "; " + reason);
        return detail(fromId);
    }

    public Map<String, Object> previewImport(String adminId, String csv) {
        List<Map<String, Object>> rows = new ArrayList<>();
        String[] lines = (csv == null ? "" : csv).replace("\r", "").split("\n");
        if (lines.length < 2) throw ApiException.badRequest("CSV 至少需要表头和一行数据");
        String[] headers = lines[0].split(",", -1);
        int ok = 0;
        int failed = 0;
        for (int i = 1; i < lines.length; i++) {
            if (lines[i].isBlank()) continue;
            String[] cols = parseCsvLine(lines[i]);
            Map<String, Object> row = new LinkedHashMap<>();
            for (int c = 0; c < headers.length && c < cols.length; c++) row.put(headers[c].trim(), cols[c].trim());
            Map<String, Object> result = new LinkedHashMap<>(row);
            result.put("line", i + 1);
            List<String> errors = new ArrayList<>();
            String name = text(row.get("name"), 30);
            if (name.isBlank()) errors.add("名称为空");
            if (name.length() > 30) errors.add("名称超过 30 字");
            String muscle = text(row.get("primaryMuscle"), 20);
            if (!ExerciseService.MUSCLES.contains(muscle)) errors.add("主肌群不在枚举内");
            String equipment = text(row.get("equipment"), 30);
            if (!ExerciseService.EQUIPMENTS.contains(equipment)) errors.add("器械不在枚举内");
            String type = text(row.get("type"), 20);
            if (!ExerciseService.TYPES.contains(type)) errors.add("类型不在枚举内");
            String aliases = text(row.get("aliases"), 500);
            if (aliases.split(",").length > 10 && !aliases.isBlank()) errors.add("别名超过 10 个");
            Map<String, Object> existing = errors.isEmpty() ? db.one("SELECT id FROM exercises WHERE name = ? AND equipment = ? AND owner_id IS NULL", name, equipment) : null;
            result.put("action", existing == null ? "create" : "update");
            result.put("existingId", existing == null ? null : Db.str(existing, "id"));
            result.put("errors", errors);
            if (errors.isEmpty()) ok++; else failed++;
            rows.add(result);
        }
        String batchId = UUID.randomUUID().toString();
        try {
            db.update("INSERT INTO exercise_import_batches(id,status,rows_json,total,ok_count,failed_count,created_by,created_at) VALUES(?,'preview',?,?,?,?,?,?)",
                    batchId, json.writeValueAsString(rows), rows.size(), ok, failed, adminId, TimeUtil.now());
        } catch (Exception e) {
            throw new ApiException(500, "OPS_IMPORT_ERROR", "导入预览保存失败");
        }
        return M.of().put("batchId", batchId).put("rows", rows).put("total", rows.size())
                .put("ok", ok).put("failed", failed).put("headers", List.of(headers)).map();
    }

    public Map<String, Object> confirmImport(String adminId, String batchId) {
        Map<String, Object> batch = db.one("SELECT * FROM exercise_import_batches WHERE id = ?", batchId);
        if (batch == null) throw ApiException.notFound("导入批次不存在");
        if (!"preview".equals(Db.str(batch, "status"))) throw ApiException.badRequest("该批次已执行");
        List<Map<String, Object>> rows;
        try {
            rows = json.readValue(Db.str(batch, "rows_json"), new TypeReference<>() {});
        } catch (Exception e) {
            throw new ApiException(500, "OPS_IMPORT_ERROR", "导入数据解析失败");
        }
        int ok = 0;
        int failed = 0;
        for (Map<String, Object> row : rows) {
            if (row.get("errors") instanceof List<?> errors && !errors.isEmpty()) {
                failed++;
                continue;
            }
            try {
                Map<String, Object> body = new LinkedHashMap<>(row);
                String existingId = Db.str(row, "existingId");
                if (existingId == null) create(adminId, body);
                else update(adminId, existingId, body);
                ok++;
            } catch (Exception e) {
                failed++;
            }
        }
        db.update("UPDATE exercise_import_batches SET status='done', ok_count=?, failed_count=? WHERE id=?", ok, failed, batchId);
        audit.log(adminId, "adm_import_result", "exercise_import", batchId, null, Map.of("ok", ok, "failed", failed), "批量导入确认");
        return M.of().put("batchId", batchId).put("ok", ok).put("failed", failed).map();
    }

    public Map<String, Object> searchQuality(int days) {
        String from = TimeUtil.addDays(TimeUtil.todayForString(-480), -Math.max(1, days));
        long total = db.count("SELECT COUNT(*) AS n FROM events WHERE name='exercise_search' AND created_at >= ?", from);
        long noResult = db.count("""
                SELECT COUNT(*) AS n FROM events WHERE name='exercise_search' AND created_at >= ?
                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(props,'$.result_count')) AS UNSIGNED) = 0
                """, from);
        List<Map<String, Object>> terms = db.all("""
                SELECT JSON_UNQUOTE(JSON_EXTRACT(props,'$.keyword')) AS keyword, COUNT(*) AS n
                FROM events WHERE name='exercise_search' AND created_at >= ?
                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(props,'$.result_count')) AS UNSIGNED) = 0
                GROUP BY keyword ORDER BY n DESC LIMIT 20
                """, from).stream().map(r -> M.of().put("keyword", Db.str(r, "keyword")).put("count", Db.lng(r, "n")).map()).toList();
        List<Map<String, Object>> selfBuilt = db.all("""
                SELECT e.name, COUNT(*) AS n FROM exercises e WHERE e.is_builtin=0 AND e.archived=0
                GROUP BY e.name ORDER BY n DESC LIMIT 20
                """).stream().map(r -> M.of().put("name", Db.str(r, "name")).put("count", Db.lng(r, "n")).map()).toList();
        return M.of().put("from", from).put("totalSearches", total)
                .put("noResultRate", total == 0 ? 0 : Math.round(noResult * 1000.0 / total) / 10.0)
                .put("noResultTerms", terms).put("selfBuiltTop", selfBuilt).map();
    }

    public Map<String, Object> recommendations() {
        return M.of().put("items", db.all("""
                SELECT e.*, (SELECT COUNT(*) FROM workout_items wi WHERE wi.exercise_id=e.id) AS usage_count
                FROM exercises e WHERE e.archived=0 AND e.sort_weight > 0 ORDER BY e.sort_weight DESC LIMIT 12
                """).stream().map(this::dto).toList()).map();
    }

    public Map<String, Object> promote(String adminId, String id) {
        Map<String, Object> row = db.one("SELECT * FROM exercises WHERE id = ?", id);
        if (row == null) throw ApiException.notFound("动作不存在");
        if (Db.bool(row, "is_builtin")) throw ApiException.badRequest("该动作已经是内置动作");
        db.update("UPDATE exercises SET is_builtin=1, owner_id=NULL, updated_by=? WHERE id=?", adminId, id);
        Map<String, Object> after = db.one("SELECT * FROM exercises WHERE id = ?", id);
        audit.log(adminId, "adm_exercise_promote", "exercise", id, row, after, "自建动作提升为内置");
        return detail(id);
    }

    private Map<String, Object> dto(Map<String, Object> row) {
        String aliases = Db.str(row, "aliases", "");
        String secondary = Db.str(row, "secondary_muscles", "");
        String media = Db.str(row, "media_ids", "");
        String instructions = Db.str(row, "instructions", "");
        return M.of().put("id", Db.str(row, "id")).put("name", Db.str(row, "name"))
                .put("aliases", aliases.isBlank() ? List.of() : List.of(aliases.split(",")))
                .put("primaryMuscle", Db.str(row, "primary_muscle"))
                .put("secondaryMuscles", secondary.isBlank() ? List.of() : List.of(secondary.split(",")))
                .put("equipment", Db.str(row, "equipment")).put("type", Db.str(row, "type"))
                .put("isBuiltin", Db.bool(row, "is_builtin")).put("archived", Db.bool(row, "archived"))
                .put("status", Db.str(row, "status", Db.bool(row, "archived") ? "archived" : "active"))
                .put("version", Db.lng(row, "version")).put("redirectTo", Db.str(row, "redirect_to"))
                .put("description", Db.str(row, "description", ""))
                .put("instructions", instructions.isBlank() ? List.of() : List.of(instructions.split("\n")))
                .put("mediaIds", media.isBlank() ? List.of() : List.of(media.split(",")))
                .put("sortWeight", Db.lng(row, "sort_weight"))
                .put("sourceLicense", Db.str(row, "source_license", ""))
                .put("usageCount", Db.lng(row, "usage_count"))
                .put("usage30d", Db.lng(row, "usage_30d"))
                .put("createdAt", Db.str(row, "created_at")).map();
    }

    private Map<String, Object> normalize(Map<String, Object> body, Map<String, Object> old) {
        List<String> aliases = stringList(body.get("aliases"), 10, 500);
        String primary = text(body.get("primaryMuscle"), 20);
        if (primary.isBlank() && old != null) primary = Db.str(old, "primary_muscle");
        if (!ExerciseService.MUSCLES.contains(primary)) throw ApiException.badRequest("主肌群必须是：" + String.join("/", ExerciseService.MUSCLES));
        String equipment = text(body.get("equipment"), 30);
        if (equipment.isBlank() && old != null) equipment = Db.str(old, "equipment");
        if (!ExerciseService.EQUIPMENTS.contains(equipment)) throw ApiException.badRequest("器械不在允许范围");
        String type = text(body.get("type"), 20);
        if (type.isBlank() && old != null) type = Db.str(old, "type");
        if (!ExerciseService.TYPES.contains(type)) throw ApiException.badRequest("类型不在允许范围");
        List<String> instructions = stringList(body.get("instructions"), 8, 2000);
        List<String> mediaIds = stringList(body.get("mediaIds"), 4, 80);
        String sourceLicense = text(body.get("sourceLicense"), 40);
        if (!mediaIds.isEmpty() && !List.of("self_owned", "authorized", "public_domain").contains(sourceLicense)) {
            throw ApiException.badRequest("上传/引用官方媒体前必须登记素材来源与授权状态");
        }
        long weight = body.get("sortWeight") == null ? (old == null ? 0 : Db.lng(old, "sort_weight")) : Long.parseLong(String.valueOf(body.get("sortWeight")));
        if (weight < 0 || weight > 999) throw ApiException.badRequest("排序权重必须在 0-999");
        return M.of().put("aliases", String.join(",", aliases))
                .put("primaryMuscle", primary)
                .put("secondaryMuscles", String.join(",", stringList(body.get("secondaryMuscles"), 9, 200)))
                .put("type", type)
                .put("description", text(body.get("description"), 2000))
                .put("instructions", String.join("\n", instructions))
                .put("mediaIds", String.join(",", mediaIds))
                .put("sortWeight", weight)
                .put("sourceLicense", sourceLicense).map();
    }

    private void writeVersion(String exerciseId, int version, Map<String, Object> row, String type, String changed, String policy, String reason, String adminId) {
        try {
            db.update("INSERT INTO exercise_versions(id,exercise_id,version,payload_json,change_type,changed_fields,effective_policy,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), exerciseId, version, json.writeValueAsString(row), type, changed, policy, reason, adminId, TimeUtil.now());
        } catch (Exception e) {
            throw new ApiException(500, "OPS_VERSION_ERROR", "动作版本写入失败");
        }
    }

    private List<Object> prepend(Object first, List<Object> rest) {
        List<Object> values = new ArrayList<>();
        values.add(first);
        values.addAll(rest);
        return values;
    }

    private String text(Object value, int max) {
        if (value == null) return "";
        String text = String.valueOf(value).trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private List<String> stringList(Object value, int maxCount, int maxLength) {
        List<String> result = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list.subList(0, Math.min(maxCount, list.size()))) {
                String text = text(item, maxLength);
                if (!text.isBlank()) result.add(text);
            }
        } else if (value != null) {
            for (String item : String.valueOf(value).split(",")) {
                String text = text(item, maxLength);
                if (!text.isBlank() && result.size() < maxCount) result.add(text);
            }
        }
        return result;
    }

    private void ensureExists(String sql, Object... args) {
        if (db.one(sql, args) != null) throw ApiException.conflict("已存在同名同器械动作，请先搜索并合并");
    }

    private String[] parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else quoted = !quoted;
            } else if (c == ',' && !quoted) {
                values.add(current.toString());
                current.setLength(0);
            } else current.append(c);
        }
        values.add(current.toString());
        return values.toArray(new String[0]);
    }
}
