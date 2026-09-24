import { describe, expect, it } from 'vitest';
import { parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';

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

  it('只有跨过中间生命线才上拱，否则画直线', () => {
    // 两方协议：从生命线到信道不会跨过别的生命线。
    const twoParty = buildStructuredNarrativeLayout(coreFixture('ns-original.pv'));
    expect(twoParty.endpoints.every((endpoint) => !endpoint.crossesIntermediate)).toBe(true);
    // 多方：processS 的服务端步骤要跨过别的角色生命线（4 角色 + 1 信道）。
    const many = buildStructuredNarrativeLayout(coreFixture('ns-mutual-auth.pv'));
    expect(many.endpoints.some((endpoint) => endpoint.crossesIntermediate)).toBe(true);
  });
});
