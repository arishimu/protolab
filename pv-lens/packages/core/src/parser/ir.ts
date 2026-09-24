import type { ProcessFact } from './process.js';
import type { MessageStep } from './model.js';
import type {
  Binding,

  Condition,
  MessageItem,
  MessageEndpoint,
  PvTerm,
  RoleItem,
  RoleParameter,
  SourceSpan,
} from './model.js';
import { parseConditionText } from './condition.js';

/**
 * 从进程体事实流构造 v2 item 流。消息步骤仍由 `steps` 保留作兼容投影，
 * 本地语句则直接按源码事实进入 item 流，避免从消息注释反推绑定。
 */
export function buildRoleItems(
  roleName: string,
  parameters: readonly RoleParameter[],
  steps: readonly MessageStep[],
  facts: readonly ProcessFact[],
  roleIndex = -1,
): { items: RoleItem[]; bindings: Binding[]; steps: MessageStep[] } {
  const bindings: Binding[] = parameters.map((parameter, index) => ({
    id: `${roleName}:parameter:${index}:${parameter.name}`,
    roleName,
    name: parameter.name,
    kind: 'parameter',
    ...(parameter.typeName === undefined ? {} : { typeName: parameter.typeName }),
    span: steps[0]?.span ?? emptySpan(),
  }));
  // 作用域 = 帧栈：frames[0] 是角色级，每个分支臂压一帧，引用自内向外取最近同名绑定。
  const frames: Array<Map<string, string>> = [new Map(parameters.map((parameter, index) => [parameter.name, bindings[index].id]))];
  const branchParents: number[] = [];
  const lookup = makeLookup(frames);
  const visibleNames = (): Set<string> => new Set(frames.flatMap((frame) => [...frame.keys()]));
  const items: RoleItem[] = [];

  const addBinding = (
    name: string,
    kind: Binding['kind'],
    span: SourceSpan,
    typeName: string | undefined,
    itemId: string,
  ): Binding => {
    const binding: Binding = {
      id: `${roleName}:${kind}:${span.start.offset}:${name}`,
      roleName,
      name,
      kind,
      ...(typeName === undefined ? {} : { typeName }),
      span,
      itemId,
    };
    bindings.push(binding);
    frames[frames.length - 1].set(name, binding.id);
    return binding;
  };

  for (const fact of facts) {
    if (fact.kind === 'message') {
      const step = steps[fact.stepIndex];
      if (step === undefined) continue;
      const messageId = `${roleName}:message:${fact.stepIndex}`;
      const priorLookup = makeLookup(frames.map((frame) => new Map(frame)));
      const bindingIds: string[] = [];
      let term: PvTerm;
      if (step.direction === 'in') {
        const patternNames = collectPatternVariables(step.term);
        const patternBindings = new Map<string, Binding>();
        for (const name of patternNames) {
          const variable = findVariable(step.term, name);
          const binding = addBinding(name, 'in', step.span, variable?.typeName, messageId);
          patternBindings.set(name, binding);
          bindingIds.push(binding.id);
        }
        // 绑定名用新绑定，`=x` 用模式之前的作用域（不会被同名新绑定遮蔽）。
        term = resolvePattern(step.term, priorLookup, patternBindings);
      } else {
        term = resolveTerm(step.term, lookup);
      }
      const sourceStep: MessageStep = { ...step, term };
      const endpoint: MessageEndpoint = {
        kind: 'message',
        id: messageId,
        roleName,
        roleIndex,
        itemIndex: items.length,
        stepIndex: fact.stepIndex,
        direction: step.direction,
        channel: step.channel,
        wireTerm: term,
        term,
        bindingIds,
        span: step.span,
        sourceStep,
      };
      const message: MessageItem = {
        kind: 'message',
        id: endpoint.id,
        endpoint,
        span: step.span,
        replicated: step.annotations.replicated,
        parallel: step.annotations.parallel,
      };
      items.push(message);
      continue;
    }

    if (fact.kind === 'branch') {
      items.push({
        kind: 'branch',
        id: `${roleName}:branch:${fact.linkId}`,
        marker: 'branch',
        linkId: fact.linkId,
        guardText: fact.guardText,
        guardKind: fact.guardKind,
        guard: resolveCondition(parseConditionText(fact.guardText, visibleNames()), lookup),
        arm: 'then',
        span: fact.span,
        depth: branchParents.length,
      });
      branchParents.push(frames.length);
      frames.push(new Map());
      continue;
    }

    if (fact.kind === 'else' || fact.kind === 'join') {
      const parent = branchParents[branchParents.length - 1] ?? frames.length;
      frames.length = parent;
      if (fact.kind === 'else') {
        frames.push(new Map());
        items.push({
          kind: 'branch',
          id: `${roleName}:branch:${fact.linkId}:else`,
          marker: 'else',
          linkId: fact.linkId,
          arm: 'else',
          span: fact.span,
          depth: branchParents.length - 1,
          empty: fact.empty,
        });
        continue;
      }
      branchParents.pop();
      items.push({
        kind: 'branch',
        id: `${roleName}:branch:${fact.linkId}:join`,
        marker: 'join',
        linkId: fact.linkId,
        arm: 'main',
        span: fact.span,
        depth: branchParents.length,
      });
      continue;
    }

    if (fact.kind === 'new') {
      const itemId = `${roleName}:item:${items.length}:new`;
      const binding = addBinding(fact.fresh.name, 'new', fact.fresh.span, fact.fresh.typeName, itemId);
      items.push({
        kind: 'local',
        id: itemId,
        operation: 'new',
        span: fact.fresh.span,
        text: fact.fresh.text,
        name: fact.fresh.name,
        bindingId: binding.id,
        bindingIds: [binding.id],
      });
      continue;
    }

    if (fact.kind === 'let' || fact.kind === 'get') {
      const itemId = `${roleName}:item:${items.length}:${fact.kind}`;
      const priorLookup = makeLookup(frames.map((frame) => new Map(frame)));
      const bindingIds: string[] = [];
      const patternBindings = new Map<string, Binding>();
      for (const name of fact.boundNames) {
        const variable = findVariable(fact.pattern, name);
        const binding = addBinding(name, fact.kind, fact.span, variable?.typeName, itemId);
        patternBindings.set(name, binding);
        bindingIds.push(binding.id);
      }
      const pattern = resolvePattern(fact.pattern, priorLookup, patternBindings);
      const term = fact.kind === 'let' ? resolveTerm(fact.term, priorLookup) : undefined;
      items.push({
        kind: 'local',
        id: itemId,
        operation: fact.kind,
        span: fact.span,
        text: fact.text,
        bindingId: bindingIds[0],
        bindingIds,
        pattern,
        ...(term === undefined ? {} : { term }),
      });
      continue;
    }

    if (fact.kind === 'insert') {
      items.push({
        kind: 'local',
        id: `${roleName}:item:${items.length}:insert`,
        operation: 'insert',
        span: fact.span,
        text: fact.text,
        bindingIds: [],
      });
      continue;
    }

    if (fact.kind === 'event') {
      const args = fact.args.map((arg) => resolveTerm(arg, lookup));
      items.push({
        kind: 'event',
        id: `${roleName}:event:${fact.event.span.start.offset}`,
        name: fact.event.name,
        args,
        ...(args[0] === undefined ? {} : { term: args[0] }),
        text: fact.event.text,
        span: fact.event.span,
      });
    }
  }

  return { items, bindings, steps: [...steps] };
}

