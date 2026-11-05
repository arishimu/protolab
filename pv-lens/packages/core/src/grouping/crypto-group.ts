/**
 * 密码操作组派生：从 `ParseResult` 的角色 item 流中识别每一个密码操作出现，
 * 按词项结构建立父子嵌套，并保留源码区间与稳定 id。
 *
 * 纯函数：不读 DOM、不改写 `ParseResult`、不依赖布局坐标。用户覆盖以
 * `组 id → 操作种类` 的会话内映射传入，只改变派生结果，不回写 `.pv`。
 */

import type {
  BranchItem,
  Condition,
  EventItem,
  LocalItem,
  MessageItem,
  ParseResult,
  PvRole,
  PvTerm,
  SourceSpan,
  TermReference,
} from '../parser/model.js';
import { renderTerm } from '../symbolic-term.js';
import {
  buildOperationRegistry,
  type Confidence,
  type GroupingOrigin,
  type OperationDescriptor,
  type OperationDirection,
  type OperationKind,
  type OperationRegistry,
} from './operation-registry.js';

/** 用户覆盖后的置信度显示为「用户声明」，不再是自动置信度。 */
export type GroupConfidence = Confidence | 'user';

export interface CryptoOperationGroup {
  id: string;
  roleName: string;
  /** 方法盒所属的 item 稳定 id；布局按它把组挂回值层链。 */
  itemId: string;
  /** item 内词项路径（构造 / 元组参数下标；条件分支带 then/else 段）。 */
  nodePath: string;
  /** 该组方法盒的构造子名，审计面板显示底层 `fun`/`reduc` 名称。 */
  functor: string;
  /** 词项的符号化渲染文本，供布局匹配嵌套派生芯片。 */
  termText: string;
  kind: OperationKind;
  direction: OperationDirection;
  origin: GroupingOrigin | 'user';
  confidence: GroupConfidence;
  /** 本组自己的方法盒与值方块 id；不含子组成员。 */
  members: readonly string[];
  operands: { payload?: TermReference; key?: TermReference };
  sourceSpan: SourceSpan;
  /** 自动分类命中的方程源码区间（名称启发时为 undefined）。 */
  equationSpan?: SourceSpan;
  parentId: string | null;
  /** 折叠时隐藏的成员总数（含全部子组）。 */
  hiddenCount: number;
  /** 组产出、且在本 item 之后仍被引用的绑定；折叠时以幽灵值块保留。 */
  ghostBindingIds: readonly string[];
}

export interface CryptoGroupOptions {
  /** 稳定组 id → 用户声明的操作种类；仅存会话内存。 */
  overrides?: ReadonlyMap<string, OperationKind> | Readonly<Record<string, OperationKind>>;
}

interface MutableGroup {
  id: string;
  roleName: string;
  itemId: string;
  itemIndex: number;
  nodePath: string;
  functor: string;
  termText: string;
  kind: OperationKind;
  direction: OperationDirection;
  origin: GroupingOrigin | 'user';
  confidence: GroupConfidence;
  members: string[];
  operands: { payload?: TermReference; key?: TermReference };
  sourceSpan: SourceSpan;
  equationSpan?: SourceSpan;
  parentId: string | null;
  children: MutableGroup[];
  hiddenCount: number;
  ghostBindingIds: string[];
}

/**
 * 派生全部密码操作组，按「角色顺序 → item 顺序 → 词项深度优先」输出。
 * 未识别函数不产生组；其子词项仍会继续遍历，最近的已识别祖先是父组。
 */
export function deriveCryptoGroups(
  result: ParseResult,
  options: CryptoGroupOptions = {},
): readonly CryptoOperationGroup[] {
  const registry = buildOperationRegistry(result);
  const roles: PvRole[] = [...result.roles, ...(result.mainProcess === null ? [] : [result.mainProcess])];
  const groups: MutableGroup[] = [];

  for (const role of roles) {
    const roleGroups: MutableGroup[] = [];
    role.items.forEach((item, itemIndex) => {
      roleGroups.push(...deriveItemGroups(role, item, itemIndex, registry, options));
    });
    resolveGhostBindings(role, roleGroups);
    groups.push(...roleGroups);
  }

  resolveHiddenCounts(groups);
  return groups.map(toPublicGroup);
}

