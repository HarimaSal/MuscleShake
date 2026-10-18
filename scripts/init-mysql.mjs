/**
 * 部署辅助：执行建表与演示种子 SQL。
 * 仅做 SQL 文件执行，不在 Java 后端中自动建表/播种。
 * 用法：node scripts/init-mysql.mjs
 * 环境变量：MYSQL_HOST=127.0.0.1 MYSQL_PORT=3308 MYSQL_USER=root MYSQL_PASSWORD=123456
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const root = path.resolve(import.meta.dirname, '..');
const database = process.env.MYSQL_DATABASE ?? 'fitlog';
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3308),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '123456',
  multipleStatements: true,
  charset: 'utf8mb4',
});

try {
  const schema = fs.readFileSync(path.join(root, 'sql', 'fitlog_schema.sql'), 'utf8').replaceAll('fitlog', database);
  await connection.query(schema);
  const seed = fs.readFileSync(path.join(root, 'sql', 'fitlog_seed.sql'), 'utf8');
  await connection.query(seed);
  const [tables] = await connection.query(`SHOW TABLES FROM \`${database}\``);
  const [users] = await connection.query(`SELECT COUNT(*) AS n FROM \`${database}\`.users`);
  const [exercises] = await connection.query(`SELECT COUNT(*) AS n FROM \`${database}\`.exercises`);
  console.log(`MySQL 初始化完成：${database}，${tables.length} 张表，${users[0].n} 个用户，${exercises[0].n} 个动作`);
} finally {
  await connection.end();
}
