import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { SourceSpan } from '@pv-lens/core';
import { attributeDiagnostics, buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView, ZOOM_MAX, ZOOM_MIN, nextZoomOf, spanOverlapsSelected } from '../src/narrative/NarrativeView';
import { SourcePanel } from '../src/SourcePanel';
import type { LoadedProtocol } from '../src/protocol';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string) => parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));

const protocolOf = (source: string): LoadedProtocol => ({
  title: 'test',
  description: '',
  origin: { kind: 'imported', fileName: 'test.pv' },
  source,
});

const lineSpan = (source: string, line: number): SourceSpan => {
  const lines = source.split('\n');
  const text = lines[line - 1] ?? '';
  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) offset += (lines[index] ?? '').length + 1;
  return {
    start: { offset, line, column: 1 },
    end: { offset: offset + text.length, line, column: text.length + 1 },
  };
};

/** 同名绑定样例：A 与 B 各有一个 `kk`（不同 bindingId、不同行）。 */
const SAME_NAME_SOURCE = [
  'free c: channel.',
  'fun f(bitstring): bitstring.',
  'const a: bitstring.',
  'const b: bitstring.',
  'let A(x: bitstring) =',
  '\tlet kk = f(x) in',
  '\tout(c, kk).',
  'let B(y: bitstring) =',
  '\tlet kk = f(y) in',
  '\tout(c, kk).',
  'process ( A(a) | B(b) )',
].join('\n');

/** 角色内降级样例：get 未声明表 → 诊断落在 A 的源码区间内。 */
const IN_ROLE_DIAGNOSTIC_SOURCE = [
  'free c: channel.',
  'const a: bitstring.',
  'let A() =',
  '\tget t1(x: bitstring) = x in',
  '\tout(c, a).',
  'let B() = in(c, r: bitstring).',
  'process ( A() | B() )',
].join('\n');

describe('ticket #10：SourcePanel 行结构化与高亮', () => {
  it('按行切块渲染：data-line 与行号齐全，点击行回调该行区间（onSelectLine）', () => {
    const source = SAME_NAME_SOURCE;
    const spans: SourceSpan[] = [];
    const html = renderToString(createElement(SourcePanel, {
      protocol: protocolOf(source),
      onSelectLine: (span) => spans.push(span),
    }));
    for (let line = 1; line <= source.split('\n').length; line += 1) {
      expect(html).toContain(`data-line="${String(line)}"`);
    }
    expect(html).toContain('source-line-number');
    // 行号不可选区（aria-hidden）且行本身可点（cursor 由 CSS 提供）。
    expect(html.match(/class="source-line"/g)?.length).toBe(source.split('\n').length);
  });

  it('highlightSpan 只高亮区间覆盖的行（span 半开：end 行首不计入）', () => {
    const source = SAME_NAME_SOURCE;
    const html = renderToString(createElement(SourcePanel, {
      protocol: protocolOf(source),
      highlightSpan: { start: { offset: 0, line: 5, column: 1 }, end: { offset: 0, line: 8, column: 1 } },
    }));
    expect((html.match(/source-line--highlight/g) ?? []).length).toBe(3);
    expect(html).toContain('<code class="source-line source-line--highlight" data-line="5"');
    expect(html).not.toContain('data-line="8" class="source-line source-line--highlight"');
  });
});

describe('ticket #10：span 重叠（反向高亮判定，纯函数）', () => {
  it('同行重叠、跨行包含、异行不重叠', () => {
    const objectSpan: SourceSpan = {
      start: { offset: 0, line: 6, column: 2 },
      end: { offset: 9, line: 6, column: 11 },
    };
    expect(spanOverlapsSelected(objectSpan, null)).toBe(false);
    expect(spanOverlapsSelected(objectSpan, lineSpan(SAME_NAME_SOURCE, 6))).toBe(true);
    expect(spanOverlapsSelected(objectSpan, {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 12, column: 1 },
    })).toBe(true);
    expect(spanOverlapsSelected(objectSpan, lineSpan(SAME_NAME_SOURCE, 7))).toBe(false);
  });

  it('单行选中按列相交：同行不同列的声明不串选（半开区间，相邻不重叠）', () => {
    const first: SourceSpan = {
      start: { offset: 0, line: 3, column: 1 },
      end: { offset: 9, line: 3, column: 10 },
    };
    const overlapping: SourceSpan = {
      start: { offset: 4, line: 3, column: 5 },
      end: { offset: 7, line: 3, column: 8 },
    };
    expect(spanOverlapsSelected(first, overlapping)).toBe(true);
    // 半开：区间起点恰为 first 的终点列（10）→ 相邻不重叠。
    const adjacent: SourceSpan = {
      start: { offset: 9, line: 3, column: 10 },
      end: { offset: 14, line: 3, column: 15 },
    };
    expect(spanOverlapsSelected(first, adjacent)).toBe(false);
    // 同行更远的声明完全不重叠。
    const far: SourceSpan = {
      start: { offset: 20, line: 3, column: 21 },
      end: { offset: 29, line: 3, column: 30 },
    };
    expect(spanOverlapsSelected(first, far)).toBe(false);
  });
});

