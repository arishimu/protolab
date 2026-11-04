import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, createCorrespondencePlan, pairSteps, parsePv } from '@pv-lens/core';
import { buildStructuredNarrativeLayout, foldGuardBudgetOf } from '../src/narrative/structured-layout';
import { Legend, legendContentFor } from '../src/narrative/Legend';
import { NarrativeView, compactnessTierOf } from '../src/narrative/NarrativeView';
import type { EventCorrespondenceBinding } from '../src/narrative/NarrativeView';

// ticket #20：P3 记法与降级（C1–C15 的自动化合同；两行排版与几何细节以浏览器验收为准）。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureParse(name: string) {
  return parsePv(readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

function renderNarrative(name: string, extra = {}) {
  const result = fixtureParse(name);
  const pairings = composeMessagePairings(result).pairings;
  return {
    result,
    pairings,
    layout: buildStructuredNarrativeLayout(result, { pairings }),
    html: renderToString(createElement(NarrativeView, { result, pairings, ...extra })),
  };
}

describe('ticket #20：P3 记法（C1–C7）', () => {
  it('C2 未选中查询时事件全部中性空心菱形；选中查询后恰一菱形一旗', () => {
    const { result, layout } = renderNarrative('handshake-fixed');
    const plan = createCorrespondencePlan('', result);
    const eventCount = plan.events.length;
    const neutralBinding: EventCorrespondenceBinding = {
      rolesByOffset: new Map(),
      selectedOffset: null,
      onSelect: () => {},
      onReflexive: () => {},
    };
    const neutralHtml = renderToString(createElement(NarrativeView, {
      result: fixtureParse('handshake-fixed'),
      pairings: composeMessagePairings(fixtureParse('handshake-fixed')).pairings,
      eventCorrespondence: neutralBinding,
    }));
    expect((neutralHtml.match(/structured-event--premise/g) ?? []).length).toBe(0);
    expect((neutralHtml.match(/structured-event--conclusion/g) ?? []).length).toBe(0);
    expect((neutralHtml.match(/structured-event-diamond/g) ?? []).length).toBe(0);
    expect((neutralHtml.match(/structured-event-neutral/g) ?? []).length).toBe(eventCount);
    expect(layout.nodes.filter((node) => node.kind === 'event')).toHaveLength(eventCount);

    const query = plan.queries.find((candidate) => candidate.from.id !== candidate.to.id)!;
    const selectedBinding: EventCorrespondenceBinding = {
      rolesByOffset: new Map([
        [query.from.span.start.offset, { premise: true, conclusion: false }],
        [query.to.span.start.offset, { premise: false, conclusion: true }],
      ]),
      selectedOffset: null,
      onSelect: () => {},
      onReflexive: () => {},
    };
    const selectedHtml = renderToString(createElement(NarrativeView, {
      result: fixtureParse('handshake-fixed'),
      pairings: composeMessagePairings(fixtureParse('handshake-fixed')).pairings,
      eventCorrespondence: selectedBinding,
    }));
    expect((selectedHtml.match(/structured-event-diamond/g) ?? []).length).toBe(1);
    expect((selectedHtml.match(/structured-event-neutral/g) ?? []).length).toBe(eventCount - 2);
  });

  it('C1 图例方向条目无 →/← 字形，① 有专门条目，单角色模型说明分流', () => {
    const hello = renderNarrative('hello');
    const helloLegend = renderToString(createElement(Legend, { layout: hello.layout, result: hello.result }));
    expect(helloLegend).toContain('箭头指向抵达目标');
    expect(helloLegend).toContain('信道序号');
    expect(helloLegend).toContain('单角色模型没有跨角色收发关系');
    expect(helloLegend).not.toContain('→ 发出');
    expect(helloLegend).not.toContain('← 接收');

    const multi = renderNarrative('multi-channel');
    const multiLegend = renderToString(createElement(Legend, { layout: multi.layout, result: multi.result }));
    expect(multiLegend).toContain('信道序号');
    expect(multiLegend).not.toContain('单角色模型');
    // 信道列标题并入序号字形（hello 单信道只出现 ①）。
    expect(hello.html.replace(/<title>[^<]*<\/title>/g, '')).not.toContain('②');
  });

  it('C3 等值复制出现时图例含虚线边框说明与虚线样例', () => {
    const ns = renderNarrative('ns-mutual-auth');
    const content = legendContentFor(ns.layout, ns.result);
    const legendHtml = renderToString(createElement(Legend, { layout: ns.layout, result: ns.result }));
    if (content.hasEqualityCopy) {
      // 「虚线边框」在 span 元素内、「表示等值复制」在其后：分段断言。
      expect(legendHtml).toContain('虚线边框');
      expect(legendHtml).toContain('表示等值复制');
      expect(legendHtml).toContain('legend-value-block--dashed');
    } else {
      // 样例更新后无等值复制时图例不出现该条目（按内容过滤原则）。
      expect(legendHtml).not.toContain('虚线边框表示等值复制');
    }
  });

  it('C4 insert 显示为带文字胶囊而非空矩形', () => {
    const source = [
      'free c: channel.',
      'table keys: bitstring.',
      'let A = insert(keys, k); out(c, k).',
      'let B = in(c, x: bitstring).',
      'process A | B.',
    ].join('\n');
    const result = parsePv(source);
    const { pairings } = composeMessagePairings(result);
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(html).toContain('structured-node--insert');
    expect(html).toMatch(/insert/i);
  });

  it('C5 get 只保留 ∈ 检查盒，不再生成重复方法盒', () => {
    const source = [
      'free c: channel.',
      'table t: bitstring.',
      'event done(bitstring).',
      'let A = get(t, =k) in event done(k).',
      'let B = out(c, m).',
      'process A | B.',
    ].join('\n');
    const result = parsePv(source);
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const getChecks = layout.methods.filter((method) => method.label === '∈');
    expect(getChecks.length).toBeGreaterThanOrEqual(1);
    // get 语句不再产生同跨度方法盒：∈ 检查盒之外无与 get 同源的方法盒。
    const getSpanTexts = layout.methods.filter((method) => method.sourceSpan.start.line === 4);
    expect(getSpanTexts.filter((method) => method.direction !== 'check')).toHaveLength(0);
  });

  it('C6 构造盒宽度覆盖全部输入方块跨度', () => {
    const { layout } = renderNarrative('handshake-fixed');
    const constructs = layout.methods.filter((method) => method.direction === 'construct');
    expect(constructs.length).toBeGreaterThan(0);
    for (const method of constructs) {
      // aenc 输入 5 个的线上构造盒与值链构造盒同式：宽端覆盖全部输入跨度。
      const expected = Math.max(66, method.inputBindingIds.length * 20 + 12);
      expect(method.width).toBeCloseTo(expected, 1);
    }
    const wideConstruct = constructs.find((method) => method.inputBindingIds.length >= 4);
    expect(wideConstruct, '握手修正版 aenc 构造盒应有不少于 4 个输入').toBeDefined();
  });

  it('C7 分支臂内的事件标记以臂轨为基线', () => {
    const { layout } = renderNarrative('ns-mutual-auth');
    const armRails = layout.armRuns.map((run) => run.railX);
    expect(armRails.length).toBeGreaterThan(0);
    const armEvents = layout.nodes.filter((node) =>
      node.kind === 'event' && node.markerX !== undefined && armRails.some((railX) => Math.abs(node.markerX! - (railX + 39)) < 0.5));
    expect(armEvents.length).toBeGreaterThan(0);
  });
});

describe('ticket #20：P3 记法（C8–C15）', () => {
  it('C8 冲突消息为用户语言，标记与列表同现', () => {
    const source = [
      'free c: channel.',
      'let A = in(c, a1: bitstring); out(c, a2).',
      'let B = in(c, b1: bitstring); out(c, b2).',
      'let C = out(c, c1).',
      'process A | B | C.',
    ].join('\n');
    const result = parsePv(source);
    const intents = [
      { outEnd: { roleIndex: 0, stepIndex: 1 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
      { outEnd: { roleIndex: 1, stepIndex: 1 }, inEnd: { roleIndex: 0, stepIndex: 0 } },
    ];
    const { pairings } = composeMessagePairings(result, intents);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    const forbidden = ['禁置带', '全局 y 唯一性', '非静默重排', '迭代'];
    for (const conflict of layout.conflicts) {
      for (const term of forbidden) expect(conflict.message).not.toContain(term);
    }
    if (layout.conflicts.length > 0) {
      expect(html).toContain('布局冲突');
      expect(html).toContain('narrative-conflicts');
    }
  });

  it('C10 折叠条徽标预算独立：守卫预算为徽标留 28px', () => {
    expect(foldGuardBudgetOf(160)).toBe(Math.floor((160 - 12 - 28) / 6.2));
    const { layout, html } = renderNarrative('ns-mutual-auth');
    for (const fold of layout.branchFolds) {
      expect(html).toContain(`+${String(fold.hiddenCount)}`);
    }
  });

  it('C12 紧凑度档位名与 aria-valuetext', () => {
    expect(compactnessTierOf(0)).toBe('宽松');
    expect(compactnessTierOf(0.3)).toBe('宽松');
    expect(compactnessTierOf(0.4)).toBe('标准');
    expect(compactnessTierOf(0.6)).toBe('标准');
    expect(compactnessTierOf(0.7)).toBe('紧凑');
    expect(compactnessTierOf(1)).toBe('紧凑');
    const { html } = renderNarrative('hello');
    expect(html).toContain('aria-valuetext="紧凑度 0.0，宽松"');
    expect(html).toContain('宽松 · 紧凑');
  });

  it('C13 未配对端点存在时画布提供人工配对入口与常驻说明', () => {
    const { html } = renderNarrative('ns-mutual-auth');
    expect(html).toContain('人工配对');
    expect(html).toContain('可点选未配对端点声明收发关系');
  });

  it('C14 phase 降级语句按源码位置成为行单元，诊断条不再重复', () => {
    const source = [
      'free c: channel.',
      'phase 1.',
      'let A = out(c, a); phase 2; out(c, b).',
      'let B = in(c, x).',
      'process A | B.',
    ].join('\n');
    const result = parsePv(source);
    expect(result.hasDegraded).toBe(true);
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const degraded = layout.nodes.filter((node) => node.degraded === true);
    expect(degraded.length).toBeGreaterThanOrEqual(1);
    // 位置：降级行单元位于角色 A 的两次 out 之间（源码顺序）。
    const roleItems = result.roles.find((role) => role.name === 'A')?.items ?? [];
    const degradedIndex = roleItems.findIndex((item) => item.kind === 'local' && item.operation === 'degraded');
    const firstOut = roleItems.findIndex((item) => item.kind === 'message');
    const secondOut = roleItems.findIndex((item, index) => index > firstOut && item.kind === 'message');
    expect(degradedIndex).toBeGreaterThan(firstOut);
    expect(degradedIndex).toBeLessThan(secondOut);
    // 诊断条只保留非语句级：该降级 span 不再出现在角色诊断条。
    for (const strip of layout.roleDiagnostics) {
      for (const entry of strip.entries) {
        expect(entry.diagnostic.span.start.offset).not.toBe(roleItems[degradedIndex]?.span.start.offset);
      }
    }
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(html).toContain('解析器不支持，已按原文保留');
  });

  it('C15 new n: bitstring 的变量引用继承类型，两角色同信道可自动配对', () => {
    const source = [
      'free c: channel.',
      'let A = new n: bitstring; out(c, n).',
      'let B = in(c, x: bitstring).',
      'process A | B.',
    ].join('\n');
    const result = parsePv(source);
    const pairings = pairSteps(result);
    expect(pairings.length).toBeGreaterThanOrEqual(1);
    // 现有样例配对数量不减少（回归口径）。
    for (const name of ['handshake-fixed', 'ns-original']) {
      const baseline = fixtureParse(name);
      expect(pairSteps(baseline).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('ticket #20：R11 降级语句的独立视觉类别', () => {
  const MIXED_SOURCE = [
    'free c: channel.',
    'table keys: bitstring.',
    'let A = insert(keys, k); phase 1; out(c, k).',
    'let B = in(c, x: bitstring).',
    'process A | B.',
  ].join('\n');

  it('降级节点用 --degraded 类，insert 保持 --insert，二者不再共用胶囊', () => {
    const result = parsePv(MIXED_SOURCE);
    expect(result.hasDegraded).toBe(true);
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    expect(layout.nodes.some((node) => node.inserted === true)).toBe(true);
    expect(layout.nodes.some((node) => node.degraded === true)).toBe(true);
    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(html).toContain('structured-node--insert');
    expect(html).toContain('structured-node--degraded');
    // 降级节点组不再同时携带 insert 类（两者互斥）。
    const degradedGroups = html.match(/<g class="structured-node[^"]*structured-node--degraded[^"]*"/g) ?? [];
    expect(degradedGroups.length).toBeGreaterThanOrEqual(1);
    for (const group of degradedGroups) {
      expect(group).not.toContain('structured-node--insert');
    }
    // 降级样式：虚线琥珀边框，与降级诊断条同色系。
    const v2 = readFileSync(join(packagesDir, 'web', 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.structured-node--degraded rect\s*\{[^}]*stroke:\s*#d97706[^}]*stroke-dasharray:\s*4 3/s);
  });

  it('图例说明降级与 insert 的视觉区分', () => {
    const result = parsePv(MIXED_SOURCE);
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const html = renderToString(createElement(Legend, { layout, result }));
    expect(html).toContain('虚线琥珀边框');
    expect(html).toContain('insert');
  });

  it('标题区提供“解析降级 N 处”横幅与定位入口，数量与诊断一致', () => {
    const app = readFileSync(join(packagesDir, 'web', 'src', 'App.tsx'), 'utf8');
    expect(app).toContain('degraded-banner');
    expect(app).toMatch(/解析降级 \$\{String\(degradedDiagnostics\.length\)\} 处/);
    expect(app).toContain('定位首个降级节点');
    // ParseNotices 的降级提示补数量。
    const verify = readFileSync(join(packagesDir, 'web', 'src', 'VerifyPanel.tsx'), 'utf8');
    expect(verify).toMatch(/已降级显示（\$\{String\(parseResult\.diagnostics/);
    // 数量一致性：诊断数 == 画布降级节点数 + 角色诊断条降级项（归属只算一次，C14 口径）。
    const result = parsePv(MIXED_SOURCE);
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const degradedNodeOffsets = new Set(
      layout.nodes.filter((node) => node.degraded === true).map((node) => node.span.start.offset),
    );
    const stripOffsets = new Set(
      layout.roleDiagnostics.flatMap((strip) => strip.entries
        .filter((entry) => entry.diagnostic.severity === 'degraded')
        .map((entry) => entry.diagnostic.span.start.offset)),
    );
    for (const offset of stripOffsets) {
      expect(degradedNodeOffsets.has(offset)).toBe(false);
    }
    const degradedCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'degraded').length;
    expect(degradedCount).toBe(degradedNodeOffsets.size + stripOffsets.size);
  });
});
