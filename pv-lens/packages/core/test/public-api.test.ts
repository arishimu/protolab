import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, getCoreSample } from '@pv-lens/core';

const srcDir = join(fileURLToPath(new URL('..', import.meta.url)), 'src');

/**
 * src 下的纯代码文件；跳过 `sample-texts.generated.ts`——它是 .pv 原文的数据副本
 * （由 scripts/sync-sample-texts.mjs 生成），不是代码，内含 `.pv` 正文里的任意文本。
 */
function listCoreSourceFiles(dir: string = srcDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listCoreSourceFiles(full);
    if (!entry.name.endsWith('.ts') || entry.name === 'sample-texts.generated.ts') return [];
    return [full];
  });
}

describe('core 公共接口', () => {
  it('可被按包名导入（干净环境冒烟：不依赖 ProVerif）', () => {
    expect(coreSamples.length).toBe(4);
    expect(getCoreSample).toBeTypeOf('function');
  });
});

describe('core 无 Node / 浏览器 API 泄漏（src 纯净性守卫）', () => {
  // core 必须浏览器与 Node 双端可用；一旦 src 依赖平台 API，web/server 之一会崩。
  // 注意禁的是「平台 API 的用法」，不是平台词汇：解析器必须匹配 ProVerif 关键字
  // `process`（注释里也要写「主进程」），所以 process 只按其 Node 全局对象的用法形态禁用。
  const forbidden: readonly { re: RegExp; label: string }[] = [
    { re: /\bnode:/, label: 'Node 内建模块' },
    { re: /\brequire\s*\(/, label: 'CommonJS require' },
    // 用环形断言避开相对导入路径里的 `./process.js` 之类的字样。
    { re: /(?<![.\w/])process\s*[.[]/, label: 'Node 全局 process 用法（process.env 之类）' },
    { re: /\bwindow\b/, label: '浏览器 window' },
    { re: /\bdocument\b/, label: '浏览器 document' },
    { re: /\bBuffer\b/, label: 'Node Buffer' },
    { re: /\bimport\s*\(/, label: '动态 import' },
    { re: /\bfrom\s*['"][^.'"]/, label: '非相对路径 import' },
  ];

  const files = listCoreSourceFiles();

  it('扫描范围覆盖 src 下全部代码文件', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(files.map((f) => relative(srcDir, f)).sort()).toEqual([
      'correspondence.ts',
      'horizontal-sequence.ts',
      'index.ts',
      'message-pairing.ts',
      'pairing.ts',
      'parser/condition.ts',
      'parser/ir.ts',
      'parser/lexer.ts',
      'parser/model.ts',
      'parser/parse.ts',
      'parser/process.ts',
      'parser/state.ts',
      'parser/terms.ts',
      'spacing.ts',
      'symbolic-term.ts',
      'verdict.ts',
      'verify-result.ts',
    ]);
  });

  for (const file of files) {
    const label = `src/${relative(srcDir, file)}`;
    it(`${label} 不碰任何 Node / 浏览器 API`, () => {
      const text = readFileSync(file, 'utf8');
      for (const { re, label: what } of forbidden) {
        expect(text, `${label} 命中了 ${what}`).not.toMatch(re);
      }
    });
  }
});
