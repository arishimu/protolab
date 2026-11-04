import type { MessageEndpoint, ParseResult, PvTerm, RoleItem } from './parser/model.js';
import { pairSteps, narrativeRoleOrder, inferredTypeOf } from './pairing.js';

export type PairingOrigin = 'automatic' | 'manual';

export interface MessageEndpointRef {
  roleIndex: number;
  stepIndex: number;
}

export interface MessagePairing {
  outEnd: MessageEndpointRef;
  inEnd: MessageEndpointRef;
  origin: PairingOrigin;
  warning?: string;
}

export interface PairingIntent {
  outEnd: MessageEndpointRef;
  inEnd: MessageEndpointRef;
}

export interface PairingDiagnostic {
  kind: 'invalid-channel' | 'invalid-direction' | 'automatic-endpoint' | 'unknown-endpoint' | 'order-cycle';
  message: string;
  outEnd?: MessageEndpointRef;
  inEnd?: MessageEndpointRef;
}

/** 将自动配对和会话内人工声明合成统一 IR；不会修改 ParseResult。 */
export function composeMessagePairings(
  result: ParseResult,
  intents: readonly PairingIntent[] = [],
): { pairings: readonly MessagePairing[]; diagnostics: readonly PairingDiagnostic[] } {
  const automatic = pairSteps(result).map((pairing) => ({
    outEnd: pairing.from,
    inEnd: pairing.to,
    origin: 'automatic' as const,
  }));
  const automaticKeys = new Set(automatic.flatMap((pairing) => [refKey(pairing.outEnd), refKey(pairing.inEnd)]));
  const endpoints = endpointMap(result);
  const pairings: MessagePairing[] = [...automatic];
  const diagnostics: PairingDiagnostic[] = [];
  for (const intent of intents) {
    const out = endpoints.get(refKey(intent.outEnd));
    const incoming = endpoints.get(refKey(intent.inEnd));
    if (out === undefined || incoming === undefined) {
      diagnostics.push({ kind: 'unknown-endpoint', message: '人工配对端点不存在。', outEnd: intent.outEnd, inEnd: intent.inEnd });
      continue;
    }
    if (automaticKeys.has(refKey(intent.outEnd)) || automaticKeys.has(refKey(intent.inEnd))) {
      diagnostics.push({ kind: 'automatic-endpoint', message: '自动配对端点不能再次人工配对。', outEnd: intent.outEnd, inEnd: intent.inEnd });
      continue;
    }
    if (out.direction !== 'out' || incoming.direction !== 'in' || out.roleIndex === incoming.roleIndex) {
      diagnostics.push({ kind: 'invalid-direction', message: '人工配对必须连接不同角色的 out 与 in。', outEnd: intent.outEnd, inEnd: intent.inEnd });
      continue;
    }
    if (!termEquals(out.channel, incoming.channel)) {
      diagnostics.push({ kind: 'invalid-channel', message: '人工配对必须使用同一信道。', outEnd: intent.outEnd, inEnd: intent.inEnd });
      continue;
    }
    const warning = compatibleShape(out.term, incoming.term) ? undefined : typeMismatchWarning(result, out, incoming, intent);
    if (!pairings.some((pairing) => refKey(pairing.outEnd) === refKey(intent.outEnd) && refKey(pairing.inEnd) === refKey(intent.inEnd))) {
      pairings.push({ outEnd: intent.outEnd, inEnd: intent.inEnd, origin: 'manual', ...(warning === undefined ? {} : { warning }) });
    }
  }
  return { pairings, diagnostics: [...diagnostics, ...orderCycleDiagnostics(pairings, result)] };
}

/**
 * 顺序环检测（ticket 06）：每条配对给出消息因果边 out → in，每条生命线上相邻消息步
 * 给出本地序边；出现环即该声明集在任何局部梯子下都无法满足，显式标冲突，
 * 不静默丢弃声明（ADR-0005：人工配对只产出顺序约束，约束不可满足时必须可见）。
 */
function orderCycleDiagnostics(pairings: readonly MessagePairing[], result: ParseResult): PairingDiagnostic[] {
  // 诊断用可读端点标签（角色名 + 该角色的第几个消息步），不暴露内部 ref 键。
  const labels = new Map<string, string>();
  narrativeRoleOrder(result).forEach((role, roleIndex) => {
    let seen = 0;
    role.items.forEach((item) => {
      if (item.kind !== 'message') return;
      seen += 1;
      labels.set(refKey({ roleIndex, stepIndex: item.endpoint.stepIndex }), `${role.name}·${item.endpoint.direction === 'out' ? '发' : '收'}${String(seen)}`);
    });
  });
  const edges = new Map<string, Array<{ to: string; pairing?: MessagePairing }>>();
  const addEdge = (from: string, to: string, pairing?: MessagePairing): void => {
    const list = edges.get(from) ?? [];
    if (!list.some((edge) => edge.to === to)) list.push({ to, pairing });
    edges.set(from, list);
  };
  for (const pairing of pairings) {
    addEdge(refKey(pairing.outEnd), refKey(pairing.inEnd), pairing);
  }
  narrativeRoleOrder(result).forEach((role, roleIndex) => {
    const messageItems = role.items.filter((item): item is Extract<RoleItem, { kind: 'message' }> => item.kind === 'message');
    for (let index = 0; index + 1 < messageItems.length; index += 1) {
      addEdge(
        refKey({ roleIndex, stepIndex: messageItems[index].endpoint.stepIndex }),
        refKey({ roleIndex, stepIndex: messageItems[index + 1].endpoint.stepIndex }),
      );
    }
  });

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const diagnostics: PairingDiagnostic[] = [];
  const visit = (vertex: string): void => {
    if (diagnostics.length >= 3) return;
    state.set(vertex, 'visiting');
    stack.push(vertex);
    for (const edge of edges.get(vertex) ?? []) {
      if (diagnostics.length >= 3) break;
      if (state.get(edge.to) === 'visiting') {
        const cycleStart = stack.indexOf(edge.to);
        const cycle = [...stack.slice(cycleStart), edge.to];
        reportCycle(cycle, edges, diagnostics, labels);
        continue;
      }
      if (state.get(edge.to) === undefined) visit(edge.to);
    }
    stack.pop();
    state.set(vertex, 'done');
  };
  for (const vertex of edges.keys()) {
    if (state.get(vertex) === undefined) visit(vertex);
  }
  return diagnostics;
}

