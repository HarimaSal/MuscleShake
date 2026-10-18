/**
 * 统一用 JDK 21 执行 Maven / Java，避免 npm run dev 被系统默认的 JDK 17 拦截。
 * 查找顺序：FITLOG_JAVA_HOME / JDK21_HOME / JAVA_HOME_21_X64 / JAVA_HOME（需 21+）
 *          -> JAVA_HOME 同级目录中的 jdk-21*
 *          -> 常见 JDK 安装目录
 *          -> PATH 中的 java
 * 用法：node scripts/run-with-jdk21.mjs mvn -f backend/pom.xml spring-boot:run
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const javaBin = isWindows ? 'java.exe' : 'java';

function javaMajor(home) {
  if (!home) return 0;
  const executable = path.join(home, 'bin', javaBin);
  if (!fs.existsSync(executable)) return 0;
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
  const text = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  const match = text.match(/version "(\d+)/);
  return match ? Number(match[1]) : 0;
}

function candidates() {
  const list = [];
  const add = (value) => {
    if (!value) return;
    const normalized = path.resolve(value);
    if (!list.includes(normalized)) list.push(normalized);
  };

  add(process.env.FITLOG_JAVA_HOME);
  add(process.env.JDK21_HOME);
  add(process.env.JAVA_HOME_21_X64);
  add(process.env.JAVA_HOME);

  // 常见场景：JAVA_HOME 指向 jdk-17，同目录下还有 jdk-21。
  if (process.env.JAVA_HOME) {
    const parent = path.dirname(process.env.JAVA_HOME);
    try {
      for (const name of fs.readdirSync(parent)) {
        if (/21/.test(name)) add(path.join(parent, name));
      }
    } catch {
      /* ignore */
    }
  }

  const roots = isWindows
    ? [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files\\Zulu',
        'C:\\Program Files (x86)\\Java',
      ]
    : ['/usr/lib/jvm', '/opt/java', '/Library/Java/JavaVirtualMachines'];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (/21/.test(name)) add(path.join(root, name));
      }
    } catch {
      /* ignore */
    }
  }

  const which = spawnSync(isWindows ? 'where' : 'which', ['java'], { encoding: 'utf8' });
  if (which.status === 0) {
    const binary = which.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (binary) add(path.dirname(path.dirname(binary)));
  }
  return list;
}

const detected = candidates()
  .map((home) => ({ home, major: javaMajor(home) }))
  .filter((item) => item.major >= 21);
const selected = detected.find((item) => item.major === 21) ?? detected[0];

if (!selected) {
  console.error('未找到 JDK 21。请安装 JDK 21，或设置 JAVA_HOME / FITLOG_JAVA_HOME 指向 JDK 21。');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法：node scripts/run-with-jdk21.mjs <mvn|java> [...args]');
  process.exit(1);
}

const executable = command === 'mvn' && isWindows ? 'mvn.cmd' : command === 'java' && isWindows ? 'java.exe' : command;
const env = {
  ...process.env,
  JAVA_HOME: selected.home,
  PATH: `${path.join(selected.home, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
};

console.error(`[jdk21] ${selected.home} (Java ${selected.major})`);
const quoteCmdArg = (item) => {
  const text = String(item);
  return /[\s"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const child =
  isWindows && executable.toLowerCase().endsWith('.cmd')
    ? spawn(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', [executable, ...args].map(quoteCmdArg).join(' ')],
        { stdio: 'inherit', env },
      )
    : spawn(executable, args, { stdio: 'inherit', env });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
