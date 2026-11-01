/**
 * 查询结果呈现（ticket 08）：把 stdout 解析出的**归一化**结果映射回**用户书写的查询原文**。
 *
 * 为什么需要这一层：ProVerif 的 RESULT 行针对归一化查询（`attacker(x)` 显示为
 * `not attacker(x)`、角色参数被加上 `[]`、变量被重命名成 `x_2`），直接展示会让人
 * 认不出自己写的那条。本模块按查询把「归一化形态 + 用户原文 + 判定措辞」组装成
 * UI 可直接渲染的视图数据；判定措辞遵循归一化语义（CONTEXT.md「验证结论」）。
 *
 * 纯函数、node 可测。
 */

import type { PvQuery, Verdict, VerificationResult } from '@pv-lens/core';

/** 判定的展示语气：用于徽标配色（绿 / 红 / 中性），不参与文案。 */
export type VerdictTone = 'positive' | 'negative' | 'unknown';

export interface VerdictMeta {
  /** 中文判定标签，对照归一化语义：`is true` / `is false` / `cannot be proved`。 */
  label: '成立' | '被证伪' | '未证出';
  tone: VerdictTone;
  /** 中文解释（「未证出不等于不成立」的措辞纪律在这一条里落地）。 */
  explanation: string;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  true: {
    label: '成立',
    tone: 'positive',
    explanation:
      'ProVerif 证明该查询成立（归一化输出里的 `is true`）：在 Dolev-Yao 攻击者模型下没有找到反例。',
  },
  false: {
    label: '被证伪',
    tone: 'negative',
    explanation:
      'ProVerif 找到反例（归一化输出里的 `is false`）：该查询不成立，攻击路径见下方的反例 trace。',
  },
  'cannot-be-proved': {
    label: '未证出',
    tone: 'unknown',
    explanation:
      'ProVerif 未能证明该查询，也未能证伪它（归一化输出里的 `cannot be proved`）——'
      + '「未证出」不等于「不成立」：可能是模型太复杂、缺少必要假设，或该性质确实需要人工判断。',
  },
};

/**
 * 一条查询在结果面板上的视图数据。
 *
 * `cardId` 是 1 基、按结果顺序的稳定代码（`query-1`、`query-2`…），作 React key 与卡片锚点。
 */
export interface QueryResultView {
  cardId: string;
  /** stdout 中呈现的归一化查询原文（如 `not attacker(RSA[])`）。 */
  normalizedQuery: string;
  /** 用户书写的查询原文；映射不到时为 null（UI 会加以说明并退回归一化形态）。 */
  userText: string | null;
  /** 该查询在源码里声明前缀的变量名（`query x:key; ...` → `['x']`）；无前缀为空数组。 */
  variables: readonly string[];
  verdict: Verdict;
  verdictLabel: VerdictMeta['label'];
  counterexampleTrace: string | null;
  goalReachable: string | null;
  /** 是否映射到了某条用户查询（false ⇒ userText 为 null）。 */
  matched: boolean;
}

/**
 * 把验证结果映射到用户查询。
 *
 * 策略：**优先按位置**——四基准样例实测结果顺序与 `query` 语句顺序一致
 * （一条 `query a; b;` 会按序展开成多条 PvQuery），故两边条数相等时直接按序配对，
 * 不必（也无法）依赖文本相等：ProVerif 会重命名变量（`x` → `x_2`）。
 * 条数不等（如某节缺 RESULT 行）时退回**归一化文本匹配**：两边都去 `not ` 前缀、
 * 去 `[]` 空参数括号、去空白后比较，每条用户查询只认领一次。
 * 仍匹配不到时 `userText: null, matched: false`，UI 显示归一化原文并标注。
 */
export function mapResultsToQueries(
  results: readonly VerificationResult[],
  queries: readonly PvQuery[],
): QueryResultView[] {
  const positional = results.length === queries.length;
  const claimed = new Set<number>();

  return results.map((result, index) => {
    let query: PvQuery | undefined;
    if (positional) {
      query = queries[index];
      claimed.add(index);
    } else {
      const matchIndex = queries.findIndex(
        (candidate, candidateIndex) =>
          !claimed.has(candidateIndex) &&
          normalizeQueryForMatch(candidate.text) === normalizeQueryForMatch(result.query),
      );
      if (matchIndex >= 0) {
        query = queries[matchIndex];
        claimed.add(matchIndex);
      }
    }

    const meta = VERDICT_META[result.verdict];
    return {
      cardId: `query-${String(index + 1)}`,
      normalizedQuery: result.query,
      userText: query?.text ?? null,
      variables: query?.variables ?? [],
      verdict: result.verdict,
      verdictLabel: meta.label,
      counterexampleTrace: result.counterexampleTrace,
      goalReachable: result.goalReachable,
      matched: query !== undefined,
    };
  });
}

/**
 * 文本匹配用的归一化：去掉 ProVerif 加的 `not ` 前缀、去掉空参数括号 `[]`、去掉所有空白。
 * 只服务「位置对不上时的兜底匹配」，不做语法级等价判断。
 */
export function normalizeQueryForMatch(text: string): string {
  return text
    .replace(/\bnot\s+/g, '')
    .replace(/\[\]/g, '')
    .replace(/\s+/g, '');
}