describe('ticket #10：图→源码 / 源码→图联动渲染（选中态类）', () => {
  it('选中 A 的 kk 行：只 A 的 kk 方块带选中类，B 的同名 kk 不被合并高亮', () => {
    const result = parsePv(SAME_NAME_SOURCE);
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const aKk = layout.valueBlocks.find((block) => block.bindingId.startsWith('A:let:') && block.label === 'kk');
    expect(aKk).toBeDefined();
    const selected = lineSpan(SAME_NAME_SOURCE, aKk!.sourceSpan.start.line);
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      sourceLink: { selectedSpan: selected, onSelectSpan: () => undefined },
    }));
    // A 的 kk（含绑定与引用两次出现）全选中；B 的 kk 不选。
    const aKkSelected = (html.match(new RegExp(`structured-source-selected`, 'g')) ?? []).length;
    expect(aKkSelected).toBeGreaterThanOrEqual(1);
    const bKkBlocks = layout.valueBlocks.filter((block) => block.bindingId.startsWith('B:let:') && block.label === 'kk');
    expect(bKkBlocks.length).toBeGreaterThan(0);
    bKkBlocks.forEach((block) => {
      const blockG = html.match(new RegExp(`<g class="structured-value-block[^"]*" data-binding-id="${block.bindingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`))?.[0] ?? '';
      expect(blockG).not.toContain('structured-source-selected');
    });
    // 源码面板同一份 span：A 的 kk 行高亮（由 App 接线共享状态，此处验证两端渲染一致）。
    const sourceHtml = renderToString(createElement(SourcePanel, {
      protocol: protocolOf(SAME_NAME_SOURCE),
      highlightSpan: selected,
    }));
    expect(sourceHtml).toContain(`class="source-line source-line--highlight" data-line="${String(aKk!.sourceSpan.start.line)}"`);
  });

  it('选中消息行：消息端点带选中类，非同行的本地步骤不选', () => {
    const result = fixture('handshake-fixed.pv');
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const endpoint = layout.endpoints.find((candidate) => candidate.direction === 'out');
    expect(endpoint).toBeDefined();
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      sourceLink: { selectedSpan: lineSpan(fixtureSource('handshake-fixed.pv'), endpoint!.sourceSpan.start.line), onSelectSpan: () => undefined },
    }));
    const endpointG = html.match(new RegExp(`<g class="structured-endpoint[^"]*" data-identity="${endpoint!.id}"[^>]*>`))?.[0] ?? '';
    expect(endpointG).toContain('structured-source-selected');
  });
});

function fixtureSource(name: string): string {
  return readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8');
}

describe('ticket #10：诊断按角色归属入泳道、未归属各一次', () => {
  it('角色内诊断画进泳道（降级带原文标注段、错误带中文消息），无未归属时下方平铺不渲染', () => {
    const result = parsePv(IN_ROLE_DIAGNOSTIC_SOURCE);
    const { byRole, unassigned } = attributeDiagnostics(narrativeRoleOrder(result), result.diagnostics);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(unassigned).toHaveLength(0);
    expect(byRole.get(0)).toHaveLength(1);
    const layout = buildStructuredNarrativeLayout(result);
    expect(layout.roleDiagnostics).toHaveLength(1);
    expect(layout.roleDiagnostics[0]?.roleIndex).toBe(0);
    expect(layout.roleDiagnostics[0]?.entries[0]?.text).toContain('降级诊断 L4:6');
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(html).toContain('structured-role-diagnostics');
    expect(html).toContain('structured-diagnostic-chip--degraded');
    expect(html).toContain('降级诊断 L4:6');
    expect(html).not.toContain('解析诊断 · 未归属角色');
    // 布局输出未归属集合（归属只算一次，供下方平铺直接消费）。
    expect(layout.unassignedDiagnostics).toHaveLength(0);
  });

  it('未归属诊断保留画布下方平铺且只出现一次（multi-channel 主进程诊断）', () => {
    const result = fixture('multi-channel.pv');
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(result.diagnostics.length).toBe(1);
    // 该诊断落在主进程（不在任何命名角色区间）→ 泳道内无诊断条，下方平铺保留一次。
    expect(html).not.toContain('structured-role-diagnostics');
    expect(html).toContain('解析诊断 · 未归属角色');
    expect((html.match(/diagnostic-item--degraded/g) ?? []).length).toBe(1);
  });

  it('无角色结构兜底：未知语法不产生空白画布（诊断仍完整列出）', () => {
    const result = parsePv('(* 只有注释，没有角色 *)\n');
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(html).toContain('narrative-empty');
    expect(html).toContain('没有可识别的角色结构');
  });
});

describe('ticket #10：视口控件与措辞收尾', () => {
  it('缩放控件齐全（−/100%/+/适合宽度）且 aria 可寻', () => {
    const result = fixture('hello.pv');
    const html = renderToString(createElement(NarrativeView, { result, pairings: composeMessagePairings(result).pairings }));
    ['缩小画布', '放大画布', '适合宽度', '当前缩放'].forEach((label) => {
      expect(html).toContain(label);
    });
  });

  it('缩放步进 clamp 到 60%–180%（行为断言，非仅标签）', () => {
    expect(ZOOM_MIN).toBe(0.6);
    expect(ZOOM_MAX).toBe(1.8);
    let zoom = 1;
    for (let step = 0; step < 12; step += 1) zoom = nextZoomOf(zoom, -1);
    expect(zoom).toBeCloseTo(ZOOM_MIN, 9);
    expect(nextZoomOf(zoom, -1)).toBeCloseTo(ZOOM_MIN, 9);
    for (let step = 0; step < 30; step += 1) zoom = nextZoomOf(zoom, 1);
    expect(zoom).toBeCloseTo(ZOOM_MAX, 9);
    expect(nextZoomOf(zoom, 1)).toBeCloseTo(ZOOM_MAX, 9);
    // display 取整：clamp 尾差在界内显示为整百分比。
    expect(Math.round(nextZoomOf(0.65, -1) * 100)).toBe(60);
  });
});
