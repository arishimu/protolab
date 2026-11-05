/**
 * 交换段引擎（ADR-0018 / 阶段 3）。
 *
 * 顶点是「完整消息」：由配对边连通的全部端点合并为一条逻辑消息；未配对端点各自成条。
 * 因果边来自配对（发送端消息 → 接收端消息）与同角色相邻消息步的本地序。
 * 段只保存消息集合，不保存端点；候选范围先做因果凸闭包，再逐项校验 V1 限制。
 *
 * 纯函数：不读文件、不依赖 DOM；段状态由调用方保存在会话内存。
 */

import type { MessagePairing } from '../message-pairing.js';
import type { MessageItem, ParseResult, PvRole, SourceSpan } from '../parser/model.js';
import { narrativeRoleOrder } from '../pairing.js';
import { renderTerm } from '../symbolic-term.js';

export interface ExchangeMessageEndpoint {
  /** MessageItem 的稳定 id。 */
  id: string;
  roleIndex: number;
  roleName: string;
  stepIndex: number;
  itemIndex: number;
  direction: 'out' | 'in';
  channelName: string;
  termText: string;
  /** 是否出现在任一条配对边中。 */
  paired: boolean;
  span: SourceSpan;
}

export interface ExchangeMessage {
  id: string;
  /** 因果拓扑序中的 1 基序号，与画布 M 序号同源。 */
  sequence: number;
  endpoints: readonly ExchangeMessageEndpoint[];
  roles: readonly string[];
  channels: readonly string[];
  termText: string;
  paired: boolean;
  sourceSpan: SourceSpan;
}

export type ExchangeDagEdgeKind = 'pairing' | 'local-order';

export interface ExchangeDagEdge {
  from: string;
  to: string;
  kind: ExchangeDagEdgeKind;
}

export interface ExchangeDag {
  messages: readonly ExchangeMessage[];
  edges: readonly ExchangeDagEdge[];
  /** 确定性拓扑序（SCC 收缩后，环内按源码序展开）。 */
  topologicalOrder: readonly string[];
  /** 有环 SCC 的消息 id 全集。 */
  cycles: readonly (readonly string[])[];
}

export interface ExchangeSegmentEvent {
  id: string;
  roleName: string;
  name: string;
  span: SourceSpan;
}

export interface ExchangeSegment {
  id: string;
  /** 完整消息 id（拓扑序）。 */
  messageIds: readonly string[];
  /** 段内全部消息端点（MessageItem id），布局据此隐藏消息端。 */
  endpointIds: readonly string[];
  roles: readonly string[];
  channels: readonly string[];
  origin: 'manual' | 'suggested';
  label: string | null;
  hiddenCounts: {
    messages: number;
    unpaired: number;
    branches: number;
    conflicts: number;
  };
  /** 段内被折叠的 item（消息端、本地步骤、分支标记）；事件不在此列。 */
  hiddenItemIds: readonly string[];
  /** 段内事件：不隐藏，以段头事件芯片保留。 */
  events: readonly ExchangeSegmentEvent[];
  firstSequence: number;
  lastSequence: number;
  sourceSpans: readonly SourceSpan[];
}

export type ExchangeSegmentCheckId =
  | 'contiguous'
  | 'whole'
  | 'convex'
  | 'parties'
  | 'channel'
  | 'overlap'
  | 'scc';

export interface ExchangeSegmentCheck {
  id: ExchangeSegmentCheckId;
  label: string;
  ok: boolean;
  reason?: string;
}

export interface ExchangeSegmentValidation {
  ok: boolean;
  idle: boolean;
  checks: readonly ExchangeSegmentCheck[];
  /** 因果凸闭包（拓扑序）。 */
  closureIds: readonly string[];
  /** 闭包比候选多出的消息（拓扑序）。 */
  missingIds: readonly string[];
}

export interface ExchangeSegmentOptions {
  existing?: readonly ExchangeSegment[];
  /** 切半模拟：这些消息按“只有发送端在段内”拒绝。 */
  cutMessageIds?: readonly string[];
  label?: string | null;
}

interface EndpointRecord extends ExchangeMessageEndpoint {
  refKey: string;
}

interface MessageOrderKey {
  id: string;
  sourceSpan: SourceSpan;
}

