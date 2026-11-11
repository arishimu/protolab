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

import { collectEventReferences, narrativeRoleOrder } from '@pv-lens/core';
import type { ParseResult, PvQuery, SourceSpan, Verdict, VerificationResult } from '@pv-lens/core';

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
      'ProVerif 证明该查询成立，归一化输出为 is true；在 Dolev-Yao 攻击者模型下没有找到反例。',
  },
  false: {
    label: '被证伪',
    tone: 'negative',
    explanation:
      'ProVerif 找到反例，归一化输出为 is false；该查询不成立，攻击路径见下方反例 trace。',
  },
  'cannot-be-proved': {
    label: '未证出',
    tone: 'unknown',
    explanation:
      'ProVerif 未能证明该查询，也未能证伪，归一化输出为 cannot be proved。'
      + '未证出不等于不成立：可能是模型过复杂、缺少必要假设，或该性质需要人工判断。',
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
  /** 查询性质：保密性、认证/对应性、可达性或其它。 */
  propertyKind: QueryPropertyKind;
  propertyLabel: string;
  propertySubject: string;
  /** 性质化徽标，例如“保密性成立”“认证被证伪”。 */
  propertyVerdictLabel: string;
  /** 性质化解释句。 */
  propertyExplanation: string;
  counterexampleTrace: string | null;
  goalReachable: string | null;
  /** 是否映射到了某条用户查询（false ⇒ userText 为 null）。 */
  matched: boolean;
  /** 声明目标或会话目标。 */
  origin: QueryOrigin;
  originLabel: string;
  /** 查询在源码中的区间；未匹配到用户查询时为 null。 */
  sourceSpan: SourceSpan | null;
  /** 查询文本里出现的事件在画布上的锚点。 */
  eventAnchors: readonly QueryEventAnchor[];
  /** 三行解释：协议问题 / ProVerif 读法 / 判定含义。 */
  protocolQuestion: string;
  proverifReading: string;
  verdictMeaning: string;
}

export interface QueryEventAnchor {
  id: string;
  name: string;
  roleName: string;
  span: SourceSpan;
}

export type QueryPropertyKind = 'secrecy' | 'correspondence' | 'reachability' | 'other';

export type QueryOrigin = 'declared' | 'session';

/** 会话目标的查询正文与原始锚点（派生文本中的行号不能直接用于原源码）。 */
export interface SessionQueryRef {
  queryText: string;
  sourceSpan?: SourceSpan;
}

export interface QueryProperty {
  kind: QueryPropertyKind;
  /** 性质名，用于徽标前缀。 */
  label: string;
  /** 被查询的主体，用于解释句。 */
  subject: string;
}

