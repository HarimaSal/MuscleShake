import { before, test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.FITLOG_SMOKE_BASE ?? 'http://127.0.0.1:8787';
let demoToken = '';
let adminToken = '';
let secondToken = '';
let benchId = '';
let sessionId = '';
let postId = '';
let mediaId = '';
let exportId = '';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function req(urlPath, options = {}) {
  const headers = {
    'X-Device-Id': 'smoke-device',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers ?? {}),
  };
  let body;
  if (options.raw) {
    body = options.raw;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method: options.method ?? 'GET', headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, data: json?.data, error: json?.error, text, headers: res.headers };
}

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('服务未在预期时间内启动');
}

before(async () => {
  await waitForServer();

  const demo = await req('/api/auth/demo-login', { method: 'POST', body: {} });
  assert.equal(demo.status, 200);
  demoToken = demo.data.tokens.accessToken;

  const admin = await req('/api/auth/admin-login', { method: 'POST', body: {} });
  assert.equal(admin.status, 200);
  adminToken = admin.data.tokens.accessToken;

  const sms = await req('/api/auth/sms/send', { method: 'POST', body: { phone: '13700001111' } });
  assert.equal(sms.status, 200);
  const second = await req('/api/auth/sms/login', {
    method: 'POST',
    body: { phone: '13700001111', code: '123456' },
  });
  assert.equal(second.status, 200);
  secondToken = second.data.tokens.accessToken;
});

