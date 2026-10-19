import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const apiPort = process.env.PORT ?? '8787';

export default defineConfig(({ command }) => ({
  root: appRoot,
  // 开发时通过 /ops/ 访问；生产构建把资源放到 /admin/，由 Spring Boot 的 /ops/** 转发 index。
  base: command === 'build' ? '/admin/' : '/ops/',
  plugins: [
    react(),
    {
      name: 'ops-root-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/ops' || req.url?.startsWith('/ops?')) {
            res.statusCode = 302;
            res.setHeader('Location', `/ops/${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    fs: {
      allow: [path.resolve(appRoot, '..')],
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(appRoot, '../../dist/web/admin'),
    emptyOutDir: true,
  },
}));
