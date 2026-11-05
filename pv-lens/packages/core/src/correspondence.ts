import type { EventDeclaration, ParseResult, SourceSpan } from './parser/model.js';
import { tokenize } from './parser/lexer.js';
import type { VerificationResult } from './verify-result.js';

export interface EventReference {
  id: string;
  name: string;
  text: string;
  roleIndex: number;
  stepIndex: number;
  span: SourceSpan;
}

export interface CorrespondenceQuery {
  id: string;
  from: EventReference;
  to: EventReference;
  text: string;
  /** 该有序对是否对应源码中一条声明查询。 */
  declared?: boolean;
  /** 对应的源码查询原文；仅 declared 为真时存在。 */
  declaredText?: string;
  /**
   * 声明目标是否按单射 `inj-event` 语义运行；仅 declared 为真时存在。
   * 源码声明为非单射 `event` 时为 false，声明格按原查询语义判定。
   */
  declaredInjective?: boolean;
}

export type CorrespondenceVerdict = 'true' | 'false' | 'cannot-be-proved' | 'pending';

export interface CorrespondenceCell {
  query: CorrespondenceQuery;
  verdict: CorrespondenceVerdict;
  result: VerificationResult | null;
}

export interface CorrespondencePlan {
  source: string;
  verificationSource: string;
  events: readonly EventReference[];
  queries: readonly CorrespondenceQuery[];
}

/** 收集角色中带源码 span 的 event 标记；不把同名事件跨角色合并。 */
export function collectEventReferences(result: ParseResult): readonly EventReference[] {
  const roles = result.roles.length > 0 ? result.roles : result.mainProcess === null ? [] : [result.mainProcess];
  const events: EventReference[] = [];
  roles.forEach((role, roleIndex) => {
    role.steps.forEach((step, stepIndex) => {
      step.annotations.events.forEach((event) => {
        events.push({
          id: `${role.name}:event:${event.span.start.offset}`,
          name: event.name,
          text: event.text,
          roleIndex,
          stepIndex,
          span: event.span,
        });
      });
    });
  });
  return events;
}

/**
 * 为 n 个事件生成固定顺序的 n² 个有序对应性 query。
 *
 * 查询变量按事件声明的形参类型生成（ProVerif 要求查询里的自由变量带类型声明）：
 * 同位置两侧类型一致时共用一个变量（对应性语义：同一值），不一致时各自独立变量。
 */
export function generateCorrespondenceQueries(
  events: readonly EventReference[],
  declarations: readonly EventDeclaration[] = [],
): readonly CorrespondenceQuery[] {
  const typesByName = new Map(declarations.map((declaration) => [declaration.name, declaration.argTypes]));
  return events.flatMap((from) => events.map((to) => ({
    id: `${from.id}=>${to.id}`,
    from,
    to,
    text: correspondenceQueryText(from, to, typesByName),
  })));
}

const FALLBACK_EVENT_ARG_TYPE = 'bitstring';

export function correspondenceQueryText(
  from: EventReference,
  to: EventReference,
  typesByName: ReadonlyMap<string, readonly string[]>,
  injective = true,
): string {
  const fromTypes = typesByName.get(from.name) ?? [];
  const toTypes = typesByName.get(to.name) ?? [];
  const arity = Math.max(fromTypes.length, toTypes.length);
  const declarations: string[] = [];
  const fromArgs: string[] = [];
  const toArgs: string[] = [];
  for (let index = 0; index < arity; index += 1) {
    const fromType = fromTypes[index] ?? FALLBACK_EVENT_ARG_TYPE;
    const toType = toTypes[index] ?? FALLBACK_EVENT_ARG_TYPE;
    if (fromType === toType) {
      const variable = `x${String(index)}`;
      declarations.push(`${variable}:${fromType}`);
      if (index < fromTypes.length) fromArgs.push(variable);
      if (index < toTypes.length) toArgs.push(variable);
      continue;
    }
    const fromVariable = `xa${String(index)}`;
    const toVariable = `xb${String(index)}`;
    declarations.push(`${fromVariable}:${fromType}`, `${toVariable}:${toType}`);
    if (index < fromTypes.length) fromArgs.push(fromVariable);
    if (index < toTypes.length) toArgs.push(toVariable);
  }
  const prefix = declarations.length === 0 ? '' : `${declarations.join(', ')}; `;
  const keyword = injective ? 'inj-event' : 'event';
  return `${prefix}${keyword}(${from.name}(${fromArgs.join(',')})) ==> ${keyword}(${to.name}(${toArgs.join(',')}))`;
}

