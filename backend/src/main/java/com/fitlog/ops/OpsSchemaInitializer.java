package com.fitlog.ops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitlog.common.Db;
import com.fitlog.common.TimeUtil;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 运营后台独立表结构与演示种子。
 * 基础库 fitlog_schema.sql 负责前台表；这里只做增量迁移，启动时幂等执行。
 */
@Component
public class OpsSchemaInitializer {
    private static final Logger log = LoggerFactory.getLogger(OpsSchemaInitializer.class);
    private final Db db;
    private final ObjectMapper json;

    public OpsSchemaInitializer(Db db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    @PostConstruct
    public void init() {
        createTables();
        ensureColumns();
        seedAdmin();
        seedOfficialUser();
        seedConfigs();
        seedOfficialWelcome();
        log.info("FitLog Ops schema ready");
    }

    private void createTables() {
        db.update("""
                CREATE TABLE IF NOT EXISTS admin_accounts (
                  id VARCHAR(64) PRIMARY KEY,
                  username VARCHAR(60) NOT NULL UNIQUE,
                  password_hash VARCHAR(200) NOT NULL,
                  password_salt VARCHAR(120) NOT NULL,
                  totp_secret VARCHAR(120),
                  role VARCHAR(30) NOT NULL DEFAULT 'super_admin',
                  status VARCHAR(20) NOT NULL DEFAULT 'active',
                  failed_attempts INT NOT NULL DEFAULT 0,
                  locked_until VARCHAR(40),
                  last_login_at VARCHAR(40),
                  recovery_codes TEXT,
                  created_at VARCHAR(40) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS admin_sessions (
                  id VARCHAR(64) PRIMARY KEY,
                  admin_id VARCHAR(64) NOT NULL,
                  token_hash VARCHAR(128) NOT NULL UNIQUE,
                  ip VARCHAR(60),
                  ua VARCHAR(300),
                  last_seen_at VARCHAR(40),
                  expires_at VARCHAR(40) NOT NULL,
                  revoked_at VARCHAR(40),
                  created_at VARCHAR(40) NOT NULL,
                  KEY idx_admin_sessions_admin (admin_id, revoked_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS exercise_versions (
                  id VARCHAR(64) PRIMARY KEY,
                  exercise_id VARCHAR(64) NOT NULL,
                  version INT NOT NULL,
                  payload_json MEDIUMTEXT NOT NULL,
                  change_type VARCHAR(30) NOT NULL,
                  changed_fields VARCHAR(500),
                  effective_policy VARCHAR(30),
                  reason VARCHAR(300),
                  created_by VARCHAR(64),
                  created_at VARCHAR(40) NOT NULL,
                  KEY idx_exercise_versions (exercise_id, version)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS exercise_redirects (
                  from_id VARCHAR(64) PRIMARY KEY,
                  to_id VARCHAR(64) NOT NULL,
                  created_by VARCHAR(64),
                  reason VARCHAR(300),
                  created_at VARCHAR(40) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS official_contents (
                  id VARCHAR(64) PRIMARY KEY,
                  post_id VARCHAR(64) NOT NULL UNIQUE,
                  official_type VARCHAR(30) NOT NULL,
                  status VARCHAR(30) NOT NULL DEFAULT 'draft',
                  publish_at VARCHAR(40),
                  offline_at VARCHAR(40),
                  created_by VARCHAR(64),
                  reviewed_by VARCHAR(64),
                  single_review TINYINT NOT NULL DEFAULT 0,
                  checklist_json MEDIUMTEXT,
                  checklist_at VARCHAR(40),
                  published_at VARCHAR(40),
                  created_at VARCHAR(40) NOT NULL,
                  updated_at VARCHAR(40) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS config_change_logs (
                  id VARCHAR(64) PRIMARY KEY,
                  config_key VARCHAR(80) NOT NULL,
                  old_value TEXT,
                  new_value TEXT,
                  risk_level VARCHAR(20) NOT NULL DEFAULT 'mid',
                  reason VARCHAR(500),
                  operator_id VARCHAR(64),
                  reviewer_id VARCHAR(64),
                  effective_at VARCHAR(40),
                  status VARCHAR(20) NOT NULL DEFAULT 'effective',
                  created_at VARCHAR(40) NOT NULL,
                  KEY idx_config_logs (config_key, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS exercise_import_batches (
                  id VARCHAR(64) PRIMARY KEY,
                  status VARCHAR(20) NOT NULL DEFAULT 'preview',
                  rows_json MEDIUMTEXT NOT NULL,
                  total INT NOT NULL DEFAULT 0,
                  ok_count INT NOT NULL DEFAULT 0,
                  failed_count INT NOT NULL DEFAULT 0,
                  created_by VARCHAR(64),
                  created_at VARCHAR(40) NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        db.update("""
                CREATE TABLE IF NOT EXISTS official_cost_ledger (
                  stat_day VARCHAR(10) PRIMARY KEY,
                  storage_gb DOUBLE NOT NULL DEFAULT 0,
                  traffic_gb DOUBLE NOT NULL DEFAULT 0,
                  transcode_minutes DOUBLE NOT NULL DEFAULT 0,
                  cost_cny DOUBLE NOT NULL DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
    }

    private void ensureColumns() {
        ensureColumn("exercises", "status", "VARCHAR(20) NOT NULL DEFAULT 'active'");
        ensureColumn("exercises", "version", "INT NOT NULL DEFAULT 1");
        ensureColumn("exercises", "updated_by", "VARCHAR(64)");
        ensureColumn("exercises", "redirect_to", "VARCHAR(64)");
        ensureColumn("exercises", "description", "TEXT");
        ensureColumn("exercises", "instructions", "TEXT");
        ensureColumn("exercises", "media_ids", "TEXT");
        ensureColumn("exercises", "sort_weight", "INT NOT NULL DEFAULT 0");
        ensureColumn("exercises", "source_license", "VARCHAR(40)");
        ensureColumn("posts", "author_type", "VARCHAR(20) NOT NULL DEFAULT 'user'");
        ensureColumn("posts", "official_type", "VARCHAR(30)");
        ensureColumn("posts", "is_pinned", "TINYINT NOT NULL DEFAULT 0");
        ensureColumn("templates", "is_official", "TINYINT NOT NULL DEFAULT 0");
        ensureColumn("templates", "version", "INT NOT NULL DEFAULT 1");
        ensureColumn("templates", "published_at", "VARCHAR(40)");
        ensureColumn("app_settings", "risk_level", "VARCHAR(20) NOT NULL DEFAULT 'mid'");
        ensureColumn("app_settings", "updated_by", "VARCHAR(64)");
        ensureColumn("app_settings", "updated_at", "VARCHAR(40)");
        ensureColumn("app_settings", "description", "VARCHAR(500)");
        ensureColumn("app_settings", "ref_prd", "VARCHAR(80)");
        ensureColumn("app_settings", "default_value", "VARCHAR(300)");
        ensureColumn("audit_logs", "actor_type", "VARCHAR(20)");
        ensureColumn("audit_logs", "before_json", "MEDIUMTEXT");
        ensureColumn("audit_logs", "after_json", "MEDIUMTEXT");
        ensureColumn("audit_logs", "reason", "VARCHAR(300)");
        ensureColumn("audit_logs", "ip", "VARCHAR(60)");
        ensureColumn("audit_logs", "ua", "VARCHAR(300)");
        ensureColumn("users", "is_test", "TINYINT NOT NULL DEFAULT 0");
        ensureColumn("official_contents", "draft_title", "VARCHAR(100)");
        ensureColumn("official_contents", "draft_blocks", "MEDIUMTEXT");
        ensureColumn("official_contents", "draft_summary", "VARCHAR(300)");
        ensureColumn("official_contents", "draft_updated_at", "VARCHAR(40)");
    }

    private void ensureColumn(String table, String column, String definition) {
        long exists = db.count(
                "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                table, column);
        if (exists == 0) {
            db.update("ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition);
        }
    }

    private void seedAdmin() {
        if (db.one("SELECT id FROM admin_accounts WHERE username = 'admin'") != null) return;
        String salt = OpsCrypto.newSalt();
        List<String> recovery = new ArrayList<>();
        for (int i = 0; i < 10; i++) recovery.add(OpsCrypto.randomCode(10));
        String codes;
        try {
            codes = json.writeValueAsString(recovery);
        } catch (Exception e) {
            codes = "[]";
        }
        db.update("""
                INSERT INTO admin_accounts(id,username,password_hash,password_salt,totp_secret,role,status,recovery_codes,created_at)
                VALUES(?,?,?,?,?, 'super_admin','active',?,?)
                """,
                UUID.randomUUID().toString(), "admin", OpsCrypto.passwordHash("FitLog@2026!", salt), salt,
                "JBSWY3DPEHPK3PXP", codes, TimeUtil.now());
    }

    private void seedOfficialUser() {
        if (db.one("SELECT id FROM users WHERE id = 'ops-official'") != null) return;
        db.update("""
                INSERT INTO users(id,phone,nickname,avatar,role,status,tz_offset,weekly_goal,created_at)
                VALUES('ops-official',NULL,'练迹官方',NULL,'official','active',-480,3,?)
                """, TimeUtil.now());
    }

    private void seedConfigs() {
        String[][] items = {
                {"public_daily_quota", "20", "20", "high", "每日公开内容名额，全站共享", "FR-92"},
                {"budget_cap_cny", "20", "20", "high", "用户内容月度预算上限（元）", "8.5"},
                {"official_budget_cny", "10", "10", "high", "官方内容独立月度预算（元）", "D-A11"},
                {"official_storage_gb", "100", "100", "mid", "官方媒体容量上限（GB，软上限 20GB）", "NFR-A23"},
                {"official_traffic_alert_gb", "40/45", "40/45", "mid", "官方播放流量告警/降级线（GB）", "NFR-A22"},
                {"official_review_mode", "single", "single", "high", "官方内容复核模式：single / dual", "F-20"},
                {"test_account_enabled", "1", "1", "mid", "前台测试号是否可用", "11.2"},
                {"budget_alert_threshold", "50/80", "50/80", "high", "预算告警阈值百分比", "8.5"},
                {"community_visible", "1", "1", "mid", "前台社区占位入口开关", "RK-13"},
                {"public_listing_enabled", "0", "0", "mid", "公开内容列表开关", "FR-70"},
                {"brand_watermark_text", "练迹", "练迹", "mid", "视频水印文字", "FR-65"},
                {"watermark_default_enabled", "0", "0", "mid", "视频水印默认开关", "FR-65"},
                {"daily_upload_mb", "500", "500", "mid", "单用户日上传上限（MB）", "FR-63"},
                {"max_file_mb", "200", "200", "mid", "单文件大小上限（MB）", "FR-62"},
                {"review_sample_rate", "20", "20", "mid", "人审抽检率（%）", "FR-93"},
                {"checkin_backfill_hours", "48", "48", "low", "训练后补记窗口（小时）", "FR-50"},
                {"deletion_cooling_days", "30", "30", "low", "注销冷静期（天）", "FR-13"}
        };
        for (String[] item : items) {
            db.update("""
                    INSERT INTO app_settings(setting_key,value,risk_level,description,ref_prd,default_value,updated_at)
                    VALUES(?,?,?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE
                      risk_level=VALUES(risk_level), description=VALUES(description),
                      ref_prd=VALUES(ref_prd), default_value=VALUES(default_value),
                      updated_at=COALESCE(updated_at, VALUES(updated_at))
                    """,
                    item[0], item[1], item[3], item[4], item[5], item[2], TimeUtil.now());
        }
    }

    private void seedOfficialWelcome() {
        if (db.one("SELECT id FROM posts WHERE id = 'ops-official-welcome'") != null) return;
        String blocks;
        try {
            blocks = json.writeValueAsString(List.of(
                    Map.of("id", "ops-welcome-1", "type", "heading", "version", 1,
                            "props", Map.of("level", 2, "text", "欢迎使用 FitLog Ops v2.0")),
                    Map.of("id", "ops-welcome-2", "type", "paragraph", "version", 1,
                            "props", Map.of("text", "这里是运营后台的官方内容示例。你可以发布公告、官方文章、帮助页与训练模板，并在发布前完成单人复核清单。")),
                    Map.of("id", "ops-welcome-3", "type", "list", "version", 1,
                            "props", Map.of("ordered", false, "items", List.of("动作库变更可版本化、回滚与审计", "配置项集中管理并按风险分级", "官方内容复用前台块渲染与公开页")))
            ));
        } catch (Exception e) {
            blocks = "[]";
        }
        String now = TimeUtil.now();
        db.update("""
                INSERT INTO posts(id,user_id,title,blocks,blocks_version,status,visibility,summary,allow_share,allow_index,
                  review_status,published_at,created_at,updated_at,author_type,official_type)
                VALUES('ops-official-welcome','ops-official','练迹运营后台 v2.0 上线',?,1,'published','public',
                  '官方内容发布与运营配置的统一入口。',1,1,'approved',?,?,?,'official','announcement')
                """, blocks, now, now, now);
        db.update("""
                INSERT INTO official_contents(id,post_id,official_type,status,published_at,created_by,reviewed_by,single_review,created_at,updated_at)
                VALUES(?, 'ops-official-welcome','announcement','published',?,'admin','admin',1,?,?)
                """, UUID.randomUUID().toString(), now, now, now);
    }
}
