import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT ?? 8787;

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
      // 运营后台是独立 Vite 应用（frontend/admin，:5174）；开发时从主站 /ops 透传。
      '/ops': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
});
