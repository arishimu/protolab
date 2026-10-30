import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { buildCorrespondenceMatrix, createCorrespondencePlan, deriveEventRoles, getSampleSource, parsePv } from '@pv-lens/core';
import type { VerificationResult } from '@pv-lens/core';
import { CorrespondencePanel } from '../src/CorrespondencePanel';
import { NarrativeView } from '../src/narrative/NarrativeView';
import type { EventCorrespondenceBinding } from '../src/narrative/NarrativeView';

describe('ticket #08：事件标记与批量对应性查询（web）', () => {
  it('矩阵常驻可折叠：handshake-fixed 4 事件 16 有序对，初始全部未验证、自反单元可辨识', () => {
    const source = getSampleSource('handshake-fixed') ?? '';
    const plan = createCorrespondencePlan(source, parsePv(source));
    const html = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: null,
      onSelectEvent: () => {},
      selectedQueryId: null,
      onSelectQuery: () => {},
    }));
    // React 数字插值会产生 <!-- --> 分隔，先剥离再比对文本。
    const plain = html.replace(/<!-- -->/g, '');
    expect(plain).toContain('4 个事件 × 16 条有序对');
    expect(plain).toContain('<details open');
    // 初始未运行：16 个单元全部 pending。
    expect((html.match(/correspondence-cell--pending/g) ?? []).length).toBe(16);
    expect((html.match(/：未验证/g) ?? []).length).toBe(16);
    // 4 个自反单元（对角线）带自反标记与 aria 标注。
    expect((html.match(/（自反）/g) ?? []).length).toBe(4);
    expect((html.match(/correspondence-reflexive-mark/g) ?? []).length).toBe(4);
  });

  it('结果映射后单元三态独立：成立 / 反例 / 未证出各有判定徽标与 aria', () => {
    const source = getSampleSource('handshake-fixed') ?? '';
    const result = parsePv(source);
    const plan = createCorrespondencePlan(source, result);
    // 用矩阵自产的三条查询文本构造三态结果，按归一化文本对齐。
    const fakeResults: VerificationResult[] = [
      { query: plan.queries[0].text, verdict: 'true', goalReachable: null, counterexampleTrace: null, sectionText: '' },
      { query: plan.queries[1].text, verdict: 'false', goalReachable: null, counterexampleTrace: 'Derivation: …', sectionText: '' },
      { query: plan.queries[2].text, verdict: 'cannot-be-proved', goalReachable: null, counterexampleTrace: null, sectionText: '' },
    ];
    const cells = buildCorrespondenceMatrix(plan, fakeResults);
    expect(cells.filter((cell) => cell.verdict === 'true')).toHaveLength(1);
    expect(cells.filter((cell) => cell.verdict === 'false')).toHaveLength(1);
    expect(cells.filter((cell) => cell.verdict === 'cannot-be-proved')).toHaveLength(1);
    expect(cells.filter((cell) => cell.verdict === 'pending')).toHaveLength(13);
    // 反例单元保留 trace 入口数据。
    expect(cells.find((cell) => cell.verdict === 'false')?.result?.counterexampleTrace).toBe('Derivation: …');
  });

  it('事件旗标按前提/结论区分形状并可点击，title 说明联动操作', () => {
    const source = getSampleSource('handshake-fixed') ?? '';
    const result = parsePv(source);
    const plan = createCorrespondencePlan(source, result);
    const rolesByOffset = deriveEventRoles(plan);
    const binding: EventCorrespondenceBinding = {
      rolesByOffset,
      selectedOffset: null,
      onSelect: () => {},
      onReflexive: () => {},
    };
    const html = renderToString(createElement(NarrativeView, { result, eventCorrespondence: binding }));
    // handshake-fixed 的每个事件都同时是某查询的前提与结论 → 菱形 + 旗并排。
    expect((html.match(/structured-event-diamond/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((html.match(/structured-event--premise/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((html.match(/structured-event--conclusion/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((html.match(/structured-event--clickable/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('单击选中行列，双击查自反对应性');
  });

  it('无事件样例给出提示而不是空矩阵', () => {
    const source = getSampleSource('hello') ?? '';
    const plan = createCorrespondencePlan(source, parsePv(source));
    const html = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: null,
      onSelectEvent: () => {},
      selectedQueryId: null,
      onSelectQuery: () => {},
    }));
    expect(html).toContain('没有 event 标记');
    expect(html).not.toContain('correspondence-matrix"');
  });
});