function collectPatternVariables(term: PvTerm): string[] {
  const names: string[] = [];
  const visit = (current: PvTerm, insideEquality = false): void => {
    if (current.kind === 'variable') {
      if (!insideEquality && !names.includes(current.name)) names.push(current.name);
      return;
    }
    if (current.kind === 'equality') {
      visit(current.term, true);
      return;
    }
    if (current.kind === 'application') current.args.forEach((child) => visit(child, insideEquality));
    if (current.kind === 'tuple') current.items.forEach((child) => visit(child, insideEquality));
  };
  visit(term);
  return names;
}

/** 作用域查询：帧栈自内向外取最近同名绑定。 */
type BindingLookup = (name: string) => string | undefined;

function makeLookup(frames: readonly ReadonlyMap<string, string>[]): BindingLookup {
  return (name) => {
    for (let index = frames.length - 1; index >= 0; index--) {
      const hit = frames[index].get(name);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
}

function resolvePattern(
  term: PvTerm,
  lookup: BindingLookup,
  introduced: ReadonlyMap<string, Binding>,
): PvTerm {
  if (term.kind === 'variable') {
    const bindingId = introduced.get(term.name)?.id ?? lookup(term.name);
    return bindingId === undefined ? term : { ...term, bindingId };
  }
  if (term.kind === 'equality') return { ...term, term: resolveTerm(term.term, lookup) };
  if (term.kind === 'application') return { ...term, args: term.args.map((child) => resolvePattern(child, lookup, introduced)) };
  if (term.kind === 'tuple') return { ...term, items: term.items.map((child) => resolvePattern(child, lookup, introduced)) };
  return resolveTerm(term, lookup);
}

function resolveTerm(term: PvTerm, lookup: BindingLookup): PvTerm {
  if (term.kind === 'variable') {
    const bindingId = lookup(term.name);
    return bindingId === undefined ? term : { ...term, bindingId };
  }
  if (term.kind === 'application') return { ...term, args: term.args.map((child) => resolveTerm(child, lookup)) };
  if (term.kind === 'tuple') return { ...term, items: term.items.map((child) => resolveTerm(child, lookup)) };
  if (term.kind === 'conditional') {
    return {
      ...term,
      condition: resolveCondition(term.condition, lookup),
      thenTerm: resolveTerm(term.thenTerm, lookup),
      elseTerm: resolveTerm(term.elseTerm, lookup),
    };
  }
  if (term.kind === 'equality') return { ...term, term: resolveTerm(term.term, lookup) };
  return term;
}

function resolveCondition(condition: Condition, lookup: BindingLookup): Condition {
  if (condition.kind === 'comparison') {
    return {
      ...condition,
      left: resolveTerm(condition.left, lookup),
      right: resolveTerm(condition.right, lookup),
    };
  }
  if (condition.kind === 'compound') {
    return { ...condition, clauses: condition.clauses.map((clause) => resolveCondition(clause, lookup)) };
  }
  return condition;
}

function findVariable(term: PvTerm, name: string): Extract<PvTerm, { kind: 'variable' }> | undefined {
  let found: Extract<PvTerm, { kind: 'variable' }> | undefined;
  visitTerm(term, (current) => {
    if (found === undefined && current.kind === 'variable' && current.name === name) found = current;
  });
  return found;
}

function visitTerm(term: PvTerm, visit: (term: PvTerm) => void): void {
  visit(term);
  switch (term.kind) {
    case 'application':
      term.args.forEach((child) => visitTerm(child, visit));
      return;
    case 'tuple':
      term.items.forEach((child) => visitTerm(child, visit));
      return;
    case 'conditional':
      visitTerm(term.thenTerm, visit);
      visitTerm(term.elseTerm, visit);
      return;
    case 'equality':
      visitTerm(term.term, visit);
      return;
    default:
      return;
  }
}

function emptySpan(): SourceSpan {
  const position = { offset: 0, line: 1, column: 1 };
  return { start: position, end: position };
}

/** 给后续布局使用的条件表达式解析入口，保持 parser 内部 helper 可测试。 */
export function parseCondition(source: string, scope: ReadonlySet<string> = new Set()): Condition {
  return parseConditionText(source, scope);
}
