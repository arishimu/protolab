import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildExchangeDag,
  composeMessagePairings,
  createExchangeSegment,
  exchangeMessageSequence,
  parsePv,
  validateExchangeSegment,
} from '@pv-lens/core';
import type { ExchangeDag } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

function edgeCaseModel(): { dag: ExchangeDag; sequences: number[] } {
  const result = parsePv(fixture('pv/exchange-edge-cases.pv'));
  expect(result.hasErrors).toBe(false);
  const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
  return { dag, sequences: dag.messages.map((message) => message.sequence) };
}

describe('阶段 3：交换段因果 DAG', () => {
  it('配对端点合并为完整消息，未配对步骤单独成条，并按拓扑序编号', () => {
    const { dag } = edgeCaseModel();
    expect(dag.messages).toHaveLength(4);
    expect(dag.messages.map((message) => message.sequence)).toEqual([1, 2, 3, 4]);
    expect(dag.messages.map((message) => message.channels)).toEqual([['c1'], ['c1'], ['c1'], ['c2']]);
    expect(dag.messages[0]?.endpoints.map((endpoint) => `${endpoint.roleName}/${endpoint.direction}/${String(endpoint.stepIndex)}`))
      .toEqual(['alice/out/0', 'bob/in/0']);
    expect(dag.messages[2]?.endpoints).toHaveLength(1);
    expect(dag.messages[2]?.paired).toBe(false);
    expect(dag.messages[3]?.endpoints.map((endpoint) => endpoint.roleName)).toEqual(['alice', 'bob']);
  });

  it('配对数组顺序打乱不改变逻辑消息、拓扑序与因果边', () => {
    const result = parsePv(fixture('pv/exchange-edge-cases.pv'));
    const pairings = composeMessagePairings(result).pairings;
    const forward = buildExchangeDag(result, pairings);
    const reverse = buildExchangeDag(result, [...pairings].reverse());
    expect(reverse.messages).toEqual(forward.messages);
    expect(reverse.topologicalOrder).toEqual(forward.topologicalOrder);
    expect(reverse.edges).toEqual(forward.edges);
    expect(forward.cycles).toEqual([]);
  });

  it('同角色本地序与配对边共同形成因果关系', () => {
    const { dag } = edgeCaseModel();
    const sequences = new Map(dag.messages.map((message) => [message.id, message.sequence]));
    const edges = dag.edges.map((edge) => `${String(sequences.get(edge.from))}→${String(sequences.get(edge.to))}:${edge.kind}`);
    expect(edges).toContain('1→2:local-order');
    expect(edges).toContain('2→3:local-order');
    expect(edges).toContain('2→4:local-order');
    expect(edges).toContain('3→4:local-order');
  });
});

describe('阶段 3：交换段校验', () => {
  it('连续、整条、因果凸、两方、单信道的范围可创建', () => {
    const { dag } = edgeCaseModel();
    const ids = dag.messages.map((message) => message.id);
    const validation = validateExchangeSegment(dag, [ids[0]!, ids[1]!]);
    expect(validation.ok).toBe(true);
    expect(validation.idle).toBe(false);
    expect(validation.checks.every((check) => check.ok)).toBe(true);
    expect(validation.closureIds).toEqual([ids[0], ids[1]]);
    expect(validation.missingIds).toEqual([]);
  });

  it('非连续选择给出凸闭包缺失消息，不静默扩大', () => {
    const { dag } = edgeCaseModel();
    const ids = dag.messages.map((message) => message.id);
    const validation = validateExchangeSegment(dag, [ids[0]!, ids[2]!]);
    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'contiguous')?.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'convex')?.ok).toBe(false);
    expect(validation.closureIds).toEqual([ids[0], ids[1], ids[2]]);
    expect(validation.missingIds).toEqual([ids[1]]);
  });

  it('跨信道范围按非法拒绝并说明信道', () => {
    const { dag } = edgeCaseModel();
    const validation = validateExchangeSegment(dag, dag.messages.map((message) => message.id));
    expect(validation.ok).toBe(false);
    const channel = validation.checks.find((check) => check.id === 'channel');
    expect(channel?.ok).toBe(false);
    expect(channel?.reason).toContain('c1');
    expect(channel?.reason).toContain('c2');
  });

  it('切半模拟按切断消息拒绝', () => {
    const { dag } = edgeCaseModel();
    const first = dag.messages[0]!;
    const validation = validateExchangeSegment(dag, [first.id], { cutMessageIds: [first.id] });
    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'whole')?.reason).toContain('M1');
  });

  it('与已有段重叠时拒绝嵌套段', () => {
    const result = parsePv(fixture('pv/exchange-edge-cases.pv'));
    const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
    const ids = dag.messages.map((message) => message.id);
    const first = createExchangeSegment(result, dag, [ids[0]!, ids[1]!]).segment;
    expect(first).not.toBeNull();
    const validation = validateExchangeSegment(dag, [ids[1]!, ids[2]!], { existing: first === null ? [] : [first] });
    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'overlap')?.ok).toBe(false);
  });

  it('多方协议涉及三个角色时拒绝', () => {
    const result = parsePv(fixture('pv/multi-channel.pv'));
    const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
    const validation = validateExchangeSegment(dag, dag.messages.map((message) => message.id));
    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'parties')?.ok).toBe(false);
  });
});

describe('阶段 3：交换段创建与计数', () => {
  it('创建段保留消息、端点、角色、信道、计数与源码 span', () => {
    const result = parsePv(fixture('pv/exchange-edge-cases.pv'));
    const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
    const ids = dag.messages.map((message) => message.id);
    const { segment, validation } = createExchangeSegment(result, dag, [ids[1]!, ids[2]!]);
    expect(validation.ok).toBe(true);
    expect(segment).not.toBeNull();
    expect(segment?.messageIds).toEqual([ids[1], ids[2]]);
    expect(segment?.roles).toEqual(['alice', 'bob']);
    expect(segment?.channels).toEqual(['c1']);
    expect(segment?.hiddenCounts).toMatchObject({ messages: 2, unpaired: 1, branches: 1, conflicts: 0 });
    expect(segment?.firstSequence).toBe(2);
    expect(segment?.lastSequence).toBe(3);
    expect(segment?.sourceSpans.length).toBeGreaterThan(0);
    expect(segment?.events.map((event) => event.name)).toEqual(['aDone']);
    expect(segment?.endpointIds).toContain('alice:message:1');
    expect(segment?.hiddenItemIds).toContain('alice:message:2');
    expect(exchangeMessageSequence(dag, ids[2]!)).toBe(3);
    expect(segment?.id).toBe(`segment:${ids[1]}::${ids[2]}`);
  });

  it('校验失败时不产生半条段', () => {
    const result = parsePv(fixture('pv/exchange-edge-cases.pv'));
    const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
    const ids = dag.messages.map((message) => message.id);
    const { segment, validation } = createExchangeSegment(result, dag, [ids[0]!, ids[3]!]);
    expect(validation.ok).toBe(false);
    expect(segment).toBeNull();
  });
});
