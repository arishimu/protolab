import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getSampleSource, parsePv, solveHorizontalSequence } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(path: string) {
  return readFileSync(join(coreDir, 'fixtures', path), 'utf8');
}

/** ADR-0009 的加权见证图：r0–c0×1、r0–c2×1、r0–c3×2、r1–c0×1、r2–c2×2（c1 孤立）。 */
const WITNESS_SOURCE = [
  'free c0: channel. free c1: channel. free c2: channel. free c3: channel.',
  'let r0 = out(c3, x1); out(c3, x2); out(c0, a); out(c2, b).',
  'let r1 = in(c0, y).',
  'let r2 = in(c2, z1); in(c2, z2).',
  'process r0 | r1 | r2.',
].join('\n');

const WITNESS_EDGES: ReadonlyArray<readonly [string, string, number]> = [
  ['r0', 'c0', 1],
  ['r0', 'c2', 1],
  ['r0', 'c3', 2],
  ['r1', 'c0', 1],
  ['r2', 'c2', 2],
];

/** 与求解器独立的暴力枚举：全排列计算 (maxCut, sum)，用于见证数字断言。 */
function enumerateOrderStats(names: readonly string[]): Array<{ order: string[]; maxCut: number; sum: number }> {
  const stats: Array<{ order: string[]; maxCut: number; sum: number }> = [];
  const visit = (prefix: string[], rest: string[]): void => {
    if (rest.length === 0) {
      const order = prefix;
      const cuts = order.slice(0, -1).map((_, index) => {
        const left = new Set(order.slice(0, index + 1));
        return WITNESS_EDGES.reduce(
          (total, [u, v, weight]) => total + (left.has(u) !== left.has(v) ? weight : 0),
          0,
        );
      });
      stats.push({ order, maxCut: cuts.length === 0 ? 0 : Math.max(...cuts), sum: cuts.reduce((a, b) => a + b, 0) });
      return;
    }
    rest.forEach((name, index) => visit([...prefix, name], [...rest.slice(0, index), ...rest.slice(index + 1)]));
  };
  visit([], [...names]);
  return stats;
}

describe('ticket #04：水平序列与局部梯子（core 求解器）', () => {
  it('ns-mutual-auth 回归：S · I · c · R · K，同输入重跑结果一致', () => {
    const result = parsePv(getSampleSource('ns-mutual-auth') ?? '');
    const first = solveHorizontalSequence(result);
    const second = solveHorizontalSequence(result);
    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.name)).toEqual([
      'processS',
      'processInitiator',
      'c',
      'processResponder',
      'processK',
    ]);
  });

  it('见证图回归：min-max 否决 min-sum 排列（ADR-0009 的不等价论证）', () => {
    const stats = enumerateOrderStats(['r0', 'r1', 'r2', 'c0', 'c1', 'c2', 'c3']);
    // 不存在 max ≤ 1 的排列：min-max 最优值就是 2。
    expect(Math.min(...stats.map((stat) => stat.maxCut))).toBe(2);
    // min-sum 最优（8）的排列 max 全部为 3：按总走线长度挑会破坏 min-max 目标。
    const minSum = Math.min(...stats.map((stat) => stat.sum));
    expect(minSum).toBe(8);
    expect(new Set(stats.filter((stat) => stat.sum === minSum).map((stat) => stat.maxCut))).toEqual(new Set([3]));
    // max = 2 的排列 sum ≥ 9（ADR-0009 原文「≥ 11」系笔误，暴力枚举更正）。
    expect(Math.min(...stats.filter((stat) => stat.maxCut === 2).map((stat) => stat.sum))).toBe(9);

    const sequence = solveHorizontalSequence(parsePv(WITNESS_SOURCE));
    expect(sequence.maxCut).toBe(2);
    expect(sequence.cutWidths.reduce((a, b) => a + b, 0)).toBe(9);
    // 三级 tie-break（min-max → 降序 cut 曲线 → 源码序）选中的确定排列。
    expect(sequence.nodes.map((node) => node.name)).toEqual(['r2', 'c2', 'r1', 'c0', 'r0', 'c3', 'c1']);
  });

  it('打乱步骤书写顺序不改序列（候选枚举顺序无关的确定性）', () => {
    const shuffled = parsePv([
      'free c0: channel. free c1: channel. free c2: channel. free c3: channel.',
      'let r0 = out(c0, a); out(c2, b); out(c3, x1); out(c3, x2).',
      'let r1 = in(c0, y).',
      'let r2 = in(c2, z2); in(c2, z1).',
      'process r0 | r1 | r2.',
    ].join('\n'));
    const witness = solveHorizontalSequence(parsePv(WITNESS_SOURCE));
    expect(solveHorizontalSequence(shuffled)).toEqual(witness);
  });

  it('空边集与孤立角色由源码序兜底', () => {
    const result = parsePv([
      'free c: channel.',
      'let a = new n: bitstring.',
      'let b = new m: bitstring.',
      'process a | b.',
    ].join('\n'));
    const sequence = solveHorizontalSequence(result);
    expect(sequence.nodes.map((node) => node.name)).toEqual(['a', 'b', 'c']);
    expect(sequence.maxCut).toBe(0);
  });

  it('不可满足的外部顺序约束回退源码序，不抛错', () => {
    const result = parsePv([
      'free c: channel.',
      'let a = out(c, x).',
      'let b = in(c, x).',
      'process a | b.',
    ].join('\n'));
    const sequence = solveHorizontalSequence(result, [
      { before: 'a', after: 'b' },
      { before: 'b', after: 'a' },
    ]);
    expect(sequence.nodes.map((node) => node.name)).toEqual(['a', 'b', 'c']);
  });

  it('多信道交错排布，信道不集中在同一侧', () => {
    const sequence = solveHorizontalSequence(parsePv(fixture('pv/multi-channel.pv')));
    const names = sequence.nodes.map((node) => node.name);
    expect(names).toEqual(['processS', 'c2', 'processB', 'c1', 'processA', 'c3']);
    const channelPositions = names
      .map((name, index) => (name.startsWith('c') ? index : -1))
      .filter((index) => index >= 0);
    channelPositions.forEach((position, index) => {
      if (index > 0) expect(position - channelPositions[index - 1]).toBeGreaterThanOrEqual(2);
    });
  });
});
