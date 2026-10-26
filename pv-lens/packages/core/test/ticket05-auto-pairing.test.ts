import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeMessagePairings, getSampleSource, narrativeRoleOrder, parsePv } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(path: string) {
  return readFileSync(join(coreDir, 'fixtures', path), 'utf8');
}

describe('ticket #05：消息层与两方意图配对（core 统一配对）', () => {
  it('两方协议：统一配对结果全部为 automatic 来源，两端方向正确', () => {
    const result = parsePv(getSampleSource('handshake-fixed') ?? '');
    const { pairings, diagnostics } = composeMessagePairings(result);
    expect(diagnostics).toEqual([]);
    expect(pairings).toHaveLength(3);
    const roles = narrativeRoleOrder(result);
    for (const pairing of pairings) {
      expect(pairing.origin).toBe('automatic');
      const outRole = roles[pairing.outEnd.roleIndex];
      const inRole = roles[pairing.inEnd.roleIndex];
      expect(outRole, '发送端必须是 out 步骤').toBeDefined();
      expect(inRole, '接收端必须是 in 步骤').toBeDefined();
      expect(outRole.steps[pairing.outEnd.stepIndex]?.direction).toBe('out');
      expect(inRole.steps[pairing.inEnd.stepIndex]?.direction).toBe('in');
      expect(pairing.outEnd.roleIndex).not.toBe(pairing.inEnd.roleIndex);
    }
  });

  it('多方协议：无人工声明时自动配对为空，未配对端都是独立消息步骤', () => {
    for (const source of [getSampleSource('ns-mutual-auth') ?? '', fixture('pv/multi-channel.pv')]) {
      const result = parsePv(source);
      const { pairings } = composeMessagePairings(result);
      expect(pairings).toEqual([]);
      const messageStepCount = narrativeRoleOrder(result)
        .reduce((total, role) => total + role.steps.length, 0);
      expect(messageStepCount).toBeGreaterThan(0);
    }
  });

  it('两方跨信道不配对：信道是自动配对的硬边界', () => {
    const result = parsePv([
      'free c1: channel. free c2: channel.',
      'let a = out(c1, x).',
      'let b = in(c2, x).',
      'process a | b.',
    ].join('\n'));
    const { pairings } = composeMessagePairings(result);
    expect(pairings).toEqual([]);
  });
});
