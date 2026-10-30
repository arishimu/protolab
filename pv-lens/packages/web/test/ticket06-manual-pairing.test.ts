import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, getSampleSource, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { PairingIntent, ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';
import { reducePairingSelection } from '../src/narrative/pairing-selection';
import type { SelectableEndpoint } from '../src/narrative/pairing-selection';

function endpointOf(result: ParseResult, roleName: string, direction: 'out' | 'in', occurrence = 0): { roleIndex: number; stepIndex: number } {
  const roles = narrativeRoleOrder(result);
  for (const [roleIndex, role] of roles.entries()) {
    if (role.name !== roleName) continue;
    let seen = 0;
    for (const item of role.items) {
      if (item.kind !== 'message' || item.endpoint.direction !== direction) continue;
      if (seen === occurrence) return { roleIndex, stepIndex: item.endpoint.stepIndex };
      seen += 1;
    }
  }
  throw new Error(`endpoint not found: ${roleName} ${direction} ${String(occurrence)}`);
}

function selectableOf(result: ParseResult, ref: { roleIndex: number; stepIndex: number }, pairingState: 'unpaired' | 'manual' | 'automatic', channelName = 'c'): SelectableEndpoint {
  const roles = narrativeRoleOrder(result);
  const role = roles[ref.roleIndex];
  const item = role?.items.find((candidate) => candidate.kind === 'message' && candidate.endpoint.stepIndex === ref.stepIndex);
  if (item === undefined || item.kind !== 'message') throw new Error('endpoint item not found');
  return {
    id: item.endpoint.id,
    roleIndex: ref.roleIndex,
    stepIndex: ref.stepIndex,
    direction: item.endpoint.direction,
    channelName,
    pairingState,
  };
}

describe('ticket #06：人工配对点选状态机（纯函数）', () => {
  const result = parsePv(getSampleSource('ns-mutual-auth') ?? '');
  const outS = selectableOf(result, endpointOf(result, 'processS', 'out'), 'unpaired');
  const inI = selectableOf(result, endpointOf(result, 'processInitiator', 'in'), 'unpaired');
  const outI = selectableOf(result, endpointOf(result, 'processInitiator', 'out'), 'unpaired');

  it('点未配对发送端选中；再点同信道未配对接收端产出声明并清空选择', () => {
    const first = reducePairingSelection({ pendingOut: null }, { kind: 'select', endpoint: outS });
    expect(first.state.pendingOut?.id).toBe(outS.id);
    const second = reducePairingSelection(first.state, { kind: 'select', endpoint: inI });
    expect(second.state.pendingOut).toBeNull();
    expect(second.intent).toEqual({
      outEnd: { roleIndex: outS.roleIndex, stepIndex: outS.stepIndex },
      inEnd: { roleIndex: inI.roleIndex, stepIndex: inI.stepIndex },
    });
  });

  it('再点同一发送端取消；点另一发送端换源；可继续扇出', () => {
    const pending = reducePairingSelection({ pendingOut: null }, { kind: 'select', endpoint: outS }).state;
    expect(reducePairingSelection(pending, { kind: 'select', endpoint: outS }).state.pendingOut).toBeNull();
    const swapped = reducePairingSelection(pending, { kind: 'select', endpoint: outI });
    expect(swapped.state.pendingOut?.id).toBe(outI.id);
    expect(swapped.intent).toBeUndefined();
  });

  it('自动配对端、先点接收端、跨信道接收端均拒绝并给出原因；已人工配对端可继续追加', () => {
    expect(reducePairingSelection({ pendingOut: null }, { kind: 'select', endpoint: { ...outS, pairingState: 'automatic' } }).reason)
      .toBe('automatic-endpoint');
    expect(reducePairingSelection({ pendingOut: null }, { kind: 'select', endpoint: inI }).reason)
      .toBe('in-without-pending');
    expect(reducePairingSelection({ pendingOut: outS }, { kind: 'select', endpoint: { ...inI, channelName: 'c2' } }).reason)
      .toBe('channel-mismatch');
    // 合流追加：已人工配对的接收端再次被声明命中，不被拒绝。
    expect(reducePairingSelection({ pendingOut: outS }, { kind: 'select', endpoint: { ...inI, pairingState: 'manual' } }).intent)
      .toBeDefined();
  });

  it('reset 清空会话选择', () => {
    expect(reducePairingSelection({ pendingOut: outS }, { kind: 'reset' }).state.pendingOut).toBeNull();
  });
});

describe('ticket #06：广播扇出与合流（视图层派生）', () => {
  const result = parsePv(getSampleSource('ns-mutual-auth') ?? '');

  it('广播：同一发送端的多条声明归并为一根多端柱，一条发送段进信道', () => {
    const fanoutIntents: PairingIntent[] = [
      { outEnd: endpointOf(result, 'processS', 'out'), inEnd: endpointOf(result, 'processInitiator', 'in') },
      { outEnd: endpointOf(result, 'processS', 'out'), inEnd: endpointOf(result, 'processResponder', 'in') },
    ];
    const { pairings } = composeMessagePairings(result, fanoutIntents);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const outRef = endpointOf(result, 'processS', 'out');
    const groupPillars = layout.pillars.filter((pillar) => pillar.endpoints.some(
      (endpoint) => endpoint.roleIndex === outRef.roleIndex && endpoint.stepIndex === outRef.stepIndex,
    ));
    expect(groupPillars).toHaveLength(1);
    const pillar = groupPillars[0];
    expect(pillar.endpoints).toHaveLength(3);
    expect(pillar.origin).toBe('manual');
    const ys = pillar.endpoints.map((endpoint) => endpoint.y);
    expect(pillar.top).toBe(Math.min(...ys));
    expect(pillar.bottom).toBe(Math.max(...ys));
    // 各端维持不同本地 y，无共享行。
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('合流：多个发送端命中同一接收端时各柱独立，渲染并排抽头可区分', () => {
    const sharedIn = endpointOf(result, 'processS', 'in');
    const mergeIntents: PairingIntent[] = [
      { outEnd: endpointOf(result, 'processInitiator', 'out'), inEnd: sharedIn },
      { outEnd: endpointOf(result, 'processResponder', 'out'), inEnd: sharedIn },
    ];
    const { pairings } = composeMessagePairings(result, mergeIntents);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const hitPillars = layout.pillars.filter((pillar) => pillar.endpoints.some(
      (endpoint) => endpoint.roleIndex === sharedIn.roleIndex && endpoint.stepIndex === sharedIn.stepIndex,
    ));
    expect(hitPillars).toHaveLength(2);
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(html).toContain('structured-merge-taps');
    expect(html).toContain('合流端：命中 2 条消息');
    // 人工来源在柱的 aria/title 上可见。
    expect(html).toContain('人工声明');
  });

  it('人工声明只在会话内：NV 不持久化，柱 origin 随声明集合变化', () => {
    const alone = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    expect(alone.pillars).toHaveLength(0);
  });
});
