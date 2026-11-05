import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CONCEPTS,
  CONCEPT_IDS,
  coreSamples,
  conceptOf,
  notationConceptId,
  operationConceptId,
  originConceptId,
  parsePv,
  parseVerifyStdout,
  queryConceptId,
  verdictConceptId,
} from '@pv-lens/core';
import type { GroupingOrigin, OperationKind, Verdict } from '@pv-lens/core';
import { LEGEND_KEYS } from '../src/narrative/Legend';
import { ConceptNote } from '../src/narrative/ConceptNote';
import { mapResultsToQueries, summarizeCoverage } from '../src/query-presentation';
import { QueryResultCard } from '../src/VerifyPanel';
import { SAMPLE_GUIDES, resolveGuideTarget } from '../src/sample-guides';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const coreDir = join(webDir, '..', 'core', 'fixtures');

function readFixture(relativePath: string): string {
  return readFileSync(join(coreDir, relativePath), 'utf8');
}

function sampleViews(id: string) {
  const source = readFixture(join('pv', `${id}.pv`));
  const parseResult = parsePv(source);
  const results = parseVerifyStdout(readFixture(join('proverif', `${id}.stdout.txt`)));
  return { source, parseResult, results, views: mapResultsToQueries(results, parseResult.queries, parseResult) };
}

const OPERATION_KINDS: readonly OperationKind[] = [
  'signature',
  'symmetric-encryption',
  'symmetric-decryption',
  'asymmetric-encryption',
  'asymmetric-decryption',
  'hash',
  'key-derivation',
  'unknown',
];
const ORIGINS: readonly (GroupingOrigin | 'user')[] = ['equation', 'name', 'user', 'unknown'];
const QUERY_KINDS = ['secrecy', 'correspondence', 'reachability', 'other'] as const;
const VERDICTS: readonly Verdict[] = ['true', 'false', 'cannot-be-proved'];

describe('阶段 4：概念注解覆盖', () => {
  it('全部概念都有定义、协议问题、ProVerif 读法与至少一个锚点', () => {
    expect(CONCEPTS.size).toBe(CONCEPT_IDS.length);
    for (const id of CONCEPT_IDS) {
      const concept = conceptOf(id);
      expect(concept, id).toBeDefined();
      if (concept === undefined) continue;
      expect(concept.definition.trim().length, id).toBeGreaterThan(0);
      expect(concept.protocolQuestion.trim().length, id).toBeGreaterThan(0);
      expect(concept.proverifReading.trim().length, id).toBeGreaterThan(0);
      expect(concept.anchors.length, id).toBeGreaterThan(0);
    }
  });

  it('每种操作种类、来源、折叠状态、查询性质与判定状态都有注解', () => {
    for (const kind of OPERATION_KINDS) expect(conceptOf(operationConceptId(kind)), kind).toBeDefined();
    for (const origin of ORIGINS) expect(conceptOf(originConceptId(origin)), origin).toBeDefined();
    for (const kind of QUERY_KINDS) expect(conceptOf(queryConceptId(kind)), kind).toBeDefined();
    for (const verdict of VERDICTS) expect(conceptOf(verdictConceptId(verdict)), verdict).toBeDefined();
    for (const fold of ['fold:expanded', 'fold:collapsed', 'fold:semantic', 'fold:density']) {
      expect(conceptOf(fold), fold).toBeDefined();
    }
  });

  it('图例中的每一种记法都有概念注解与锚点', () => {
    for (const key of LEGEND_KEYS) {
      const concept = conceptOf(notationConceptId(key));
      expect(concept, key).toBeDefined();
      expect(concept?.anchors.length ?? 0, key).toBeGreaterThan(0);
    }
    expect(conceptOf(notationConceptId('crypto-notation'))).toBeDefined();
  });

  it('概念抽屉渲染定义、协议问题、ProVerif 读法与锚点', () => {
    const concept = conceptOf(operationConceptId('signature')) ?? null;
    expect(concept).not.toBeNull();
    const html = renderToString(createElement(ConceptNote, { concept, onClose: () => undefined }));
    expect(html).toContain('签名');
    expect(html).toContain('定义');
    expect(html).toContain('协议问题');
    expect(html).toContain('ProVerif 读法');
    expect(html).toContain('锚点');
  });
});