/** 只在 process 关键字前插入批量 query，源文本本身不被修改。 */
export function injectCorrespondenceQueries(source: string, queries: readonly CorrespondenceQuery[]): string {
  if (queries.length === 0) return source;
  const insertion = `${queries.map((query) => `query ${query.text}.`).join('\n')}\n\n`;
  const processToken = tokenize(source).tokens.find((token) => token.kind === 'ident' && token.text === 'process');
  if (processToken === undefined) return `${insertion}${source}`;
  const offset = processToken.span.start.offset;
  return `${source.slice(0, offset)}${insertion}${source.slice(offset)}`;
}

/** 从一条源码查询文本提取事件名有序对；非对应性查询返回 null。 */
export function declaredEventPairOfQuery(text: string): string | null {
  const names = [...text.matchAll(/(?:inj-)?event\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
  if (names.length < 2) return null;
  return `${names[0]}=>${names[1]}`;
}

export function createCorrespondencePlan(source: string, result: ParseResult): CorrespondencePlan {
  const events = collectEventReferences(result);
  const declared = new Map<string, string>();
  for (const query of result.queries) {
    const pair = declaredEventPairOfQuery(query.text);
    if (pair !== null && !declared.has(pair)) declared.set(pair, query.text);
  }
  const typesByName = new Map(result.events.map((declaration) => [declaration.name, declaration.argTypes]));
  const queries = events.flatMap((from) => events.map((to) => {
    const key = `${from.name}=>${to.name}`;
    const declaredText = declared.get(key);
    // 源码声明为非单射 event 时，声明格必须按原查询语义运行；inj-event 只用于
    // 探索性有序对，避免把单射强化探针的结论误当成声明目标的结论（ADR-0016 修订）。
    const declaredInjective = declaredText === undefined || /\binj-event\s*\(/.test(declaredText);
    const query: CorrespondenceQuery = {
      id: `${from.id}=>${to.id}`,
      from,
      to,
      text: correspondenceQueryText(from, to, typesByName, declaredInjective),
    };
    return declaredText === undefined
      ? query
      : { ...query, declared: true, declaredText, declaredInjective };
  }));
  return { source, verificationSource: injectCorrespondenceQueries(source, queries), events, queries };
}

/**
 * 将验证器结果映射为常驻矩阵单元。
 *
 * ProVerif 的 RESULT 行会重命名查询变量（`x` → `x_2`），因此匹配按事件名有序对进行：
 * 从结果文本中提取 `inj-event(A(…)) ==> inj-event(B(…))` 的 (A, B)，与查询对方向敏感地对齐；
 * 同事件对的重复行（源文件自带同款查询）共享结论。
 */
export function buildCorrespondenceMatrix(
  plan: CorrespondencePlan,
  results: readonly VerificationResult[] = [],
): readonly CorrespondenceCell[] {
  const byPair = new Map<string, VerificationResult>();
  for (const result of results) {
    const pair = eventPairOfResultText(result.query);
    if (pair === null) continue;
    if (!byPair.has(pair)) byPair.set(pair, result);
  }
  return plan.queries.map((query) => {
    const result = byPair.get(`${query.from.name}=>${query.to.name}`) ?? null;
    return { query, result, verdict: result?.verdict ?? 'pending' };
  });
}

/**
 * 从 RESULT 行的查询文本提取事件名有序对；同时接受 `event(` 与 `inj-event(`。
 * 声明目标可能按源码原语义运行非单射查询，探索性有序对使用 inj-event 探针。
 * 事件实参可能嵌套括号（元组、构造子），按括号深度跳过实参，避免在实参中再次命中。
 */
function eventPairOfResultText(text: string): string | null {
  const names: string[] = [];
  const pattern = /(?:inj-)?event\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while (names.length < 2 && (match = pattern.exec(text)) !== null) {
    const name = match[1];
    if (name === undefined) return null;
    names.push(name);
    const openAt = text.indexOf('(', match.index);
    if (openAt < 0) return null;
    let depth = 0;
    let cursor = openAt;
    while (cursor < text.length) {
      const ch = text[cursor];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    if (depth !== 0) return null;
    pattern.lastIndex = cursor + 1;
  }
  return names.length === 2 ? pairOf(names) : null;
}

function pairOf(names: readonly string[]): string {
  return `${names[0]}=>${names[1]}`;
}

/** 事件在查询集中的角色：出现在某查询左侧为前提、右侧为结论（旗标形状共用，不两处各算）。 */
export function deriveEventRoles(plan: CorrespondencePlan): ReadonlyMap<number, { premise: boolean; conclusion: boolean }> {
  const roles = new Map<number, { premise: boolean; conclusion: boolean }>();
  plan.queries.forEach((query) => {
    const fromOffset = query.from.span.start.offset;
    const from = roles.get(fromOffset) ?? { premise: false, conclusion: false };
    from.premise = true;
    roles.set(fromOffset, from);
    const toOffset = query.to.span.start.offset;
    const to = roles.get(toOffset) ?? { premise: false, conclusion: false };
    to.conclusion = true;
    roles.set(toOffset, to);
  });
  return roles;
}