function reportCycle(
  cycle: readonly string[],
  edges: ReadonlyMap<string, Array<{ to: string; pairing?: MessagePairing }>>,
  diagnostics: PairingDiagnostic[],
  labels: ReadonlyMap<string, string>,
): void {
  // 环上第一条消息因果边作为诊断挂点；全为本地序边的环不涉及声明，不会出现。
  let anchor: MessagePairing | undefined;
  for (let index = 0; index + 1 < cycle.length; index += 1) {
    const edge = (edges.get(cycle[index] ?? '') ?? []).find((candidate) => candidate.to === cycle[index + 1]);
    if (edge?.pairing !== undefined) {
      anchor = edge.pairing;
      break;
    }
  }
  const readable = cycle.map((key) => labels.get(key) ?? key).join(' → ');
  diagnostics.push({
    kind: 'order-cycle',
    message: `消息顺序存在环：${readable}。该配对声明集在任何局部梯子下都无法同时满足，请调整声明。`,
    ...(anchor === undefined ? {} : { outEnd: anchor.outEnd, inEnd: anchor.inEnd }),
  });
}

function endpointMap(result: ParseResult): Map<string, MessageEndpoint> {
  const map = new Map<string, MessageEndpoint>();
  narrativeRoleOrder(result).forEach((role, roleIndex) => {
    role.items.forEach((item) => {
      if (item.kind !== 'message') return;
      const endpoint = item.endpoint;
      map.set(refKey({ roleIndex, stepIndex: endpoint.stepIndex }), {
        ...endpoint,
        roleIndex,
        itemIndex: item.endpoint.itemIndex,
      });
    });
  });
  return map;
}

/**
 * D7 类型不符警告：两侧类型都可得且不同时写明类型名；否则退回通用措辞。
 * 类型不符不阻止声明（U3.10），警告与拒绝诊断区分呈现。
 */
function typeMismatchWarning(
  result: ParseResult,
  out: MessageEndpoint,
  incoming: MessageEndpoint,
  intent: { outEnd: { roleIndex: number }; inEnd: { roleIndex: number } },
): string {
  const outType = inferredTypeOf(result, out.term, intent.outEnd.roleIndex);
  const inType = inferredTypeOf(result, incoming.term, intent.inEnd.roleIndex);
  if (outType !== undefined && inType !== undefined && outType !== inType) {
    return `类型不符：${out.term.text} 为 ${outType}，${incoming.term.text} 为 ${inType}；声明已保留`;
  }
  return '词项类型或形状不完全匹配；已保留为人工设计意图。';
}

function refKey(ref: MessageEndpointRef): string {
  return `${ref.roleIndex}:${ref.stepIndex}`;
}

function termEquals(a: PvTerm, b: PvTerm): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'variable': return a.name === (b as typeof a).name;
    case 'name': return a.name === (b as typeof a).name;
    case 'application': return a.functor === (b as typeof a).functor && a.args.length === (b as typeof a).args.length && a.args.every((arg, index) => termEquals(arg, (b as typeof a).args[index]));
    case 'tuple': return a.items.length === (b as typeof a).items.length && a.items.every((item, index) => termEquals(item, (b as typeof a).items[index]));
    case 'conditional': return termEquals(a.thenTerm, (b as typeof a).thenTerm) && termEquals(a.elseTerm, (b as typeof a).elseTerm);
    case 'equality': return termEquals(a.term, (b as typeof a).term);
    case 'unknown': return a.text === (b as typeof a).text;
  }
}

function compatibleShape(out: PvTerm, incoming: PvTerm): boolean {
  if (incoming.kind === 'variable') return true;
  if (incoming.kind === 'equality') return compatibleShape(out, incoming.term);
  if (out.kind !== incoming.kind) return false;
  switch (incoming.kind) {
    case 'name': return out.kind === 'name' && out.name === incoming.name;
    case 'application': return out.kind === 'application' && out.functor === incoming.functor && out.args.length === incoming.args.length && out.args.every((arg, index) => compatibleShape(arg, incoming.args[index]));
    case 'tuple': return out.kind === 'tuple' && out.items.length === incoming.items.length && out.items.every((item, index) => compatibleShape(item, incoming.items[index]));
    case 'conditional': return out.kind === 'conditional';
    default: return true;
  }
}
