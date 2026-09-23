import { describe, expect, it } from 'vitest';
import { parsePv, solveHorizontalSequence } from '@pv-lens/core';

describe('solveHorizontalSequence', () => {
  it('按加权 min-max 割边和稳定源码序生成角色-信道交错序列', () => {
    const result = parsePv(`
      free c: channel.
      let a = out(c, x); out(c, y).
      let b = in(c, x).
      let d = in(c, y).
      process a | b | d.
    `);
    const first = solveHorizontalSequence(result);
    const second = solveHorizontalSequence(result);
    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.name)).toEqual(['a', 'c', 'b', 'd']);
    expect(first.maxCut).toBe(2);
  });

  it('不依赖配对结果，外部约束作为确定性输入', () => {
    const result = parsePv(`
      free c: channel.
      let a = out(c, x).
      let b = in(c, x).
      process a | b.
    `);
    const sequence = solveHorizontalSequence(result, [{ before: 'c', after: 'a' }]);
    expect(sequence.nodes.map((node) => node.name)).toEqual(['b', 'c', 'a']);
  });
});
