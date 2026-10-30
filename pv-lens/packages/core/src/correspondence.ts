import type { EventDeclaration, ParseResult, SourceSpan } from './parser/model.js';
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

function correspondenceQueryText(
  from: EventReference,
  to: EventReference,
  typesByName: ReadonlyMap<string, readonly string[]>,
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
  return `${prefix}inj-event(${from.name}(${fromArgs.join(',')})) ==> inj-event(${to.name}(${toArgs.join(',')}))`;
}

/** 只在 process 关键字前插入批量 query，源文本本身不被修改。 */
export function injectCorrespondenceQueries(source: string, queries: readonly CorrespondenceQuery[]): string {
  if (queries.length === 0) return source;
  const processMatch = /\bprocess\b/.exec(source);
  const insertion = `${queries.map((query) => `query ${query.text}.`).join('\n')}\n\n`;
  if (processMatch === null) return `${insertion}${source}`;
  return `${source.slice(0, processMatch.index)}${insertion}${source.slice(processMatch.index)}`;
}

export function createCorrespondencePlan(source: string, result: ParseResult): CorrespondencePlan {
  const events = collectEventReferences(result);
  const queries = generateCorrespondenceQueries(events, result.events);
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
 * 从 RESULT 行的查询文本提取事件名有序对；非单射行 / 无法识别的行不参与映射。
 * 事件实参可能嵌套括号（元组、构造子），不能只用 `[^()]*`——先按 inj-event 定位再
 * 以括号深度平衡截取实参区间。
 */
function eventPairOfResultText(text: string): string | null {
  const names: string[] = [];
  let index = 0;
  while (names.length < 2) {
    const hit = text.indexOf('inj-event(', index);
    if (hit < 0) return null;
    const nameStart = hit + 'inj-event('.length;
    const nameMatch = text.slice(nameStart).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (nameMatch === null) return null;
    names.push(nameMatch[0]);
    // 跳过实参的括号区（深度平衡），索引推进到其后。
    const restOffset = text.slice(nameStart + nameMatch[0].length).indexOf('(');
    if (restOffset < 0) return null;
    const openAt = nameStart + nameMatch[0].length + restOffset;
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
    index = cursor + 1;
  }
  return pairOf(names);
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
