import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, parsePv } from '@pv-lens/core';
import {
  NarrativeView,
  ZOOM_OVERVIEW_MIN,
  fitPageZoomOf,
  nextZoomOf,
  splitLabelLines,
} from '../src/narrative/NarrativeView';
import { LEGEND_VALUE_FOLD_THRESHOLD, Legend, legendContentFor } from '../src/narrative/Legend';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8');
}

describe('ticket #23：R04 长模型视口', () => {
  it('适合页面同时按宽高适配，并允许概览低于手动缩放下限', () => {
    expect(fitPageZoomOf(800, 600, 1000, 2000)).toBeCloseTo(0.3, 6);
    expect(fitPageZoomOf(800, 600, 1000, 4000)).toBeCloseTo(0.15, 6);
    expect(fitPageZoomOf(800, 600, 1000, 10000)).toBeCloseTo(ZOOM_OVERVIEW_MIN, 6);
    expect(fitPageZoomOf(800, 600, 500, 300)).toBe(1);
    expect(fitPageZoomOf(0, 600, 1000, 1000)).toBe(1);
    expect(fitPageZoomOf(800, 0, 1000, 1000)).toBe(1);
  });

  it('概览下限可手动步进，默认步进仍以 60% 为界', () => {
    expect(nextZoomOf(ZOOM_OVERVIEW_MIN, 1, ZOOM_OVERVIEW_MIN)).toBeCloseTo(ZOOM_OVERVIEW_MIN + 0.1, 6);
    expect(nextZoomOf(ZOOM_OVERVIEW_MIN, -1, ZOOM_OVERVIEW_MIN)).toBeCloseTo(ZOOM_OVERVIEW_MIN, 6);
    expect(nextZoomOf(0.65, -1)).toBeCloseTo(0.6, 6);
  });

  it('控制条提供适合页面、展开画布与全屏入口', () => {
    const html = renderToString(createElement(NarrativeView, { result: parsePv(fixture('hello')) }));
    expect(html).toContain('aria-label="适合页面"');
    expect(html).toContain('aria-label="展开画布"');
    expect(html).toContain('aria-label="全屏画布"');
    expect(html).toContain('适合宽度');
  });

  it('视口样式包含展开、全屏、可见滚动条与回到顶部', () => {
    const css = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(css).toMatch(/\.narrative-viewport--expanded\s*\{[^}]*max-height:\s*none/s);
    expect(css).toMatch(/\.narrative-viewport--fullscreen\s*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.narrative-viewport\s*\{[^}]*scrollbar-width:\s*thin/s);
    expect(css).toMatch(/\.narrative-back-to-top-wrap\s*\{[^}]*position:\s*sticky/s);
  });
});

describe('ticket #23：R05 标签边界与原文保真', () => {
  it('最左事件标签不越过画布左缘', () => {
    const result = parsePv(fixture('handshake-fixed'));
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const leftAnchored = layout.nodes.filter((node) => node.kind === 'event' && node.labelAnchor === 'end');
    expect(leftAnchored.length).toBeGreaterThan(0);
    for (const node of leftAnchored) {
      const lines = splitLabelLines(node.label, node.labelMaxChars);
      const width = Math.max(...lines.map((line) => line.length * 6.2));
      expect(node.labelX - width, `${node.label} 越过画布左缘`).toBeGreaterThanOrEqual(-0.5);
    }
  });

  it('长事件名在空格处断行，不在标识符内部切开', () => {
    expect(splitLabelLines('event beginA(nA)', 10)).toEqual(['event', 'beginA(nA)']);
    expect(splitLabelLines('event endB(nB)', 10)).toEqual(['event', 'endB(nB)']);
    expect(splitLabelLines('pkX = pkA', 6)).toEqual(['pkX =', 'pkA']);
    expect(splitLabelLines('event begi', 10)).toEqual(['event begi']);
  });

  it('降级原文逐字保留，不插入切片空格', () => {
    const source = [
      'free c: channel.',
      'let server0() =',
      '  in(c, x: bitstring);',
      '  phase 1;',
      '  not attacker(Na).',
      'process server0().',
    ].join('\n');
    const result = parsePv(source);
    const layout = buildStructuredNarrativeLayout(result);
    const degraded = layout.nodes.find((node) => node.label.includes('not attacker'));
    expect(degraded?.label).toBe('not attacker(Na)');
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(html).toContain('not attacker(Na)');
    expect(html).not.toContain('not attacke r');
  });
});

describe('ticket #23：R07 图例膨胀与列布局', () => {
  it('值身份超过阈值时默认折叠为独立面板，标题显示数量', () => {
    const result = parsePv(fixture('ns-mutual-auth'));
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const values = legendContentFor(layout, result).values;
    expect(values.length).toBeGreaterThan(LEGEND_VALUE_FOLD_THRESHOLD);
    const html = renderToString(createElement(Legend, { layout, result }));
    expect(html).toContain('<details class="legend-value-fold">');
    expect(html).toMatch(new RegExp(`本图值序号 · <!-- -->${String(values.length)}`));
  });

  it('值身份不超过阈值时默认展开，清单条目仍渲染', () => {
    const source = [
      'free c: channel.',
      'let A() = new Na; out(c, Na).',
      'let B() = in(c, x: bitstring); new Nb; out(c, Nb).',
      'process A() | B()',
    ].join('\n');
    const result = parsePv(source);
    const layout = buildStructuredNarrativeLayout(result);
    const values = legendContentFor(layout, result).values;
    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThanOrEqual(LEGEND_VALUE_FOLD_THRESHOLD);
    const html = renderToString(createElement(Legend, { layout, result }));
    expect(html).toContain('<details class="legend-value-fold" open="">');
    expect(html).toContain('aria-label="本图值序号"');
  });

  it('值清单移出记法网格条目，不再撑高单个网格行', () => {
    const result = parsePv(fixture('ns-mutual-auth'));
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const html = renderToString(createElement(Legend, { layout, result }));
    const valueItem = html.match(/<span class="legend-value-block">值<\/span><\/dt><dd>[\s\S]*?<\/dd>/);
    expect(valueItem).not.toBeNull();
    expect(valueItem?.[0]).not.toContain('legend-token-list');
    expect(html).toMatch(/<\/dl><details class="legend-value-fold"/);
  });

  it('图例样式限高并内部滚动，打印时放开且折叠内容强制显示', () => {
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.narrative-legend\s*\{[^}]*max-height:\s*320px[^}]*overflow-y:\s*auto/s);
    expect(styles).toMatch(/\.legend-value-fold\s*\{/);
    const printBlock = styles.match(/@media print\s*\{[\s\S]*?\n\}/);
    expect(printBlock).not.toBeNull();
    expect(printBlock?.[0]).toMatch(/\.narrative-legend\s*\{[^}]*max-height:\s*none/s);
    expect(printBlock?.[0]).toMatch(/\.legend-value-fold > \*:not\(summary\)/);
  });
});
