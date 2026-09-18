import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// web 脚手架（ticket 01）。@pv-lens/core 经 workspace 依赖解析到其 dist；
// 需先 `pnpm --filter @pv-lens/core build`（根级 `pnpm build` 会按依赖序先构建 core）。
//
// `/api` 代理（ticket 08）：验证服务只在 127.0.0.1:8787 上监听、且不发 CORS 头，
// 故 dev 与 preview 都把 `/api` 原样转发给本机 server，前端一律用同源相对路径请求。
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
