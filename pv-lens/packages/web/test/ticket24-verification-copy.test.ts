import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { mapResultsToQueries } from '../src/query-presentation';
import { QueryResultCard, splitStdoutSections } from '../src/VerifyPanel';
import type { QueryResultView } from '../src/query-presentation';

function viewOf(
  query: string,
  verdict: 'true' | 'false',
  userQueries: readonly { text: string; variables?: readonly string[] }[] = [],
): QueryResultView {
  const view = mapResultsToQueries([
    {
      query,
      verdict,
      goalReachable: 'goal reachable: b-event(acceptsServer(k_2)) -> event(termClient(k_2))',
      counterexampleTrace: verdict === 'false' ? 'Derivation: …' : null,
      sectionText: '',
    },
  ] as never, userQueries as never)[0];
  expect(view).toBeDefined();
  return view!;
}

function render(view: QueryResultView): string {
  return renderToString(createElement(QueryResultCard, { index: 0, view })).replace(/<!-- -->/g, '');
}

function cardOf(query: string, verdict: 'true' | 'false'): string {
  return render(viewOf(query, verdict));
}

describe('ticket #24：验证卡片的证明见证与攻击路径分流', () => {
  it('证明成立的对应性查询把 goal reachable 放进证明细节', () => {
    const html = cardOf('event(termClient(x)) ==> event(acceptsServer(x))', 'true');
    expect(html).toContain('证明细节');
    expect(html).toContain('goal reachable');
    expect(html).not.toContain('在攻击者模型下可达');
    expect(html).not.toContain('攻击路径摘要');
  });

  it('被证伪的对应性查询把 goal reachable 表述为攻击路径摘要', () => {
    const html = cardOf('event(termClient(x)) ==> event(acceptsServer(x))', 'false');
    expect(html).toContain('攻击路径摘要');
    expect(html).toContain('goal reachable');
    expect(html).not.toContain('在攻击者模型下可达');
  });
});

describe('ticket #24：R14 归一化形态不与用户原文重复', () => {
  it('书写形式与归一化一致（含 not 前缀与空白差异）时不显示归一化行', () => {
    const userText = 'inj-event(beginA(x)) ==> inj-event(endB(x))';
    const html = render(viewOf('inj-event(beginA(x)) ==> inj-event(endB(x))', 'true', [{ text: userText }]));
    expect(html.replace(/&gt;/g, '>')).toContain(userText);
    expect(html).not.toContain('归一化形态');
    // not 前缀差异也属归一化等价（normalizeQueryForMatch 去 not / [] / 空白）。
    const negated = render(viewOf('attacker(secret[])', 'false', [{ text: 'not attacker(secret[])' }]));
    expect(negated).not.toContain('归一化形态');
  });

  it('归一化形态与原文有实质差异（变量重命名）时另列（判定针对它给出）', () => {
    const userText = 'event(beginA(x)) ==> event(endB(x))';
    const html = render(viewOf('event(beginA(x_2)) ==> event(endB(x_2))', 'false', [{ text: userText }]));
    expect(html).toContain('归一化形态');
    expect(html).toContain('event(beginA(x_2)) ==&gt; event(endB(x_2))');
  });

  it('查询前缀声明的变量折叠进证明细节，不占主说明区', () => {
    const userText = 'query x: bitstring. inj-event(beginA(x)) ==> inj-event(endB(x))';
    const html = render(viewOf('inj-event(beginA(x)) ==> inj-event(endB(x))', 'true', [{ text: userText, variables: ['x'] }]));
    expect(html).toContain('证明细节');
    expect(html).toMatch(/证明细节[\s\S]*?查询前缀声明的变量/);
    // 主区顺序：判定徽标与解释在前，前缀声明不早于证明细节。
    expect(html.indexOf('证明细节')).toBeLessThan(html.indexOf('查询前缀声明的变量'));
  });
});

describe('ticket #24：R12 trace 与 stdout 的操作入口', () => {
  it('被证伪卡片提供反例 trace 的复制与下载入口', () => {
    const userText = 'not attacker(secret[])';
    const html = render(viewOf('attacker(secret[])', 'false', [{ text: userText }]));
    expect(html).toContain('复制');
    expect(html).toContain('下载');
    expect(html).toContain('适合宽度');
  });

  it('splitStdoutSections 按 Starting query 行切节，首节为运行准备', () => {
    const stdout = [
      'Process 0 (role) started.',
      'Starting query not attacker(s[])',
      'RESULT not attacker(s[]) cannot be proved.',
      'Starting query inj-event(a) ==> inj-event(b)',
      'RESULT inj-event(a) ==> inj-event(b) is true.',
    ].join('\n');
    const sections = splitStdoutSections(stdout);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toContain('Process 0');
    expect(sections[1].startsWith('Starting query not attacker')).toBe(true);
    expect(sections[1]).toContain('cannot be proved');
    expect(sections[2].startsWith('Starting query inj-event')).toBe(true);
    // 逐字保留：拼回后与原文一致（按切分边界）。
    expect(sections.join('\n')).toBe(stdout);
  });

  it('空与全空白的 stdout 不产生空节', () => {
    expect(splitStdoutSections('')).toHaveLength(0);
    expect(splitStdoutSections('\n \n')).toHaveLength(0);
  });
});