/** 从解析结果与配对结果构造逻辑消息因果 DAG。 */
export function buildExchangeDag(result: ParseResult, pairings: readonly MessagePairing[] = []): ExchangeDag {
  const roles = narrativeRoleOrder(result);
  const endpoints = collectEndpoints(roles);
  const endpointByKey = new Map(endpoints.map((endpoint) => [endpoint.refKey, endpoint]));
  const pairedKeys = new Set<string>();
  for (const pairing of pairings) {
    const outKey = refKeyOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex);
    const inKey = refKeyOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex);
    if (!endpointByKey.has(outKey) || !endpointByKey.has(inKey)) continue;
    pairedKeys.add(outKey);
    pairedKeys.add(inKey);
  }

  const union = new UnionFind(endpoints.map((endpoint) => endpoint.refKey));
  for (const pairing of pairings) {
    const outKey = refKeyOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex);
    const inKey = refKeyOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex);
    if (endpointByKey.has(outKey) && endpointByKey.has(inKey)) union.union(outKey, inKey);
  }

  const components = new Map<string, EndpointRecord[]>();
  for (const endpoint of endpoints) {
    const root = union.find(endpoint.refKey);
    const list = components.get(root) ?? [];
    list.push({ ...endpoint, paired: pairedKeys.has(endpoint.refKey) });
    components.set(root, list);
  }

  const messageByEndpointKey = new Map<string, string>();
  const drafts: Array<{
    id: string;
    endpoints: EndpointRecord[];
    sourceSpan: SourceSpan;
  }> = [];
  for (const members of components.values()) {
    const ordered = [...members].sort(compareEndpoint);
    const anchor = ordered[0];
    if (anchor === undefined) continue;
    const id = `message:${anchor.id}`;
    for (const member of ordered) messageByEndpointKey.set(member.refKey, id);
    drafts.push({
      id,
      endpoints: ordered,
      sourceSpan: {
        start: ordered.reduce((best, member) => member.span.start.offset < best.offset ? member.span.start : best, ordered[0]!.span.start),
        end: ordered.reduce((best, member) => member.span.end.offset > best.offset ? member.span.end : best, ordered[0]!.span.end),
      },
    });
  }

  // 因果边：配对边 + 同角色相邻消息步的本地序边。
  const edgeKeys = new Map<string, ExchangeDagEdge>();
  const addEdge = (from: string, to: string, kind: ExchangeDagEdgeKind): void => {
    if (from === to) return;
    const key = `${from}\u0000${to}`;
    const existing = edgeKeys.get(key);
    if (existing === undefined || (existing.kind === 'local-order' && kind === 'pairing')) {
      edgeKeys.set(key, { from, to, kind });
    }
  };
  for (const pairing of pairings) {
    const outKey = refKeyOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex);
    const inKey = refKeyOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex);
    const from = messageByEndpointKey.get(outKey);
    const to = messageByEndpointKey.get(inKey);
    if (from !== undefined && to !== undefined) addEdge(from, to, 'pairing');
  }
  roles.forEach((role, roleIndex) => {
    const messageItems = role.items.filter((item): item is MessageItem => item.kind === 'message');
    for (let index = 0; index + 1 < messageItems.length; index += 1) {
      const current = messageItems[index];
      const next = messageItems[index + 1];
      const from = messageByEndpointKey.get(refKeyOf(roleIndex, current.endpoint.stepIndex));
      const to = messageByEndpointKey.get(refKeyOf(roleIndex, next.endpoint.stepIndex));
      if (from !== undefined && to !== undefined) addEdge(from, to, 'local-order');
    }
  });

  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  const edges = [...edgeKeys.values()].sort((a, b) => compareMessageIds(a.from, b.from, byId) || compareMessageIds(a.to, b.to, byId));
  const adjacency = new Map<string, string[]>();
  for (const id of byId.keys()) adjacency.set(id, []);
  for (const edge of edges) {
    if (byId.has(edge.from) && byId.has(edge.to)) adjacency.get(edge.from)?.push(edge.to);
  }
  for (const list of adjacency.values()) list.sort((a, b) => compareMessageIds(a, b, byId));
  const sccs = stronglyConnected([...byId.keys()], adjacency, byId);
  const cycles = sccs.filter((scc) => scc.length > 1);
  const topologicalOrder = condensationOrder(sccs, adjacency, byId);

  const messages: ExchangeMessage[] = topologicalOrder.map((id, index) => {
    const draft = byId.get(id);
    if (draft === undefined) throw new Error(`missing exchange message ${id}`);
    const endpointRoles = [...new Set(draft.endpoints.map((endpoint) => endpoint.roleName))];
    const channels = [...new Set(draft.endpoints.map((endpoint) => endpoint.channelName))];
    return {
      id,
      sequence: index + 1,
      endpoints: draft.endpoints.map(({ refKey: _refKey, ...endpoint }) => endpoint),
      roles: endpointRoles,
      channels,
      termText: draft.endpoints.find((endpoint) => endpoint.direction === 'out')?.termText ?? draft.endpoints[0]?.termText ?? '',
      paired: draft.endpoints.some((endpoint) => endpoint.paired),
      sourceSpan: draft.sourceSpan,
    };
  });

  return { messages, edges, topologicalOrder, cycles };
}

