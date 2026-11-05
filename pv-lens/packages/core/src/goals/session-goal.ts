/**
 * 会话目标（ADR-0018 / 阶段 5）。
 *
 * 会话目标是用户在本次会话内声明的验证问题：保密性、认证/对应性、可达性。
 * 它只生成派生 `.pv` 文本（在首个 process 前插入 query），不写回原文件，
 * 也不覆盖源码里已声明的查询。
 */

import type { ParseResult, SourceSpan } from '../parser/model.js';
import { collectEventReferences, correspondenceQueryText } from '../correspondence.js';
import { tokenize } from '../parser/lexer.js';
import type { EventReference } from '../correspondence.js';

export type SessionGoalKind = 'secrecy' | 'authentication' | 'reachability';

interface SessionGoalBase {
  id: string;
  kind: SessionGoalKind;
  /** 数据侧显式区分：会话目标不是声明目标，也不是探索性有序对。 */
  origin: 'session';
  label: string;
  queryText: string;
  sourceSpan?: SourceSpan;
}

export interface SessionSecrecyGoal extends SessionGoalBase {
  kind: 'secrecy';
  name: string;
  typeName?: string;
}

export interface SessionAuthenticationGoal extends SessionGoalBase {
  kind: 'authentication';
  from: EventReference;
  to: EventReference;
  injective: boolean;
}

export interface SessionReachabilityGoal extends SessionGoalBase {
  kind: 'reachability';
  event: EventReference;
}

export type SessionGoal = SessionSecrecyGoal | SessionAuthenticationGoal | SessionReachabilityGoal;

/** 角色内 `new` 名字：不能直接生成 attacker(name)，只能给出建模提示。 */
export interface RoleLocalFreshName {
  name: string;
  roleName: string;
  typeName?: string;
  span: SourceSpan;
}

/** 顶层 `free ... [private]` 秘密名 → 保密性会话目标候选。 */
export function secrecyCandidates(result: ParseResult): readonly SessionSecrecyGoal[] {
  return result.names
    .filter((name) => name.private === true && name.typeName !== 'channel')
    .map((name) => ({
      id: `session:secrecy:${name.name}`,
      kind: 'secrecy',
      origin: 'session',
      label: `保密性：${name.name}`,
      name: name.name,
      ...(name.typeName === undefined ? {} : { typeName: name.typeName }),
      queryText: `attacker(${name.name})`,
      ...(name.span === undefined ? {} : { sourceSpan: name.span }),
    }));
}

/** 角色内 `new` 名字清单；UI 用它提示“不能直接写成 attacker(name)”。 */
export function roleLocalFreshNames(result: ParseResult): readonly RoleLocalFreshName[] {
  const roles = result.roles.length > 0 ? result.roles : result.mainProcess === null ? [] : [result.mainProcess];
  const names: RoleLocalFreshName[] = [];
  roles.forEach((role) => {
    role.steps.forEach((step) => {
      for (const fresh of step.annotations.freshNames) {
        names.push({
          name: fresh.name,
          roleName: role.name,
          ...(fresh.typeName === undefined ? {} : { typeName: fresh.typeName }),
          span: fresh.span,
        });
      }
    });
  });
  return names;
}

export function createAuthenticationGoal(
  result: ParseResult,
  fromId: string,
  toId: string,
  injective: boolean,
): SessionAuthenticationGoal | null {
  const from = collectEventReferences(result).find((event) => event.id === fromId);
  const to = collectEventReferences(result).find((event) => event.id === toId);
  if (from === undefined || to === undefined) return null;
  const typesByName = new Map(result.events.map((declaration) => [declaration.name, declaration.argTypes]));
  return {
    id: `session:authentication:${from.id}=>${to.id}:${injective ? 'inj' : 'event'}`,
    kind: 'authentication',
    origin: 'session',
    label: `${injective ? '单射认证' : '对应性'}：${from.name} ⇒ ${to.name}`,
    from,
    to,
    injective,
    queryText: correspondenceQueryText(from, to, typesByName, injective),
    sourceSpan: from.span,
  };
}

export function createReachabilityGoal(result: ParseResult, eventId: string): SessionReachabilityGoal | null {
  const event = collectEventReferences(result).find((candidate) => candidate.id === eventId);
  if (event === undefined) return null;
  const types = result.events.find((declaration) => declaration.name === event.name)?.argTypes ?? [];
  return {
    id: `session:reachability:${event.id}`,
    kind: 'reachability',
    origin: 'session',
    label: `可达性：${event.name}`,
    event,
    queryText: singleEventQueryText(event, types),
    sourceSpan: event.span,
  };
}

function singleEventQueryText(event: EventReference, argTypes: readonly string[]): string {
  if (argTypes.length === 0) return `event(${event.name})`;
  const declarations = argTypes.map((type, index) => `x${String(index)}:${type}`);
  const args = argTypes.map((_, index) => `x${String(index)}`);
  return `${declarations.join(', ')}; event(${event.name}(${args.join(',')}))`;
}

/**
 * 把会话目标插入派生文本的首个 process 之前；原 source 不变。
 * 与源码中已有查询完全相同的行不重复插入。
 */
export function buildSessionGoalSource(source: string, goals: readonly SessionGoal[]): string {
  if (goals.length === 0) return source;
  const lines: string[] = [];
  for (const goal of goals) {
    const line = `query ${goal.queryText}.`;
    if (source.includes(line) || lines.includes(line)) continue;
    lines.push(line);
  }
  if (lines.length === 0) return source;
  const insertion = `${lines.join('\n')}\n\n`;
  const processToken = tokenize(source).tokens.find((token) => token.kind === 'ident' && token.text === 'process');
  if (processToken === undefined) return `${source.replace(/\s*$/, '')}\n\n${insertion}`;
  const offset = processToken.span.start.offset;
  return `${source.slice(0, offset)}${insertion}${source.slice(offset)}`;
}

/** 会话目标的查询原文集合；供验证结果标注“会话目标”来源。 */
export function sessionGoalQueryTexts(goals: readonly SessionGoal[]): readonly string[] {
  return goals.map((goal) => goal.queryText);
}

/** 去掉 ProVerif 查询前缀变量声明（`x:t; ...`），得到与 PvQuery.text 同形的正文。 */
export function sessionGoalQueryBody(queryText: string): string {
  const separator = queryText.lastIndexOf('; ');
  return separator < 0 ? queryText : queryText.slice(separator + 2);
}

/** 角色内 new 的提示文案（不生成查询）。 */
export function roleLocalFreshHint(name: RoleLocalFreshName): string {
  const type = name.typeName === undefined ? '' : `: ${name.typeName}`;
  return `角色 ${name.roleName} 内的 new ${name.name}${type} 不是顶层 free 秘密名；若要查询它的保密性，请改用顶层 free ${name.name}: ${name.typeName ?? 'bitstring'} [private] 的建模技巧。`;
}
