/**
 * 可选的前端运行冒烟：使用本机 Chrome + CDP，检查关键页面能否渲染。
 * 需要先构建并启动 Spring Boot：npm run build && npm start
 * 用法：CHROME_PATH=... APP_URL=http://localhost:8787 node tests/ui-check.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ??
  (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const APP = process.env.APP_URL ?? 'http://localhost:8787';
const DEBUG_PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlog-cdp-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent('about:blank')}`, {
        method: 'PUT',
      });
      if (res.ok) return res.json();
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error('无法启动 Chrome 调试端口');
}

const target = await createTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params?.exceptionDetails?.text ?? 'unknown exception');
  } else if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
    errors.push(message.params.entry.text);
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
  const file = path.join(os.tmpdir(), `fitlog-${name}.png`);
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  return file;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const checks = [];
const loginText = await go('/login');
checks.push(['登录页', loginText.includes('登录练迹') && loginText.includes('演示账号')]);

await evaluate(`(async () => {
  const res = await fetch('/api/auth/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await res.json();
  localStorage.setItem('fitlog.tokens', JSON.stringify(body.data.tokens));
  return body.data.user.nickname;
})()`);

const pages = [
  ['/', '首页', '这周练了'],
  ['/sessions', '记录列表', '训练记录'],
  ['/posts', '内容列表', '内容'],
  ['/data', '数据页', '数据与成长档案'],
  ['/checkin', '打卡页', '连续打卡'],
  ['/exercises', '动作库', '动作库'],
  ['/settings', '设置', '账号资料'],
  ['/community', '社区占位', '敬请期待'],
];

for (const [urlPath, name, expected] of pages) {
  const text = await go(urlPath);
  checks.push([name, text.includes(expected)]);
  if (urlPath === '/') await shot('home');
  if (urlPath === '/sessions') await shot('sessions');
}

const sessionId = await evaluate(`(async () => {
  const token = JSON.parse(localStorage.getItem('fitlog.tokens') || '{}').accessToken;
  const res = await fetch('/api/sessions?pageSize=1', { headers: { Authorization: 'Bearer ' + token } });
  const body = await res.json();
  return body.data?.items?.[0]?.id;
})()`);
if (sessionId) {
  const editorText = await go(`/sessions/${sessionId}/edit`);
  checks.push(['训练编辑', editorText.includes('本次动作') || editorText.includes('结束训练')]);
  await shot('editor');
}

const dataText = await go('/data?tab=prs');
checks.push(['PR 页', dataText.includes('单组最大重量')]);

const postInfo = await evaluate(`(async () => {
  const token = JSON.parse(localStorage.getItem('fitlog.tokens') || '{}').accessToken;
  const res = await fetch('/api/posts', { headers: { Authorization: 'Bearer ' + token } });
  const body = await res.json();
  const items = body.data.items || [];
  return { editId: items[0]?.id, publicId: items.find((item) => item.status === 'published')?.id };
})()`);

if (postInfo.editId) {
  const editorText = await go(`/posts/${postInfo.editId}/edit`, 2600);
  checks.push(['文章编辑器', editorText.includes('发布设置') && editorText.includes('媒体库')]);
  await shot('post-editor');
}
if (postInfo.publicId) {
  const publicText = await go(`/p/${postInfo.publicId}`);
  checks.push(['公开页', publicText.includes('分享') && publicText.includes('举报')]);
  await shot('public');
}

await evaluate(`(async () => {
  const res = await fetch('/api/ops/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await res.json();
  localStorage.setItem('fitlog.ops.token', body.data.token);
})()`);
const adminText = await go('/ops');
checks.push(['运营后台', adminText.includes('工作台') && adminText.includes('待审核内容')]);
await shot('admin');

await evaluate(`(async () => {
  const res = await fetch('/api/auth/demo-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const body = await res.json();
  localStorage.setItem('fitlog.tokens', JSON.stringify(body.data.tokens));
})()`);

await go('/');
await evaluate(`document.querySelector('.theme-toggle')?.click()`);
await sleep(300);
const activeTheme = await evaluate(`document.documentElement.dataset.theme`);
checks.push(['明亮/暗色主题切换', activeTheme === 'light']);
await shot('home-light');
const lightData = await go('/data?tab=prs');
checks.push(['明亮主题数据页', lightData.includes('单组最大重量')]);
await shot('data-light');
const lightCheckin = await go('/checkin');
checks.push(['明亮主题打卡页', lightCheckin.includes('连续打卡')]);
await shot('checkin-light');
await evaluate(`document.querySelector('.theme-toggle')?.click()`);
await sleep(200);

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
const mobileText = await go('/checkin');
checks.push(['移动端打卡', mobileText.includes('连续打卡') && mobileText.includes('本周目标')]);
await shot('checkin-mobile');
await go('/');
await shot('home-mobile');
if (sessionId) {
  const mobileEditor = await go(`/sessions/${sessionId}/edit`);
  checks.push([
    '移动端训练编辑',
    mobileEditor.includes('结束训练') && (mobileEditor.includes('添加一组') || mobileEditor.includes('添加动作')),
  ]);
  await shot('editor-mobile');
}
await send('Emulation.clearDeviceMetricsOverride');

const result = checks.map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(result.join('\n'));
if (errors.length) {
  console.log('\n前端错误:');
  for (const error of [...new Set(errors)].slice(0, 20)) console.log(`- ${error}`);
}
console.log(`\n截图目录: ${os.tmpdir()}`);

ws.close();
chrome.kill();
await sleep(500);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  /* Chrome 可能仍占用临时目录，可忽略 */
}
if (checks.some(([, ok]) => !ok) || errors.length) process.exitCode = 1;