test('健康检查与公开配置可用', async () => {
  const health = await req('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const config = await req('/api/config');
  assert.equal(config.status, 200);
  assert.equal(config.data.communityVisible, true);
  assert.equal(config.data.publicDailyQuota, 20);
  assert.ok(config.data.quotaGb >= 50);
});

test('演示账号、动作库与统计概览', async () => {
  const me = await req('/api/auth/me', { token: demoToken });
  assert.equal(me.status, 200);
  assert.ok(me.data.user.nickname.length > 0);
  assert.ok(me.data.streak >= 7, '演示账号应有连续打卡');

  const exercises = await req('/api/exercises', { token: demoToken });
  assert.equal(exercises.status, 200);
  assert.ok(exercises.data.items.length >= 120, '内置动作应 ≥120 个');
  const bench = exercises.data.items.find((item) => item.name === '杠铃卧推');
  assert.ok(bench, '应存在杠铃卧推');
  benchId = bench.id;

  const overview = await req('/api/stats/overview', { token: demoToken });
  assert.equal(overview.status, 200);
  assert.ok(overview.data.totalSessions > 10);
  assert.equal(overview.data.empty, false);

  const prs = await req('/api/stats/prs', { token: demoToken });
  assert.equal(prs.status, 200);
  assert.ok(prs.data.items.length > 0);
  assert.ok(prs.data.items.some((item) => item.exerciseName === '杠铃卧推' && item.maxE1RM));
});

test('创建训练：容量计算、预填上次、幂等与自动打卡', async () => {
  const tz = -480;
  const localDate = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10);
  const created = await req('/api/sessions', {
    method: 'POST',
    token: demoToken,
    body: {
      type: 'strength',
      title: '冒烟测试 · 推日',
      startedAt: new Date(Date.now() - 40 * 60000).toISOString(),
      tzOffset: tz,
      notes: 'smoke',
      feeling: 4,
      items: [
        {
          exerciseId: benchId,
          sets: [
            { weightKg: 40, reps: 10, setType: 'warmup' },
            { weightKg: 60, reps: 8, rpe: 8 },
            { weightKg: 62.5, reps: 6 },
          ],
        },
      ],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  sessionId = created.data.session.id;
  assert.equal(created.data.session.volumeKg, 60 * 8 + 62.5 * 6, '容量应排除热身组');
  assert.equal(created.data.session.localDate, localDate);
  assert.equal(created.data.session.itemCount, 1);
  assert.equal(created.data.session.setCount, 3);
  const benchItem = created.data.session.items[0];
  assert.equal(benchItem.exerciseName, '杠铃卧推');
  assert.ok(benchItem.last, '应带出上次同动作数据');

  const checkins = await req(`/api/checkins?month=${localDate.slice(0, 7)}`, { token: demoToken });
  assert.equal(checkins.status, 200);
  const today = checkins.data.days.find((day) => day.date === localDate);
  assert.ok(today && today.status !== 'none', '保存训练后应自动打卡');

  const item = benchItem;
  const opId = `smoke-${Date.now()}`;
  const first = await req(`/api/sessions/${sessionId}/items/${item.id}/sets`, {
    method: 'POST',
    token: demoToken,
    body: { weightKg: 70, reps: 5, rpe: 9, clientOpId: opId },
  });
  assert.equal(first.status, 200, JSON.stringify(first.error));
  assert.equal(first.data.session.setCount, 4);
  assert.ok(first.data.set.estimated1RM > 70);

  const duplicate = await req(`/api/sessions/${sessionId}/items/${item.id}/sets`, {
    method: 'POST',
    token: demoToken,
    body: { weightKg: 70, reps: 5, rpe: 9, clientOpId: opId },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.duplicated, true);
  assert.equal(duplicate.data.session.setCount, 4, '幂等键应避免重复写入');
});

test('数据校验与越权保护', async () => {
  const invalidWeight = await req(`/api/sessions/${sessionId}/items/xx/sets`, {
    method: 'POST',
    token: demoToken,
    body: { weightKg: 2000, reps: 8 },
  });
  assert.ok([400, 404].includes(invalidWeight.status));

  const list = await req('/api/sessions?page=1', { token: demoToken });
  const itemId = list.data.items.find((s) => s.id === sessionId).id;
  const detail = await req(`/api/sessions/${itemId}`, { token: demoToken });
  const realItemId = detail.data.items[0].id;
  const tooHeavy = await req(`/api/sessions/${sessionId}/items/${realItemId}/sets`, {
    method: 'POST',
    token: demoToken,
    body: { weightKg: 2000, reps: 8 },
  });
  assert.equal(tooHeavy.status, 400);
  assert.match(tooHeavy.error.message, /0–1000/);

  const invalidReps = await req(`/api/sessions/${sessionId}/items/${realItemId}/sets`, {
    method: 'POST',
    token: demoToken,
    body: { weightKg: 60, reps: 0 },
  });
  assert.equal(invalidReps.status, 400);

  const foreign = await req(`/api/sessions/${sessionId}`, { token: secondToken });
  assert.equal(foreign.status, 404, '他人训练记录不可访问');

  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const badCheckin = await req('/api/checkins/manual', {
    method: 'POST',
    token: demoToken,
    body: { localDate: future, workoutType: 'strength', durationMin: 30 },
  });
  assert.equal(badCheckin.status, 400);
});

test('文章块、审核链路、公开页与举报', async () => {
  const created = await req('/api/posts', {
    method: 'POST',
    token: demoToken,
    body: { title: '冒烟测试文章', visibility: 'private' },
  });
  assert.equal(created.status, 201);
  postId = created.data.id;

  const blocks = [
    { id: 'b1', type: 'paragraph', version: 1, props: { text: '这是一篇冒烟测试文章。' } },
    { id: 'b2', type: 'embed', version: 1, props: { embedType: 'session', refId: sessionId } },
    { id: 'b3', type: 'list', version: 1, props: { ordered: false, items: ['保持记录', '保持复盘'] } },
  ];
  const saved = await req(`/api/posts/${postId}`, {
    method: 'PATCH',
    token: demoToken,
    body: { title: '冒烟测试文章', blocks, summary: '自动化测试', device: 'smoke-device' },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.blocks.length, 3);

  const publishedPrivate = await req(`/api/posts/${postId}/publish`, {
    method: 'POST',
    token: demoToken,
    body: { visibility: 'private' },
  });
  assert.equal(publishedPrivate.status, 200);
  assert.equal(publishedPrivate.data.post.status, 'published');
  assert.equal(publishedPrivate.data.post.reviewStatus, 'approved');

  const publishedPublic = await req(`/api/posts/${postId}/publish`, {
    method: 'POST',
    token: demoToken,
    body: { visibility: 'public', allowIndex: true },
  });
  assert.equal(publishedPublic.status, 200);
  assert.equal(publishedPublic.data.post.status, 'pending');
  assert.equal(publishedPublic.data.post.reviewStatus, 'pending');

  const beforeApprove = await req(`/api/public/posts/${postId}`);
  assert.equal(beforeApprove.status, 403, '审核通过前公开页不可见');

  const queue = await req('/api/admin/queue', { token: adminToken });
  assert.equal(queue.status, 200);
  assert.ok(queue.data.posts.some((post) => post.id === postId));

  const reviewed = await req(`/api/admin/posts/${postId}/review`, {
    method: 'POST',
    token: adminToken,
    body: { action: 'approve', reason: '内容正常', ruleCodes: [] },
  });
  assert.equal(reviewed.status, 200);

  const publicPost = await req(`/api/public/posts/${postId}`);
  assert.equal(publicPost.status, 200);
  assert.equal(publicPost.data.title, '冒烟测试文章');
  assert.ok(publicPost.data.blocks.some((block) => block.type === 'embed' && block.props.data?.type === 'session'));

  const card = await req(`/api/public/posts/${postId}/share-card`);
  assert.equal(card.status, 200);
  assert.ok(card.data.qrSvg.includes('<svg'));
  assert.ok(card.data.url.endsWith(`/p/${postId}`));

  const reported = await req(`/api/public/posts/${postId}/report`, {
    method: 'POST',
    body: { reason: '其他', detail: '冒烟测试举报' },
  });
  assert.equal(reported.status, 201);
  const reportQueue = await req('/api/admin/queue', { token: adminToken });
  const report = reportQueue.data.reports.find((item) => item.postId === postId);
  assert.ok(report);
  const handled = await req(`/api/admin/reports/${report.id}/handle`, {
    method: 'POST',
    token: adminToken,
    body: { result: 'dismiss' },
  });
  assert.equal(handled.status, 200);
});

test('文本机审拦截、草稿保留与申诉', async () => {
  const rejected = await req(`/api/posts/${postId}/publish`, {
    method: 'POST',
    token: demoToken,
    body: { visibility: 'public' },
  });
  assert.equal(rejected.status, 200);

  const bad = await req(`/api/posts/${postId}`, {
    method: 'PATCH',
    token: demoToken,
    body: {
      title: '加微信领取计划',
      blocks: [{ id: 'x1', type: 'paragraph', version: 1, props: { text: '想变强就加微信，保证减肥。' } }],
      device: 'smoke-device',
    },
  });
  assert.equal(bad.status, 200);

  const blocked = await req(`/api/posts/${postId}/publish`, {
    method: 'POST',
    token: demoToken,
    body: { visibility: 'public' },
  });
  assert.equal(blocked.status, 422);
  assert.ok(blocked.error.details.hits.length > 0);

  const stillThere = await req(`/api/posts/${postId}`, { token: demoToken });
  assert.equal(stillThere.status, 200);
  assert.ok(stillThere.data.blocks.length >= 1, '拦截后草稿应保留');

  const appeal = await req(`/api/posts/${postId}/appeal`, {
    method: 'POST',
    token: demoToken,
    body: { reason: '这是一次误判，内容是训练计划说明。' },
  });
  assert.equal(appeal.status, 201);

  const queue = await req('/api/admin/queue', { token: adminToken });
  const appealItem = queue.data.appeals.find((item) => item.postId === postId);
  assert.ok(appealItem);
  const resolved = await req(`/api/admin/appeals/${appealItem.id}/resolve`, {
    method: 'POST',
    token: adminToken,
    body: { approve: true, resolution: '复核后确认误判，恢复内容' },
  });
  assert.equal(resolved.status, 200);
});

test('媒体分片上传、签名链接、配额与删除', async () => {
  const session = await req('/api/media/upload-sessions', {
    method: 'POST',
    token: demoToken,
    body: { fileName: 'smoke.png', mime: 'image/png', sizeBytes: PNG.length, type: 'image' },
  });
  assert.equal(session.status, 201, JSON.stringify(session.error));
  assert.equal(session.data.totalChunks, 1);

  const uploadId = session.data.uploadId;
  const chunk = await req(`/api/media/upload/${uploadId}/chunk?index=0`, {
    method: 'PUT',
    token: demoToken,
    raw: PNG,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  assert.equal(chunk.status, 200);

  const complete = await req(`/api/media/upload/${uploadId}/complete`, {
    method: 'POST',
    token: demoToken,
    body: {},
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.error));
  mediaId = complete.data.id;
  assert.equal(complete.data.status, 'ready');
  assert.ok(complete.data.url.includes('sig='));

  const file = await fetch(`${BASE}${complete.data.url}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');

  const expired = await fetch(`${BASE}${complete.data.url.replace(/sig=[^&]+/, 'sig=bad')}`);
  assert.equal(expired.status, 403);

  const usage = await req('/api/media/usage', { token: demoToken });
  assert.equal(usage.status, 200);
  assert.ok(usage.data.usedBytes >= PNG.length);
  assert.ok(usage.data.quotaBytes > 0);
  assert.ok(usage.data.budget);

  const attached = await req(`/api/sessions/${sessionId}/media`, {
    method: 'POST',
    token: demoToken,
    body: { mediaIds: [mediaId] },
  });
  assert.equal(attached.status, 200);
  assert.equal(attached.data.media.length, 1);
});

test('打卡补记、周目标与徽章', async () => {
  const summary = await req('/api/checkins/summary', { token: demoToken });
  assert.equal(summary.status, 200);
  assert.ok(summary.data.badges.length >= 8);

  const goal = await req('/api/checkins/goal', {
    method: 'PUT',
    token: demoToken,
    body: { weeklyGoal: 4 },
  });
  assert.equal(goal.status, 200);
  assert.equal(goal.data.weekly.goal, 4);

  const tz = -480;
  const yesterday = new Date(Date.now() - 86400000 - tz * 60000).toISOString().slice(0, 10);
  const manual = await req('/api/checkins/manual', {
    method: 'POST',
    token: secondToken,
    body: { localDate: yesterday, workoutType: 'stretch', durationMin: 20, note: '冒烟补记' },
  });
  assert.equal(manual.status, 201, JSON.stringify(manual.error));
  assert.equal(manual.data.checkin.source, 'manual');

  const duplicate = await req('/api/checkins/manual', {
    method: 'POST',
    token: secondToken,
    body: { localDate: yesterday, workoutType: 'stretch', durationMin: 20 },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.duplicated, true, '重复补记应幂等，不新增记录');
});

test('导出 CSV/JSON 与下载鉴权', async () => {
  const created = await req('/api/exports', { method: 'POST', token: demoToken });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  exportId = created.data.id;
  assert.ok(created.data.files.length >= 5);

  const list = await req('/api/exports', { token: demoToken });
  assert.ok(list.data.items.some((item) => item.id === exportId));

  const file = await fetch(`${BASE}/api/exports/${exportId}/download/workout_sessions.csv`, {
    headers: { Authorization: `Bearer ${demoToken}` },
  });
  assert.equal(file.status, 200);
  const text = await file.text();
  assert.ok(text.includes('local_date'), 'CSV 应包含表头');

  const prohibited = await fetch(`${BASE}/api/exports/${exportId}/download/workout_sessions.csv`);
  assert.equal(prohibited.status, 401);
});

test('删除训练联动打卡回退与恢复', async () => {
  const tz = -480;
  const localDate = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10);
  const before = await req(`/api/checkins?month=${localDate.slice(0, 7)}`, { token: demoToken });
  const dayBefore = before.data.days.find((day) => day.date === localDate);
  assert.ok(dayBefore.status !== 'none');

  const deleted = await req(`/api/sessions/${sessionId}`, { method: 'DELETE', token: demoToken });
  assert.equal(deleted.status, 200);

  const trash = await req('/api/sessions/trash', { token: demoToken });
  assert.ok(trash.data.items.some((item) => item.id === sessionId));

  const restored = await req(`/api/sessions/${sessionId}/restore`, { method: 'POST', token: demoToken });
  assert.equal(restored.status, 200);

  const after = await req(`/api/checkins?month=${localDate.slice(0, 7)}`, { token: demoToken });
  const dayAfter = after.data.days.find((day) => day.date === localDate);
  assert.ok(dayAfter.status !== 'none', '恢复训练后打卡应恢复');
});

test('社区占位与埋点、未知接口返回 JSON 404', async () => {
  const community = await req('/api/config/community');
  assert.equal(community.status, 200);
  assert.equal(community.data.open, false);
  assert.match(community.data.title, /敬请期待/);

  const event = await req('/api/config/events', {
    method: 'POST',
    token: demoToken,
    body: { name: 'reserved_entry_click', props: { platform: 'web', entry: 'tab' } },
  });
  assert.equal(event.status, 200);

  const notFound = await req('/api/does-not-exist');
  assert.equal(notFound.status, 404);
  assert.equal(notFound.error.code, 'NOT_FOUND');
});
