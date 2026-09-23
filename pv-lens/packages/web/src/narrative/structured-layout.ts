import type {
  MessagePairing,
  ParseResult,
  PvRole,
  RoleItem,
  SourceSpan,
  StepPairing,
} from '@pv-lens/core';
import { narrativeRoleOrder, renderTerm, solveHorizontalSequence } from '@pv-lens/core';
import type { HorizontalSequence } from '@pv-lens/core';

export const MESSAGE_COLORS = ['#2563EB', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#475569'] as const;
export const VALUE_COLORS = ['#BFDBFE', '#A5F3FC', '#BBF7D0', '#FED7AA', '#FECACA', '#DDD6FE', '#FBCFE8', '#CBD5E1'] as const;
export const CHANNEL_STYLES = ['solid', 'long-dash', 'dot'] as const;

export interface StructuredColumn {
  kind: 'role' | 'channel';
  name: string;
  index: number;
  x: number;
  width: number;
  signatureText?: string;
  replicated?: boolean;
  parallel?: boolean;
}

export interface StructuredNode {
  id: string;
  roleIndex: number;
  itemIndex: number;
  kind: RoleItem['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  span: SourceSpan;
  stepIndex?: number;
  direction?: 'out' | 'in';
  channelName?: string;
  bindingIds: readonly string[];
}

export interface StructuredEndpoint {
  roleIndex: number;
  stepIndex: number;
  id: string;
  direction: 'out' | 'in';
  roleX: number;
  channelX: number;
  y: number;
  channelName: string;
  termText: string;
  unpaired: boolean;
  sourceSpan: SourceSpan;
}

export interface MessagePillar {
  id: string;
  color: string;
  sequence: number;
  channelName: string;
  channelX: number;
  top: number;
  bottom: number;
  endpoints: readonly StructuredEndpoint[];
}

export interface StructuredConflict {
  id: string;
  message: string;
  y: number;
  roleIndex?: number;
}

export interface StructuredNarrativeLayout {
  columns: readonly StructuredColumn[];
  nodes: readonly StructuredNode[];
  endpoints: readonly StructuredEndpoint[];
  pillars: readonly MessagePillar[];
  conflicts: readonly StructuredConflict[];
  horizontal: HorizontalSequence;
  width: number;
  height: number;
  hasLanes: boolean;
  compactness: number;
  gapUnit: number;
}

export interface StructuredLayoutOptions {
  pairings?: readonly MessagePairing[];
  /** 0 = 偏好间距，1 = 最紧凑；gap.unit 始终落在 [18, 26]。 */
  compactness?: number;
}

const METRICS = {
  margin: 32,
  columnWidth: 154,
  channelWidth: 72,
  columnGap: 38,
  headerHeight: 58,
  parameterHeight: 28,
  nodeHeight: 28,
  branchHeight: 38,
  localHeight: 30,
  eventHeight: 30,
  messageHeight: 30,
} as const;

/** v2 的内容驱动几何：各角色保留本地顺序，只有信道柱跨角色共享。 */
export function buildStructuredNarrativeLayout(
  result: ParseResult,
  options: StructuredLayoutOptions = {},
): StructuredNarrativeLayout {
  const roles = narrativeRoleOrder(result);
  const compactness = clamp(options.compactness ?? 0, 0, 1);
  const gapUnit = 26 - compactness * 8;
  const horizontal = solveHorizontalSequence(result);
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const columns = horizontal.nodes.map((node, index) => {
    const role = node.kind === 'role' ? roleByName.get(node.name) : undefined;
    return {
      kind: node.kind,
      name: node.name,
      index: node.index,
      x: METRICS.margin + index * (METRICS.columnWidth + METRICS.columnGap),
      width: node.kind === 'channel' ? METRICS.channelWidth : METRICS.columnWidth,
      ...(role === undefined ? {} : {
        signatureText: signatureOf(role),
        replicated: role.replicated,
        parallel: role.parallel,
      }),
    };
  });
  const roleColumns = new Map(roles.map((role) => [role.name, columns.find((column) => column.kind === 'role' && column.name === role.name)]));
  const channelColumns = new Map(columns.filter((column) => column.kind === 'channel').map((column) => [column.name, column]));
  const nodes: StructuredNode[] = [];
  const endpoints: StructuredEndpoint[] = [];
  let maxBottom = METRICS.margin + METRICS.headerHeight;
  const usedY = new Set<number>();

  roles.forEach((role, roleIndex) => {
    const column = roleColumns.get(role.name);
    if (column === undefined) return;
    let cursor = METRICS.margin + METRICS.headerHeight + METRICS.parameterHeight;
    role.items.forEach((item, itemIndex) => {
      const height = item.kind === 'branch' ? METRICS.branchHeight : item.kind === 'event' ? METRICS.eventHeight : item.kind === 'message' ? METRICS.messageHeight : METRICS.localHeight;
      const proposedY = cursor + height / 2;
      const y = uniqueY(proposedY, usedY);
      usedY.add(y);
      const stepItem = item.kind === 'message' ? item : undefined;
      const stepIndex = stepItem?.endpoint.stepIndex;
      const label = stepItem !== undefined
        ? `${stepItem.endpoint.direction === 'out' ? '发出' : '接收'} · ${renderTerm(stepItem.endpoint.term)}`
        : item.kind === 'event'
          ? `event ${item.text}`
          : item.kind === 'branch'
            ? `${item.marker}${item.guard === undefined ? '' : ` · ${conditionLabel(item.guard)}`}`
            : item.kind === 'local'
              ? item.text
              : '';
      nodes.push({
        id: item.id,
        roleIndex,
        itemIndex,
        kind: item.kind,
        x: column.x + column.width / 2 - METRICS.nodeHeight,
        y: y - height / 2,
        width: METRICS.nodeHeight * 2,
        height,
        label,
        span: item.span,
        ...(stepItem === undefined ? {} : { stepIndex, direction: stepItem.endpoint.direction, channelName: renderTerm(stepItem.endpoint.channel) }),
        bindingIds: item.kind === 'local' && item.bindingId !== undefined ? [item.bindingId] : [],
      });
      if (stepItem !== undefined) {
        const channelName = renderTerm(stepItem.endpoint.channel);
        const channel = channelColumns.get(channelName);
        if (channel !== undefined) {
          endpoints.push({
            roleIndex,
            stepIndex: stepItem.endpoint.stepIndex,
            id: stepItem.endpoint.id,
            direction: stepItem.endpoint.direction,
            roleX: column.x + column.width / 2,
            channelX: channel.x + channel.width / 2,
            y,
            channelName,
            termText: renderTerm(stepItem.endpoint.term),
            unpaired: true,
            sourceSpan: item.span,
          });
        }
      }
      cursor = y + height / 2 + gapUnit;
      maxBottom = Math.max(maxBottom, cursor);
    });
    maxBottom = Math.max(maxBottom, cursor);
  });

  const endpointByRef = new Map(endpoints.map((endpoint) => [`${endpoint.roleIndex}:${endpoint.stepIndex}`, endpoint]));
  const paired = new Set<string>();
  const pillars: MessagePillar[] = [];
  (options.pairings ?? []).forEach((pairing, index) => {
    const out = endpointByRef.get(`${pairing.outEnd.roleIndex}:${pairing.outEnd.stepIndex}`);
    const incoming = endpointByRef.get(`${pairing.inEnd.roleIndex}:${pairing.inEnd.stepIndex}`);
    if (out === undefined || incoming === undefined || out.channelName !== incoming.channelName) return;
    paired.add(out.id);
    paired.add(incoming.id);
    const channel = channelColumns.get(out.channelName);
    if (channel === undefined) return;
    const endpointsForPillar = [out, incoming];
    pillars.push({
      id: `message-${String(index + 1)}`,
      color: MESSAGE_COLORS[index % MESSAGE_COLORS.length],
      sequence: index + 1,
      channelName: out.channelName,
      channelX: channel.x + channel.width / 2,
      top: Math.min(out.y, incoming.y),
      bottom: Math.max(out.y, incoming.y),
      endpoints: endpointsForPillar,
    });
  });
  const finalEndpoints = endpoints.map((endpoint) => ({ ...endpoint, unpaired: !paired.has(endpoint.id) }));
  const finalPillars = pillars.map((pillar) => ({
    ...pillar,
    endpoints: pillar.endpoints.map((endpoint) => finalEndpoints.find((candidate) => candidate.id === endpoint.id) ?? endpoint),
  }));
  const conflicts: StructuredConflict[] = [];
  if (new Set(finalEndpoints.map((endpoint) => endpoint.y)).size !== finalEndpoints.length) {
    conflicts.push({ id: 'global-y', message: '消息端点的局部 y 约束无法完全分离，已延长生命线。', y: maxBottom });
  }
  const width = columns.length === 0
    ? METRICS.margin * 2
    : columns[columns.length - 1].x + columns[columns.length - 1].width + METRICS.margin;
  return {
    columns,
    nodes,
    endpoints: finalEndpoints,
    pillars: finalPillars,
    conflicts,
    horizontal,
    width,
    height: maxBottom + METRICS.margin,
    hasLanes: roles.length > 0,
    compactness,
    gapUnit,
  };
}

function signatureOf(role: PvRole): string {
  if (role.parameters.length === 0) return '';
  return `(${role.parameters.map((parameter) => parameter.typeName === undefined ? parameter.name : `${parameter.name}: ${parameter.typeName}`).join(', ')})`;
}
function uniqueY(value: number, used: ReadonlySet<number>): number {
  let y = value;
  while (used.has(y)) y += 4;
  return y;
}


function conditionLabel(condition: { kind: string; text?: string; operator?: string }): string {
  return condition.kind === 'unknown' ? condition.text ?? 'unknown' : condition.operator ?? condition.kind;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 把旧 StepPairing 转为 v2 统一 IR，给迁移中的调用方使用。 */
export function legacyPairingsToMessagePairings(pairings: readonly StepPairing[]): readonly MessagePairing[] {
  return pairings.map((pairing) => ({ outEnd: pairing.from, inEnd: pairing.to, origin: 'automatic' }));
}