function deriveItemGroups(
  role: PvRole,
  item: MessageItem | LocalItem | EventItem | BranchItem,
  itemIndex: number,
  registry: OperationRegistry,
  options: CryptoGroupOptions,
): MutableGroup[] {
  const groups: MutableGroup[] = [];
  const base = {
    roleName: role.name,
    itemId: item.id,
    itemIndex,
    itemSpan: item.span,
    registry,
    overrides: options.overrides,
    parent: null,
  } as const;

  if (item.kind === 'message') {
    // 接收模式是匹配模式而非执行中的密码操作；只对发出的词项建组。
    if (item.endpoint.direction === 'out') {
      visitTerm(item.endpoint.term, { ...base, path: '0', groups });
    }
    return groups;
  }

  if (item.kind === 'event') {
    item.args.forEach((arg, index) => {
      visitTerm(arg, { ...base, path: String(index), groups });
    });
    return groups;
  }

  if (item.kind === 'branch') {
    if (item.marker === 'branch' && item.guard !== undefined) {
      visitCondition(item.guard, { ...base, path: '0', groups });
    }
    return groups;
  }

  if (item.kind !== 'local' || item.operation !== 'let' || item.term === undefined) return groups;

  visitTerm(item.term, { ...base, path: '0', groups });

  // `let x = op(...)` 的输出值方块属于顶层操作；条件/元组等复杂形态不猜归属。
  if (item.term.kind === 'application') {
    const root = groups.find((group) => group.parentId === null);
    if (root !== undefined) {
      const outputIds = new Set(item.bindingIds);
      if (item.pattern !== undefined) {
        for (const bindingId of bindingRefsOfTerm(item.pattern)) {
          if (!outputIds.has(bindingId)) pushMember(root.members, `value:${bindingId}:pattern`);
        }
      }
      for (const bindingId of outputIds) {
        pushMember(root.members, `value:${bindingId}:output`);
      }
    }
  }
  return groups;
}

interface VisitContext {
  roleName: string;
  itemId: string;
  itemIndex: number;
  itemSpan: SourceSpan;
  registry: OperationRegistry;
  overrides: CryptoGroupOptions['overrides'];
  parent: MutableGroup | null;
  path: string;
  groups: MutableGroup[];
}

function visitTerm(term: PvTerm, context: VisitContext): void {
  switch (term.kind) {
    case 'application': {
      const descriptor = context.registry.lookup(term.functor);
      let parent = context.parent;
      if (descriptor !== undefined && descriptor.kind !== 'unknown') {
        parent = createGroup(term, descriptor, context);
        context.groups.push(parent);
        if (context.parent !== null) context.parent.children.push(parent);
      }
      term.args.forEach((arg, index) => {
        visitTerm(arg, { ...context, parent, path: `${context.path}.${index}` });
      });
      return;
    }
    case 'tuple':
      term.items.forEach((child, index) => {
        visitTerm(child, { ...context, path: `${context.path}.${index}` });
      });
      return;
    case 'conditional':
      visitCondition(term.condition, { ...context, path: `${context.path}.cond` });
      visitTerm(term.thenTerm, { ...context, path: `${context.path}.then` });
      visitTerm(term.elseTerm, { ...context, path: `${context.path}.else` });
      return;
    case 'equality':
      visitTerm(term.term, context);
      return;
    default:
      return;
  }
}

function visitCondition(condition: Condition, context: VisitContext): void {
  if (condition.kind === 'comparison') {
    visitTerm(condition.left, { ...context, path: `${context.path}.left` });
    visitTerm(condition.right, { ...context, path: `${context.path}.right` });
    return;
  }
  if (condition.kind === 'compound') {
    condition.clauses.forEach((clause, index) => {
      visitCondition(clause, { ...context, path: `${context.path}.${index}` });
    });
  }
}

