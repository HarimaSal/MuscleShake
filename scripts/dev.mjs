/**
 * 开发启动器：
 * - 8787 已有 FitLog 后端（例如 IntelliJ 正在运行）时，只启动前端，避免端口冲突；
 * - 否则同时启动 Spring Boot 与 Vite；
 * - Spring Boot 通过 run-with-jdk21.mjs 自动选择 JDK 21。
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiPort = process.env.PORT ?? '8787';
const children = new Set();
let shuttingDown = false;

async function backendRunning() {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.data?.service === 'fitlog-spring';
  } catch {
    return false;
  }
}

function start(script) {
  const child =
    process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], {
          stdio: 'inherit',
          env: process.env,
        })
      : spawn(npm, ['run', script], { stdio: 'inherit', env: process.env });
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    if (shuttingDown) return;
    if (code && code !== 0) process.exitCode = code;
    shutdown();
  });
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown();
    setTimeout(() => process.exit(0), 500);
  });
}

if (await backendRunning()) {
  console.log(`[dev] 检测到 ${apiPort} 的 FitLog 后端已运行，跳过 dev:api，仅启动前端`);
  start('dev:frontend');
} else {
  console.log('[dev] 启动 Spring Boot 与前端');
  start('dev:api');
  start('dev:frontend');
}