/** 校验候选消息集合；空闲、非连续、非凸、跨信道、多方、重叠与 SCC 拆分都在这里给出原因。 */
export function validateExchangeSegment(
  dag: ExchangeDag,
  messageIds: readonly string[],
  options: ExchangeSegmentOptions = {},
): ExchangeSegmentValidation {
  const messageById = new Map(dag.messages.map((message) => [message.id, message]));
  const orderIndex = new Map(dag.topologicalOrder.map((id, index) => [id, index]));
  const selected = [...new Set(messageIds)].filter((id) => messageById.has(id));
  const unknown = messageIds.filter((id) => !messageById.has(id));
  if (selected.length === 0) {
    return { ok: false, idle: true, checks: [], closureIds: [], missingIds: [] };
  }
  const selectedSorted = [...selected].sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  const selectedSet = new Set(selectedSorted);
  const indices = selectedSorted.map((id) => orderIndex.get(id) ?? 0);
  const contiguous = unknown.length === 0 && indices.every((value, position) => position === 0 || value === indices[position - 1]! + 1);
  const cut = new Set(options.cutMessageIds ?? []);
  const cutSelected = selectedSorted.filter((id) => cut.has(id));
  const closure = convexClosure(dag, selectedSet);
  const closureSorted = dag.topologicalOrder.filter((id) => closure.has(id));
  const missingSorted = closureSorted.filter((id) => !selectedSet.has(id));

  const roles = new Set(selectedSorted.flatMap((id) => messageById.get(id)?.roles ?? []));
  const channels = new Set(selectedSorted.flatMap((id) => messageById.get(id)?.channels ?? []));
  const existing = options.existing ?? [];
  const overlaps = existing.filter((segment) => segment.messageIds.some((id) => selectedSet.has(id)));
  const splitCycles = dag.cycles.filter((scc) => {
    const inside = scc.filter((id) => selectedSet.has(id)).length;
    return inside > 0 && inside < scc.length;
  });

  const checks: ExchangeSegmentCheck[] = [
    {
      id: 'contiguous',
      label: '连续区间',
      ok: contiguous,
      ...(contiguous ? {} : { reason: unknown.length > 0 ? '包含不存在的消息。' : '选择在拓扑序上不连续；交换段必须是一段连续消息集合。' }),
    },
    {
      id: 'whole',
      label: '整条消息',
      ok: cutSelected.length === 0,
      ...(cutSelected.length === 0 ? {} : { reason: `切断消息：${cutSelected.map((id) => displayIdOf(dag, id)).join('、')} 只有发送端在段内；一条消息的全部端点必须同属一段。` }),
    },
    {
      id: 'convex',
      label: '因果凸',
      ok: contiguous && missingSorted.length === 0,
      ...(contiguous && missingSorted.length === 0
        ? {}
        : { reason: contiguous
          ? `因果凸闭包需要加入 ${missingSorted.map((id) => displayIdOf(dag, id)).join('、')}。`
          : '选择不连续，无法形成单一因果凸区间。' }),
    },
    {
      id: 'parties',
      label: '两方以内',
      ok: roles.size <= 2,
      ...(roles.size <= 2 ? {} : { reason: `段内涉及 ${String(roles.size)} 个角色；V1 仅允许两方交换段。` }),
    },
    {
      id: 'channel',
      label: '单信道',
      ok: channels.size <= 1,
      ...(channels.size <= 1 ? {} : { reason: `跨信道：段内消息涉及 ${[...channels].join(' 与 ')}；V1 仅允许单信道段。` }),
    },
    {
      id: 'overlap',
      label: '不与已有段重叠',
      ok: overlaps.length === 0,
      ...(overlaps.length === 0 ? {} : { reason: `与已有段「${overlaps[0]?.label ?? '未命名段'}」重叠；V1 不支持段中段。` }),
    },
    {
      id: 'scc',
      label: '冲突整体包含',
      ok: splitCycles.length === 0,
      ...(splitCycles.length === 0 ? {} : { reason: '顺序冲突环跨段边界；冲突必须整体包含或整体排除。' }),
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    idle: false,
    checks,
    closureIds: closureSorted,
    missingIds: missingSorted,
  };
}

/**
 * 校验通过后创建交换段。`messageIds` 必须是完整消息 id；若闭包更大，调用方应先扩展到闭包。
 * 段状态仅由调用方保存在会话内存，本函数不修改 `.pv` 或配对。
 */
export function createExchangeSegment(
  result: ParseResult,
  dag: ExchangeDag,
  messageIds: readonly string[],
  options: ExchangeSegmentOptions = {},
): { segment: ExchangeSegment | null; validation: ExchangeSegmentValidation } {
  const validation = validateExchangeSegment(dag, messageIds, options);
  if (!validation.ok) return { segment: null, validation };

  const messageById = new Map(dag.messages.map((message) => [message.id, message]));
  const selected = dag.topologicalOrder
    .filter((id) => validation.closureIds.includes(id))
    .map((id) => messageById.get(id))
    .filter((message): message is ExchangeMessage => message !== undefined);
  const roles = narrativeRoleOrder(result);
  const roleIndexByName = new Map(roles.map((role, index) => [role.name, index]));
  const selectedSet = new Set(selected.map((message) => message.id));
  const hiddenItemIds: string[] = [];
  const events: ExchangeSegmentEvent[] = [];
  const sourceSpans: SourceSpan[] = [];
  let branches = 0;
  let conflicts = 0;

  for (const role of roles) {
    const roleIndex = roleIndexByName.get(role.name) ?? -1;
    const indexes: number[] = [];
    role.items.forEach((item, itemIndex) => {
      if (item.kind !== 'message') return;
      const messageId = messageIdOfEndpoint(dag, roleIndex, item.endpoint.stepIndex);
      if (messageId !== undefined && selectedSet.has(messageId)) indexes.push(itemIndex);
    });
    if (indexes.length === 0) continue;
    const min = Math.min(...indexes);
    const max = Math.max(...indexes);
    for (let itemIndex = min; itemIndex <= max; itemIndex += 1) {
      const item = role.items[itemIndex];
      if (item === undefined) continue;
      if (item.kind === 'message') {
        const messageId = messageIdOfEndpoint(dag, roleIndex, item.endpoint.stepIndex);
        if (messageId !== undefined && selectedSet.has(messageId)) {
          hiddenItemIds.push(item.id);
          sourceSpans.push(item.span);
        }
        continue;
      }
      if (item.kind === 'event') {
        events.push({ id: item.id, roleName: role.name, name: item.name, span: item.span });
        continue;
      }
      if (item.kind === 'branch' || item.kind === 'local') {
        hiddenItemIds.push(item.id);
        sourceSpans.push(item.span);
        branches += 1;
      }
    }
  }

  for (const scc of dag.cycles) {
    if (scc.every((id) => selectedSet.has(id))) conflicts += 1;
  }

  const endpoints = selected.flatMap((message) => message.endpoints);
  const channelList = [...new Set(selected.flatMap((message) => message.channels))];
  const messageList = selected.map((message) => message.id);
  const uniqueHidden = [...new Set(hiddenItemIds)];
  const first = selected[0];
  const last = selected[selected.length - 1];
  if (first === undefined || last === undefined || messageList.length === 0) {
    return { segment: null, validation };
  }
  const segment: ExchangeSegment = {
    id: `segment:${first.id}::${last.id}`,
    messageIds: messageList,
    endpointIds: endpoints.map((endpoint) => endpoint.id),
    roles: [...new Set(selected.flatMap((message) => message.roles))],
    channels: channelList,
    origin: 'manual',
    label: options.label ?? null,
    hiddenCounts: {
      messages: messageList.length,
      unpaired: endpoints.filter((endpoint) => !endpoint.paired).length,
      branches,
      conflicts,
    },
    hiddenItemIds: uniqueHidden,
    events,
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    sourceSpans,
  };
  return { segment, validation };
}

/** 逻辑消息 id → 画布 M 序号；供布局保持折叠前后消息编号稳定。 */
export function exchangeMessageSequence(dag: ExchangeDag, messageId: string): number | undefined {
  return dag.messages.find((message) => message.id === messageId)?.sequence;
}

function collectEndpoints(roles: readonly PvRole[]): EndpointRecord[] {
  const endpoints: EndpointRecord[] = [];
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item, itemIndex) => {
      if (item.kind !== 'message') return;
      const endpointId = item.endpoint.id;
      endpoints.push({
        id: endpointId,
        roleIndex,
        roleName: role.name,
        stepIndex: item.endpoint.stepIndex,
        itemIndex,
        direction: item.endpoint.direction,
        channelName: renderTerm(item.endpoint.channel),
        termText: renderTerm(item.endpoint.term),
        paired: false,
        span: item.span,
        refKey: refKeyOf(roleIndex, item.endpoint.stepIndex),
      });
    });
  });
  return endpoints;
}

