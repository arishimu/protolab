import type { ProcessFact } from './process.js';
import type { MessageStep } from './model.js';
import type {
  Binding,
  BranchItem,
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
  const visible = new Map(parameters.map((parameter, index) => [parameter.name, bindings[index].id]));
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
    visible.set(name, binding.id);
    return binding;
  };

  for (const fact of facts) {
    if (fact.kind === 'message') {
      const step = steps[fact.stepIndex];
      if (step === undefined) continue;
      const messageId = `${roleName}:message:${fact.stepIndex}`;
      const priorVisible = new Map(visible);
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
        term = resolvePattern(step.term, priorVisible, patternBindings);
      } else {
        term = resolveTerm(step.term, priorVisible);
      }
      const sourceStep: MessageStep = { ...step, term };
      if (step.annotations.guards.length > 0) {
        for (const guard of step.annotations.guards) {
          if (guard.kind !== 'if' && guard.kind !== 'get') continue;
          const condition = resolveCondition(
            parseConditionText(guard.text, new Set(priorVisible.keys())),
            priorVisible,
          );
          const branch: BranchItem = {
            kind: 'branch',
            id: `${roleName}:branch:${guard.span.start.offset}`,
            marker: 'branch',
            guard: condition,
            arm: 'then',
            span: guard.span,
            depth: 0,
          };
          items.push(branch);
        }
      }
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
      const priorVisible = new Map(visible);
      const bindingIds: string[] = [];
      const patternBindings = new Map<string, Binding>();
      for (const name of fact.boundNames) {
        const variable = findVariable(fact.pattern, name);
        const binding = addBinding(name, fact.kind, fact.span, variable?.typeName, itemId);
        patternBindings.set(name, binding);
        bindingIds.push(binding.id);
      }
      const pattern = resolvePattern(fact.pattern, priorVisible, patternBindings);
      const term = fact.kind === 'let' ? resolveTerm(fact.term, priorVisible) : undefined;
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
      const args = fact.args.map((arg) => resolveTerm(arg, visible));
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

function resolvePattern(
  term: PvTerm,
  visible: ReadonlyMap<string, string>,
  introduced: ReadonlyMap<string, Binding>,
): PvTerm {
  if (term.kind === 'variable') {
    const bindingId = introduced.get(term.name)?.id ?? visible.get(term.name);
    return bindingId === undefined ? term : { ...term, bindingId };
  }
  if (term.kind === 'equality') return { ...term, term: resolveTerm(term.term, visible) };
  if (term.kind === 'application') return { ...term, args: term.args.map((child) => resolvePattern(child, visible, introduced)) };
  if (term.kind === 'tuple') return { ...term, items: term.items.map((child) => resolvePattern(child, visible, introduced)) };
  return resolveTerm(term, visible);
}

function resolveTerm(term: PvTerm, visible: ReadonlyMap<string, string>): PvTerm {
  if (term.kind === 'variable') {
    const bindingId = visible.get(term.name);
    return bindingId === undefined ? term : { ...term, bindingId };
  }
  if (term.kind === 'application') return { ...term, args: term.args.map((child) => resolveTerm(child, visible)) };
  if (term.kind === 'tuple') return { ...term, items: term.items.map((child) => resolveTerm(child, visible)) };
  if (term.kind === 'conditional') {
    return {
      ...term,
      condition: resolveCondition(term.condition, visible),
      thenTerm: resolveTerm(term.thenTerm, visible),
      elseTerm: resolveTerm(term.elseTerm, visible),
    };
  }
  if (term.kind === 'equality') return { ...term, term: resolveTerm(term.term, visible) };
  return term;
}

function resolveCondition(condition: Condition, visible: ReadonlyMap<string, string>): Condition {
  if (condition.kind === 'comparison') {
    return {
      ...condition,
      left: resolveTerm(condition.left, visible),
      right: resolveTerm(condition.right, visible),
    };
  }
  if (condition.kind === 'compound') {
    return { ...condition, clauses: condition.clauses.map((clause) => resolveCondition(clause, visible)) };
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
