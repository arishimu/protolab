import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, parsePv, parseVerifyStdout } from '@pv-lens/core';
import {
  mapResultsToQueries,
  normalizeQueryForMatch,
  VERDICT_META,
} from '../src/query-presentation';

// 黄金映射：四个录制 stdout 样例（core/fixtures）的验证结果 ↔ 样例 .pv 里的查询原文。
// 断言口径来自 spec 的「四样例实测表」与 core 的 expectedVerdicts 契约。

const fixturesDir = fileURLToPath(new URL('../..', import.meta.url));

function readFixture(relativePath: string): string {
  return readFileSync(join(fixturesDir, 'core', 'fixtures', relativePath), 'utf8');
}

/** 载入一个样例：.pv 源码 + 查询列表 + 录制 stdout 的解析结果。 */
function loadSample(id: string) {
  const source = readFixture(join('pv', `${id}.pv`));
  const stdout = readFixture(join('proverif', `${id}.stdout.txt`));
  return {
    queries: parsePv(source).queries,
    results: parseVerifyStdout(stdout),
  };
}

describe('query-presentation：四样例黄金映射', () => {
  it('条数、顺序、用户原文与判定都与 spec 实测表一致（位置优先）', () => {
    for (const def of coreSamples) {
      const { queries, results } = loadSample(def.id);
      expect(queries.length, `${def.id} 查询数`).toBe(def.expectedVerdicts.length);
      expect(results.length, `${def.id} 结果数`).toBe(def.expectedVerdicts.length);

      const views = mapResultsToQueries(results, queries);
      expect(views.length, def.id).toBe(results.length);

      views.forEach((view, index) => {
        const expected = def.expectedVerdicts[index];
        expect(view.cardId, def.id).toBe(`query-${String(index + 1)}`);
        expect(view.matched, `${def.id} #${String(index)} 应匹配到用户查询`).toBe(true);
        expect(view.userText, def.id).toBe(queries[index].text);
        expect(view.normalizedQuery, def.id).toBe(expected.query);
        expect(view.verdict, def.id).toBe(expected.verdict);
        expect(view.verdictLabel, def.id).toBe(VERDICT_META[expected.verdict].label);
      });
    }
  });

  it('handshake-fixed：归一化里被重命名的变量仍映射回用户书写的查询', () => {
    const { queries, results } = loadSample('handshake-fixed');
    const views = mapResultsToQueries(results, queries);

    expect(views[1].normalizedQuery).toBe(
      'event(termClient(x_2,y_1)) ==> event(acceptsServer(x_2,y_1))',
    );
    expect(views[1].userText).toBe('event(termClient(x,y))==>event(acceptsServer(x,y))');
    expect(views[1].variables).toEqual(['x', 'y']);
    // 位置映射的另一个作用：查询前缀里的类型标注不进 userText（原文就是书写形态）。
    expect(views[2].userText).toBe('inj-event(termServer(x))==>inj-event(acceptsClient(x))');
  });

  it('ns-original：endBparam 被证伪且带反例 trace；成立条目没有 trace', () => {
    const { queries, results } = loadSample('ns-original');
    const views = mapResultsToQueries(results, queries);

    const lowe = views[0];
    expect(lowe.matched).toBe(true);
    expect(lowe.userText).toBe('inj-event(endBparam(x)) ==> inj-event(beginBparam(x))');
    expect(lowe.verdict).toBe('false');
    expect(lowe.verdictLabel).toBe('被证伪');
    expect(lowe.counterexampleTrace).not.toBeNull();
    expect(lowe.counterexampleTrace).toContain('Derivation:');
    expect(lowe.counterexampleTrace).toContain('attacker');
    expect(lowe.goalReachable).toContain('goal reachable:');

    for (const view of views) {
      if (view.verdict === 'true') {
        expect(view.counterexampleTrace, `${view.normalizedQuery} 不该有 trace`).toBeNull();
        expect(view.verdictLabel).toBe('成立');
      } else {
        expect(view.counterexampleTrace, `${view.normalizedQuery} 应带 trace`).not.toBeNull();
      }
    }
    // B 侧两条保密性查询同样被证伪（spec 实测表）。
    expect(views[4].normalizedQuery).toBe('not attacker(secretBNa[])');
    expect(views[4].verdict).toBe('false');
    expect(views[5].normalizedQuery).toBe('not attacker(secretBNb[])');
    expect(views[5].verdict).toBe('false');
  });

  it('hello：`is false` → 被证伪，`is true` → 成立；`[]` 归一化靠位置映射消化', () => {
    const { queries, results } = loadSample('hello');
    const views = mapResultsToQueries(results, queries);

    expect(views[0].userText).toBe('attacker(RSA)');
    expect(views[0].normalizedQuery).toBe('not attacker(RSA[])');
    expect(views[0].verdictLabel).toBe('被证伪');
    expect(views[0].counterexampleTrace).not.toBeNull();
    expect(views[1].userText).toBe('attacker(Cocks)');
    expect(views[1].verdictLabel).toBe('成立');
    expect(views[1].counterexampleTrace).toBeNull();
  });
});

