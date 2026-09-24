import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parsePv, coreSamples, pairSteps } from '@pv-lens/core';
import type { ParseResult, RoleItem } from '@pv-lens/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

/** 三层 else 嵌套：第 3 层的守卫应该封顶到第 2 道，并在道内缩进 + 带角标。 */
const nestedElseChain = parsePv([
  'free c: channel.',
  'let p(x: bitstring) =',
  '  if x = a then out(c, n0)',
  '  else if x = b then out(c, n1)',
  '  else if x = c then out(c, n2) else out(c, n3).',
  'process p(t).',
].join('\n'));

function firstBranchId(result: ParseResult): string {
  const branch = result.roles[0].items.find((item: RoleItem) => item.kind === 'branch' && item.marker === 'branch');
  if (branch === undefined) throw new Error('样例里没有分支');
  return branch.id;
}

const webDir = fileURLToPath(new URL('..', import.meta.url));
function coreFixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

describe('ticket #03 视觉合同：等值检查盒与臂道', () => {
  it('守卫画成无输出的等值检查盒：两个操作数并排贴在盒上方', () => {
    const layout = buildStructuredNarrativeLayout(coreFixture('ns-original.pv'));
    // ns-original 有三处守卫：A 的 `if pkX = pkB`，B 的 `if Nb = adec(m3, skB)` 与内层 `if pkY = pkA`。
    const checks = layout.methods.filter((method) => method.direction === 'check');
    expect(checks).toHaveLength(3);
    const first = checks[0];
    expect(first.label).toBe('=');
    expect(first.outputBindingIds).toEqual([]);
    // 两个操作数在上方同一 y、左右错开，且都是值方块（被检查的值复用同色）。
    const operands = layout.valueBlocks.filter(
      (block) => Math.abs(block.y - (first.y - 24)) < 12 && block.roleIndex === first.roleIndex,
    );
    expect(operands).toHaveLength(2);
    expect(operands[0].y).toBe(operands[1].y);
    expect(Math.abs(operands[0].x - operands[1].x)).toBeGreaterThanOrEqual(50);
  });

  it('内嵌解构先成自己的解构盒 + 派生虚线芯片，再喂进检查盒', () => {
    const layout = buildStructuredNarrativeLayout(coreFixture('ns-original.pv'));
    const derived = layout.chips.filter((chip) => chip.kind === 'derived');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.some((chip) => chip.text.startsWith('adec('))).toBe(true);
    // 派生芯片不是值方块：它没有值身份色。
    expect(layout.valueBlocks.some((block) => block.label.startsWith('adec('))).toBe(false);
  });

  it('then 恒占第 1 道轨道，且轨道落在值方块之外', () => {
    const layout = buildStructuredNarrativeLayout(coreFixture('ns-original.pv'));
    expect(layout.armRuns).toHaveLength(3);
    for (const run of layout.armRuns) {
      expect(run.arm).toBe('then');
      expect(run.lane).toBe(1);
      expect(run.railX - run.lifelineX).toBeGreaterThan(25);
      expect(run.bottom).toBeGreaterThanOrEqual(run.top);
    }
  });

  it('双分支给 else 第 2 道轨道，空 else 带 empty 标记', () => {
    const layout = buildStructuredNarrativeLayout(parsePv([
      'free c: channel.',
      'let p(x: bitstring) = (if x = a then out(c, n1) else 0); out(c, n1).',
      'process p(t).',
    ].join('\n')));
    const runs = layout.armRuns;
    expect(runs.map((run) => run.arm)).toEqual(['then', 'else']);
    expect(runs[1].lane).toBe(2);
    expect(runs[1].empty).toBe(true);
    expect(runs[1].label).toBe('else ∅');
  });

  it('复合条件逐子句成行，连接词挂在后续子句上', () => {
    const layout = buildStructuredNarrativeLayout(parsePv([
      'free c: channel.',
      'let p(x: host) = if x = a || x = b then out(c, n1).',
      'process p(t).',
    ].join('\n')));
    const checks = layout.methods.filter((method) => method.direction === 'check');
    expect(checks).toHaveLength(2);
    expect(checks[0].connector).toBeUndefined();
    expect(checks[1].connector).toBe('||');
  });

  it('选择盒（?:）带盒外条件芯片，且不产生臂道', () => {
    const layout = buildStructuredNarrativeLayout(parsePv([
      'free c: channel.',
      'let p(x: bitstring) = let y = if x = a then n1 else n2 in out(c, y).',
      'process p(t).',
    ].join('\n')));
    const select = layout.methods.find((method) => method.label === '?:');
    expect(select?.direction).toBe('select');
    expect(layout.chips.filter((chip) => chip.kind === 'condition')).toHaveLength(1);
    expect(layout.armRuns).toEqual([]);
  });

  it('嵌套 else 超过两条臂道时封顶，改在道内缩进并带 ↳ 角标', () => {
    const layout = buildStructuredNarrativeLayout(nestedElseChain);
    const thenRuns = layout.armRuns.filter((run) => run.arm === 'then');
    expect(thenRuns.map((run) => run.lane)).toEqual([1, 2, 2]);
    expect(thenRuns.map((run) => run.overflow)).toEqual([0, 0, 1]);
    // 封顶后不再新增第三条道，最深一层在道内缩进。
    expect(Math.max(...layout.armRuns.map((run) => run.lane))).toBe(2);
    expect(thenRuns[0].label).toBe('then');
    expect(thenRuns[1].label).toBe('then');
    expect(thenRuns[2].label).toBe('↳ then +1');
    expect(thenRuns[2].railX).toBeGreaterThan(thenRuns[1].railX);
    const elseRuns = layout.armRuns.filter((run) => run.arm === 'else');
    expect(elseRuns.every((run) => run.lane === 2)).toBe(true);
    expect(elseRuns[elseRuns.length - 1].label).toBe('↳ else +1');
  });

  it('分支默认展开；折叠后只留一格并隐藏该分支的守卫盒与臂道', () => {
    const branchId = firstBranchId(nestedElseChain);
    const expanded = buildStructuredNarrativeLayout(nestedElseChain);
    expect(expanded.branchFolds).toEqual([]);
    expect(expanded.methods.filter((method) => method.direction === 'check').length).toBeGreaterThan(0);

    const collapsed = buildStructuredNarrativeLayout(nestedElseChain, { collapsedBranches: [branchId] });
    expect(collapsed.branchFolds).toHaveLength(1);
    const fold = collapsed.branchFolds[0];
    expect(fold.branchId).toBe(branchId);
    expect(fold.label.startsWith('▸ ')).toBe(true);
    expect(fold.hiddenCount).toBe(4);
    // 最外层折叠后，它的守卫盒、臂道和臂内消息端全部不再绘制。
    expect(collapsed.methods.filter((method) => method.direction === 'check')).toEqual([]);
    expect(collapsed.armRuns).toEqual([]);
    expect(collapsed.endpoints.length).toBeLessThan(expanded.endpoints.length);
    // 每个展开的守卫盒带一个折叠开关。
    expect(expanded.methods.some((method) => method.direction === 'check' && method.branchId === branchId)).toBe(true);
  });

  it('复合守卫每行一个检查盒，但一个分支只挂一个折叠开关', () => {
    const result = parsePv([
      'free c: channel.',
      'let p(x: host) = if x = a || x = b then out(c, n1).',
      'process p(t).',
    ].join('\n'));
    const layout = buildStructuredNarrativeLayout(result);
    const checks = layout.methods.filter((method) => method.direction === 'check');
    expect(checks).toHaveLength(2);
    // 检查盒 id 各不相同（复合守卫的每一行都是独立 React key）。
    expect(new Set(checks.map((method) => method.id)).size).toBe(2);
    // 折叠开关只挂在第一行。
    expect(checks.filter((method) => method.branchId !== undefined)).toHaveLength(1);
    expect(checks.find((method) => method.branchId !== undefined)?.branchText).toBe('x = a || x = b');
  });

  it('渲染层提供显式折叠开关：展开态每个分支一个按钮，折叠态给出可展开的折叠条', () => {
    const branchId = firstBranchId(nestedElseChain);
    const expanded = renderToString(createElement(NarrativeView, { result: nestedElseChain }));
    expect(expanded).toContain('structured-branch-toggle');
    expect(expanded).toContain('aria-label="折叠分支');
    expect(expanded).toContain(`data-branch-id="${branchId}"`);

    const collapsed = renderToString(createElement(NarrativeView, { result: nestedElseChain, initialCollapsedBranches: [branchId] }));
    expect(collapsed).toContain('structured-branch-fold');
    expect(collapsed).toContain('▸');
    expect(collapsed).not.toContain('structured-branch-toggle');

    // 臂道角标与折叠条都不越过画布右缘（沿用 ticket #02 的文字越界口径）。
    for (const html of [expanded, collapsed]) {
      const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? '';
      const width = Number(/\bwidth="([\d.]+)"/.exec(svg)?.[1] ?? 0);
      expect(width).toBeGreaterThan(0);
      for (const match of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
        const x = Number(/x="([-\d.]+)"/.exec(match[1])?.[1] ?? NaN);
        const text = match[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (!text.trim() || Number.isNaN(x)) continue;
        expect(x + text.length * 6.2, `「${text}」越出画布`).toBeLessThanOrEqual(width + 1);
      }
    }
  });

  it('消息一律画直线：跨过中间生命线也不上拱（对齐 prototype 05）', () => {
    for (const sample of coreSamples) {
      const fileName = sample.pvFile.split('/').pop() ?? sample.pvFile;
      const result = coreFixture(fileName);
      const html = renderToString(createElement(NarrativeView, { result, pairings: pairSteps(result) }));
      const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? '';
      const groups = svg.match(/class="structured-endpoint[^"]*"[\s\S]*?<path d="[^"]+"/g) ?? [];
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        const d = /<path d="([^"]+)"/.exec(group)?.[1] ?? '';
        expect(d, `${sample.id} 的消息段不是直线：${d}`).not.toContain('Q');
      }
    }
  });
});
