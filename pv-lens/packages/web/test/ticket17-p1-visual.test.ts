import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, parsePv, parseVerifyStdout } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import {
  buildStructuredNarrativeLayout,
  patternKindOf,
} from '../src/narrative/structured-layout';
import type { StructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { Legend, legendContentFor } from '../src/narrative/Legend';
import { NarrativeView } from '../src/narrative/NarrativeView';
import { QueryResultCard } from '../src/VerifyPanel';
import { mapResultsToQueries } from '../src/query-presentation';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

function layoutOf(name: string): { result: ParseResult; layout: StructuredNarrativeLayout; html: string } {
  const result = fixture(name);
  const pairings = composeMessagePairings(result).pairings;
  const layout = buildStructuredNarrativeLayout(result, { pairings });
  const html = renderToString(createElement(NarrativeView, { result, pairings, initialCollapsedCryptoGroups: [] }));
  return { result, layout, html };
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const intersects = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

function endpointPath(html: string, id: string): { startX: number; startY: number; endX: number; endY: number } | null {
  const match = new RegExp(
    `<g class="structured-endpoint[^"]*" data-identity="${escape(id)}"[^>]*>[\\s\\S]*?<path d="M ([\\d.]+) ([\\d.]+) L ([\\d.]+) ([\\d.]+)"`,
  ).exec(html);
  if (match === null) return null;
  return {
    startX: Number(match[1]),
    startY: Number(match[2]),
    endX: Number(match[3]),
    endY: Number(match[4]),
  };
}

function endpointDash(html: string, id: string): string | undefined {
  const block = new RegExp(
    `<g class="structured-endpoint[^"]*" data-identity="${escape(id)}"[^>]*>([\\s\\S]*?)</g>`,
  ).exec(html)?.[1];
  return block === undefined ? undefined : /stroke-dasharray="([^"]+)"/.exec(block)?.[1];
}