function messageIdOfEndpoint(dag: ExchangeDag, roleIndex: number, stepIndex: number): string | undefined {
  const key = refKeyOf(roleIndex, stepIndex);
  return dag.messages.find((message) => message.endpoints.some((endpoint) => refKeyOf(endpoint.roleIndex, endpoint.stepIndex) === key))?.id;
}

function convexClosure(dag: ExchangeDag, selected: ReadonlySet<string>): Set<string> {
  const reach = new Map<string, Set<string>>();
  for (const id of dag.topologicalOrder) reach.set(id, reachableFrom(id, dag));
  const closure = new Set(selected);
  for (const start of selected) {
    const forward = reach.get(start) ?? new Set<string>();
    for (const end of selected) {
      if (!forward.has(end)) continue;
      for (const candidate of forward) {
        if ((reach.get(candidate) ?? new Set<string>()).has(end)) closure.add(candidate);
      }
    }
  }
  return closure;
}

function reachableFrom(start: string, dag: ExchangeDag): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of dag.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const seen = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    stack.push(...(adjacency.get(id) ?? []));
  }
  return seen;
}

function stronglyConnected(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
  byId: ReadonlyMap<string, MessageOrderKey>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];

  const visit = (id: string): void => {
    indices.set(id, index);
    low.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id) ?? 0, indices.get(next) ?? 0));
      }
    }
    if (low.get(id) === indices.get(id)) {
      const component: string[] = [];
      for (;;) {
        const popped = stack.pop();
        if (popped === undefined) break;
        onStack.delete(popped);
        component.push(popped);
        if (popped === id) break;
      }
      result.push(component.sort((a, b) => compareMessageIds(a, b, byId)));
    }
  };
  for (const id of [...ids].sort((a, b) => compareMessageIds(a, b, byId))) {
    if (!indices.has(id)) visit(id);
  }
  return result;
}

