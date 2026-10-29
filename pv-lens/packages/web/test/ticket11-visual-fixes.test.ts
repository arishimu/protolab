import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { ParseResult, PvRole } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import type { StructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { legendContentFor } from '../src/narrative/Legend';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const rectOf = (x: number, y: number, width: number, height: number): Rect => ({
  x1: x - width / 2,
  y1: y - height / 2,
  x2: x + width / 2,
  y2: y + height / 2,
});

const intersects = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

function columnCenterOf(layout: StructuredNarrativeLayout, roles: readonly PvRole[], roleIndex: number): number | undefined {
  const role = roles[roleIndex];
  const column = role === undefined ? undefined : layout.columns.find((candidate) => candidate.kind === 'role' && candidate.name === role.name);
  return column === undefined ? undefined : column.x + column.width / 2;
}

describe('ticket #11：使用关卡视觉修复', () => {
  it('F2 未配对线上芯片落在自身泳道、宽度按文字估算、不与方法盒交叠', () => {
    const samples: Array<{ name: string; file: string; withPairings: boolean }> = [
      { name: 'hello', file: 'hello.pv', withPairings: false },
      { name: 'ns-original', file: 'ns-original.pv', withPairings: true },
      { name: 'ns-mutual-auth', file: 'ns-mutual-auth.pv', withPairings: true },
    ];
    for (const sample of samples) {
      const result = fixture(sample.file);
      const roles = narrativeRoleOrder(result);
      const pairings = sample.withPairings ? composeMessagePairings(result).pairings : [];
      const layout = buildStructuredNarrativeLayout(result, { pairings });
      const wireChips = layout.chips.filter((chip) => chip.kind === 'wire');
      expect(wireChips.length, `${sample.name} 应存在未配对线上芯片`).toBeGreaterThan(0);
      for (const chip of wireChips) {
        const center = columnCenterOf(layout, roles, chip.roleIndex);
        expect(center, `${sample.name} 芯片所属角色列应存在`).toBeDefined();
        expect(chip.x).toBe(center);
        // 宽度按文字估算（CAPTION_CHAR_WIDTH=5.6），封顶 132；不越出自身泳道。
        expect(chip.width).toBeCloseTo(Math.min(132, 20 + chip.text.length * 5.6), 5);
        expect(chip.x + chip.width / 2).toBeLessThanOrEqual((center ?? 0) + 154 / 2 - 4);
        // 芯片与方法盒（含 wire 构造盒）不交叠——这是关卡截图里 senc 盒压住芯片的根因。
        for (const method of layout.methods.filter((candidate) => candidate.roleIndex === chip.roleIndex)) {
          expect(intersects(rectOf(chip.x, chip.y, chip.width, chip.height), rectOf(method.x, method.y, method.width, method.height)))
            .toBe(false);
        }
      }
    }
    // hello：唯一消息 out(c, RSA)，RSA 是自由名，芯片写全文、描边为未配对橙。
    const hello = buildStructuredNarrativeLayout(fixture('hello.pv'));
    const helloChips = hello.chips.filter((chip) => chip.kind === 'wire');
    expect(helloChips).toHaveLength(1);
    expect(helloChips[0]?.text).toBe('RSA');
    expect(helloChips[0]?.color).toBe('#C2410C');
  });

  it('F5 identity 接收去重：配对 in(c, x) 不再画同名词块，值身份色带转移到信道帧', () => {
    const result = fixture('handshake-fixed.pv');
    const roles = narrativeRoleOrder(result);
    const { pairings } = composeMessagePairings(result);
    const paired = buildStructuredNarrativeLayout(result, { pairings });
    const alone = buildStructuredNarrativeLayout(result);
    let identityCount = 0;
    for (const pairing of pairings) {
      const role = roles[pairing.inEnd.roleIndex];
      const item = role?.items.find((candidate) => candidate.kind === 'message' && candidate.endpoint.stepIndex === pairing.inEnd.stepIndex);
      if (item === undefined || item.kind !== 'message') continue;
      const term = item.endpoint.term;
      if (term.kind !== 'variable' || term.bindingId === undefined) continue;
      identityCount += 1;
      // 配对后：泳道不再出现该绑定的 binding 方块；信道帧以 termValueColor 承接值身份。
      expect(paired.valueBlocks.some((block) => block.bindingId === term.bindingId && block.occurrence === 'binding')).toBe(false);
      const pillar = paired.pillars.find((candidate) => candidate.endpoints.some(
        (endpoint) => endpoint.roleIndex === pairing.inEnd.roleIndex && endpoint.stepIndex === pairing.inEnd.stepIndex,
      ));
      expect(pillar?.termValueColor).toBeDefined();
      // 不配对时（对照）：binding 方块照常存在，值身份锚点不丢失。
      expect(alone.valueBlocks.some((block) => block.bindingId === term.bindingId && block.occurrence === 'binding')).toBe(true);
    }
    expect(identityCount).toBeGreaterThanOrEqual(3);
  });

  it('F6 方法盒去冗余：实参全为已绑定变量时不写盒下 caption（adec / sdec）', () => {
    const result = fixture('handshake-fixed.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const destructors = layout.methods.filter((method) => method.label === 'adec' || method.label === 'sdec');
    expect(destructors.length).toBeGreaterThanOrEqual(2);
    for (const method of destructors) expect(method.caption).toBeUndefined();
  });

  it('F7 标签不越列：事件/分支/本地标签预算止于下一列左缘', () => {
    for (const file of ['hello.pv', 'handshake-fixed.pv', 'ns-mutual-auth.pv', 'ns-original.pv', 'multi-channel.pv']) {
      const result = fixture(file);
      const roles = narrativeRoleOrder(result);
      const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
      for (const node of layout.nodes.filter((candidate) => candidate.labelAnchor === 'start')) {
        const role = roles[node.roleIndex];
        const position = layout.columns.findIndex((column) => column.kind === 'role' && column.name === role?.name);
        const next = position >= 0 ? layout.columns[position + 1] : undefined;
        if (next === undefined) continue;
        expect(node.labelX + node.labelMaxChars * 6.2).toBeLessThanOrEqual(next.x - 8 + 0.5);
      }
    }
  });

  it('F8 折叠条封在泳道内且全折叠子集下与值层元素无交叠', () => {
    const files = ['handshake-fixed.pv', 'ns-mutual-auth.pv', 'ns-original.pv'];
    for (const file of files) {
      const result = fixture(file);
      const roles = narrativeRoleOrder(result);
      const pairings = composeMessagePairings(result).pairings;
      const branchIds = roles.flatMap((role) => role.items
        .filter((item): item is Extract<typeof item, { kind: 'branch' }> => item.kind === 'branch' && item.marker === 'branch')
        .map((item) => item.id));
      expect(branchIds.length, `${file} 应存在分支`).toBeGreaterThan(0);
      const subsets: string[][] = [[]];
      branchIds.forEach((id) => {
        subsets.forEach((subset) => subsets.push([...subset, id]));
      });
      for (const subset of subsets) {
        const layout = buildStructuredNarrativeLayout(result, { pairings, collapsedBranches: subset });
        for (const fold of layout.branchFolds) {
          expect(fold.width).toBeLessThanOrEqual(154 - 8 + 0.01);
          const foldRect = rectOf(fold.x, fold.y, fold.width, fold.height);
          const elements = [
            ...layout.valueBlocks.map((block) => rectOf(block.x, block.y, block.width, block.height)),
            ...layout.chips.map((chip) => rectOf(chip.x, chip.y, chip.width, chip.height)),
            ...layout.methods.map((method) => rectOf(method.x, method.y, method.width, method.height)),
          ];
          for (const element of elements) {
            expect(intersects(foldRect, element), `${file} 折叠 ${fold.branchId} 不应与值层元素交叠`).toBe(false);
          }
        }
      }
    }
  });

  it('F3 跨泳道消息线 y 预留：被穿过的中间角色列内，值层元素不落入线 ±11px 禁置带', () => {
    const result = fixture('ns-mutual-auth.pv');
    const roles = narrativeRoleOrder(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    expect(layout.endpoints.length).toBeGreaterThan(0);
    // 参数簇位于顶部固定区（headerHeight 58 + labelGap 20 + 14 起，参数每格 20），不在避让范围（行锚定元素的既定限制）。
    const parameterBandBottom = (roleIndex: number): number => {
      const role = roles[roleIndex];
      const count = role?.bindings.filter((binding) => binding.kind === 'parameter').length ?? 0;
      return 58 + 20 + 14 + count * 20 + 0.5;
    };
    for (const endpoint of layout.endpoints) {
      const left = Math.min(endpoint.roleX, endpoint.channelX);
      const right = Math.max(endpoint.roleX, endpoint.channelX);
      for (const column of layout.columns) {
        if (column.kind !== 'role') continue;
        const centerX = column.x + column.width / 2;
        if (centerX <= left || centerX >= right) continue;
        const crossedRole = roles.findIndex((role) => role.name === column.name);
        const laneElements = [
          ...layout.valueBlocks.filter((block) => block.roleIndex === crossedRole && block.y > parameterBandBottom(crossedRole)),
          ...layout.chips.filter((chip) => chip.roleIndex === crossedRole),
          ...layout.methods.filter((method) => method.roleIndex === crossedRole),
        ];
        for (const element of laneElements) {
          // 只约束横跨泳道中轴的元素（构造链盒与 wire 构造盒在泳道侧翼，线从其外侧穿过）。
          if (Math.abs(element.x - centerX) >= element.width / 2 - 0.01) continue;
          expect(Math.abs(element.y - endpoint.y)).toBeGreaterThanOrEqual(11 + element.height / 2 - 0.01);
        }
      }
    }
  });

  it('F1/F9 图例按画布内容过滤：hello 只剩三条，多协议样例含方法盒与惯用记法', () => {
    const hello = fixture('hello.pv');
    const helloContent = legendContentFor(buildStructuredNarrativeLayout(hello), hello);
    expect(new Set(helloContent.keys)).toEqual(new Set(['unpaired', 'wire-chip', 'direction']));
    expect(helloContent.notation).toHaveLength(0);

    const ns = fixture('ns-mutual-auth.pv');
    const nsContent = legendContentFor(
      buildStructuredNarrativeLayout(ns, { pairings: composeMessagePairings(ns).pairings }),
      ns,
    );
    for (const key of ['value-block', 'method-box', 'unpaired', 'branch-lane', 'scope-flags'] as const) {
      expect(nsContent.keys, `ns-mutual-auth 图例应包含 ${key}`).toContain(key);
    }
    expect(nsContent.notation.some((entry) => entry.functors.includes('aenc'))).toBe(true);
  });

  it('F4 层叠顺序：消息线在值层之下、折叠条与文本节点在值层之上', () => {
    const result = fixture('ns-mutual-auth.pv');
    const html = renderToString(createElement(NarrativeView, { result }));
    const order = [
      'structured-arm-layer',
      'structured-message-layer',
      'structured-value-layer',
      'structured-branch-fold-layer',
      'structured-node-layer',
    ].map((name) => html.indexOf(`class="${name}"`));
    order.forEach((position, index) => {
      expect(position, `${order.join(',')} 层都应存在`).toBeGreaterThanOrEqual(0);
      if (index > 0) expect(position).toBeGreaterThan(order[index - 1] as number);
    });
  });
});