describe('ticket #17：P1 遮挡与消息道', () => {
  it('B1 帧层位于消息层之后，发送线在帧边界外停止', () => {
    for (const name of ['handshake-fixed.pv', 'ns-mutual-auth.pv']) {
      const { layout, html } = layoutOf(name);
      expect(html.indexOf('class="structured-frame-layer"'))
        .toBeGreaterThan(html.indexOf('class="structured-message-layer"'));
      const frames = [...html.matchAll(/<g class="structured-message-frame">[\s\S]*?<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"/g)]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]) }));
      expect(frames.length).toBe(layout.pillars.length);
      for (const pillar of layout.pillars) {
        const frame = frames[layout.pillars.indexOf(pillar)];
        expect(frame).toBeDefined();
        const frameY = frame!.y + 11;
        // 与渲染端 nearFrame 同口径：端点贴近帧中线且角色离信道够远时，线端必须落在帧边界外。
        const nearFrame = (endpoint: { y: number; roleX: number; channelX: number }): boolean =>
          Math.abs(endpoint.y - frameY) <= 12
          && Math.abs(endpoint.channelX - endpoint.roleX) > pillar.frameWidth / 2 + 4;
        const sender = pillar.endpoints.find((endpoint) => endpoint.direction === 'out');
        if (sender !== undefined) {
          const path = endpointPath(html, sender.id);
          expect(path, `${name} ${sender.id} 路径`).not.toBeNull();
          if (!nearFrame(sender)) continue;
          const insideFrame = path!.endX > frame!.x && path!.endX < frame!.x + frame!.width;
          expect(insideFrame, `${name} ${pillar.id} 发送线不应停在帧内`).toBe(false);
        }
        const receiver = pillar.endpoints.find((endpoint) => endpoint.direction === 'in');
        if (receiver !== undefined) {
          const path = endpointPath(html, receiver.id);
          expect(path, `${name} ${receiver.id} 路径`).not.toBeNull();
          if (!nearFrame(receiver)) continue;
          const insideFrame = path!.startX > frame!.x && path!.startX < frame!.x + frame!.width;
          expect(insideFrame, `${name} ${pillar.id} 接收线不应从帧内起画`).toBe(false);
        }
      }
    }
  });

  it('B2 M 标签位于柱顶之上，不被端点线穿过', () => {
    const { layout, html } = layoutOf('handshake-fixed.pv');
    const plain = html.replace(/<!-- -->/g, '');
    for (const pillar of layout.pillars) {
      const match = new RegExp(`<text class="structured-text-halo" x="[\\d.]+" y="([\\d.]+)" fill="[^"]+">M${String(pillar.sequence)}</text>`).exec(plain);
      expect(match, `M${String(pillar.sequence)} 标签`).not.toBeNull();
      expect(Number(match![1])).toBeLessThanOrEqual(pillar.top - 8);
    }
  });

  it('B3 事件标记移出值列，旗标 bbox 不与值方块相交', () => {
    for (const name of ['handshake-fixed.pv', 'ns-mutual-auth.pv', 'ns-original.pv']) {
      const { layout } = layoutOf(name);
      for (const node of layout.nodes.filter((candidate) => candidate.kind === 'event')) {
        expect(node.markerX, `${name} ${node.id} 应有 markerX`).toBeDefined();
        expect(node.markerY).toBeDefined();
        const marker: Rect = {
          x1: node.markerX! - 10,
          x2: node.markerX! + 12,
          y1: node.markerY! - 14,
          y2: node.markerY! + 4,
        };
        for (const block of layout.valueBlocks.filter((candidate) => candidate.roleIndex === node.roleIndex)) {
          const valueRect = {
            x1: block.x - block.width / 2,
            x2: block.x + block.width / 2,
            y1: block.y - block.height / 2,
            y2: block.y + block.height / 2,
          };
          expect(intersects(marker, valueRect), `${name} ${node.id} 与值方块 ${block.id} 不应相交`).toBe(false);
        }
      }
    }
  });

  it('B4 值序号嵌入方块内部', () => {
    const { layout, html } = layoutOf('ns-original.pv');
    const ordinals = [...html.matchAll(/class="structured-value-ordinal structured-text-halo" x="([\d.]+)" y="([\d.]+)"/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    expect(ordinals).toHaveLength(layout.valueBlocks.length);
    for (const block of layout.valueBlocks) {
      const expectedX = block.x + block.width / 2 - 3;
      const expectedY = block.y - block.height / 2 + 7;
      expect(ordinals.some((ordinal) => Math.abs(ordinal.x - expectedX) < 0.01 && Math.abs(ordinal.y - expectedY) < 0.01),
        `${block.id} 序号应位于方块内部`).toBe(true);
    }
  });

  it('B5 参数标签与方法 caption 带光晕和底框', () => {
    const { html } = layoutOf('ns-mutual-auth.pv');
    expect(html).toContain('structured-parameter-label structured-text-halo');
    expect(html).toContain('structured-caption-bg');
    expect(html).toContain('structured-method-caption structured-text-halo');
  });

  it('B6 重叠消息柱分道，未配对圆点不落在任何柱身上', () => {
    const { layout } = layoutOf('ns-original.pv');
    for (let first = 0; first < layout.pillars.length; first += 1) {
      for (let second = first + 1; second < layout.pillars.length; second += 1) {
        const a = layout.pillars[first]!;
        const b = layout.pillars[second]!;
        const overlap = a.top < b.bottom && a.bottom > b.top;
        if (overlap) expect(a.lane).not.toBe(b.lane);
      }
    }
    for (const endpoint of layout.endpoints.filter((candidate) => candidate.unpaired)) {
      for (const pillar of layout.pillars) {
        const inside = Math.abs(endpoint.wireX! - pillar.laneX) < 4
          && endpoint.y > pillar.top - 6
          && endpoint.y < pillar.bottom + 6;
        expect(inside, `${endpoint.id} 不应落在 ${pillar.id} 柱身上`).toBe(false);
      }
    }
  });
});

describe('ticket #17：P1 灰度线型与值图案', () => {
  it('G1 消息线型按 M 序号循环，端点线使用同一线型', () => {
    const { layout, html } = layoutOf('handshake-fixed.pv');
    expect(layout.pillars.map((pillar) => pillar.lineStyle)).toEqual(['solid', 'short-dash', 'dot']);
    expect(html).toContain('structured-message-pillar-line--solid');
    expect(html).toContain('structured-message-pillar-line--short-dash');
    expect(html).toContain('structured-message-pillar-line--dot');
    const senderDashes = layout.pillars.map((pillar) => {
      const sender = pillar.endpoints.find((endpoint) => endpoint.direction === 'out');
      return sender === undefined ? undefined : endpointDash(html, sender.id);
    });
    expect(senderDashes).toEqual(['none', '6 3', '1.5 3.5']);
  });

  it('G2 值图案按序号循环，图例列出图案类型', () => {
    const { layout, html } = layoutOf('ns-original.pv');
    for (const block of layout.valueBlocks) {
      expect(block.pattern).toBe(patternKindOf(block.ordinal));
    }
    expect(html).toContain('value-pattern-slash');
    expect(html).toContain('value-pattern-backslash');
    expect(html).toContain('value-pattern-dots');
    expect(html).toContain('斜线');
    expect(html).toContain('点阵');
  });

  it('G2 图例 token 数与值身份数一致，每个 token 含序号、名称与图案', () => {
    for (const name of ['ns-original.pv', 'handshake-fixed.pv', 'ns-mutual-auth.pv']) {
      const { result, layout } = layoutOf(name);
      const content = legendContentFor(layout, result);
      const bindingIds = new Set(layout.valueBlocks.map((block) => block.bindingId));
      expect(content.values, `${name} 图例 token 数应等于值身份数`).toHaveLength(bindingIds.size);
      expect(new Set(content.values.map((token) => token.ordinal)).size).toBe(content.values.length);
      for (const token of content.values) {
        expect(token.label.length, `${name} token ${String(token.ordinal)} 应有绑定名`).toBeGreaterThan(0);
        expect(token.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(token.pattern).toBe(patternKindOf(token.ordinal));
      }
      const legendHtml = renderToString(createElement(Legend, { layout, result })).replace(/<!-- -->/g, '');
      for (const token of content.values) {
        expect(legendHtml, `${name} 图例应列出序号 ${String(token.ordinal)}`).toContain(`${String(token.ordinal)} ${token.label} ·`);
      }
    }
  });

  it('B7 反例 trace 嵌在查询卡片内，防溢出规则就位', () => {
    const source = readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', 'ns-original.pv'), 'utf8');
    const stdout = readFileSync(join(webDir, '..', 'core', 'fixtures', 'proverif', 'ns-original.stdout.txt'), 'utf8');
    const views = mapResultsToQueries(parseVerifyStdout(stdout), parsePv(source).queries);
    const falsified = views.find((view) => view.counterexampleTrace !== null);
    expect(falsified, 'ns-original 应有一条可展开的反例 trace').toBeDefined();
    const card = renderToString(createElement(QueryResultCard, { index: 0, view: falsified! }));
    // 结构：trace 折叠块与正文都在卡片 li 内部，卡片自身可收缩（min-width:0 由 CSS 断言）。
    expect(card.startsWith('<li')).toBe(true);
    expect(card).toContain('class="query-card');
    expect(card.indexOf('class="counterexample-body"')).toBeGreaterThan(card.indexOf('class="query-card'));
    expect(card).toContain('Derivation:');

    // CSS 约束（B7）：网格列最小为 0、卡片可断行、trace 容器限宽、页面兜底裁切。
    const css = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(css).toMatch(/\.query-result-list\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.query-card\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.query-card\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(css).toMatch(/\.counterexample-body,\s*\.raw-output-body\s*\{[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.counterexample-body,\s*\.raw-output-body\s*\{[^}]*white-space:\s*pre/s);
    expect(css).toMatch(/\.app\s*\{[^}]*overflow-x:\s*clip/s);
  });
});

describe('ticket #17：R15 分支标签字号与选中态颜色分离', () => {
  it('臂道标签最小字号 10px（100% 缩放下可读）', () => {
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.structured-arm-label\s*\{[^}]*font-size:\s*10px/s);
  });

  it('选中态描边不再与 then 臂道共用 #2563eb 色相', () => {
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    // 臂道轨/tick/标签保持蓝（then）与青（else）。
    expect(v2).toMatch(/\.structured-arm-rail\s*\{[^}]*stroke:\s*#2563eb/s);
    expect(v2).toMatch(/\.structured-arm--else \.structured-arm-rail\s*\{[^}]*stroke:\s*#0d9488/s);
    // 选中态描边改中性深色 + 暖色光晕，与臂道色相分离。
    const selected = v2.match(/\.structured-source-selected > rect,\s*\n\.structured-source-selected > polygon,\s*\n\.structured-source-selected > path,\s*\n\.structured-source-selected > circle\s*\{[^}]*\}/s);
    expect(selected).not.toBeNull();
    expect(selected?.[0]).toMatch(/stroke:\s*#111827/);
    expect(selected?.[0]).not.toMatch(/#2563eb/);
    expect(selected?.[0]).toMatch(/drop-shadow/);
  });
});
