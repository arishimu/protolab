import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePv, parseVerifyStdout } from '@pv-lens/core';
import { mapResultsToQueries } from '../src/query-presentation';
import { QueryResultCard } from '../src/VerifyPanel';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const coreDir = join(webDir, '..', 'core', 'fixtures');

function nsOriginalViews() {
  const source = readFileSync(join(coreDir, 'pv', 'ns-original.pv'), 'utf8');
  const stdout = readFileSync(join(coreDir, 'proverif', 'ns-original.stdout.txt'), 'utf8');
  const parseResult = parsePv(source);
  const views = mapResultsToQueries(parseVerifyStdout(stdout), parseResult.queries, parseResult);
  return { parseResult, views };
}

describe('阶段 5：反例归因 UI', () => {
  it('被证伪查询卡列出攻击者从哪些消息获得哪些项', () => {
    const { views } = nsOriginalViews();
    const view = views.find((candidate) => candidate.verdict === 'false' && candidate.counterexampleTrace !== null);
    expect(view).toBeDefined();
    if (view === undefined) return;
    const html = renderToString(createElement(QueryResultCard, {
      index: 0,
      view,
      onLocateSpan: () => undefined,
      onSelectEvent: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('攻击者从哪条消息获得什么');
    expect(html).toContain('攻击者收到');
    expect(html).toContain('未归因原文');
    expect(html).toContain('pk(skB[])');
    expect(html).not.toContain('攻击路径几何');
  });

  it('成立查询不渲染归因列表', () => {
    const { views } = nsOriginalViews();
    const view = views.find((candidate) => candidate.verdict === 'true');
    expect(view).toBeDefined();
    if (view === undefined) return;
    const html = renderToString(createElement(QueryResultCard, {
      index: 0,
      view,
      onLocateSpan: () => undefined,
      onSelectEvent: () => undefined,
    }));
    expect(html).not.toContain('攻击者从哪条消息获得什么');
  });
});
