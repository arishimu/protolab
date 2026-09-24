import type {
  Binding,
  Condition,
  MessagePairing,
  ParseResult,
  PvRole,
  PvTerm,
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

export interface StructuredValueBlock {
  id: string;
  roleIndex: number;
  bindingId: string;
  label: string;
  color: string;
  occurrence: 'binding' | 'reference' | 'equality';
  x: number;
  y: number;
  width: number;
  height: number;
  sourceSpan: SourceSpan;
}

export interface StructuredMethod {
  id: string;
  roleIndex: number;
  label: string;
  direction: 'construct' | 'destruct' | 'select';
  x: number;
  y: number;
  width: number;
  height: number;
  inputBindingIds: readonly string[];
  outputBindingIds: readonly string[];
  sourceSpan: SourceSpan;
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
  termPresentation: 'wire' | 'binding-reference' | 'literal';
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
  valueBlocks: readonly StructuredValueBlock[];
  methods: readonly StructuredMethod[];
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
  valueWidth: 50,
  valueHeight: 18,
  methodWidth: 66,
  methodHeight: 24,
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
  const valueBlocks: StructuredValueBlock[] = [];
  const methods: StructuredMethod[] = [];
  const endpoints: StructuredEndpoint[] = [];
  const bindingColors = assignBindingColors(roles);
  const bindingById = new Map(roles.flatMap((role) => role.bindings).map((binding) => [binding.id, binding]));
  const destructorNames = new Set(result.destructors.map((destructor) => destructor.name));
  let maxBottom = METRICS.margin + METRICS.headerHeight;
  const usedY = new Set<number>();

  roles.forEach((role, roleIndex) => {
    const column = roleColumns.get(role.name);
    if (column === undefined) return;
    let cursor = METRICS.margin + METRICS.headerHeight + METRICS.parameterHeight;
    role.bindings
      .filter((binding) => binding.kind === 'parameter')
      .forEach((binding, parameterIndex) => {
        const y = METRICS.headerHeight + 8 + parameterIndex * (METRICS.valueHeight + 3);
        valueBlocks.push(valueBlockOf(
          binding,
          roleIndex,
          column.x + column.width / 2,
          y,
          'binding',
          bindingColors,
          valueBlocks.length,
        ));
      });
    cursor += Math.max(0, (role.parameters.length - 1) * (METRICS.valueHeight + 3));
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
            termPresentation: termPresentation(stepItem.endpoint.term),
            unpaired: true,
            sourceSpan: item.span,
          });
        }
      }
      projectValueLayer({
        item,
        roleIndex,
        roleX: column.x + column.width / 2,
        y,
        channelX: stepItem === undefined
          ? undefined
          : channelColumns.get(renderTerm(stepItem.endpoint.channel))?.x,
        bindingById,
        bindingColors,
        destructorNames,
        valueBlocks,
        methods,
      });
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
    valueBlocks,
    methods,
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

interface ValueProjectionContext {
  item: RoleItem;
  roleIndex: number;
  roleX: number;
  y: number;
  channelX?: number;
  bindingById: ReadonlyMap<string, Binding>;
  bindingColors: ReadonlyMap<string, string>;
  destructorNames: ReadonlySet<string>;
  valueBlocks: StructuredValueBlock[];
  methods: StructuredMethod[];
}