describe('阶段 4：查询三行、锚点与覆盖摘要', () => {
  it('每条查询都有三行解释、源码 span 与事件锚点', () => {
    const { parseResult, views } = sampleViews('handshake-fixed');
    expect(views).toHaveLength(3);
    expect(views[0]?.sourceSpan?.start.line).toBe(34);
    expect(views[0]?.protocolQuestion).toContain('攻击者能否获得');
    expect(views[0]?.proverifReading).toContain('not attacker');
    expect(views[0]?.verdictMeaning.length).toBeGreaterThan(0);
    expect(views[1]?.eventAnchors.map((anchor) => anchor.name).sort()).toEqual(['acceptsServer', 'termClient']);
    expect(views[2]?.eventAnchors.map((anchor) => anchor.name).sort()).toEqual(['acceptsClient', 'termServer']);
    expect(views.every((view) => view.protocolQuestion.length > 0 && view.proverifReading.length > 0 && view.verdictMeaning.length > 0)).toBe(true);
    expect(parseResult.queries).toHaveLength(3);
  });

  it('查询卡渲染三行、源码定位与事件定位入口', () => {
    const { views } = sampleViews('handshake-fixed');
    const view = views[1];
    expect(view).toBeDefined();
    if (view === undefined) return;
    const html = renderToString(createElement(QueryResultCard, {
      index: 1,
      view,
      onLocateSpan: () => undefined,
      onSelectEvent: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('协议问题');
    expect(html).toContain('ProVerif 读法');
    expect(html).toContain('判定含义');
    expect(html).toContain('定位查询源码');
    expect(html).toContain('定位事件');
  });

  it('覆盖摘要与实际查询集合一致，并明确不等于协议整体安全', () => {
    const handshake = sampleViews('handshake-fixed');
    const coverage = summarizeCoverage(handshake.views, handshake.parseResult.queries);
    expect(coverage.declaredQueries).toBe(3);
    expect(coverage.verifiedQueries).toBe(3);
    expect(coverage.matchedQueries).toBe(3);
    expect(coverage.byKind).toEqual({ secrecy: 1, correspondence: 2, reachability: 0, other: 0 });
    expect(coverage.uncovered.map((entry) => entry.kind)).toContain('reachability');
    expect(coverage.note).toContain('不等于协议整体安全');

    const hello = sampleViews('hello');
    const helloCoverage = summarizeCoverage(hello.views, hello.parseResult.queries);
    expect(helloCoverage.byKind).toEqual({ secrecy: 2, correspondence: 0, reachability: 0, other: 0 });
    expect(helloCoverage.uncovered.map((entry) => entry.kind).sort()).toEqual(['correspondence', 'reachability']);
  });

  it('没有声明 query 时覆盖摘要不给安全性结论', () => {
    const coverage = summarizeCoverage([], []);
    expect(coverage.note).toContain('不会给出安全性结论');
    expect(coverage.declaredQueries).toBe(0);
  });
});

describe('阶段 4：四样例导读', () => {
  it('每个内置样例有 3–5 步，且每一步都解析到真实 span、事件或查询', () => {
    for (const sample of coreSamples) {
      const guide = SAMPLE_GUIDES[sample.id];
      expect(guide, sample.id).toBeDefined();
      if (guide === undefined) continue;
      expect(guide.steps.length, sample.id).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length, sample.id).toBeLessThanOrEqual(5);
      const source = readFixture(sample.pvFile);
      const parseResult = parsePv(source);
      for (const step of guide.steps) {
        const resolved = resolveGuideTarget(step.target, source, parseResult);
        expect(resolved, `${sample.id}/${step.id}`).not.toBeNull();
        expect(resolved?.span.start.offset ?? -1, `${sample.id}/${step.id}`).toBeGreaterThanOrEqual(0);
        expect(resolved?.span.end.offset ?? 0, `${sample.id}/${step.id}`).toBeGreaterThan(resolved?.span.start.offset ?? 0);
      }
    }
  });

  it('导读与概念文案不出现“自动修复”一类结论', () => {
    const text = Object.values(SAMPLE_GUIDES).map((guide) =>
      [guide.title, guide.summary, ...guide.steps.flatMap((step) => [step.title, step.body])].join('\n')).join('\n');
    expect(text).not.toContain('自动修复');
    expect(text).not.toContain('协议整体安全');
  });
});
