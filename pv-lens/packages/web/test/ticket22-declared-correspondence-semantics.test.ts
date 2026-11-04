import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { buildCorrespondenceMatrix, createCorrespondencePlan, parsePv } from '@pv-lens/core';
import type { VerificationResult } from '@pv-lens/core';
import { CorrespondenceCellDetail, CorrespondencePanel } from '../src/CorrespondencePanel';

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureSource(name: string): string {
  return readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8');
}

function resultOf(query: string, verdict: VerificationResult['verdict']): VerificationResult {
  return {
    query,
    verdict,
    goalReachable: null,
    counterexampleTrace: verdict === 'false' ? 'Derivation: …' : null,
    sectionText: '',
  };
}

describe('ticket #22：声明目标的判定归属', () => {
  it('非单射声明目标按源码原查询语义生成 event，单射声明目标保留 inj-event', () => {
    const source = fixtureSource('handshake-fixed');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const nonInjective = plan.queries.find((query) =>
      query.declared === true && query.from.name === 'termClient' && query.to.name === 'acceptsServer');
    const injective = plan.queries.find((query) =>
      query.declared === true && query.from.name === 'termServer' && query.to.name === 'acceptsClient');

    expect(nonInjective, '握手修正版应有一条非单射声明目标').toBeDefined();
    expect(nonInjective!.declaredInjective).toBe(false);
    expect(nonInjective!.text).toContain('event(termClient');
    expect(nonInjective!.text).not.toContain('inj-event(termClient');

    expect(injective, '握手修正版应有一条单射声明目标').toBeDefined();
    expect(injective!.declaredInjective).toBe(true);
    expect(injective!.text).toContain('inj-event(termServer');
    expect(injective!.text).toContain('inj-event(acceptsClient');
  });

  it('验证文本注入原查询而非同名单射探针', () => {
    const source = fixtureSource('handshake-fixed');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const nonInjective = plan.queries.find((query) =>
      query.declared === true && query.from.name === 'termClient' && query.to.name === 'acceptsServer');
    expect(nonInjective).toBeDefined();
    expect(plan.verificationSource).toContain(`query ${nonInjective!.text}.`);
    expect(plan.verificationSource).not.toContain(
      'inj-event(termClient(x0,x1)) ==> inj-event(acceptsServer(x0,x1))',
    );
  });

  it('矩阵按非单射 event 结果映射声明格，不再使用 inj-event 探针结论', () => {
    const source = fixtureSource('handshake-fixed');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const nonInjective = plan.queries.find((query) =>
      query.declared === true && query.from.name === 'termClient' && query.to.name === 'acceptsServer');
    expect(nonInjective).toBeDefined();
    const declaredResult = resultOf(
      'event(termClient(k_2,pk(skA[]))) ==> event(acceptsServer(k_2,pk(skA[])))',
      'true',
    );
    const cell = buildCorrespondenceMatrix(plan, [declaredResult])
      .find((candidate) => candidate.query.id === nonInjective!.id);
    expect(cell, '声明格应存在').toBeDefined();
    expect(cell!.verdict).toBe('true');
    expect(cell!.query.declared).toBe(true);
    expect(cell!.query.declaredInjective).toBe(false);
  });

  it('声明格详情注明按原查询语义判定，不把单射探针写成攻击路径', () => {
    const source = fixtureSource('handshake-fixed');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const nonInjective = plan.queries.find((query) =>
      query.declared === true && query.from.name === 'termClient' && query.to.name === 'acceptsServer');
    expect(nonInjective).toBeDefined();
    const html = renderToString(createElement(CorrespondenceCellDetail, {
      cell: {
        query: nonInjective!,
        verdict: 'true',
        result: resultOf(nonInjective!.text, 'true'),
      },
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('按源码声明的非单射');
    expect(html).toContain('单射');
    expect(html).toContain('本格结论');
    expect(html).not.toContain('攻击路径见下方');
  });

  it('矩阵说明区分声明目标与探索性探针', () => {
    const source = fixtureSource('handshake-fixed');
    const plan = createCorrespondencePlan(source, parsePv(source));
    const html = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: null,
      onSelectEvent: () => {},
      selectedQueryId: null,
      onSelectQuery: () => {},
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('源码声明的目标按原查询语义运行');
    expect(html).toContain('探索性有序对');
  });
});
