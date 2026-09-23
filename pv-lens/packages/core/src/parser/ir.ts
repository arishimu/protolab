import type {
  Binding,
  BranchItem,
  Condition,
  EventItem,
  MessageItem,
  MessageEndpoint,
  PvTerm,
  RoleItem,
  RoleParameter,
  SourceSpan,
} from './model.js';
import type { MessageStep } from './model.js';
import { parseConditionText } from './condition.js';

/**
 * 从兼容的消息步骤投影构造 v2 item 流。旧解析器的步骤顺序仍是唯一排序依据，
 * 因而该适配层不会改变现有 API 的消息顺序。
 */
export function buildRoleItems(
  roleName: string,
  parameters: readonly RoleParameter[],
  steps: readonly MessageStep[],
  roleIndex = -1,
): { items: RoleItem[]; bindings: Binding[] } {
  const bindings: Binding[] = parameters.map((parameter, index) => ({
    id: `${roleName}:parameter:${index}:${parameter.name}`,
    roleName,
    name: parameter.name,
    kind: 'parameter',
    ...(parameter.typeName === undefined ? {} : { typeName: parameter.typeName }),
    span: steps[0]?.span ?? emptySpan(),
  }));
  const items: RoleItem[] = [];
  const visible = new Map(parameters.map((parameter, index) => [parameter.name, bindings[index].id]));
  let ordinal = 0;

  for (const [stepIndex, step] of steps.entries()) {
    for (const fresh of step.annotations.freshNames) {
      const binding = {
        id: `${roleName}:new:${fresh.name}:${fresh.span.start.offset}`,
        roleName,
        name: fresh.name,
        kind: 'new' as const,
        ...(fresh.typeName === undefined ? {} : { typeName: fresh.typeName }),
        span: fresh.span,
      };
      bindings.push(binding);
      visible.set(fresh.name, binding.id);
      items.push({
        kind: 'local',
        id: `${roleName}:item:${ordinal++}:new`,
        operation: 'new',
        span: fresh.span,
        text: fresh.text,
        name: fresh.name,
        bindingId: binding.id,
      });
    }

    for (const guard of step.annotations.guards) {
      const condition = guard.kind === 'if' || guard.kind === 'get'
        ? parseConditionText(guard.text, new Set(visible.keys()))
        : undefined;
      const branchId = `${roleName}:branch:${guard.span.start.offset}`;
      const branch: BranchItem = {
        kind: 'branch',
        id: branchId,
        marker: 'branch',
        ...(condition === undefined ? {} : { guard: condition }),
        arm: 'then',
        span: guard.span,
        depth: 0,
      };
      items.push(branch);
      if (guard.kind === 'let-pattern') {
        items.push({
          kind: 'local',
          id: `${roleName}:item:${ordinal++}:let`,
          operation: 'let',
          span: guard.span,
          text: guard.text,
        });
      }
    }

    const endpoint: MessageEndpoint = {
      kind: 'message',
      id: `${roleName}:message:${stepIndex}`,
      roleName,
      roleIndex,
      itemIndex: items.length,
      stepIndex,
      direction: step.direction,
      channel: step.channel,
      wireTerm: step.term,
      term: step.term,
      span: step.span,
      sourceStep: step,
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

    if (step.direction === 'in') {
      for (const name of collectVariableNames(step.term)) {
        if (visible.has(name)) continue;
        const variable = findVariable(step.term, name);
        const binding: Binding = {
          id: `${roleName}:in:${stepIndex}:${name}`,
          roleName,
          name,
          kind: 'in',
          ...(variable?.typeName === undefined ? {} : { typeName: variable.typeName }),
          span: step.span,
          itemId: message.id,
        };
        bindings.push(binding);
        visible.set(name, binding.id);
      }
    }

    for (const event of step.annotations.events) {
      const eventItem: EventItem = {
        kind: 'event',
        id: `${roleName}:event:${event.span.start.offset}`,
        name: event.name,
        text: event.text,
        span: event.span,
      };
      items.push(eventItem);
    }
  }

  return { items, bindings };
}

function collectVariableNames(term: PvTerm): string[] {
  const result: string[] = [];
  visitTerm(term, (current) => {
    if (current.kind === 'variable' && !result.includes(current.name)) result.push(current.name);
  });
  return result;
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