function projectValueLayer(context: ValueProjectionContext): void {
  const { item, roleIndex, roleX, y, bindingById, bindingColors, valueBlocks, methods } = context;
  const pushBlocks = (
    refs: readonly TermBindingRef[],
    verticalOffset: number,
    introduced: ReadonlySet<string> = new Set(),
  ): void => {
    refs.forEach((ref, index) => {
      const binding = bindingById.get(ref.bindingId);
      if (binding === undefined) return;
      const occurrence = ref.equality
        ? 'equality'
        : introduced.has(ref.bindingId)
          ? 'binding'
          : 'reference';
      const offset = (index - (refs.length - 1) / 2) * (METRICS.valueWidth + 4);
      valueBlocks.push(valueBlockOf(
        binding,
        roleIndex,
        roleX + offset,
        y + verticalOffset,
        occurrence,
        bindingColors,
        valueBlocks.length,
      ));
    });
  };

  if (item.kind === 'message') {
    const refs = termBindingRefs(item.endpoint.term);
    pushBlocks(refs, 0, new Set(item.endpoint.bindingIds));
    const method = methodOfTerm(item.endpoint.term, context.destructorNames);
    if (item.endpoint.direction === 'out' && method !== null) {
      const direction = Math.sign((context.channelX ?? roleX + 1) - roleX) || 1;
      methods.push({
        id: `${item.id}:wire-method`,
        roleIndex,
        label: method.label,
        direction: method.direction,
        x: roleX + direction * 44,
        y: y - 24,
        width: METRICS.methodWidth,
        height: METRICS.methodHeight,
        inputBindingIds: refs.map((ref) => ref.bindingId),
        outputBindingIds: [],
        sourceSpan: item.span,
      });
    }
    return;
  }

  if (item.kind === 'local') {
    if (item.operation === 'new') {
      const bindingId = item.bindingIds[0];
      const binding = bindingId === undefined ? undefined : bindingById.get(bindingId);
      if (binding !== undefined) {
        valueBlocks.push(valueBlockOf(
          binding,
          roleIndex,
          roleX,
          y,
          'binding',
          bindingColors,
          valueBlocks.length,
        ));
      }
      return;
    }

    const inputRefs = item.term === undefined ? [] : termBindingRefs(item.term);
    const patternRefs = item.pattern === undefined ? [] : termBindingRefs(item.pattern);
    pushBlocks(inputRefs, -20);
    pushBlocks(patternRefs, 20, new Set(item.bindingIds));
    const methodTerm = item.operation === 'get' ? item.pattern : item.term;
    const method = methodTerm === undefined
      ? null
      : item.operation === 'get'
        ? { label: methodLabel(methodTerm, 'get'), direction: 'destruct' as const }
        : methodOfTerm(methodTerm, context.destructorNames);
    if (method !== null) {
      methods.push({
        id: `${item.id}:method`,
        roleIndex,
        label: method.label,
        direction: method.direction,
        x: roleX,
        y,
        width: METRICS.methodWidth,
        height: METRICS.methodHeight,
        inputBindingIds: inputRefs.map((ref) => ref.bindingId),
        outputBindingIds: item.bindingIds,
        sourceSpan: item.span,
      });
    }
    return;
  }

  if (item.kind === 'event') pushBlocks(item.args.flatMap((arg) => termBindingRefs(arg)), 0);
}

interface TermBindingRef {
  bindingId: string;
  equality: boolean;
}

function termBindingRefs(term: PvTerm, equality = false): TermBindingRef[] {
  if (term.kind === 'variable') {
    return term.bindingId === undefined ? [] : [{ bindingId: term.bindingId, equality }];
  }
  if (term.kind === 'application') return term.args.flatMap((arg) => termBindingRefs(arg, equality));
  if (term.kind === 'tuple') return term.items.flatMap((child) => termBindingRefs(child, equality));
  if (term.kind === 'conditional') {
    return [
      ...conditionBindingRefs(term.condition),
      ...termBindingRefs(term.thenTerm, equality),
      ...termBindingRefs(term.elseTerm, equality),
    ];
  }
  if (term.kind === 'equality') return termBindingRefs(term.term, true);
  return [];
}

function conditionBindingRefs(condition: Condition): TermBindingRef[] {
  if (condition.kind === 'comparison') {
    return [...termBindingRefs(condition.left), ...termBindingRefs(condition.right)];
  }
  return condition.kind === 'compound' ? condition.clauses.flatMap(conditionBindingRefs) : [];
}

function methodOfTerm(
  term: PvTerm,
  destructorNames: ReadonlySet<string>,
): { label: string; direction: StructuredMethod['direction'] } | null {
  if (term.kind === 'application') {
    return {
      label: term.functor,
      direction: destructorNames.has(term.functor) ? 'destruct' : 'construct',
    };
  }
  if (term.kind === 'tuple') return { label: 'tuple', direction: 'construct' };
  if (term.kind === 'conditional') return { label: '?:', direction: 'select' };
  return null;
}

function methodLabel(term: PvTerm, fallback: string): string {
  if (term.kind === 'application') return term.functor;
  if (term.kind === 'tuple') return 'tuple';
  return fallback;
}

function termPresentation(term: PvTerm): StructuredEndpoint['termPresentation'] {
  if (term.kind === 'application' || term.kind === 'tuple' || term.kind === 'conditional') return 'wire';
  if (term.kind === 'variable' && term.bindingId !== undefined) return 'binding-reference';
  if (term.kind === 'equality' && termBindingRefs(term).length > 0) return 'binding-reference';
  return 'literal';
}

function assignBindingColors(roles: readonly PvRole[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const role of roles) {
    for (const binding of role.bindings) {
      if (!colors.has(binding.id)) colors.set(binding.id, VALUE_COLORS[colors.size % VALUE_COLORS.length]);
    }
  }
  return colors;
}

function valueBlockOf(
  binding: Binding,
  roleIndex: number,
  x: number,
  y: number,
  occurrence: StructuredValueBlock['occurrence'],
  colors: ReadonlyMap<string, string>,
  index: number,
): StructuredValueBlock {
  return {
    id: `${binding.id}:${occurrence}:${String(index)}`,
    roleIndex,
    bindingId: binding.id,
    label: binding.name,
    color: colors.get(binding.id) ?? VALUE_COLORS[0],
    occurrence,
    x,
    y,
    width: METRICS.valueWidth,
    height: METRICS.valueHeight,
    sourceSpan: binding.span,
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
