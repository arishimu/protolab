import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, getCoreSample } from '@pv-lens/core';

// 本测试文件位于 packages/core/test/，fixtures 位于 packages/core/fixtures/。
const coreDir = fileURLToPath(new URL('..', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

interface ParsedResult {
  query: string;
  verdict: string;
}

/**
 * 从 ProVerif stdout 解析 RESULT 判定行。
 * 排除形如 `RESULT (even event(...) ...)` 的括号内衍生行（其 query 以 '(' 开头），
 * 避免与真正按查询收尾的 RESULT 行混淆。
 */
function parseResults(stdout: string): ParsedResult[] {
  const out: ParsedResult[] = [];
  const re = /^RESULT ([^(].*?) is (true|false|cannot be proved)\.\s*$/gm;
  for (const m of stdout.matchAll(re)) {
    out.push({ query: m[1], verdict: m[2] });
  }
  return out;
}

/** 反例 trace：ProVerif 的 derivation 步骤以 `1.` `2.` … 行开头。 */
function hasCounterexample(stdout: string): boolean {
  return /^\s*\d+\.\s/m.test(stdout);
}

describe('core 内置样例 manifest', () => {
  it('恰好包含四个基准样例且 id 唯一', () => {
    expect(coreSamples.map((s) => s.id)).toEqual([
      'hello',
      'handshake-fixed',
      'ns-mutual-auth',
      'ns-original',
    ]);
    expect(new Set(coreSamples.map((s) => s.id)).size).toBe(coreSamples.length);
  });

  it('getCoreSample 按 id 命中', () => {
    expect(getCoreSample('hello')?.title).toContain('hello');
    expect(getCoreSample('no-such-id')).toBeUndefined();
  });

  it('每项声明的 fixture 路径都是 .pv / .stdout.txt 且字段非空', () => {
    for (const s of coreSamples) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.pvFile, s.id).toMatch(/\.pv$/);
      expect(s.stdoutFile, s.id).toMatch(/\.stdout\.txt$/);
      expect(s.expectedVerdicts.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe('fixture 资产（Seam A：.pv 原文）', () => {
  it('四个 .pv 原文文件存在且非空、含 process 定义', () => {
    for (const s of coreSamples) {
      const text = readFixture(s.pvFile);
      expect(text.trim().length, `${s.pvFile} 非空`).toBeGreaterThan(0);
      expect(text, `${s.pvFile} 含 process`).toContain('process');
    }
  });
});

describe('fixture 资产（Seam B：ProVerif stdout 录制）', () => {
  it('四个 stdout 录制存在且非空', () => {
    for (const s of coreSamples) {
      const text = readFixture(s.stdoutFile);
      expect(text.trim().length, `${s.stdoutFile} 非空`).toBeGreaterThan(0);
    }
  });

  it('录制 stdout 的 RESULT 判定与 manifest 期望一致（验收口径）', () => {
    for (const s of coreSamples) {
      const stdout = readFixture(s.stdoutFile);
      const got = parseResults(stdout);
      expect(got, s.stdoutFile).toEqual([...s.expectedVerdicts]);
    }
  });

  it('至少一个样例的录制含反例 trace（此处 hello 与 ns-original 均含）', () => {
    const withTrace = coreSamples.filter((s) =>
      hasCounterexample(readFixture(s.stdoutFile)),
    );
    const ids = withTrace.map((s) => s.id);
    expect(ids).toContain('hello');
    expect(ids).toContain('ns-original');
  });
});
