import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildSessionGoalSource,
  collectEventReferences,
  createAuthenticationGoal,
  createReachabilityGoal,
  parsePv,
  parseVerifyStdout,
  secrecyCandidates,
  sessionGoalQueryBody,
} from '@pv-lens/core';
import type { VerificationResult } from '@pv-lens/core';
import { SessionGoalPanel } from '../src/narrative/SessionGoalPanel';
import { mapResultsToQueries, summarizeCoverage } from '../src/query-presentation';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const coreDir = join(webDir, '..', 'core', 'fixtures');

function readFixture(relativePath: string): string {
  return readFileSync(join(coreDir, relativePath), 'utf8');
}

function handshake() {
  const source = readFixture('pv/handshake-fixed.pv');
  const result = parsePv(source);
  const events = collectEventReferences(result);
  const secrecy = secrecyCandidates(result)[0]!;
  const auth = createAuthenticationGoal(result, events[0]!.id, events[1]!.id, true)!;
  const reach = createReachabilityGoal(result, events[0]!.id)!;
  return { source, result, secrecy, auth, reach };
}

describe('阶段 5：会话目标面板', () => {
  it('展示三类目标构建器、角色内 new 提示与派生文本', () => {
    const { source, result } = handshake();
    const html = renderToString(createElement(SessionGoalPanel, {
      result,
      goals: [],
      verificationSource: buildSessionGoalSource(source, []),
      onAdd: () => undefined,
      onRemove: () => undefined,
      onClear: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('会话目标');
    expect(html).toContain('保密性');
    expect(html).toContain('认证 / 对应性');
    expect(html).toContain('可达性');
    expect(html).toContain('角色内 new 提示');
    expect(html).toContain('不是顶层 free 秘密名');
  });

  it('已添加目标显示来源标签、查询文本与派生文本预览', () => {
    const { source, result, secrecy, auth } = handshake();
    const goals = [secrecy, auth];
    const derived = buildSessionGoalSource(source, goals);
    const html = renderToString(createElement(SessionGoalPanel, {
      result,
      goals,
      verificationSource: derived,
      onAdd: () => undefined,
      onRemove: () => undefined,
      onClear: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('会话目标');
    expect(html).toContain(secrecy.queryText);
    expect(html).toContain('inj-event(acceptsClient');
    expect(html).toContain('inj-event(termClient');
    expect(html).toContain('查看派生验证文本');
    expect(html).toContain('query attacker(s).');
  });
});

describe('阶段 5：查询来源与覆盖摘要', () => {
  it('会话目标查询标注为 session，并使用原始 span 而非派生行号', () => {
    const { result, auth } = handshake();
    const body = sessionGoalQueryBody(auth.queryText);
    const queries = [{ text: body, variables: ['x0', 'x1'], span: { start: { offset: 1, line: 99, column: 1 }, end: { offset: 2, line: 99, column: 2 } } }];
    const results: VerificationResult[] = [{ query: body, verdict: 'true', goalReachable: null, counterexampleTrace: null }];
    const views = mapResultsToQueries(results, queries, result, [{ queryText: body, sourceSpan: auth.sourceSpan! }]);
    expect(views[0]).toMatchObject({ origin: 'session', originLabel: '会话目标', verdict: 'true' });
    expect(views[0]?.sourceSpan?.start.line).toBe(auth.sourceSpan?.start.line);
    const coverage = summarizeCoverage(views, queries);
    expect(coverage.byOrigin).toEqual({ declared: 0, session: 1 });
  });

  it('声明目标仍标注为 declared', () => {
    const { result } = handshake();
    const query = result.queries[0]!;
    const results: VerificationResult[] = [{ query: query.text, verdict: 'true', goalReachable: null, counterexampleTrace: null }];
    const views = mapResultsToQueries(results, [query], result);
    expect(views[0]).toMatchObject({ origin: 'declared', originLabel: '声明目标' });
  });
});