function createGroup(term: Extract<PvTerm, { kind: 'application' }>, descriptor: OperationDescriptor, context: VisitContext): MutableGroup {
  const methodId = `${context.itemId}:method:${context.path}`;
  const id = `${context.roleName}:group:${methodId}@${context.itemSpan.start.offset}`;
  const overrideKind = readOverride(context.overrides, id);
  const members: string[] = [];
  pushMember(members, methodId);
  for (const bindingId of collectGroupValueRefs(term, context.registry)) {
    pushMember(members, `value:${bindingId}:reference`);
  }

  return {
    id,
    roleName: context.roleName,
    itemId: context.itemId,
    itemIndex: context.itemIndex,
    nodePath: context.path,
    functor: term.functor,
    termText: renderTerm(term),
    kind: overrideKind ?? descriptor.kind,
    direction: descriptor.direction,
    origin: overrideKind === undefined ? descriptor.origin : 'user',
    confidence: overrideKind === undefined ? descriptor.confidence : 'user',
    members,
    operands: operandsOf(term, context.itemSpan),
    sourceSpan: context.itemSpan,
    ...(descriptor.equationSpan === undefined ? {} : { equationSpan: descriptor.equationSpan }),
    parentId: context.parent === null ? null : context.parent.id,
    children: [],
    hiddenCount: 0,
    ghostBindingIds: [],
  };
}

function operandsOf(term: Extract<PvTerm, { kind: 'application' }>, span: SourceSpan): { payload?: TermReference; key?: TermReference } {
  const payload = term.args[0];
  const key = term.args[1];
  return {
    ...(payload === undefined ? {} : { payload: { term: payload, span } }),
    ...(key === undefined ? {} : { key: { term: key, span } }),
  };
}

function readOverride(overrides: CryptoGroupOptions['overrides'], id: string): OperationKind | undefined {
  if (overrides === undefined) return undefined;
  if (typeof (overrides as ReadonlyMap<string, OperationKind>).get === 'function') {
    return (overrides as ReadonlyMap<string, OperationKind>).get(id);
  }
  const record = overrides as Readonly<Record<string, OperationKind>>;
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined;
}

function pushMember(members: string[], member: string): void {
  if (!members.includes(member)) members.push(member);
}

/**
 * 计算根组产出、且在该 item 之后仍被引用的绑定。折叠时这些绑定必须以幽灵值块
 * 留在组下方，否则同色同值身份会在折叠后断开（不变量 I6）。
 */
function resolveGhostBindings(role: PvRole, groups: readonly MutableGroup[]): void {
  const refsByItem = role.items.map(bindingRefsOfItem);
  const refsAfter = new Map<number, ReadonlySet<string>>();
  let suffix = new Set<string>();
  for (let index = role.items.length - 1; index >= 0; index -= 1) {
    refsAfter.set(index, suffix);
    suffix = new Set([...suffix, ...(refsByItem[index] ?? [])]);
  }

  for (const group of groups) {
    if (group.parentId !== null) continue;
    const item = role.items[group.itemIndex];
    if (item === undefined || item.kind !== 'local' || item.operation !== 'let') continue;
    const roots = groups.filter((candidate) => candidate.itemIndex === group.itemIndex && candidate.parentId === null);
    if (roots.length !== 1) continue;
    const later = refsAfter.get(group.itemIndex) ?? new Set<string>();
    group.ghostBindingIds = item.bindingIds.filter((bindingId) => later.has(bindingId));
  }
}