describe('query-presentation：cannot be proved', () => {
  it('人工 fixture → 未能证明、无 trace（假推导不算反例）', () => {
    const results = parseVerifyStdout(readFixture(join('proverif', 'cannot-be-proved.stdout.txt')));
    const queries = parsePv('query attacker(s).\nquery attacker(k).\n').queries;
    expect(queries).toHaveLength(2);

    const views = mapResultsToQueries(results, queries);
    expect(views).toHaveLength(2);

    expect(views[0].normalizedQuery).toBe('not attacker(s[])');
    expect(views[0].verdict).toBe('cannot-be-proved');
    expect(views[0].verdictLabel).toBe('未能证明');
    expect(views[0].counterexampleTrace).toBeNull();
    expect(views[0].userText).toBe('attacker(s)');

    expect(views[1].verdict).toBe('true');
    expect(views[1].verdictLabel).toBe('成立');
    expect(views[1].counterexampleTrace).toBeNull();
  });

  it('`cannot be proved` 的解释明确「不等于不成立」', () => {
    expect(VERDICT_META['cannot-be-proved'].explanation).toContain('不等于');
    expect(VERDICT_META['cannot-be-proved'].label).toBe('未能证明');
    expect(VERDICT_META.true.label).toBe('成立');
    expect(VERDICT_META.false.label).toBe('被证伪');
  });
});

describe('query-presentation：位置对不上时的兜底', () => {
  it('条数不等 → 退回归一化文本匹配，匹配不到的 userText 为 null', () => {
    const { results } = loadSample('hello'); // 2 条结果（RSA / Cocks）
    const queries = parsePv('query attacker(Cocks).\n').queries; // 1 条查询

    const views = mapResultsToQueries(results, queries);
    expect(views).toHaveLength(2);

    // RSA 没有对应原文（归一化 `not attacker(RSA[])` ≠ `attacker(Cocks)`）。
    expect(views[0].normalizedQuery).toBe('not attacker(RSA[])');
    expect(views[0].matched).toBe(false);
    expect(views[0].userText).toBeNull();
    expect(views[0].variables).toEqual([]);
    // Cocks 命中（去 `not `、去 `[]` 后相等）。
    expect(views[1].matched).toBe(true);
    expect(views[1].userText).toBe('attacker(Cocks)');
    expect(views[1].normalizedQuery).toBe('not attacker(Cocks[])');
  });

  it('一条用户查询只认领一次（多条结果不与同一条查询重复配对）', () => {
    const results = parseVerifyStdout(
      [
        'Starting query not attacker(s[])',
        'RESULT not attacker(s[]) is true.',
        'Starting query not attacker(s[])',
        'RESULT not attacker(s[]) is true.',
        'Starting query not attacker(k[])',
        'RESULT not attacker(k[]) is true.',
      ].join('\n'),
    );
    const queries = parsePv('query attacker(s).\nquery attacker(k).\n').queries;

    const views = mapResultsToQueries(results, queries);
    expect(views).toHaveLength(3);
    expect(views[0].userText).toBe('attacker(s)');
    expect(views[1].userText).toBeNull();
    expect(views[1].matched).toBe(false);
    expect(views[2].userText).toBe('attacker(k)');
  });

  it('没有查询/结果时返回空数组', () => {
    expect(mapResultsToQueries([], [])).toEqual([]);
  });

  it('normalizeQueryForMatch：去 `not ` 前缀、去 `[]`、去空白', () => {
    expect(normalizeQueryForMatch('not attacker(RSA[])')).toBe('attacker(RSA)');
    expect(normalizeQueryForMatch('event(a(x)) ==> event(b(x))')).toBe(
      normalizeQueryForMatch('event( a(x) ) ==>event( b(x) )'),
    );
  });
});
