import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { coreSamples, getSampleSource, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function coreFixture(path: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', path), 'utf8'));
}

describe('ticket #04：水平序列与局部梯子（web 布局）', () => {
  it('局部梯子：每角色消息端按本地源码序递增，且全图消息端 y 互异', () => {
    const result = parsePv(getSampleSource('ns-mutual-auth') ?? '');
    const layout = buildStructuredNarrativeLayout(result);

    const byRole = new Map<number, typeof layout.endpoints>();
    for (const endpoint of layout.endpoints) {
      const group = byRole.get(endpoint.roleIndex) ?? [];
      group.push(endpoint);
      byRole.set(endpoint.roleIndex, group);
    }
    expect(byRole.size).toBe(4);
    for (const group of byRole.values()) {
      const ordered = [...group].sort((a, b) => a.stepIndex - b.stepIndex);
      ordered.forEach((endpoint, index) => {
        if (index > 0) expect(endpoint.y).toBeGreaterThan(ordered[index - 1].y);
      });
    }
    const ys = layout.endpoints.map((endpoint) => endpoint.y);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('画布高度由内容决定：加步骤变高，两次构建结果确定，渲染画布承载完整高度', () => {
    const base = parsePv([
      'free c: channel.',
      'let a = out(c, x).',
      'let b = in(c, x).',
      'process a | b.',
    ].join('\n'));
    const longer = parsePv([
      'free c: channel.',
      'let a = out(c, x); out(c, y); out(c, z).',
      'let b = in(c, x); in(c, y); in(c, z).',
      'process a | b.',
    ].join('\n'));
    const baseLayout = buildStructuredNarrativeLayout(base);
    const longerLayout = buildStructuredNarrativeLayout(longer);
    expect(longerLayout.height).toBeGreaterThan(baseLayout.height);
    expect(buildStructuredNarrativeLayout(longer)).toEqual(longerLayout);

    const allGeometry = [
      ...layoutPoints(baseLayout),
      ...layoutPoints(longerLayout),
    ];
    for (const point of allGeometry) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }

    // 「可完整滚动查看」的渲染侧证据：SVG 画布的 viewBox/height 与布局高度一致。
    const svg = renderToString(createElement(NarrativeView, { result: longer }));
    expect(svg).toContain(`viewBox="0 0 ${String(longerLayout.width)} ${String(longerLayout.height)}"`);
    expect(svg).toContain(`height="${String(longerLayout.height)}"`);
  });

  it('全样例可绘制：信道是独立总线列，端点对准自己的信道', () => {
    const models: Array<{ id: string; result: ParseResult }> = [
      ...coreSamples.map((sample) => ({ id: sample.id, result: parsePv(getSampleSource(sample.id) ?? '') })),
      { id: 'multi-channel', result: coreFixture('pv/multi-channel.pv') },
    ];
    for (const { id, result } of models) {
      const layout = buildStructuredNarrativeLayout(result);
      const channelColumns = layout.columns.filter((column) => column.kind === 'channel');
      if (id === 'multi-channel') expect(channelColumns).toHaveLength(3);

      const channelXs = new Set(channelColumns.map((column) => column.x));
      expect(channelXs.size).toBe(channelColumns.length);
      for (const endpoint of layout.endpoints) {
        const column = channelColumns.find((candidate) => candidate.name === endpoint.channelName);
        expect(column, `${id}：端点信道 ${endpoint.channelName} 有独立总线列`).toBeDefined();
        expect(endpoint.channelX).toBe(column!.x + column!.width / 2);
      }
      for (const column of layout.columns) {
        expect(Number.isFinite(column.x)).toBe(true);
        expect(column.width).toBeGreaterThan(0);
      }
    }
  });
});

function layoutPoints(layout: ReturnType<typeof buildStructuredNarrativeLayout>) {
  return [
    ...layout.nodes.map((node) => ({ x: node.x, y: node.y })),
    ...layout.valueBlocks.map((block) => ({ x: block.x, y: block.y })),
    ...layout.methods.map((method) => ({ x: method.x, y: method.y })),
    ...layout.endpoints.map((endpoint) => ({ x: endpoint.roleX, y: endpoint.y })),
    ...layout.branchFolds.map((fold) => ({ x: fold.x, y: fold.y })),
    ...layout.armRuns.map((run) => ({ x: run.railX, y: run.top })),
  ];
}