function bindingRefsOfTerm(term: PvTerm | undefined): string[] {
  const refs = new Set<string>();
  const walkTerm = (current: PvTerm | undefined): void => {
    if (current === undefined) return;
    switch (current.kind) {
      case 'variable':
        if (current.bindingId !== undefined) refs.add(current.bindingId);
        return;
      case 'application':
        current.args.forEach(walkTerm);
        return;
      case 'tuple':
        current.items.forEach(walkTerm);
        return;
      case 'conditional':
        walkCondition(current.condition);
        walkTerm(current.thenTerm);
        walkTerm(current.elseTerm);
        return;
      case 'equality':
        walkTerm(current.term);
        return;
      default:
        return;
    }
  };
  const walkCondition = (condition: Condition | undefined): void => {
    if (condition === undefined) return;
    if (condition.kind === 'comparison') {
      walkTerm(condition.left);
      walkTerm(condition.right);
      return;
    }
    if (condition.kind === 'compound') condition.clauses.forEach(walkCondition);
  };
  walkTerm(term);
  return [...refs];
}

function bindingRefsOfItem(item: MessageItem | LocalItem | EventItem | BranchItem): Set<string> {
  if (item.kind === 'message') return new Set(bindingRefsOfTerm(item.endpoint.term));
  if (item.kind === 'event') return new Set(item.args.flatMap((arg) => bindingRefsOfTerm(arg)));
  if (item.kind === 'branch') {
    if (item.guard === undefined) return new Set();
    if (item.guard.kind === 'comparison') {
      return new Set([...bindingRefsOfTerm(item.guard.left), ...bindingRefsOfTerm(item.guard.right)]);
    }
    if (item.guard.kind === 'compound') {
      return new Set(item.guard.clauses.flatMap((clause) => {
        if (clause.kind === 'comparison') {
          return [...bindingRefsOfTerm(clause.left), ...bindingRefsOfTerm(clause.right)];
        }
        return [];
      }));
    }
    return new Set();
  }
  return new Set([...bindingRefsOfTerm(item.term), ...bindingRefsOfTerm(item.pattern)]);
}

/**
 * 组自身的输入值：递归收集实参中的绑定引用，但遇到已识别的嵌套操作即停——
 * 子组的输入属于子组，父组 members 不重复计入。
 */
function collectGroupValueRefs(
  term: Extract<PvTerm, { kind: 'application' }>,
  registry: OperationRegistry,
): string[] {
  const refs = new Set<string>();
  const walk = (current: PvTerm): void => {
    switch (current.kind) {
      case 'variable':
        if (current.bindingId !== undefined) refs.add(current.bindingId);
        return;
      case 'application':
        if (registry.lookup(current.functor) !== undefined) return;
        current.args.forEach(walk);
        return;
      case 'tuple':
        current.items.forEach(walk);
        return;
      case 'conditional':
        if (current.condition.kind === 'comparison') {
          walk(current.condition.left);
          walk(current.condition.right);
        } else if (current.condition.kind === 'compound') {
          current.condition.clauses.forEach((clause) => {
            if (clause.kind === 'comparison') {
              walk(clause.left);
              walk(clause.right);
            }
          });
        }
        walk(current.thenTerm);
        walk(current.elseTerm);
        return;
      case 'equality':
        walk(current.term);
        return;
      default:
        return;
    }
  };
  term.args.forEach(walk);
  return [...refs];
}

function resolveHiddenCounts(groups: readonly MutableGroup[]): void {
  for (const group of groups) {
    let hidden = group.members.length;
    for (const child of group.children) {
      resolveHiddenCounts([child]);
      hidden += child.hiddenCount;
    }
    group.hiddenCount = hidden;
  }
}

function hiddenCountOf(group: MutableGroup): number {
  return group.hiddenCount;
}

function toPublicGroup(group: MutableGroup): CryptoOperationGroup {
  return {
    id: group.id,
    roleName: group.roleName,
    itemId: group.itemId,
    nodePath: group.nodePath,
    functor: group.functor,
    termText: group.termText,
    kind: group.kind,
    direction: group.direction,
    origin: group.origin,
    confidence: group.confidence,
    members: group.members,
    operands: group.operands,
    sourceSpan: group.sourceSpan,
    ...(group.equationSpan === undefined ? {} : { equationSpan: group.equationSpan }),
    parentId: group.parentId,
    hiddenCount: hiddenCountOf(group),
    ghostBindingIds: group.ghostBindingIds,
  };
}
