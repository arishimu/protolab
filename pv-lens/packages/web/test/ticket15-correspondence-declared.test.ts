import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createCorrespondencePlan, declaredEventPairOfQuery, parsePv } from '@pv-lens/core';
import { CorrespondenceCellDetail, CorrespondencePanel } from '../src/CorrespondencePanel';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8');
}

describe('ticket #15：对应性矩阵的声明目标与探索对', () => {
  it('从源码 query 提取事件名有序对', () => {
    expect(declaredEventPairOfQuery('event(termClient(x,y)) ==> event(acceptsServer(x,y))'))
      .toBe('termClient=>acceptsServer');
    expect(declaredEventPairOfQuery('inj-event(termServer(x)) ==> inj-event(acceptsClient(x))'))
      .toBe('termServer=>acceptsClient');
    expect(declaredEventPairOfQuery('attacker(s)')).toBeNull();
  });

  it('握手修正版：16 条查询中 2 条为声明目标，其余为探索对', () => {
    const source = fixture('handshake-fixed.pv');
    const plan = createCorrespondencePlan(source, parsePv(source));
    expect(plan.queries).toHaveLength(16);
    const declared = plan.queries.filter((query) => query.declared === true);
    expect(declared).toHaveLength(2);
    expect(declared.map((query) => `${query.from.name}=>${query.to.name}`).sort())
      .toEqual(['termClient=>acceptsServer', 'termServer=>acceptsClient']);
    expect(declared.every((query) => query.declaredText !== undefined)).toBe(true);
  });

  it('矩阵标题分开报告事件数、有序对数与声明目标数', () => {
    const source = fixture('handshake-fixed.pv');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const html = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: null,
      onSelectEvent: () => {},
      selectedQueryId: null,
      onSelectQuery: () => {},
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('4 个事件 · 16 条有序对 · 2 条源码声明的安全目标');
    expect(html).toContain('仅显示源码声明的安全目标');
    expect(html).toContain('自反对即');
  });

  it('探索对的 false 不写攻击路径，声明目标的 false 保留该措辞', () => {
    const source = fixture('handshake-fixed.pv');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const result = {
      query: '',
      verdict: 'false' as const,
      goalReachable: null,
      counterexampleTrace: 'Derivation: …',
      sectionText: '',
    };
    const declared = plan.queries.find((query) => query.declared === true && query.from.name !== query.to.name);
    const exploratory = plan.queries.find((query) => query.declared !== true);
    expect(declared).toBeDefined();
    expect(exploratory).toBeDefined();
    const declaredHtml = renderToString(createElement(CorrespondenceCellDetail, {
      cell: { query: declared!, verdict: 'false', result: { ...result, query: declared!.text } },
    }));
    const exploratoryHtml = renderToString(createElement(CorrespondenceCellDetail, {
      cell: { query: exploratory!, verdict: 'false', result: { ...result, query: exploratory!.text } },
    }));
    expect(declaredHtml).toContain('攻击路径');
    expect(exploratoryHtml).toContain('不构成协议攻击');
    expect(exploratoryHtml).not.toContain('攻击路径');
  });
});