/** 从用户原文或归一化原文判断查询性质。归一化文本先去掉 `not ` 与 `[]`。 */
export function propertyOf(text: string): QueryProperty {
  const normalized = text.replace(/\bnot\s+/gi, '').replace(/\[\]/g, '').trim();
  const attacker = /^attacker\s*\((.*)\)$/is.exec(normalized);
  if (attacker !== null) {
    return { kind: 'secrecy', label: '保密性', subject: attacker[1]?.trim() ?? normalized };
  }
  const correspondence = normalized.includes('==>') && /(inj-)?event\s*\(/i.test(normalized);
  if (correspondence) {
    const injective = /\binj-event\s*\(/i.test(normalized);
    return {
      kind: 'correspondence',
      label: injective ? '认证' : '对应性',
      subject: normalized,
    };
  }
  if (/^(inj-)?event\s*\(/i.test(normalized)) {
    return { kind: 'reachability', label: '可达性', subject: normalized };
  }
  return { kind: 'other', label: '查询', subject: normalized };
}

function propertyVerdictLabel(property: QueryProperty, verdict: Verdict): string {
  if (property.kind === 'reachability') {
    if (verdict === 'true') return '目标可达';
    if (verdict === 'false') return '目标不可达';
    return '可达性未证出';
  }
  if (property.kind === 'other') return VERDICT_META[verdict].label;
  return `${property.label}${VERDICT_META[verdict].label}`;
}

function propertyExplanation(property: QueryProperty, verdict: Verdict): string {
  if (property.kind === 'secrecy') {
    if (verdict === 'true') {
      return `ProVerif 证明攻击者无法获得 ${property.subject}；归一化输出为 is true，在 Dolev-Yao 模型下没有找到反例。`;
    }
    if (verdict === 'false') {
      return `ProVerif 找到反例：攻击者可以获得 ${property.subject}；该保密性查询不成立，攻击路径见下方反例 trace。`;
    }
    return `ProVerif 未能证明攻击者无法获得 ${property.subject}，也未能证伪；未证出不等于该秘密已泄露。`;
  }
  if (property.kind === 'correspondence') {
    if (verdict === 'true') return `ProVerif 证明该${property.label}目标成立；归一化输出为 is true，在 Dolev-Yao 模型下没有找到反例。`;
    if (verdict === 'false') {
      return `ProVerif 找到反例：该${property.label}目标不成立，已被证伪；攻击路径见下方反例 trace。`;
    }
    return `ProVerif 未能证明该${property.label}目标，也未能证伪；未证出不等于性质为假。`;
  }
  if (property.kind === 'reachability') {
    if (verdict === 'true') return `ProVerif 证明该目标在攻击者模型下可达；归一化输出为 is true。`;
    if (verdict === 'false') return `ProVerif 证明该目标不可达；归一化输出为 is false。`;
    return `ProVerif 未能证明该目标可达或不可达；未证出不等于目标不存在。`;
  }
  return VERDICT_META[verdict].explanation;
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
  parseResult?: ParseResult,
  sessionQueries: readonly SessionQueryRef[] = [],
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
    const property = propertyOf(query?.text ?? result.query);
    const queryText = query?.text ?? result.query;
    const sessionRef = sessionQueries.find((candidate) =>
      normalizeQueryForMatch(candidate.queryText) === normalizeQueryForMatch(queryText));
    return {
      cardId: `query-${String(index + 1)}`,
      normalizedQuery: result.query,
      userText: query?.text ?? null,
      variables: query?.variables ?? [],
      verdict: result.verdict,
      verdictLabel: meta.label,
      propertyKind: property.kind,
      propertyLabel: property.label,
      propertySubject: property.subject,
      propertyVerdictLabel: propertyVerdictLabel(property, result.verdict),
      propertyExplanation: propertyExplanation(property, result.verdict),
      counterexampleTrace: result.counterexampleTrace ?? null,
      goalReachable: result.goalReachable ?? null,
      matched: query !== undefined,
      origin: sessionRef === undefined ? 'declared' : 'session',
      originLabel: sessionRef === undefined ? '声明目标' : '会话目标',
      sourceSpan: sessionRef?.sourceSpan ?? query?.span ?? null,
      eventAnchors: eventAnchorsOf(queryText, parseResult),
      protocolQuestion: protocolQuestionOf(property),
      proverifReading: proverifReadingOf(property),
      verdictMeaning: propertyExplanation(property, result.verdict),
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

function protocolQuestionOf(property: QueryProperty): string {
  if (property.kind === 'secrecy') return `攻击者能否获得 ${property.subject}？`;
  if (property.kind === 'correspondence') return `当 ${property.subject} 的结论事件发生时，前提事件是否一定已经发生？`;
  if (property.kind === 'reachability') return `事件 ${property.subject} 是否可能发生？`;
  return '这条查询在协议层面询问什么？';
}

function proverifReadingOf(property: QueryProperty): string {
  if (property.kind === 'secrecy') {
    return `attacker(${property.subject}) 在 ProVerif 输出中归一化为 not attacker(${property.subject}[])：is true 表示攻击者无法获得该值。`;
  }
  if (property.kind === 'correspondence') {
    return '==> 是 ProVerif 的对应性断言；inj-event 还要求事件一一对应，普通 event 只要求存在对应。';
  }
  if (property.kind === 'reachability') {
    return '单个 event(...) 在 ProVerif 中作为可达性目标：is true 表示该事件可达，is false 表示不可达。';
  }
  return '按 ProVerif 归一化输出 is true、is false、cannot be proved 解读，不套用固定性质。';
}

function eventAnchorsOf(text: string, parseResult: ParseResult | undefined): readonly QueryEventAnchor[] {
  if (parseResult === undefined) return [];
  const names = new Set<string>();
  for (const match of text.matchAll(/(?:inj-)?event\s*\(\s*([A-Za-z_][A-Za-z0-9_']*)/gi)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  if (names.size === 0) return [];
  const roles = narrativeRoleOrder(parseResult);
  const anchors: QueryEventAnchor[] = [];
  const seen = new Set<string>();
  for (const event of collectEventReferences(parseResult)) {
    if (!names.has(event.name) || seen.has(event.id)) continue;
    seen.add(event.id);
    anchors.push({
      id: event.id,
      name: event.name,
      roleName: roles[event.roleIndex]?.name ?? `角色 ${String(event.roleIndex)}`,
      span: event.span,
    });
  }
  return anchors;
}

/**
 * 覆盖摘要：统计本次声明的查询性质与实际验证条数，并列出未覆盖维度。
 * 措辞纪律：成立只说明这些查询成立，不推出协议整体安全。
 */
export interface VerificationCoverage {
  declaredQueries: number;
  verifiedQueries: number;
  matchedQueries: number;
  byKind: Readonly<Record<QueryPropertyKind, number>>;
  byOrigin: Readonly<Record<QueryOrigin, number>>;
  declaredKinds: readonly QueryPropertyKind[];
  uncovered: readonly { kind: QueryPropertyKind; label: string }[];
  note: string;
}

export function summarizeCoverage(
  views: readonly QueryResultView[],
  queries: readonly PvQuery[],
): VerificationCoverage {
  const byKind: Record<QueryPropertyKind, number> = { secrecy: 0, correspondence: 0, reachability: 0, other: 0 };
  const byOrigin: Record<QueryOrigin, number> = { declared: 0, session: 0 };
  views.forEach((view) => { byKind[view.propertyKind] += 1; byOrigin[view.origin] += 1; });
  const declaredKinds = [...new Set(queries.map((query) => propertyOf(query.text).kind))];
  const required: readonly QueryPropertyKind[] = ['secrecy', 'correspondence', 'reachability'];
  const uncovered = required
    .filter((kind) => !declaredKinds.includes(kind))
    .map((kind) => ({ kind, label: propertyLabelOf(kind) }));
  const note = queries.length === 0
    ? '当前 .pv 没有声明任何 query，本次运行不会给出安全性结论。'
    : `本次查询 ${String(queries.length)} 条，其中声明目标 ${String(byOrigin.declared)} 条、会话目标 ${String(byOrigin.session)} 条；已验证 ${String(views.length)} 条。`
      + '查询全部成立只说明这些查询在 Dolev-Yao 模型下成立，不等于协议整体安全。'
      + (uncovered.length === 0 ? '三类查询维度均已声明。' : `未覆盖维度：${uncovered.map((entry) => entry.label).join('、')}。`);
  return {
    declaredQueries: queries.length,
    verifiedQueries: views.length,
    matchedQueries: views.filter((view) => view.matched).length,
    byKind,
    byOrigin,
    declaredKinds,
    uncovered,
    note,
  };
}

function propertyLabelOf(kind: QueryPropertyKind): string {
  if (kind === 'secrecy') return '保密性';
  if (kind === 'correspondence') return '认证 / 对应性';
  if (kind === 'reachability') return '可达性';
  return '其它';
}
