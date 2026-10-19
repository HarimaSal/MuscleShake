/**
 * 运营后台页面运行检查：Chrome CDP。
 * 用法：APP_URL=http://localhost:8788 node tests/ops-ui-check.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.APP_URL ?? 'http://localhost:8787';
const DEBUG_PORT = 9444;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlog-ops-cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
      if (res.ok) return res.json();
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('无法启动 Chrome 调试端口');
}

const target = await createTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.text ?? 'unknown exception');
  else if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') errors.push(message.params.entry.text);
  else if (message.method === 'Network.responseReceived' && message.params?.response?.status >= 400) {
    errors.push(`${message.params.response.status} ${message.params.response.url}`);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function go(urlPath, wait = 2200) {
  await send('Page.navigate', { url: `${APP}${urlPath}` });
  await sleep(wait);
  return evaluate('document.body.innerText');
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), `fitlog-ops-${name}.png`), Buffer.from(result.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
const checks = [];

const loginText = await go('/ops/login');
checks.push(['运营后台登录页', loginText.includes('登录运营后台') && loginText.includes('动态验证码')]);
await shot('login');

await evaluate(`(async () => {
  const res = await fetch('/api/ops/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await res.json();
  localStorage.setItem('fitlog.ops.token', body.data.token);
  return body.data.admin.username;
})()`);

const pages = [
  ['/ops', '工作台', '待审核内容'],
  ['/ops/exercises', '动作列表', '内置动作'],
  ['/ops/configs', '配置中心', '高风险'],
  ['/ops/official', '官方内容', '官方内容'],
  ['/ops/users', '用户与处置', '手机号'],
  ['/ops/review', '审核队列', 'SLA'],
  ['/ops/review/spotcheck', '抽查工作台', '抽查'],
  ['/ops/analytics', '数据看板', '双科目成本'],
  ['/ops/system', '系统与审计', '后台账号'],
  ['/ops/test-account', '测试号', '测试号'],
];
for (const [url, name, expected] of pages) {
  const text = await go(url);
  checks.push([name, text.includes(expected)]);
  if (url === '/ops') await shot('dashboard');
  if (url === '/ops/exercises') await shot('exercises');
  if (url === '/ops/configs') await shot('configs');
}

const ids = await evaluate(`(async () => {
  const token = localStorage.getItem('fitlog.ops.token');
  const headers = { Authorization: 'Bearer ' + token };
  const ex = await fetch('/api/ops/exercises?pageSize=1', { headers }).then((r) => r.json());
  const ct = await fetch('/api/ops/official/contents?pageSize=1', { headers }).then((r) => r.json());
  return { exerciseId: ex.data?.items?.[0]?.id, contentId: ct.data?.items?.[0]?.id };
})()`);

const extraPages = [
  ['/ops/exercises/new', '新建动作', '新建内置动作'],
  ['/ops/exercises/import', '批量导入页', '粘贴 CSV'],
  ['/ops/exercises/merge', '合并页', '选择动作'],
  ['/ops/exercises/search-quality', '搜索质量页', '无结果率'],
  ['/ops/official/new', '新建官方内容页', '发布前复核'],
  ['/ops/official/templates', '训练模板页', '训练模板'],
  ['/ops/official/help', '帮助页列表', '帮助页'],
  ['/ops/official/banners', '横幅列表', '横幅公告'],
  ['/ops/review/reports', '举报申诉页', '举报与申诉'],
  ['/ops/review/rules', '规则库页', '规则库'],
  ['/ops/configs/public_daily_quota', '配置详情页', '变更原因'],
];
if (ids.exerciseId) {
  extraPages.push([`/ops/exercises/${ids.exerciseId}`, '动作编辑页', '影响评估']);
  extraPages.push([`/ops/exercises/${ids.exerciseId}/versions`, '版本历史页', '版本历史']);
}
if (ids.contentId) extraPages.push([`/ops/official/${ids.contentId}`, '官方内容编辑页', '发布前复核']);

for (const [url, name, expected] of extraPages) {
  const text = await go(url, 1800);
  checks.push([name, text.includes(expected)]);
  if (url.includes('/versions')) await shot('versions');
}

const result = checks.map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(result.join('\n'));
if (errors.length) {
  console.log('\nRUNTIME_ERRORS');
  console.log([...new Set(errors)].join('\n'));
}
ws.close();
chrome.kill();
await sleep(400);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
if (checks.some(([, ok]) => !ok) || errors.length) process.exitCode = 1;
