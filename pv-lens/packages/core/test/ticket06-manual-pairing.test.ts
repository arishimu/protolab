import { describe, expect, it } from 'vitest';
import { composeMessagePairings, parsePv } from '@pv-lens/core';
import type { PairingIntent } from '@pv-lens/core';

/** 顺序环样例：A 收 a1 发 a2、B 收 b1 发 b2，第三角色抑制自动配对（多方不自动连线）。 */
const cycleModel = parsePv([
  'free c: channel.',
  'let A = in(c, a1: bitstring); out(c, a2).',
  'let B = in(c, b1: bitstring); out(c, b2).',
  'let C = out(c, c1).',
  'process A | B | C.',
].join('\n'));

describe('ticket #06：人工配对、广播扇出与合流（core 合同）', () => {
  it('合流：多个发送端声明命中同一接收端，声明全部接受且去重重复声明', () => {
    // 合流声明集（不闭合）：A.out 与 C.out 都命中 B.in；第三条为重复声明，应被去重。
    const intents: PairingIntent[] = [
      { outEnd: { roleIndex: 0, stepIndex: 1 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
      { outEnd: { roleIndex: 2, stepIndex: 0 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
      { outEnd: { roleIndex: 0, stepIndex: 1 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
    ];
    const { pairings, diagnostics } = composeMessagePairings(cycleModel, intents);
    expect(pairings).toHaveLength(2);
    expect(pairings.every((pairing) => pairing.origin === 'manual')).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });

  it('顺序环：因果边与角色本地序成环时显式标 order-cycle，不静默丢弃声明', () => {
    // 边：a1→a2（A 序）、a2→b1（声明1）、b1→b2（B 序）、b2→a1（声明2）——构成环。
    const intents: PairingIntent[] = [
      { outEnd: { roleIndex: 0, stepIndex: 1 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
      { outEnd: { roleIndex: 1, stepIndex: 1 }, inEnd: { roleIndex: 0, stepIndex: 0 } },
    ];
    const { pairings, diagnostics } = composeMessagePairings(cycleModel, intents);
    expect(pairings).toHaveLength(2);
    const cycle = diagnostics.filter((diagnostic) => diagnostic.kind === 'order-cycle');
    expect(cycle.length).toBeGreaterThanOrEqual(1);
    expect(cycle[0]?.message).toContain('0:1');
    expect(cycle[0]?.message).toContain('→');
  });

  it('无环声明不误报：单条因果声明与本地序共存时不产生 order-cycle', () => {
    const { diagnostics } = composeMessagePairings(cycleModel, [
      { outEnd: { roleIndex: 0, stepIndex: 1 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
    ]);
    expect(diagnostics.filter((diagnostic) => diagnostic.kind === 'order-cycle')).toHaveLength(0);
  });
});
