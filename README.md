# 练迹 FitLog v1.3

> 以「训练记录」为地基、以「图文视频内容」为表达方式的个人健身成长档案。
> 手机端负责记录与打卡，桌面端负责沉淀与复盘；社区留位，先长出内容。

本仓库包含 **Spring Boot 3 后端 + React Web 前端 + MySQL 8 数据库脚本**，按 `PRD-健身记录产品_FitLog_v1.3.md` 实现训练、打卡、动作库、媒体、块编辑器、公开页、分享、审核后台、统计与导出等主链路。

> 后端为 `backend/`（Spring Boot 3 + MySQL），前端为 `frontend/`（React + Vite）。所有业务数据从 MySQL 读取，不依赖本地 SQLite 或 Node 服务端。

前端支持全局**明亮 / 暗色主题切换**：导航栏与登录页均有切换按钮，选择写入 `localStorage`，刷新后保持；默认暗色。

---

## 1. 技术栈与目录

| 层 | 技术 |
| --- | --- |
| 后端 | Java 21、Spring Boot 3.3.5、Spring MVC、JdbcTemplate、MySQL Connector/J、ZXing |
| 数据库 | MySQL 8.x，`127.0.0.1:3308`，用户 `root`，密码 `123456`，库 `fitlog` |
| 前端 | React 18、Vite 5、TypeScript、React Router |
| 运营后台 | `/ops` 独立入口、独立账号体系、TOTP、动作版本化、官方内容复核与配置中心 |
| 测试 | `node:test` API 冒烟 + 无头 Chrome 页面检查（前台 + 运营后台） |

```
.
├─ backend/                     Spring Boot 3 后端（默认）
│  ├─ pom.xml
│  └─ src/main/java/com/fitlog/
│     ├─ auth/                  登录、Token、鉴权拦截器
│     ├─ config/                配置、健康检查、SPA 托管
│     ├─ exercise/              动作库
│     ├─ workout/               训练记录、组、模板
│     ├─ checkin/               打卡、徽章
│     ├─ media/                 分片上传、签名 URL、配额与预算
│     ├─ post/                  文章、公开页、审核
│     ├─ ops/                   运营后台：独立鉴权、动作版本、官方内容、配置、审计
│     ├─ stats/                 概览、趋势、PR、周报、身体数据
│     ├─ export/                CSV / JSON 导出
│     └─ common/                Db、时间、指标、校验、异常、审计
├─ sql/
│  ├─ fitlog_schema.sql         30 张表 MySQL DDL（手动执行）
│  └─ fitlog_seed.sql           135 个动作 + 演示账号/训练/文章种子
├─ scripts/
│  ├─ init-mysql.mjs            执行 DDL + 种子（部署辅助）
│  ├─ dev.mjs                   开发启动器（前台 + 独立运营后台）
│  └─ run-with-jdk21.mjs        自动选择 JDK 21 执行 Maven / Java
├─ frontend/
│  ├─ src/                      React 前台源码
│  ├─ index.html                前台 Vite 入口
│  └─ admin/                    独立运营后台 Vite 应用
│     ├─ index.html
│     ├─ vite.config.ts
│     ├─ tsconfig.json
│     └─ src/                   运营后台源码
├─ tests/
│  ├─ smoke.test.mjs            11 组 API 冒烟
│  ├─ ui-check.mjs              19 个前台页面/场景检查
│  └─ ops-ui-check.mjs          25 个运营后台页面检查
└─ docs/
   ├─ PRD-健身记录产品_FitLog_v1.3.md
   └─ PRD-运营后台_FitLog-Ops_v2.0.md
```

---

## 2. 快速开始

**环境**：JDK 21（必须，`pom.xml` 的编译目标为 21）、Maven 3.8+、Node.js 24+（前端与测试脚本）、MySQL 8（3308）。

```powershell
java -version   # 应显示 21.x
mvn -version    # Java version 应为 21.x
# 如默认 JAVA_HOME 不是 21，先切换，例如：
# $env:JAVA_HOME='D:\path\to\jdk-21'
# $env:Path="$env:JAVA_HOME\bin;$env:Path"
```

### 2.1 初始化数据库

```powershell
npm install
$env:MYSQL_HOST='127.0.0.1'; $env:MYSQL_PORT='3308'
$env:MYSQL_USER='root'; $env:MYSQL_PASSWORD='123456'
npm run db:init
```

`db:init` 只执行 `sql/fitlog_schema.sql` 与 `sql/fitlog_seed.sql`，**Spring Boot 不做自动建表或 Java 播种**。
也可以手动在 MySQL 客户端执行这两个 SQL 文件。

