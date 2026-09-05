import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// core 是纯 TS 源码，测试直接按包名 '@pv-lens/core' 命中其 src 入口，
// 无需预先 build dist，即可在干净环境（无 ProVerif）跑通。
const coreSrc = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@pv-lens/core': coreSrc,
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
