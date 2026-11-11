import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildExchangeDag, composeMessagePairings, createExchangeSegment, parsePv } from '@pv-lens/core';
import type { ExchangeSegment, ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { MessageList } from '../src/narrative/MessageList';
import { CrossSegmentEdgeSvg, ExchangeSegmentBandSvg, ExchangeSegmentFoldSvg } from '../src/narrative/ExchangeSegmentBand';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function coreFixture(path: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', path), 'utf8'));
}

function setup(): {
  result: ParseResult;
  dag: ReturnType<typeof buildExchangeDag>;
  pairings: ReturnType<typeof composeMessagePairings>['pairings'];
  segment: ExchangeSegment;
} {
  const result = coreFixture('pv/exchange-edge-cases.pv');
  const pairings = composeMessagePairings(result).pairings;
  const dag = buildExchangeDag(result, pairings);
  const ids = dag.messages.map((message) => message.id);
  const { segment } = createExchangeSegment(result, dag, [ids[0]!, ids[1]!]);
  if (segment === null) throw new Error('segment fixture failed');
  return { result, dag, pairings, segment };
}

describe('阶段 3：交换段布局', () => {
  it('展开态段带圈住原有消息 y，消息位置与基线一致', () => {
    const { result, dag, pairings, segment } = setup();
    const baseline = buildStructuredNarrativeLayout(result, { pairings });
    const expanded = buildStructuredNarrativeLayout(result, {
      pairings,
      exchangeDag: dag,
      exchangeSegments: [segment],
      collapsedExchangeSegments: [],
    });
    expect(expanded.exchangeSegmentBands).toHaveLength(1);
    expect(expanded.exchangeSegmentBands[0]).toMatchObject({
      id: segment.id,
      collapsed: false,
      messageCount: 2,
      firstSequence: 1,
      lastSequence: 2,
    });
    expect(expanded.exchangeSegmentFolds).toHaveLength(0);
    expect(expanded.endpoints.map((endpoint) => [endpoint.id, endpoint.y]))
      .toEqual(baseline.endpoints.map((endpoint) => [endpoint.id, endpoint.y]));
    expect(expanded.pillars.map((pillar) => pillar.frameY))
      .toEqual(baseline.pillars.map((pillar) => pillar.frameY));
    expect(expanded.pillars.map((pillar) => pillar.sequence)).toEqual([1, 2, 4]);
    expect(baseline.pillars.map((pillar) => pillar.sequence)).toEqual([1, 2, 4]);
    const band = expanded.exchangeSegmentBands[0];
    const memberYs = expanded.endpoints
      .filter((endpoint) => segment.endpointIds.includes(endpoint.id))
      .map((endpoint) => endpoint.y);
    expect(band?.top).toBeLessThanOrEqual(Math.min(...memberYs));
    expect(band?.bottom).toBeGreaterThanOrEqual(Math.max(...memberYs));
  });

  it('折叠态隐藏段内消息与端点，只保留段摘要与跨段边', () => {
    const { result, dag, pairings, segment } = setup();
    const expanded = buildStructuredNarrativeLayout(result, {
      pairings,
      exchangeDag: dag,
      exchangeSegments: [segment],
      collapsedExchangeSegments: [],
    });
    const collapsed = buildStructuredNarrativeLayout(result, {
      pairings,
      exchangeDag: dag,
      exchangeSegments: [segment],
      collapsedExchangeSegments: [segment.id],
    });
    expect(collapsed.exchangeSegmentBands[0]?.collapsed).toBe(true);
    expect(collapsed.exchangeSegmentFolds.length).toBeGreaterThanOrEqual(2);
    expect(collapsed.endpoints.some((endpoint) => segment.endpointIds.includes(endpoint.id))).toBe(false);
    expect(collapsed.endpoints.length).toBe(expanded.endpoints.length - segment.endpointIds.length);
    expect(collapsed.height).toBeLessThan(expanded.height);
    expect(collapsed.crossSegmentEdges.length).toBeGreaterThan(0);
    // 段外消息保留原有序号身份。
    const visibleSequences = collapsed.pillars.map((pillar) => pillar.sequence);
    expect(visibleSequences).toEqual([4]);
  });

  it('折叠不改变段外消息的先后顺序', () => {
    const { result, dag, pairings, segment } = setup();
    const expanded = buildStructuredNarrativeLayout(result, {
      pairings, exchangeDag: dag, exchangeSegments: [segment], collapsedExchangeSegments: [],
    });
    const collapsed = buildStructuredNarrativeLayout(result, {
      pairings, exchangeDag: dag, exchangeSegments: [segment], collapsedExchangeSegments: [segment.id],
    });
    const sequences = (layout: typeof expanded) => layout.pillars.map((pillar) => pillar.sequence);
    expect(sequences(collapsed)).toEqual(sequences(expanded).filter((sequence) => sequence !== 1 && sequence !== 2));
  });
});

describe('阶段 3：段带、消息列表与画布组件', () => {
  it('段头渲染计数、事件芯片与折叠态，并支持键盘语义属性', () => {
    const { result, dag, pairings } = setup();
    const ids = dag.messages.map((message) => message.id);
    const { segment } = createExchangeSegment(result, dag, [ids[1]!, ids[2]!]);
    if (segment === null) throw new Error('segment fixture failed');
    const layout = buildStructuredNarrativeLayout(result, {
      pairings, exchangeDag: dag, exchangeSegments: [segment], collapsedExchangeSegments: [segment.id],
    });
    const band = layout.exchangeSegmentBands[0];
    expect(band).toBeDefined();
    if (band === undefined) return;
    const html = renderToString(createElement(ExchangeSegmentBandSvg, {
      band,
      onToggle: () => undefined,
    }));
    expect(html).toContain('structured-exchange-segment');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('交换段');
    expect(html).toContain('未配对 1');
    expect(html).toContain('分支 1');
    expect(html).toContain('aDone');

    const fold = layout.exchangeSegmentFolds[0];
    expect(fold).toBeDefined();
    if (fold === undefined) return;
    const foldHtml = renderToString(createElement(ExchangeSegmentFoldSvg, { fold, onToggle: () => undefined }));
    expect(foldHtml).toContain('structured-exchange-fold');
    expect(foldHtml).toContain('aria-expanded="false"');
  });

  it('跨段边组件可见且带可读标签', () => {
    const { result, dag, pairings, segment } = setup();
    const layout = buildStructuredNarrativeLayout(result, {
      pairings, exchangeDag: dag, exchangeSegments: [segment], collapsedExchangeSegments: [segment.id],
    });
    const edge = layout.crossSegmentEdges[0];
    expect(edge).toBeDefined();
    if (edge === undefined) return;
    const html = renderToString(createElement(CrossSegmentEdgeSvg, { edge }));
    expect(html).toContain('structured-cross-segment-edge');
    expect(html).toContain('跨段边');
    expect(html).toContain('<path');
  });

  it('消息列表按拓扑序列出完整消息，并显示校验清单与已创建段', () => {
    const { result, dag, segment } = setup();
    const html = renderToString(createElement(MessageList, {
      result,
      dag,
      segments: [segment],
      collapsedSegments: new Set(),
      onCreate: () => undefined,
      onToggleSegment: () => undefined,
      onRenameSegment: () => undefined,
      onRemoveSegment: () => undefined,
      onCollapseAll: () => undefined,
      onExpandAll: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('交换段 · 消息列表');
    expect(html).toContain('M1');
    expect(html).toContain('M4');
    expect(html).toContain('封装为交换段');
    expect(html).toContain('清空选择');
    expect(html).toContain('未选择消息');
    expect(html).toContain('M1–M2');
    expect(html).toContain('移除段');
  });

  it('多方协议入口禁用并说明原因', () => {
    const result = coreFixture('pv/multi-channel.pv');
    const dag = buildExchangeDag(result, composeMessagePairings(result).pairings);
    const html = renderToString(createElement(MessageList, {
      result,
      dag,
      segments: [],
      collapsedSegments: new Set(),
      onCreate: () => undefined,
      onToggleSegment: () => undefined,
      onRenameSegment: () => undefined,
      onRemoveSegment: () => undefined,
      onCollapseAll: () => undefined,
      onExpandAll: () => undefined,
    }));
    expect(html).toContain('V1 仅支持两方协议');
    expect(html).toContain('disabled');
  });

  it('NarrativeView 注入交换段时默认折叠并渲染段带、折叠摘要与图例', () => {
    const { result, pairings, segment } = setup();
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      initialExchangeSegments: [segment],
    }));
    expect(html).toContain('structured-exchange-segment');
    expect(html).toContain('structured-exchange-segment--collapsed');
    expect(html).toContain('structured-exchange-fold');
    expect(html).toContain('交换段：双线边框');
  });

  it('NarrativeView 可用显式空折叠集合展开初始交换段', () => {
    const { result, pairings, segment } = setup();
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      initialExchangeSegments: [segment],
      initialCollapsedExchangeSegments: [],
    }));
    expect(html).toContain('structured-exchange-segment');
    expect(html).not.toContain('structured-exchange-segment--collapsed');
  });

  it('NarrativeView 面板与画布共存，无交换段时保持基线', () => {
    const { result, pairings } = setup();
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(html).toContain('交换段 · 消息列表');
    expect(html).toContain('封装为交换段');
    expect(html).not.toContain('structured-exchange-segment');
  });
});
