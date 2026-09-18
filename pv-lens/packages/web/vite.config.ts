import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// web 脚手架（ticket 01）。@pv-lens/core 经 workspace 依赖解析到其 dist；
// 需先 `pnpm --filter @pv-lens/core build`（根级 `pnpm build` 会按依赖序先构建 core）。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0"
  },
});
