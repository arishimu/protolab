import { describe, expect, it } from 'vitest';
import {
  buildCorrespondenceMatrix,
  composeMessagePairings,
  createCorrespondencePlan,
  parsePv,
} from '@pv-lens/core';

describe('v2 消息配对 IR', () => {
  const result = parsePv(`
    free c: channel.
    let sender = out(c, x).
    let receiver = in(c, y).
    let other = in(c, z).
    process sender | receiver | other.
  `);

  it('多方自动配对关闭，人工声明可一发多收并保留来源', () => {
    const composed = composeMessagePairings(result, [
      { outEnd: { roleIndex: 0, stepIndex: 0 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
      { outEnd: { roleIndex: 0, stepIndex: 0 }, inEnd: { roleIndex: 2, stepIndex: 0 } },
    ]);
    expect(composed.diagnostics).toEqual([]);
    expect(composed.pairings.map((pairing) => pairing.origin)).toEqual(['manual', 'manual']);
  });

  it('跨信道人工配对被拒绝', () => {
    const crossChannel = parsePv(`
      free c1: channel. free c2: channel.
      let sender = out(c1, x).
      let receiver = in(c2, y).
      process sender | receiver.
    `);
    const composed = composeMessagePairings(crossChannel, [
      { outEnd: { roleIndex: 0, stepIndex: 0 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
    ]);
    expect(composed.pairings).toEqual([]);
    expect(composed.diagnostics[0]?.kind).toBe('invalid-channel');
  });
});

describe('v2 对应性 query 计划', () => {
  const source = `
    free c: channel.
    event begin(bitstring).
    event end(bitstring).
    let p = event begin(x); out(c, x); event end(x).
    process p.
  `;

  it('生成 n² 有序 query 并插到 process 前', () => {
    const result = parsePv(source);
    const plan = createCorrespondencePlan(source, result);
    expect(plan.events).toHaveLength(2);
    expect(plan.queries).toHaveLength(4);
    // 查询变量按事件声明的形参类型生成（ProVerif 要求查询自由变量带类型声明）。
    expect(plan.verificationSource.indexOf('query x0:bitstring; inj-event(begin(x0)) ==> inj-event(begin(x0)).')).toBeLessThan(
      plan.verificationSource.indexOf('process'),
    );
    expect(plan.source).toBe(source);
  });

  it('未返回的矩阵格保持 pending，返回结果只影响自身格', () => {
    const result = parsePv(source);
    const plan = createCorrespondencePlan(source, result);
    const matrix = buildCorrespondenceMatrix(plan, [{
      query: plan.queries[0].text,
      verdict: 'true',
      goalReachable: null,
      counterexampleTrace: null,
    }]);
    expect(matrix[0]?.verdict).toBe('true');
    expect(matrix[1]?.verdict).toBe('pending');
  });
});
