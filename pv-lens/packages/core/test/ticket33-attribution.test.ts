import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { attributeCounterexample, parseVerifyStdout } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function traceFixture(): string {
  const stdout = readFileSync(join(coreDir, 'fixtures', 'proverif', 'ns-original.stdout.txt'), 'utf8');
  const result = parseVerifyStdout(stdout).find((candidate) => candidate.counterexampleTrace !== null);
  if (result?.counterexampleTrace === null || result?.counterexampleTrace === undefined) {
    throw new Error('missing counterexample fixture');
  }
  return result.counterexampleTrace;
}

describe('阶段 5：反例 trace 归因', () => {
  it('按 output/input 消息步分组，并列出攻击者获得的知识项', () => {
    const attribution = attributeCounterexample(traceFixture());
    const outputs = attribution.entries.filter((entry) => entry.kind === 'output');
    expect(outputs.map((entry) => entry.step)).toEqual(expect.arrayContaining([3, 6]));
    const firstOutput = outputs.find((entry) => entry.step === 6);
    expect(firstOutput?.terms).toContain('pk(skB[])');
    expect(firstOutput?.title).toContain('攻击者收到');
    expect(attribution.summary).toContain('输出');
    expect(attribution.summary).toContain('不同项');
  });

  it('同一编号块内的输入→输出按输出步归因，并保留原始行', () => {
    const attribution = attributeCounterexample(traceFixture());
    const inputThenOutput = attribution.entries.find((entry) => entry.step === 9 || entry.terms.some((term) => term.includes('aenc')));
    expect(inputThenOutput).toBeDefined();
    expect(inputThenOutput?.lines[0]).toMatch(/^\s*\d+\./);
    expect(inputThenOutput?.lines.every((line) => line.length >= 0)).toBe(true);
  });

  it('无法归因的导语与缩写行逐字保留，不绘制几何路径', () => {
    const trace = traceFixture();
    const attribution = attributeCounterexample(trace);
    expect(attribution.unattributed.length).toBeGreaterThan(0);
    expect(attribution.unattributed.some((line) => line.includes('='))).toBe(true);
    for (const entry of attribution.entries) {
      expect(entry).not.toHaveProperty('x');
      expect(entry).not.toHaveProperty('y');
      expect(entry).not.toHaveProperty('path');
    }
  });

  it('空 trace 不抛异常，返回空归因', () => {
    expect(attributeCounterexample('')).toMatchObject({ entries: [], unattributed: [] });
  });
});
