import type { ParseResult, PvRole, PvTerm } from './parser/model.js';
import { narrativeRoleOrder } from './pairing.js';

export type HorizontalNode =
  | { kind: 'role'; name: string; index: number }
  | { kind: 'channel'; name: string; index: number };

export interface HorizontalSequence {
  nodes: readonly HorizontalNode[];
  cutWidths: readonly number[];
  maxCut: number;
}

export interface HorizontalOrderConstraint {
  before: string;
  after: string;
}

interface Edge {
  left: string;
  right: string;
  weight: number;
}

/**
 * 求角色与信道交错的确定性水平序列。输入只看消息步骤，不读取配对结果。
 * 规模较小时精确枚举排列；更大的模型使用确定性的贪心插入，避免视图卡死。
 */
export function solveHorizontalSequence(
  result: ParseResult,
  constraints: readonly HorizontalOrderConstraint[] = [],
): HorizontalSequence {
  const roles = narrativeRoleOrder(result);
  const channels = collectChannels(result, roles);
  const nodes = [
    ...roles.map((role, index) => ({ kind: 'role' as const, name: role.name, index })),
    ...channels.map((name, index) => ({ kind: 'channel' as const, name, index })),
  ];
  const edges = collectEdges(roles);
  if (nodes.length === 0) return { nodes: [], cutWidths: [], maxCut: 0 };

  const names = nodes.map((node) => node.name);
  const sourceRanks = new Map(nodes.map((node, index) => [node.name, index]));
  const candidates = names.length <= 10
    ? permutations(names).filter((order) => satisfiesConstraints(order, constraints))
    : [greedyOrder(names, edges, constraints, sourceRanks)];
  const orders = candidates.length === 0 ? [names] : candidates;
  let best = orders[0];
  let bestScore = scoreOrder(best, edges, sourceRanks);
  for (const order of orders.slice(1)) {
    const score = scoreOrder(order, edges, sourceRanks);
    if (compareScores(score, bestScore) < 0) {
      best = order;
      bestScore = score;
    }
  }
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const ordered = best.map((name) => byName.get(name)!);
  return { nodes: ordered, cutWidths: bestScore.cutWidths, maxCut: bestScore.maxCut };
}

export function collectChannels(result: ParseResult, roles = narrativeRoleOrder(result)): string[] {
  const names: string[] = [];
  const add = (term: PvTerm): void => {
    const text = termIdentity(term);
    if (text !== null && !names.includes(text)) names.push(text);
  };
  for (const declaration of result.channels) add({ kind: 'name', name: declaration.name, text: declaration.name });
  for (const role of roles) for (const step of role.steps) add(step.channel);
  return names;
}

function collectEdges(roles: readonly PvRole[]): Edge[] {
  const weights = new Map<string, Edge>();
  for (const role of roles) {
    for (const step of role.steps) {
      const channel = termIdentity(step.channel);
      if (channel === null) continue;
      const key = `${role.name}\u0000${channel}`;
      const edge = weights.get(key) ?? { left: role.name, right: channel, weight: 0 };
      edge.weight += 1;
      weights.set(key, edge);
    }
  }
  return [...weights.values()];
}

function termIdentity(term: PvTerm): string | null {
  switch (term.kind) {
    case 'name':
    case 'variable':
      return term.name;
    default:
      return null;
  }
}

interface OrderScore {
  maxCut: number;
  cutWidths: number[];
  descendingCuts: number[];
  order: string[];
  ranks: number[];
}

function scoreOrder(order: string[], edges: readonly Edge[], sourceRanks: ReadonlyMap<string, number>): OrderScore {
  const cuts = order.slice(0, -1).map((_, index) => {
    const left = new Set(order.slice(0, index + 1));
    return edges.reduce((sum, edge) => {
      const crosses = left.has(edge.left) !== left.has(edge.right);
      return sum + (crosses ? edge.weight : 0);
    }, 0);
  });
  return {
    maxCut: cuts.length === 0 ? 0 : Math.max(...cuts),
    cutWidths: cuts,
    descendingCuts: [...cuts].sort((a, b) => b - a),
    order,
    ranks: order.map((name) => sourceRanks.get(name) ?? Number.MAX_SAFE_INTEGER),
  };
}

function compareScores(a: OrderScore, b: OrderScore): number {
  if (a.maxCut !== b.maxCut) return a.maxCut - b.maxCut;
  for (let index = 0; index < Math.max(a.descendingCuts.length, b.descendingCuts.length); index++) {
    const left = a.descendingCuts[index] ?? 0;
    const right = b.descendingCuts[index] ?? 0;
    if (left !== right) return left - right;
  }
  for (let index = 0; index < Math.max(a.ranks.length, b.ranks.length); index++) {
    const left = a.ranks[index] ?? Number.MAX_SAFE_INTEGER;
    const right = b.ranks[index] ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
  }
  return 0;
}

function satisfiesConstraints(order: readonly string[], constraints: readonly HorizontalOrderConstraint[]): boolean {
  const positions = new Map(order.map((name, index) => [name, index]));
  return constraints.every((constraint) => {
    const before = positions.get(constraint.before);
    const after = positions.get(constraint.after);
    return before === undefined || after === undefined || before < after;
  });
}

function greedyOrder(
  names: readonly string[],
  edges: readonly Edge[],
  constraints: readonly HorizontalOrderConstraint[],
  sourceRanks: ReadonlyMap<string, number>,
): string[] {
  let order: string[] = [];
  for (const name of names) {
    const positions = Array.from({ length: order.length + 1 }, (_, index) => index);
    const valid = positions.filter((position) => {
      const candidate = [...order.slice(0, position), name, ...order.slice(position)];
      return satisfiesConstraints(candidate, constraints);
    });
    const position = valid
      .map((candidatePosition) => ({
        candidatePosition,
        score: scoreOrder(
          [...order.slice(0, candidatePosition), name, ...order.slice(candidatePosition)],
          edges,
          sourceRanks,
        ),
      }))
      .sort((a, b) => compareScores(a.score, b.score))[0]?.candidatePosition ?? order.length;
    order = [...order.slice(0, position), name, ...order.slice(position)];
  }
  return order;
}

function permutations(values: readonly string[]): string[][] {
  if (values.length <= 1) return [values.slice()];
  const result: string[][] = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([value, ...tail]);
  });
  return result;
}