默认连接已写入 `backend/src/main/resources/application.yml`，可用环境变量覆盖：

`MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`PORT`、`FITLOG_DATA_DIR`、`FITLOG_SECRET`。

数据目录统一解析到仓库根下的 `backend/data`（上传 `uploads/`、导出 `exports/`），从仓库根或 `backend/` 启动都不会再产生 `backend/backend/data`。`FITLOG_DATA_DIR` 支持绝对路径；相对路径同样以仓库根为基准。

### 2.2 开发模式

```powershell
# 终端 A：Spring Boot :8787
npm run dev:api

# 终端 B：前台 Vite :5173
npm run dev:frontend

# 终端 C：运营后台独立 Vite :5174
npm run dev:admin

# 或一条命令同时启动前端 + 运营后台
npm run dev
```

- 前台：http://localhost:5173
- 运营后台：http://localhost:5174/ops/
- 也可以从主站入口 http://localhost:5173/ops 透传到独立后台

`npm run dev` 会先探测 `8787/api/health`：如果后端已由 IDE 或另一个终端启动，只启动前台与运营后台；否则同时启动 Spring Boot、前台与运营后台。`dev:api`、`build:backend`、`start` 会自动寻找 JDK 21，无需手动切换 `JAVA_HOME`；直接执行 `mvn` 命令时才需要把 `JAVA_HOME` 指向 21。

### 2.3 生产构建与启动

```powershell
npm run build     # 后端 + 前台 build:frontend + 后台 build:admin
npm start         # java -jar backend/target/fitlog-backend-1.3.0.jar
# 打开 http://localhost:8787
```

构建产物：

```text
dist/web/          前台静态站点
dist/web/admin/    运营后台静态站点（资源前缀 /admin/）
```

Spring Boot 托管 `dist/web`：前台 `/login`、`/sessions/**`、`/posts/**`、`/p/**` 回退 `index.html`；运营后台 `/ops`、`/ops/**` 回退 `admin/index.html`。

### 2.4 演示账号

| 账号 | 说明 |
| --- | --- |
| `13800000000` | 演示用户「李衡」，含 8 周训练、打卡、PR、文章；登录页可一键进入 |
| `13900000000` | 演示审核员；运营后台使用独立账号 `admin` / `FitLog@2026!` |
| 任意 11 位手机号 | 开发环境验证码固定 `123456` |

生产环境设置 `FITLOG_PROD=true` 后，演示登录与验证码回显默认关闭，可显式设置 `FITLOG_ENABLE_DEMO=true` / `FITLOG_SHOW_SMS_CODE=true`。

---

## 3. 后端实现范围

### 认证与账号
- 手机号验证码登录、微信 `openid` 绑定/合并、游客只读公开页。
- HMAC-SHA256 访问令牌（2 小时）+ 可轮换刷新令牌（30 天，哈希入库）。
- 注销 30 天撤销期；到期可清理账号与关联数据。
- 隐私政策、通知开关、默认可见性、时区同步。

### 训练
- 力量 / 有氧 / 拉伸 / 其他；开始训练计时、快速补记。
- 组：重量、次数、RPE、组类型、备注；容量排除热身组；Epley 估算 1RM。
- 记住上次、模板、组间休息计时、kg/lb 展示。
- 离线队列由前端承担；组写入通过 `client_op_id` 唯一键幂等。
- 软删除 7 天恢复、永久删除、打卡联动回退、PR 重新计算。
- 分页、类型/月份筛选、标题/备注/动作名搜索。

### 动作库
- 135 个内置动作、别名、肌群、器械、类型、收藏、最近使用。
- 自建动作仅本人可见；合并重复动作并迁移历史组。
- 详情：三个 PR 口径、最近 12 次趋势、历史记录。

### 媒体
- 1MB 分片上传、续传、进度、取消；图片 ≤20MB，视频 ≤200MB / ≤3 分钟。
- 私有读 + 2 小时 HMAC 签名 URL（`/api/media/{id}/{file|thumb}?exp&sig`）。
- 50GB 配额、单日 500MB、¥20 月度预算闸门（50% 告警 / 80% 暂停新用户视频 / 100% 全站视频）。
- 视频水印开关、水印撤销一次、缩略图/封面。
- 文件存储默认 `backend/data/uploads`；生产可替换为 COS/OSS + 转码。

### 内容与审核
- 块类型：段落、H2/H3、图片、相册、视频、引用、列表、待办、分割线、嵌入卡。
- 自动保存、版本（20 个）、编辑锁/接管、发布校验、三档可见性。
- 嵌入训练/打卡/动作卡为实时引用，删除后降级占位。
- 机审规则库（广告导流、医疗功效、绝对化、辱骂）；命中高危拦截并保留草稿。
- 公开内容每日 20 条全站名额，超出转仅自己可见并顺延。
- 审核后台：队列、全文预览、通过/限流/下架/禁发、举报、申诉、规则版本、审计日志、看板、配额与预算、社区 feature flag。

### 打卡与统计
- 有训练自动打卡、48 小时内手动补记、唯一约束与幂等、连续天数、周目标、月历四态。
- 徽章、站内提醒（每日最多 1 次）。
- 概览环比、周/月/年趋势、PR 三口径、肌群分布、身体数据、周报、CSV/JSON 导出。

### 公开页
- `/p/{id}` 公开页、分享卡（标题/封面/作者/容量/连续天数/二维码）、分享开关、阅读去重、举报。
- SPA 标题动态设置；生产可继续扩展服务端 OG 注入。

---

## 4. 数据库

30 张表，完整定义见 `sql/fitlog_schema.sql`：

`users`、`auth_codes`、`refresh_tokens`、`exercises`、`exercise_favorites`、`workout_sessions`、`workout_items`、`workout_sets`、`templates`、`checkins`、`body_metrics`、`media_assets`、`session_media`、`upload_sessions`、`posts`、`post_versions`、`post_embeds`、`post_locks`、`post_views`、`reports`、`appeals`、`review_logs`、`review_rules`、`badges`、`notifications`、`events`、`exports`、`app_settings`、`cost_ledger`、`audit_logs`。

关键约束：`checkins(user_id, local_date)` 唯一、`workout_sets.client_op_id` 唯一、`post_views(post_id, device_id, view_date)` 唯一；时间统一存固定格式 ISO 字符串，归属日单独存 `local_date`。

种子数据已写入 `sql/fitlog_seed.sql`，应用启动后全部从 MySQL 读取：2 个用户、135 个动作、35 次训练、125 个动作条目、415 组、39 条打卡、10 条身体数据、3 篇文章。

---

## 5. 主要 API

| 分组 | 路径 |
| --- | --- |
| 认证 | `/api/auth/sms/send`、`/sms/login`、`/wechat/login`、`/refresh`、`/logout`、`/me`、`/me/delete`、`/privacy` |
| 配置 | `/api/config`、`/api/config/community`、`/api/config/events` |
| 动作 | `/api/exercises`、`/recent`、`/merge`、`/{id}`、`/{id}/favorite` |
| 训练 | `/api/sessions`、`/quick`、`/trash`、`/{id}`、`/{id}/items`、`/{id}/items/{itemId}/sets`、`/{id}/media`、`/{id}/template` |
| 模板 | `/api/templates`、`/{id}/start` |
| 打卡 | `/api/checkins`、`/summary`、`/manual`、`/goal`、`/day/{date}` |
| 媒体 | `/api/media/upload-sessions`、`/upload/{id}/chunk`、`/complete`、`/api/media`、`/usage`、`/{id}/{variant}` |
| 内容 | `/api/posts`、`/{id}`、`/{id}/publish`、`/{id}/versions`、`/{id}/lock`、`/{id}/appeal` |
| 公开页 | `/api/public/posts/{id}`、`/report`、`/share-card`、`/meta` |
| 统计 | `/api/stats/overview`、`/trend/{id}`、`/prs`、`/muscles`、`/weekly-report`、`/frequency`、`/body`、`/exportable` |
| 审核后台 | `/api/admin/queue`、`/posts/{id}`、`/review`、`/reports/{id}/handle`、`/appeals/{id}/resolve`、`/dashboard`、`/rules`、`/audit-logs`、`/users`、`/quota`、`/budget`、`/features` |
| 导出 | `/api/exports`、`/{id}/download/{file}` |

统一响应：成功 `{ "data": ... }`；失败 `{ "error": { "code", "message", "details?" } }`。

---

## 6. 测试与验证结果

### API 冒烟（11/11 通过）

```powershell
# 1) 准备独立库
$env:MYSQL_DATABASE='fitlog_smoke'; npm run db:init

# 2) 启动独立端口的 Spring Boot
$env:PORT='8789'; $env:MYSQL_DATABASE='fitlog_smoke'
npm run dev:api

# 3) 另一终端指向该服务
$env:FITLOG_SMOKE_BASE='http://127.0.0.1:8789'
npm run smoke
```

覆盖：配置与健康、演示账号、135 个动作、统计概览、创建训练（容量/预填/幂等/自动打卡）、校验与越权、文章发布与审核、公开页/分享卡/举报、机审拦截与申诉、媒体分片/签名/配额、补记与徽章、导出鉴权、删除恢复、社区占位与 404。

### 页面检查（19/19 通过）

```powershell
npm run build:frontend
npm start
# 另一终端
$env:APP_URL='http://localhost:8787'; npm run smoke:ui
```

覆盖登录、首页、记录列表、内容列表、数据页、打卡、动作库、设置、社区、训练编辑、PR、文章编辑器、公开页、审核后台、明亮/暗色切换、明亮主题数据页、明亮主题打卡页、移动端打卡、移动端训练编辑；同时收集运行时异常与 console error。

---

## 7. 配置与实现边界

- 短信、微信 `code2Session` 为可运行的模拟实现；接入真实通道替换 `AuthController` 对应方法。
- 对象存储/CDN/视频转码为本地磁盘模拟：分片落盘、封面保存、转码分钟计入预算；水印以播放器叠加层呈现。生产替换 `MediaService` 的 `completeUpload` 与 `BudgetService.recordTranscode`。
- 机审为本地规则库 + 外部供应商占位；可扩展 `ModerationService`。
- 小程序客户端未随仓库交付：PRD 13.2.2 / RK-16 指出的域名、ICP、SSL、企业主体为硬前置；服务端已提供 `wechat/login` 与全部同构 API，手机端由响应式 H5 覆盖。
- 支付、商城、课程、社区 feed/关注/评论按 PRD 非目标未实现；`/api/feed` 等保留 501 命名空间。
- 默认面向内测规模（≤100 注册 / ≤40 活跃）；扩大规模前请评估 MySQL 连接池、媒体存储与预算闸门。

---

## 8. 运营后台 FitLog Ops v2.0

运营后台是独立 Vite 应用（`frontend/admin`）、独立入口、独立账号体系的后台管理平台，与前台用户 Token 物理隔离。前台构建产物为 `dist/web`，后台为 `dist/web/admin`，由 Spring Boot 分别托管 `/` 与 `/ops`。

```text
开发：http://localhost:5174/ops/login
生产：http://localhost:8787/ops/login
```

开发环境账号：

```text
账号：admin
密码：FitLog@2026!
TOTP：登录页自动填充（也可点击“演示登录”）
```

生产部署必须更换密码、绑定真实认证器并离线保存系统页生成的一次性恢复码；`/api/ops/auth/dev-code` 仅在非生产且 `fitlog.show-sms-code=true` 时返回验证码。

### 已实现的 22 个页面 / 场景

- 工作台、动作列表、动作编辑、版本历史、批量导入、搜索质量、合并与归档
- 官方内容、官方内容编辑器、官方训练模板、帮助页 / FAQ、横幅公告
- 审核队列、举报 / 申诉、规则库、抽查工作台
- 配置中心、配置详情、用户与处置、数据看板
- 系统与审计（后台账号 / 审计日志 / 恢复码 / 90 天权限复核）、测试号

核心能力：

- 独立 `admin_accounts` / `admin_sessions`、PBKDF2 密码、TOTP、5 次失败锁定 30 分钟、30 分钟空闲会话、8 小时绝对过期、一次性恢复码
- 动作库变更版本化、影响评估、敏感字段策略、自建动作提升、CSV 预览导入、合并重定向、归档恢复、搜索无结果补别名
- 官方内容单人/双人复核、8 项发布清单、10 秒冷却、排期/下线、发布后抽查、已发布内容编辑保留线上旧版
- 17 项配置集中管理、高风险二次确认、强制原因、历史回滚、配置审计、Web / 小程序分端 feature flag
- 用户手机号掩码、规则编号处置、通知、注销冷静期队列、测试号创建/重置
- 审核 SLA 队列、举报与申诉复核、规则库、抽查退回
- 双科目成本（用户内容 / 官方内容）、启动→打卡漏斗、动作覆盖与内容 Top、审计 CSV 导出
- 运营后台通过 `OpsSchemaInitializer` 启动时幂等创建增量表、补齐字段并写入种子账号，不要求手动迁移；生产发布前建议将增量 DDL 固化为独立迁移脚本并纳入发布流程

### 运营后台测试

```powershell
# 先启动包含运营后台的后端（默认 8787）
npm run build
npm start
# 另一终端
$env:APP_URL='http://localhost:8787'; npm run smoke:ops
```

当前验证：运营后台页面检查 **25/25 通过**（登录、工作台、动作列表/编辑/版本/导入/合并/搜索质量、配置中心/详情、官方内容/编辑/模板/帮助/横幅、用户、审核队列、举报申诉、规则库、抽查、数据看板、系统、测试号），前台 API 冒烟 **11/11 通过**，前台页面检查 **19/19 通过**。
