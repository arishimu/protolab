import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, getSampleSource, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { PairingIntent, ParseResult } from '@pv-lens/core';
import { OPERATOR_CLUSTER_MIN, buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

function endpointOf(result: ParseResult, roleName: string, direction: 'out' | 'in', occurrence = 0): { roleIndex: number; stepIndex: number } {
  const roles = narrativeRoleOrder(result);
  for (const [roleIndex, role] of roles.entries()) {
    if (role.name !== roleName) continue;
    let seen = 0;
    for (const item of role.items) {
      if (item.kind !== 'message' || item.endpoint.direction !== direction) continue;
      if (seen === occurrence) return { roleIndex, stepIndex: item.endpoint.stepIndex };
      seen += 1;
    }
  }
  throw new Error(`endpoint not found: ${roleName} ${direction} ${String(occurrence)}`);
}

const DENSE_CHAIN = [
  'free c: channel.',
  'fun f(bitstring): bitstring.',
  'const a: bitstring.',
  'let A(x: bitstring) =',
  '\tlet b = f(x) in',
  '\tlet d = f(b) in',
  '\tlet e = f(d) in',
  '\tout(c, e).',
  'let B() = in(c, r: bitstring).',
  'process ( A(a) | B() )',
].join('\n');

const parse = (source: string): ParseResult => parsePv(source);

describe('ticket #07b：高密度算子簇识别（spec 51）', () => {
  it('连续算子步骤达到阈值默认折叠为一格，表面列出主导算子名与数量', () => {
    const result = parse(DENSE_CHAIN);
    const folded = buildStructuredNarrativeLayout(result);
    expect(folded.operatorFolds).toHaveLength(1);
    const fold = folded.operatorFolds[0];
    expect(fold?.label).toBe('f ×3');
    expect(fold?.hiddenCount).toBe(3);
    expect(fold?.memberLabels).toEqual(['f', 'f', 'f']);
    // 折叠态：簇内方法盒与节点不再出现。
    expect(folded.methods).toHaveLength(0);
    const rendered = renderToString(createElement(NarrativeView, { result }));
    expect(rendered).toContain('structured-operator-fold');
    expect(rendered).toContain('f ×3');
    expect(rendered).not.toContain('structured-method--construct');
  });

  it(`低于阈值（${OPERATOR_CLUSTER_MIN - 1} 个连续算子）不成簇`, () => {
    const source = [
      'free c: channel.',
      'fun f(bitstring): bitstring.',
      'const a: bitstring.',
      'let A(x: bitstring) =',
      '\tlet b = f(x) in',
      '\tlet d = f(b) in',
      '\tout(c, d).',
      'process A(a)',
    ].join('\n');
    const result = parse(source);
    const layout = buildStructuredNarrativeLayout(result);
    expect(layout.operatorFolds).toHaveLength(0);
    expect(layout.methods.length).toBe(2);
  });

  it('展开态退回原行：方法盒恢复、折叠格消失（显式开关，spec 51 与分支相反默认折叠）', () => {
    const result = parse(DENSE_CHAIN);
    const expanded = buildStructuredNarrativeLayout(result, { expandedOperatorClusters: ['opcluster:0:0'] });
    expect(expanded.operatorFolds).toHaveLength(0);
    expect(expanded.methods).toHaveLength(3);
    const rendered = renderToString(createElement(NarrativeView, {
      result,
      initialExpandedClusters: ['opcluster:0:0'],
    }));
    expect(rendered).not.toContain('structured-operator-fold"');
    expect(rendered).toContain('structured-method--construct');
  });
});

describe('ticket #07b：幽灵值块（spec 52）与 hover 浮卡（spec 53）', () => {
  it('折叠簇下方只保留仍被簇外引用的产出（虚线幽灵块），纯内部中间值不出现', () => {
    const result = parse(DENSE_CHAIN);
    const layout = buildStructuredNarrativeLayout(result);
    const fold = layout.operatorFolds[0];
    expect(fold?.ghostLabels).toEqual(['e']);
    const ghostBlocks = layout.valueBlocks.filter((block) => block.ghost === true);
    expect(ghostBlocks).toHaveLength(1);
    expect(ghostBlocks[0]?.label).toBe('e');
    const rendered = renderToString(createElement(NarrativeView, { result }));
    expect(rendered).toContain('structured-value-block--ghost');
    expect(rendered).toContain('折叠簇引用值 e');
    // 中间值 b、d 只在簇内被引用：不产生任何值方块。
    expect(rendered).not.toContain('data-binding-id="b"');
    expect(rendered).not.toContain('data-binding-id="d"');
  });

  it('悬停浮卡（title）列出全部内含算子与仍被引用的值，不改变布局', () => {
    const result = parse(DENSE_CHAIN);
    const rendered = renderToString(createElement(NarrativeView, { result }));
    expect(rendered).toContain('算子：f、f、f；仍被后续引用的值：e');
  });
});

describe('ticket #07b：折叠的布局性质', () => {
  it('折叠不改变其他角色的消息行位置（spec 54：其他角色不跳动）', () => {
    const result = parse(DENSE_CHAIN);
    const folded = buildStructuredNarrativeLayout(result);
    const expanded = buildStructuredNarrativeLayout(result, { expandedOperatorClusters: ['opcluster:0:0'] });
    const bEndpointFolded = folded.endpoints.find((endpoint) => endpoint.roleIndex === 1);
    const bEndpointExpanded = expanded.endpoints.find((endpoint) => endpoint.roleIndex === 1);
    expect(bEndpointFolded).toBeDefined();
    expect(bEndpointExpanded).toBeDefined();
    expect(bEndpointFolded?.y).toBe(bEndpointExpanded?.y);
  });

  it('折叠态几何无交叠：折叠格、幽灵块与后续行互不重叠，画布高度收缩', () => {
    const result = parse(DENSE_CHAIN);
    const folded = buildStructuredNarrativeLayout(result);
    const expanded = buildStructuredNarrativeLayout(result, { expandedOperatorClusters: ['opcluster:0:0'] });
    expect(folded.height).toBeLessThan(expanded.height);
    const fold = folded.operatorFolds[0];
    const ghost = folded.valueBlocks.find((block) => block.ghost === true);
    const outNode = folded.endpoints.find((endpoint) => endpoint.roleIndex === 0);
    expect(fold).toBeDefined();
    expect(ghost).toBeDefined();
    expect(outNode).toBeDefined();
    // 幽灵块在折叠格之下、消息端之上，且三者纵向区间两两不交。
    expect(ghost!.y).toBeGreaterThan(fold!.y);
    expect(outNode!.y).toBeGreaterThan(ghost!.y);
    const spans: Array<[number, number]> = [
      [fold!.y - fold!.height / 2, fold!.y + fold!.height / 2],
      [ghost!.y - ghost!.height / 2, ghost!.y + ghost!.height / 2],
    ];
    expect(spans[0]![1]).toBeLessThanOrEqual(spans[1]![0]);
  });

  it('折叠不改变水平序列（列序与角色/信道身份不变）', () => {
    const result = parse(DENSE_CHAIN);
    const folded = buildStructuredNarrativeLayout(result);
    const expanded = buildStructuredNarrativeLayout(result, { expandedOperatorClusters: ['opcluster:0:0'] });
    expect(folded.horizontal.nodes.map((node) => `${node.kind}:${node.name}`))
      .toEqual(expanded.horizontal.nodes.map((node) => `${node.kind}:${node.name}`));
  });

  it('基准样例 ns-mutual-auth 无连续高密度簇：现有布局基线不受折叠影响', () => {
    const result = parse(getSampleSource('ns-mutual-auth') ?? '');
    const layout = buildStructuredNarrativeLayout(result);
    expect(layout.operatorFolds).toHaveLength(0);
    expect(layout.valueBlocks.some((block) => block.ghost === true)).toBe(false);
  });
});

describe('ticket #07b：已配对端点点选命中提示（ticket 06 移交）', () => {
  it('已人工配对端点渲染命中提示：title 说明可追加扇出/合流，且带可点选视觉类', () => {
    const result = parse(getSampleSource('ns-mutual-auth') ?? '');
    const intents: PairingIntent[] = [
      { outEnd: endpointOf(result, 'processS', 'out'), inEnd: endpointOf(result, 'processInitiator', 'in') },
    ];
    const { pairings } = composeMessagePairings(result, intents);
    const rendered = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(rendered).toContain('structured-endpoint--manual');
    expect(rendered).toContain('已人工配对');
    expect(rendered).toContain('追加声明');
  });
});
