import type { ParseResult, SourceSpan } from './parser/model.js';
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

/** 为 n 个事件生成固定顺序的 n² 个有序对应性 query。 */
export function generateCorrespondenceQueries(events: readonly EventReference[]): readonly CorrespondenceQuery[] {
  return events.flatMap((from) => events.map((to) => ({
    id: `${from.id}=>${to.id}`,
    from,
    to,
    text: `inj-event(${from.text}) ==> inj-event(${to.text})`,
  })));
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
  const queries = generateCorrespondenceQueries(events);
  return { source, verificationSource: injectCorrespondenceQueries(source, queries), events, queries };
}

/** 将验证器结果按生成 query id 映射为常驻矩阵单元。 */
export function buildCorrespondenceMatrix(
  plan: CorrespondencePlan,
  results: readonly VerificationResult[] = [],
): readonly CorrespondenceCell[] {
  const byText = new Map(results.map((result) => [normalizeQuery(result.query), result]));
  return plan.queries.map((query) => {
    const result = byText.get(normalizeQuery(query.text)) ?? null;
    return { query, result, verdict: result?.verdict ?? 'pending' };
  });
}

function normalizeQuery(text: string): string {
  return text.replace(/\s+/g, '').replace(/\[\]/g, '');
}
