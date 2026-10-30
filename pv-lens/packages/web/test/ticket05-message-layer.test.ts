import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSampleSource, parsePv, composeMessagePairings } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function coreFixture(path: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', path), 'utf8'));
}

function render(result: ParseResult): string {
  return renderToString(createElement(NarrativeView, { result }));
}

function renderPaired(result: ParseResult): string {
  return renderToString(createElement(NarrativeView, { result, pairings: composeMessagePairings(result).pairings }));
}

describe('ticket #05：消息层与两方意图配对（web 视图）', () => {
  it('两方配对消息是同一身份：柱写发送 wire term，两端同色可追踪', () => {
    const result = parsePv(getSampleSource('handshake-fixed') ?? '');
    const layout = buildStructuredNarrativeLayout(result, {
      pairings: composeMessagePairings(result).pairings,
    });
    expect(layout.pillars).toHaveLength(3);
    for (const pillar of layout.pillars) {
      expect(pillar.endpoints).toHaveLength(2);
      const sender = pillar.endpoints.find((endpoint) => endpoint.direction === 'out');
      expect(sender, '柱的两端含发送端').toBeDefined();
      // 信道帧里写的是发送端放上信道的 wire term（= 设计意图下实际到达接收方的词项）。
      expect(pillar.termText).toBe(sender!.termText);
      expect(pillar.top).toBeLessThanOrEqual(Math.min(...pillar.endpoints.map((endpoint) => endpoint.y)));
      expect(pillar.bottom).toBeGreaterThanOrEqual(Math.max(...pillar.endpoints.map((endpoint) => endpoint.y)));
    }
    const pairedEndpoints = layout.endpoints.filter((endpoint) => !endpoint.unpaired);
    expect(pairedEndpoints).toHaveLength(6);
    for (const endpoint of pairedEndpoints) {
      const pillar = layout.pillars.find((candidate) =>
        candidate.endpoints.some((member) => member.id === endpoint.id));
      expect(pillar, `端点 ${endpoint.id} 归属某条消息柱`).toBeDefined();
    }

    const svg = renderPaired(result);
    expect(svg).toContain('data-identity="message-1"');
    expect(svg).toContain('data-identity="message-3"');
    expect(svg).toContain('消息 M1');
    // 三条消息三种消息身份色（MESSAGE_COLORS 首三条 token 的字面量副本，防断言同源失效），
    // 发送段与接收段同色。
    for (const color of ['#2563EB', '#0891B2', '#16A34A']) {
      expect(svg).toContain(`stroke="${color}"`);
    }
    // 端点在 SVG 里按语义身份（endpoint id）可寻址。
    for (const endpoint of pairedEndpoints.slice(0, 2)) {
      expect(svg).toContain(`data-identity="${endpoint.id}"`);
    }
  });

  it('多方不自动连线：端点全部未配对、落在自己信道的挂轨上', () => {
    const result = coreFixture('pv/multi-channel.pv');
    const layout = buildStructuredNarrativeLayout(result, {});
    expect(layout.pillars).toEqual([]);
    expect(layout.endpoints.length).toBeGreaterThan(0);
    for (const endpoint of layout.endpoints) expect(endpoint.unpaired).toBe(true);

    // 端点按（角色，源码步序）归属信道：A=c1,c1,c3；B=c1,c2,c2,c1；S=c2,c2。
    const ordered = [...layout.endpoints].sort((a, b) =>
      a.roleIndex - b.roleIndex || a.stepIndex - b.stepIndex);
    expect(ordered.map((endpoint) => endpoint.channelName)).toEqual([
      'c1', 'c1', 'c3',
      'c1', 'c2', 'c2', 'c1',
      'c2', 'c2',
    ]);

    const svg = render(result);
    expect(svg).not.toContain('structured-message-pillar');
    expect(svg).toContain('structured-unpaired-dot');
    // 无配对不画跨角色路径；跨中间生命线/信道的段也是直线（无 Q 弧，ADR-0010）。
    expect(svg).not.toMatch(/<path[^>]*d="[^"]*Q/);
  });
});
