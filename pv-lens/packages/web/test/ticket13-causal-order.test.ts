import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeMessagePairings, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

const CYCLE_SOURCE = [
  'free c: channel.',
  'fun f(bitstring): bitstring.',
  'let roleA = in(c, x: bitstring); out(c, f(x)).',
  'let roleB = in(c, y: bitstring); out(c, f(y)).',
  'process (!roleA) | (!roleB).',
].join('\n');

describe('ticket #13：配对消息因果纵序', () => {
  it('两方基准样例：配对消息的接收端不低于发送端', () => {
    for (const file of ['handshake-fixed.pv', 'ns-original.pv']) {
      const result = fixture(file);
      const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
      expect(layout.pillars.length, `${file} 应有配对消息`).toBeGreaterThan(0);
      for (const pillar of layout.pillars) {
        const sender = pillar.endpoints.find((endpoint) => endpoint.direction === 'out');
        const receiver = pillar.endpoints.find((endpoint) => endpoint.direction === 'in');
        expect(sender, `${file} ${pillar.id} 应有发送端`).toBeDefined();
        expect(receiver, `${file} ${pillar.id} 应有接收端`).toBeDefined();
        expect(receiver!.y - sender!.y, `${file} ${pillar.id} 接收端应低于发送端`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('握手修正版：消息序号按发送端 y 升序，M1/M2/M3 自上而下', () => {
    const result = fixture('handshake-fixed.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const senders = layout.pillars.map((pillar) => ({
      sequence: pillar.sequence,
      y: pillar.endpoints.find((endpoint) => endpoint.direction === 'out')?.y ?? Number.NaN,
    }));
    expect(senders.map((sender) => sender.sequence)).toEqual([1, 2, 3]);
    for (let index = 1; index < senders.length; index += 1) {
      expect(senders[index]!.y).toBeGreaterThan(senders[index - 1]!.y);
    }
  });

  it('成环模型：保留图形并输出一条 order-cycle 冲突', () => {
    const result = parsePv(CYCLE_SOURCE);
    const pairings = composeMessagePairings(result).pairings;
    expect(pairings.length).toBe(2);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    expect(layout.pillars.length).toBe(2);
    expect(layout.conflicts.filter((conflict) => conflict.id === 'order-cycle')).toHaveLength(1);
  });

  it('同输入重复布局：单元 y 完全一致', () => {
    const result = fixture('handshake-fixed.pv');
    const pairings = composeMessagePairings(result).pairings;
    const first = buildStructuredNarrativeLayout(result, { pairings });
    const second = buildStructuredNarrativeLayout(result, { pairings });
    expect([...second.valueBlocks].map((block) => [block.id, block.y]))
      .toEqual([...first.valueBlocks].map((block) => [block.id, block.y]));
    expect(second.pillars.map((pillar) => [pillar.id, pillar.top, pillar.bottom]))
      .toEqual(first.pillars.map((pillar) => [pillar.id, pillar.top, pillar.bottom]));
  });

  it('未配对端点落在信道壁的 wireX，与中轴不同且彼此至少相隔 12px', () => {
    const result = fixture('ns-original.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const unpaired = layout.endpoints.filter((endpoint) => endpoint.unpaired);
    expect(unpaired.length).toBeGreaterThan(0);
    for (const endpoint of unpaired) {
      expect(endpoint.wireX, `${endpoint.id} 应有 wireX`).toBeDefined();
      expect(endpoint.wireX).not.toBe(endpoint.channelX);
      const channel = layout.columns.find((column) => column.kind === 'channel' && column.name === endpoint.channelName);
      expect(channel).toBeDefined();
      expect(endpoint.wireX!).toBeGreaterThan(channel!.x);
      expect(endpoint.wireX!).toBeLessThan(channel!.x + channel!.width);
    }
    for (let first = 0; first < unpaired.length; first += 1) {
      for (let second = first + 1; second < unpaired.length; second += 1) {
        expect(Math.abs(unpaired[first]!.y - unpaired[second]!.y)).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