function condensationOrder(
  sccs: readonly string[][],
  adjacency: ReadonlyMap<string, readonly string[]>,
  byId: ReadonlyMap<string, MessageOrderKey>,
): string[] {
  const componentOf = new Map<string, number>();
  sccs.forEach((scc, index) => scc.forEach((id) => componentOf.set(id, index)));
  const outgoing = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();
  sccs.forEach((_, index) => indegree.set(index, 0));
  for (const [from, list] of adjacency) {
    const fromComponent = componentOf.get(from);
    if (fromComponent === undefined) continue;
    for (const to of list) {
      const toComponent = componentOf.get(to);
      if (toComponent === undefined || toComponent === fromComponent) continue;
      const targets = outgoing.get(fromComponent) ?? new Set<number>();
      if (!targets.has(toComponent)) {
        targets.add(toComponent);
        outgoing.set(fromComponent, targets);
        indegree.set(toComponent, (indegree.get(toComponent) ?? 0) + 1);
      }
    }
  }
  const keyOfComponent = (index: number): string => sccs[index]?.[0] ?? '';
  const ready = sccs.map((_, index) => index).filter((index) => (indegree.get(index) ?? 0) === 0);
  ready.sort((a, b) => compareMessageIds(keyOfComponent(a), keyOfComponent(b), byId));
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) break;
    order.push(...(sccs[current] ?? []));
    const targets = [...(outgoing.get(current) ?? [])];
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if ((indegree.get(target) ?? 0) === 0) ready.push(target);
    }
    ready.sort((a, b) => compareMessageIds(keyOfComponent(a), keyOfComponent(b), byId));
  }
  // 防御：若 SCC 图仍有残余（不应发生），按源码序补齐，避免遗漏消息。
  for (const scc of sccs) for (const id of scc) if (!order.includes(id)) order.push(id);
  return order;
}

function compareEndpoint(a: EndpointRecord, b: EndpointRecord): number {
  return a.span.start.offset - b.span.start.offset || a.id.localeCompare(b.id);
}

function compareMessageIds(a: string, b: string, byId: ReadonlyMap<string, MessageOrderKey>): number {
  const left = byId.get(a);
  const right = byId.get(b);
  if (left === undefined || right === undefined) return a.localeCompare(b);
  return left.sourceSpan.start.offset - right.sourceSpan.start.offset || a.localeCompare(b);
}

function displayIdOf(dag: ExchangeDag, messageId: string): string {
  const message = dag.messages.find((candidate) => candidate.id === messageId);
  return message === undefined ? messageId : `M${String(message.sequence)}`;
}

function refKeyOf(roleIndex: number, stepIndex: number): string {
  return `${roleIndex}:${stepIndex}`;
}

class UnionFind {
  private readonly parent: Map<string, string>;

  constructor(ids: readonly string[]) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}
