import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parsePv } from '@pv-lens/core';
import type { VerificationResult } from '@pv-lens/core';
import { mapResultsToQueries, propertyOf } from '../src/query-presentation';
import { QueryResultCard } from '../src/VerifyPanel';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8');
}

function result(query: string, verdict: VerificationResult['verdict']): VerificationResult {
  return {
    query,
    verdict,
    goalReachable: null,
    counterexampleTrace: verdict === 'false' ? 'Derivation: …' : null,
    sectionText: '',
  };
}

describe('ticket #14：判定措辞按查询性质分流', () => {
  it('attacker 查询：保密性成立与被证伪分别给出面向秘密的结论', () => {
    const source = fixture('ns-original.pv');
    const parseResult = parsePv(source);
    const results: VerificationResult[] = [
      result('not attacker(secretANa[])', 'true'),
      result('not attacker(secretANb[])', 'true'),
      result('not attacker(secretBNa[])', 'false'),
      result('not attacker(secretBNb[])', 'false'),
    ];
    const views = mapResultsToQueries(results, parseResult.queries);
    expect(views[0]?.propertyKind).toBe('secrecy');
    expect(views[0]?.propertyVerdictLabel).toBe('保密性成立');
    expect(views[0]?.propertyExplanation).toContain('无法获得 secretANa');
    expect(views[2]?.propertyVerdictLabel).toBe('保密性被证伪');
    expect(views[2]?.propertyExplanation).toContain('可以获得 secretBNa');
  });

  it('inj-event 查询：认证成立与被证伪不再显示裸“成立”', () => {
    expect(propertyOf('inj-event(termServer(x)) ==> inj-event(acceptsClient(x))')).toMatchObject({
      kind: 'correspondence',
      label: '认证',
    });
    const source = fixture('handshake-fixed.pv');
    const parseResult = parsePv(source);
    const views = mapResultsToQueries([
      result('event(termClient(x_2,y_2)) ==> event(acceptsServer(x_2,y_2))', 'false'),
      result('inj-event(termServer(x_2)) ==> inj-event(acceptsClient(x_2))', 'true'),
    ], parseResult.queries);
    expect(views[0]?.propertyVerdictLabel).toBe('对应性被证伪');
    expect(views[0]?.propertyExplanation).toContain('目标不成立');
    expect(views[1]?.propertyVerdictLabel).toBe('认证成立');
  });

  it('结果卡片渲染性质化徽标与解释', () => {
    const source = fixture('ns-original.pv');
    const parseResult = parsePv(source);
    const views = mapResultsToQueries([result('not attacker(secretBNa[])', 'false')], parseResult.queries);
    const html = renderToString(createElement(QueryResultCard, { index: 0, view: views[0]! }));
    expect(html).toContain('保密性被证伪');
    expect(html).toContain('攻击者可以获得 secretBNa');
    expect(html).not.toContain('>成立<');
  });
});
