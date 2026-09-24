import type { MessageEndpoint, ParseResult, PvTerm } from './parser/model.js';
import { pairSteps, narrativeRoleOrder } from './pairing.js';

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
  kind: 'invalid-channel' | 'invalid-direction' | 'automatic-endpoint' | 'unknown-endpoint';
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
    const warning = compatibleShape(out.term, incoming.term) ? undefined : '词项类型或形状不完全匹配；已保留为人工设计意图。';
    if (!pairings.some((pairing) => refKey(pairing.outEnd) === refKey(intent.outEnd) && refKey(pairing.inEnd) === refKey(intent.inEnd))) {
      pairings.push({ outEnd: intent.outEnd, inEnd: intent.inEnd, origin: 'manual', ...(warning === undefined ? {} : { warning }) });
    }
  }
  return { pairings, diagnostics };
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
