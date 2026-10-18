-- FitLog v1.3 · MySQL 8.x schema
-- 本文件与 backend（Spring Boot 3）配套，部署时手动执行；后端不做自动建表。
CREATE DATABASE IF NOT EXISTS fitlog DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fitlog;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  wechat_openid VARCHAR(80) UNIQUE,
  nickname VARCHAR(40) NOT NULL,
  avatar VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  delete_requested_at VARCHAR(40),
  tz_offset INT NOT NULL DEFAULT -480,
  weekly_goal INT NOT NULL DEFAULT 3,
  default_session_visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  default_post_visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  notify_checkin TINYINT NOT NULL DEFAULT 1,
  notify_weekly TINYINT NOT NULL DEFAULT 1,
  notify_interaction TINYINT NOT NULL DEFAULT 1,
  reminder_time VARCHAR(10) NOT NULL DEFAULT '19:30',
  banned_until VARCHAR(40),
  privacy_accepted_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  KEY idx_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_codes (
  id VARCHAR(64) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  used TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_auth_codes_phone (phone, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at VARCHAR(40) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exercises (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  aliases VARCHAR(500) NOT NULL DEFAULT '',
  primary_muscle VARCHAR(20) NOT NULL,
  secondary_muscles VARCHAR(200) NOT NULL DEFAULT '',
  equipment VARCHAR(30) NOT NULL,
  type VARCHAR(20) NOT NULL,
  is_builtin TINYINT NOT NULL DEFAULT 0,
  owner_id VARCHAR(64),
  archived TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_exercises_owner (owner_id, archived),
  CONSTRAINT fk_exercise_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exercise_favorites (
  user_id VARCHAR(64) NOT NULL,
  exercise_id VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, exercise_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workout_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(100),
  started_at VARCHAR(40) NOT NULL,
  ended_at VARCHAR(40),
  local_date VARCHAR(10) NOT NULL,
  tz_offset INT NOT NULL DEFAULT -480,
  duration_sec INT NOT NULL DEFAULT 0,
  volume_kg DOUBLE NOT NULL DEFAULT 0,
  notes TEXT,
  feeling INT,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  client_op_id VARCHAR(80) UNIQUE,
  deleted_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  KEY idx_sessions_user_date (user_id, local_date),
  KEY idx_sessions_deleted (user_id, deleted_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workout_items (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  exercise_id VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  note VARCHAR(300),
  created_at VARCHAR(40) NOT NULL,
  KEY idx_items_session (session_id, sort_order),
  CONSTRAINT fk_item_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workout_sets (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  set_index INT NOT NULL,
  weight_kg DOUBLE,
  reps INT,
  duration_sec INT,
  distance_km DOUBLE,
  avg_hr INT,
  rpe DOUBLE,
  set_type VARCHAR(20) NOT NULL DEFAULT 'normal',
  note VARCHAR(300),
  client_op_id VARCHAR(80) UNIQUE,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_sets_item (item_id, set_index),
  KEY idx_sets_session (session_id),
  CONSTRAINT fk_set_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_set_item FOREIGN KEY (item_id) REFERENCES workout_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'strength',
  payload MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_template_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkins (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  local_date VARCHAR(10) NOT NULL,
  source VARCHAR(20) NOT NULL,
  workout_type VARCHAR(20),
  duration_min INT,
  note VARCHAR(300),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  revoked_at VARCHAR(40),
  UNIQUE KEY uq_checkin_user_date (user_id, local_date),
  KEY idx_checkins_user_date (user_id, local_date),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS body_metrics (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  measured_on VARCHAR(10) NOT NULL,
  weight_kg DOUBLE,
  body_fat DOUBLE,
  chest_cm DOUBLE,
  waist_cm DOUBLE,
  hip_cm DOUBLE,
  arm_cm DOUBLE,
  thigh_cm DOUBLE,
  note VARCHAR(300),
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_body_user_date (user_id, measured_on),
  CONSTRAINT fk_body_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(20) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  thumb_path VARCHAR(500),
  duration_sec INT,
  width INT,
  height INT,
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  watermark TINYINT NOT NULL DEFAULT 0,
  watermark_text VARCHAR(50),
  watermark_applied_at VARCHAR(40),
  watermark_undone_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  deleted_at VARCHAR(40),
  status_reason VARCHAR(300),
  KEY idx_media_user (user_id, deleted_at),
  CONSTRAINT fk_media_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS session_media (
  session_id VARCHAR(64) NOT NULL,
  media_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (session_id, media_id),
  CONSTRAINT fk_sm_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_media FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS upload_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL,
  chunk_size INT NOT NULL,
  total_chunks INT NOT NULL,
  received TEXT NOT NULL,
  media_id VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'uploading',
  meta MEDIUMTEXT,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_upload_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(100) NOT NULL DEFAULT '',
  blocks MEDIUMTEXT NOT NULL,
  blocks_version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  cover_url VARCHAR(300),
  summary VARCHAR(300),
  allow_share TINYINT NOT NULL DEFAULT 1,
  allow_index TINYINT NOT NULL DEFAULT 0,
  review_status VARCHAR(30) NOT NULL DEFAULT 'none',
  review_reason VARCHAR(300),
  published_at VARCHAR(40),
  deleted_at VARCHAR(40),
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  topic_ids VARCHAR(300) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  KEY idx_posts_user (user_id, deleted_at),
  KEY idx_posts_status (status, review_status),
  CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_versions (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  title VARCHAR(100) NOT NULL,
  blocks MEDIUMTEXT NOT NULL,
  blocks_version INT NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'auto',
  created_at VARCHAR(40) NOT NULL,
  KEY idx_versions_post (post_id, created_at),
  CONSTRAINT fk_version_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_embeds (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  block_id VARCHAR(64) NOT NULL,
  embed_type VARCHAR(20) NOT NULL,
  ref_id VARCHAR(64) NOT NULL,
  CONSTRAINT fk_embed_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_locks (
  post_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  device VARCHAR(100) NOT NULL,
  locked_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_lock_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS post_views (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  view_date VARCHAR(10) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_post_device_day (post_id, device_id, view_date),
  CONSTRAINT fk_view_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  reporter_id VARCHAR(64),
  reason VARCHAR(100) NOT NULL,
  detail VARCHAR(600),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  result VARCHAR(20),
  created_at VARCHAR(40) NOT NULL,
  handled_at VARCHAR(40),
  handled_by VARCHAR(64),
  CONSTRAINT fk_report_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_user FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appeals (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  reason VARCHAR(600) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  resolution VARCHAR(400),
  created_at VARCHAR(40) NOT NULL,
  resolved_at VARCHAR(40),
  resolved_by VARCHAR(64),
  CONSTRAINT fk_appeal_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_appeal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_logs (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64),
  action VARCHAR(30) NOT NULL,
  reason VARCHAR(300),
  rule_codes VARCHAR(300),
  note VARCHAR(600),
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_review_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS review_rules (
  code VARCHAR(30) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  level VARCHAR(20) NOT NULL,
  description VARCHAR(600) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS badges (
  user_id VARCHAR(64) NOT NULL,
  code VARCHAR(40) NOT NULL,
  awarded_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, code),
  CONSTRAINT fk_badge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500),
  dedupe_key VARCHAR(150) NOT NULL,
  read_at VARCHAR(40),
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_notify_user_key (user_id, dedupe_key),
  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  name VARCHAR(60) NOT NULL,
  props MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  KEY idx_events_name (name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exports (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ready',
  files MEDIUMTEXT NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_export_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cost_ledger (
  stat_day VARCHAR(10) PRIMARY KEY,
  storage_gb DOUBLE NOT NULL DEFAULT 0,
  traffic_gb DOUBLE NOT NULL DEFAULT 0,
  transcode_minutes DOUBLE NOT NULL DEFAULT 0,
  cost_cny DOUBLE NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64),
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id VARCHAR(64),
  detail VARCHAR(1000),
  created_at VARCHAR(40) NOT NULL,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
