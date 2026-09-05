import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, getCoreSample } from '@pv-lens/core';

const srcPath = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'index.ts');
const coreSrc = readFileSync(srcPath, 'utf8');

describe('core 公共接口', () => {
  it('可被按包名导入（干净环境冒烟：不依赖 ProVerif）', () => {
    expect(coreSamples.length).toBe(4);
    expect(getCoreSample).toBeTypeOf('function');
  });
});

describe('core 无 Node / 浏览器 API 泄漏（src 纯净性守卫）', () => {
  // core 必须浏览器与 Node 双端可用；一旦 src 依赖平台 API，web/server 之一会崩。
  const forbidden = [/\bprocess\b/, /\brequire\s*\(/, /node:/, /\bwindow\b/, /\bdocument\b/, /\bBuffer\b/];
  for (const re of forbidden) {
    it(`src/index.ts 不含 ${re}`, () => {
      expect(coreSrc).not.toMatch(re);
    });
  }
});
