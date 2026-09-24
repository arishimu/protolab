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

/** 粗略字宽，仅用于估算标签占用与画布宽度（不做像素级排版）。 */
const CHAR_WIDTH = 6.2;
const CAPTION_CHAR_WIDTH = 5.6;

export interface StructuredColumn {
  kind: 'role' | 'channel';
  name: string;
  index: number;
  x: number;
  width: number;
  signatureText?: string;
  replicated?: boolean;
  parallel?: boolean;
  /** 参数簇小标题「参数」的 y；无参数时缺省。 */
  parameterLabelY?: number;
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
  /** 节点标签全文；渲染方按 labelMaxChars 截断，全文进 title / aria-label。 */
  label: string;
  labelX: number;
  labelAnchor: 'start' | 'middle';
  labelMaxChars: number;
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
  /** 盒下小字：算子实参元组（原型里的 caption）。 */
  caption?: string;
  direction: 'construct' | 'destruct' | 'select' | 'check';
  /** 横置构造盒的窄底朝向：窄端指向消息（与原型的「短底 = 值方块宽」同口径）。 */
  narrowTowards?: 'left' | 'right';
  /** 复合条件的连接词字形（放在该子句行旁）。 */
  connector?: '&&' | '||';
  x: number;
  y: number;
  width: number;
  height: number;
  inputBindingIds: readonly string[];
  outputBindingIds: readonly string[];
  sourceSpan: SourceSpan;
}

/** 虚线芯片：派生值（解构输出未绑定）、条件芯片、表模式芯片。不发值身份色。 */
export interface StructuredChip {
  id: string;
  roleIndex: number;
  text: string;
  kind: 'derived' | 'condition' | 'pattern';
  x: number;
  y: number;
  width: number;
  height: number;
  sourceSpan: SourceSpan;
}

/** 分支臂道：生命线旁的虚线竖轨 + then/else 标签，两端以横 tick 接回生命线。 */
export interface StructuredArmRun {
  id: string;
  roleIndex: number;
  arm: 'then' | 'else';
  lane: number;
  /** 轨道 x 与它接回的生命线 x（两端横 tick 用）。 */
  railX: number;
  lifelineX: number;
  top: number;
  bottom: number;
  empty: boolean;
  label: string;
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
  /** 这段线是否跨过中间生命线：只有跨线才上拱（否则画直线，原型口径）。 */
  crossesIntermediate: boolean;
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
  /** 一条消息只在信道帧内写一遍的词项（取发送端 wire term）与帧的中轴 y。 */
  termText: string;
  termPresentation: StructuredEndpoint['termPresentation'];
  frameY: number;
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
  chips: readonly StructuredChip[];
  armRuns: readonly StructuredArmRun[];
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
  parameterLabelGap: 20,
  nodeHeight: 28,
  branchHeight: 26,
  localHeight: 30,
  eventHeight: 30,
  messageHeight: 30,
  valueWidth: 50,
  valueHeight: 16,
  /** 值方块槽位（含格间留白）与方法盒槽位（盒 24 + 盒下 caption）。 */
  valuePitch: 20,
  methodPitch: 38,
  /** 等值检查行：两操作数并排（上方）+ 无输出梯形盒。 */
  checkPitch: 50,
  chipWidth: 56,
  chipHeight: 18,
  /** 臂道轨道间距。 */
  laneStep: 22,
  chainPadding: 6,
  methodWidth: 66,
  methodHeight: 24,
  /** 构造盒落在「生命线 → 消息」路径上的横向偏移。 */
  wireMethodOffset: 58,
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
  const columnX = (index: number): number => METRICS.margin + index * (METRICS.columnWidth + METRICS.columnGap);
  const columns: StructuredColumn[] = horizontal.nodes.map((node, index) => {
    const role = node.kind === 'role' ? roleByName.get(node.name) : undefined;
    return {
      kind: node.kind,
      name: node.name,
      index: node.index,
      x: columnX(index),
      width: node.kind === 'channel' ? METRICS.channelWidth : METRICS.columnWidth,
      ...(role === undefined ? {} : {
        signatureText: signatureOf(role),
        replicated: role.replicated,
        parallel: role.parallel,
        ...(role.parameters.length === 0 ? {} : { parameterLabelY: METRICS.headerHeight + METRICS.parameterLabelGap }),
      }),
    };
  });
  const roleColumns = new Map(roles.map((role) => [role.name, columns.find((column) => column.kind === 'role' && column.name === role.name)]));
  const channelColumns = new Map(columns.filter((column) => column.kind === 'channel').map((column) => [column.name, column]));
  // 标签预算按「列在序列里的位置」取下一列坐标；column.index 是同类序号，不能当位置用。
  const columnPosition = new Map(columns.map((column, position) => [`${column.kind}:${column.name}`, position]));
  const nodes: StructuredNode[] = [];
  const valueBlocks: StructuredValueBlock[] = [];
  const methods: StructuredMethod[] = [];
  const chips: StructuredChip[] = [];
  const armRuns: StructuredArmRun[] = [];
  const endpoints: StructuredEndpoint[] = [];
  const bindingColors = assignBindingColors(roles);
  const bindingById = new Map(roles.flatMap((role) => role.bindings).map((binding) => [binding.id, binding]));
  const destructorNames = new Set(result.destructors.map((destructor) => destructor.name));
  const roleLifelines = columns
    .filter((column) => column.kind === 'role')
    .map((column) => ({ name: column.name, x: column.x + column.width / 2 }));
  /** 这段线是否跨过别的角色生命线：只有跨线才上拱。 */
  const crossesIntermediate = (fromX: number, toX: number, roleName: string): boolean => roleLifelines.some(
    (role) => role.name !== roleName && role.x > Math.min(fromX, toX) && role.x < Math.max(fromX, toX),
  );
  let maxBottom = METRICS.margin + METRICS.headerHeight;
  let maxTextRight = 0;
  const usedY = new Set<number>();

  roles.forEach((role, roleIndex) => {
    const column = roleColumns.get(role.name);
    if (column === undefined) return;
    const lifelineX = column.x + column.width / 2;
    /** 值层链/方法盒当前所在列（臂道轨道只作标记，条目仍贴生命线——与 proto08 一致）。 */
    const rowX = lifelineX;
    const nextColumn = columns[(columnPosition.get(`role:${role.name}`) ?? 0) + 1];
    // 信道总线又窄又淡，标签可以借过；下一列是角色时则止步于它左缘，避免压到对方生命线。
    const labelLimitX = nextColumn === undefined
      ? Number.POSITIVE_INFINITY
      : nextColumn.kind === 'channel'
        ? nextColumn.x + nextColumn.width + METRICS.columnGap / 2 - 8
        : nextColumn.x - 8;

    const parameterBindings = role.bindings.filter((binding) => binding.kind === 'parameter');
    const parameterTop = METRICS.headerHeight + METRICS.parameterLabelGap + 14;
    parameterBindings.forEach((binding, parameterIndex) => {
      valueBlocks.push(valueBlockOf(
        binding,
        roleIndex,
        lifelineX,
        parameterTop + parameterIndex * METRICS.valuePitch,
        'binding',
        bindingColors,
        valueBlocks.length,
      ));
    });
    const armStack: Array<{ runIndex: number; lane: number; enclosingElse: number }> = [];
    let cursor = parameterBindings.length === 0
      ? METRICS.margin + METRICS.headerHeight + METRICS.parameterHeight
      : parameterTop + parameterBindings.length * METRICS.valuePitch;

    role.items.forEach((item, itemIndex) => {
      const stepItem = item.kind === 'message' ? item : undefined;
      const chain = valueChainOf(item, bindingById, destructorNames);
      const baseHeight = item.kind === 'branch'
        ? METRICS.branchHeight
        : item.kind === 'event'
          ? METRICS.eventHeight
          : item.kind === 'message'
            ? METRICS.messageHeight
            : METRICS.localHeight;
      const rowHeight = Math.max(baseHeight, chainHeightOf(chain) + METRICS.chainPadding);
      const y = uniqueY(cursor + rowHeight / 2, usedY);
      usedY.add(y);

      if (item.kind === 'branch') {
        if (item.marker === 'branch') {
          const enclosingElse = armStack.filter((frame) => frame.lane >= 2).length;
          const lane = Math.min(2, 1 + enclosingElse);
          armRuns.push({
            id: item.id,
            roleIndex,
            arm: 'then',
            lane,
            railX: armRailX(lifelineX, lane),
            lifelineX,
            top: y,
            bottom: y,
            empty: false,
            label: enclosingElse === 0 ? 'then' : `then +${String(enclosingElse)}`,
          });
          armStack.push({ runIndex: armRuns.length - 1, lane, enclosingElse });
        } else if (item.marker === 'else') {
          const frame = armStack[armStack.length - 1];
          if (frame !== undefined) {
            const run = armRuns[frame.runIndex];
            if (run !== undefined) armRuns[frame.runIndex] = { ...run, bottom: y };
            const lane = Math.min(2, 2 + frame.enclosingElse);
            armRuns.push({
              id: item.id,
              roleIndex,
              arm: 'else',
              lane,
              railX: armRailX(lifelineX, lane),
              lifelineX,
              top: y,
              bottom: y,
              empty: item.empty === true,
              label: item.empty === true ? 'else ∅' : 'else',
            });
            armStack[armStack.length - 1] = { runIndex: armRuns.length - 1, lane, enclosingElse: frame.enclosingElse };
          }
        } else {
          const frame = armStack.pop();
          if (frame !== undefined) {
            const run = armRuns[frame.runIndex];
            if (run !== undefined) armRuns[frame.runIndex] = { ...run, bottom: y };
          }
        }
      }

      const labelX = stepItem === undefined ? lifelineX + METRICS.valueWidth / 2 + 6 : lifelineX;
      const labelAnchor: StructuredNode['labelAnchor'] = stepItem === undefined ? 'start' : 'middle';
      const labelBudget = labelAnchor === 'start'
        ? Math.max(6, Math.floor((labelLimitX - labelX) / CHAR_WIDTH))
        : Math.max(6, Math.floor((METRICS.nodeHeight * 2) / CHAR_WIDTH) + 2);
      const label = stepItem !== undefined
        ? `${stepItem.endpoint.direction === 'out' ? '发出' : '接收'} · ${renderTerm(stepItem.endpoint.term)}`
        : item.kind === 'event'
          ? `event ${item.text}`
          : item.kind === 'branch'
            ? branchLabel(item)
            : item.kind === 'local'
              ? item.text
              : '';
      nodes.push({
        id: item.id,
        roleIndex,
        itemIndex,
        kind: item.kind,
        x: lifelineX - METRICS.nodeHeight,
        y: y - baseHeight / 2,
        width: METRICS.nodeHeight * 2,
        height: baseHeight,
        label,
        labelX,
        labelAnchor,
        labelMaxChars: labelBudget,
        span: item.span,
        ...(stepItem === undefined ? {} : { stepIndex: stepItem.endpoint.stepIndex, direction: stepItem.endpoint.direction, channelName: renderTerm(stepItem.endpoint.channel) }),
        bindingIds: item.kind === 'local' && item.bindingId !== undefined ? [item.bindingId] : [],
      });
      if (labelAnchor === 'start') {
        maxTextRight = Math.max(maxTextRight, labelX + Math.min(label.length, labelBudget) * CHAR_WIDTH);
      }

      // 值层竖向链：紧贴生命线，值方块 20px 一格、方法盒 38px 一格（盒下留 caption），行高随链长增长。
      let slotTop = y - chainHeightOf(chain) / 2;
      chain.forEach((entry) => {
        if (entry.kind === 'value') {
          const binding = bindingById.get(entry.bindingId);
          const slotY = slotTop + METRICS.valuePitch / 2;
          slotTop += METRICS.valuePitch;
          if (binding === undefined) return;
          valueBlocks.push(valueBlockOf(
            binding,
            roleIndex,
            lifelineX,
            slotY,
            entry.occurrence,
            bindingColors,
            valueBlocks.length,
          ));
          maxTextRight = Math.max(maxTextRight, lifelineX + METRICS.valueWidth / 2);
          return;
        }
        if (entry.kind === 'check') {
          const operandY = slotTop + 9;
          entry.operands.forEach((operand, index) => {
            const operandX = rowX + (entry.operands.length > 1 ? (index === 0 ? -27 : 27) : 0);
            if (operand.kind === 'value') {
              const binding = bindingById.get(operand.bindingId);
              if (binding === undefined) return;
              valueBlocks.push(valueBlockOf(binding, roleIndex, operandX, operandY, 'reference', bindingColors, valueBlocks.length));
              return;
            }
            chips.push({
              id: `${item.id}:operand:${String(index)}`,
              roleIndex,
              text: operand.text,
              kind: 'pattern',
              x: operandX,
              y: operandY,
              width: METRICS.chipWidth,
              height: METRICS.chipHeight,
              sourceSpan: item.span,
            });
          });
          const boxY = slotTop + 33;
          slotTop += METRICS.checkPitch;
          methods.push({
            id: `${item.id}:check`,
            roleIndex,
            label: entry.op,
            direction: 'check',
            ...(entry.connector === undefined ? {} : { connector: entry.connector }),
            x: rowX,
            y: boxY,
            width: METRICS.methodWidth,
            height: METRICS.methodHeight,
            inputBindingIds: entry.operands.filter((operand) => operand.kind === 'value').map((operand) => operand.bindingId),
            outputBindingIds: [],
            sourceSpan: item.span,
          });
          maxTextRight = Math.max(maxTextRight, rowX + 27 + METRICS.chipWidth / 2);
          return;
        }

        if (entry.kind === 'derived') {
          const chipY = slotTop + METRICS.chipHeight / 2;
          slotTop += METRICS.valuePitch;
          chips.push({
            id: `${item.id}:chip:${String(chips.length)}`,
            roleIndex,
            text: entry.text,
            kind: entry.chipKind,
            x: rowX,
            y: chipY,
            width: METRICS.chipWidth,
            height: METRICS.chipHeight,
            sourceSpan: item.span,
          });
          maxTextRight = Math.max(maxTextRight, rowX + METRICS.chipWidth / 2);
          return;
        }

        const boxCenterY = slotTop + METRICS.methodHeight / 2;
        slotTop += METRICS.methodPitch;
        methods.push({
          id: `${item.id}:method`,
          roleIndex,
          label: entry.label,
          ...(entry.caption === undefined ? {} : { caption: entry.caption }),
          direction: entry.direction,
          x: lifelineX,
          y: boxCenterY,
          width: METRICS.methodWidth,
          height: METRICS.methodHeight,
          inputBindingIds: entry.inputBindingIds,
          outputBindingIds: entry.outputBindingIds,
          sourceSpan: item.span,
        });
        if (entry.caption !== undefined) {
          const captionChars = Math.min(entry.caption.length, 16);
          maxTextRight = Math.max(maxTextRight, lifelineX + (captionChars * CAPTION_CHAR_WIDTH) / 2);
        }
      });

      if (stepItem !== undefined) {
        const channelName = renderTerm(stepItem.endpoint.channel);
        const channel = channelColumns.get(channelName);
        if (channel !== undefined) {
          const channelCenterX = channel.x + channel.width / 2;
          endpoints.push({
            roleIndex,
            stepIndex: stepItem.endpoint.stepIndex,
            id: stepItem.endpoint.id,
            direction: stepItem.endpoint.direction,
            roleX: lifelineX,
            channelX: channelCenterX,
            y,
            channelName,
            termText: renderTerm(stepItem.endpoint.term),
            termPresentation: termPresentation(stepItem.endpoint.term),
            crossesIntermediate: crossesIntermediate(lifelineX, channelCenterX, role.name),
            unpaired: true,
            sourceSpan: item.span,
          });
          // 构造盒落在「生命线 → 消息」路径上：横置梯形，盒内算子名；
          // 不再写 caption——紧邻的信道帧已经写全了同一个词项，caption 会和帧打架。
          if (stepItem.endpoint.direction === 'out') {
            const wire = wireMethodOf(stepItem.endpoint.term, destructorNames);
            if (wire !== null) {
              const towardsChannel = Math.sign(channelCenterX - lifelineX) || 1;
              methods.push({
                id: `${item.id}:wire-method`,
                roleIndex,
                label: wire.label,
                direction: wire.direction,
                ...(wire.direction === 'construct' ? { narrowTowards: towardsChannel > 0 ? 'right' as const : 'left' as const } : {}),
                x: lifelineX + towardsChannel * METRICS.wireMethodOffset,
                y,
                width: METRICS.methodWidth,
                height: METRICS.methodHeight,
                inputBindingIds: wire.inputBindingIds,
                outputBindingIds: [],
                sourceSpan: item.span,
              });
            }
          }
        }
      }

      cursor = y + rowHeight / 2 + gapUnit;
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
    const channelX = channel.x + channel.width / 2;
    pillars.push({
      id: `message-${String(index + 1)}`,
      color: MESSAGE_COLORS[index % MESSAGE_COLORS.length],
      sequence: index + 1,
      channelName: out.channelName,
      channelX,
      top: Math.min(out.y, incoming.y),
      bottom: Math.max(out.y, incoming.y),
      termText: out.termText,
      termPresentation: out.termPresentation,
      // 帧对齐到发送端那一端：弧的走向固定（发出→信道→接收），帧不必浮在两端中间。
      frameY: out.y,
      endpoints: [out, incoming],
    });
    maxTextRight = Math.max(maxTextRight, channelX + 35);
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
  const columnsRight = columns.length === 0
    ? METRICS.margin
    : columns[columns.length - 1].x + columns[columns.length - 1].width;
  const width = Math.max(columnsRight + METRICS.margin, maxTextRight + 12);
  return {
    columns,
    nodes,
    valueBlocks,
    methods,
    chips,
    armRuns,
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

/** 值层链的一格：值方块，或代算子方法盒。 */
type CheckOperand =
  | { kind: 'value'; bindingId: string }
  | { kind: 'chip'; text: string };

type ChainEntry =
  | { kind: 'value'; bindingId: string; occurrence: StructuredValueBlock['occurrence'] }
  | {
      kind: 'method';
      label: string;
      direction: StructuredMethod['direction'];
      caption?: string;
      connector?: '&&' | '||';
      inputBindingIds: readonly string[];
      outputBindingIds: readonly string[];
    }
  | { kind: 'check'; op: string; operands: readonly CheckOperand[]; connector?: '&&' | '||' }
  | { kind: 'derived'; text: string; chipKind: 'derived' | 'condition' };

/**
 * 一个 item 在值层里的竖向链（自上而下）：
 * `let` = 输入 → 方法盒 → 输出；`get` = 表模式实参 → 方法盒 → 绑定名；
 * 消息端 = 该端词项引用到的值；`new` = 一个绑定；`event` = 参数引用。
 */
function valueChainOf(
  item: RoleItem,
  bindingById: ReadonlyMap<string, Binding>,
  destructorNames: ReadonlySet<string>,
): ChainEntry[] {
  const entries: ChainEntry[] = [];
  const pushValues = (refs: readonly TermBindingRef[], introduced: ReadonlySet<string> = new Set()): void => {
    for (const ref of refs) {
      if (!bindingById.has(ref.bindingId)) continue;
      entries.push({
        kind: 'value',
        bindingId: ref.bindingId,
        occurrence: ref.equality ? 'equality' : introduced.has(ref.bindingId) ? 'binding' : 'reference',
      });
    }
  };

  if (item.kind === 'message') {
    pushValues(termBindingRefs(item.endpoint.term), new Set(item.endpoint.bindingIds));
    return entries;
  }
  if (item.kind === 'event') {
    pushValues(item.args.flatMap((arg) => termBindingRefs(arg)));
    return entries;
  }
  if (item.kind === 'branch') {
    if (item.marker === 'branch') entries.push(...guardEntries(item.guard, item.guardKind ?? 'if', item.guardText ?? '', destructorNames));
    return entries;
  }
  if (item.kind !== 'local') return entries;
  if (item.operation === 'new') {
    pushValues(item.bindingIds.map((bindingId) => ({ bindingId, equality: false })), new Set(item.bindingIds));
    return entries;
  }
  if (item.operation === 'insert') return entries;

  const introduced = new Set(item.bindingIds);
  if (item.operation === 'get') {
    const patternRefs = item.pattern === undefined ? [] : termBindingRefs(item.pattern);
    pushValues(patternRefs.filter((ref) => !introduced.has(ref.bindingId)));
    if (item.pattern !== undefined) {
      const method = methodOfTerm(item.pattern, destructorNames, true);
      if (method !== null) {
        entries.push({
          kind: 'method',
          label: method.label,
          direction: method.direction,
          caption: captionOf(item.pattern),
          inputBindingIds: patternRefs.filter((ref) => !introduced.has(ref.bindingId)).map((ref) => ref.bindingId),
          outputBindingIds: item.bindingIds,
        });
      }
    }
    pushValues(patternRefs.filter((ref) => introduced.has(ref.bindingId)), introduced);
    return entries;
  }

  const termRefs = item.term === undefined ? [] : termBindingRefs(item.term);
  pushValues(termRefs);
  if (item.term !== undefined) {
    const method = methodOfTerm(item.term, destructorNames);
    if (method !== null) {
      entries.push({
        kind: 'method',
        label: method.label,
        direction: method.direction,
        caption: captionOf(item.term),
        inputBindingIds: termRefs.map((ref) => ref.bindingId),
        outputBindingIds: item.bindingIds,
      });
    }
    // `let x = if c then a else b`：条件作盒外芯片（决策 13：选择盒不划臂区间）。
    if (item.term.kind === 'conditional') {
      entries.push({ kind: 'derived', text: renderCondition(item.term.condition), chipKind: 'condition' });
    }
  }
  if (item.pattern !== undefined) pushValues(termBindingRefs(item.pattern), introduced);
  return entries;
}

/**
 * 守卫 → 检查行（决策 13）：被检查的两个操作数以同色方块并排贴在盒上方、op 在盒内、无输出；
 * 复合条件逐子句成行并把连接词作字形挂在子句旁；内嵌解构先画自己的盒 + 派生虚线芯片再喂进盒。
 */
function guardEntries(
  condition: Condition | undefined,
  kind: 'if' | 'get',
  text: string,
  destructorNames: ReadonlySet<string>,
): ChainEntry[] {
  if (kind === 'get') return [{ kind: 'check', op: '∈', operands: [{ kind: 'chip', text }] }];
  if (condition === undefined) return [{ kind: 'check', op: '?', operands: [{ kind: 'chip', text }] }];
  return pushCondition(condition, [], undefined, destructorNames);
}

function pushCondition(
  condition: Condition,
  entries: ChainEntry[],
  connector: '&&' | '||' | undefined,
  destructorNames: ReadonlySet<string>,
): ChainEntry[] {
  if (condition.kind === 'compound') {
    let collected = entries;
    condition.clauses.forEach((clause, index) => {
      collected = pushCondition(clause, collected, index === 0 ? connector : condition.operator, destructorNames);
    });
    return collected;
  }
  if (condition.kind === 'unknown') {
    return [...entries, { kind: 'check', op: '?', operands: [{ kind: 'chip', text: condition.text }], ...(connector === undefined ? {} : { connector }) }];
  }

  const operands: CheckOperand[] = [];
  for (const side of [condition.left, condition.right]) {
    if (side.kind === 'application') {
      // 条件里内嵌解构：输入方块 → 解构盒 → 派生虚线芯片（不是值方块），芯片再喂进检查盒。
      const refs = termBindingRefs(side);
      refs.forEach((ref) => entries.push({
        kind: 'value',
        bindingId: ref.bindingId,
        occurrence: ref.equality ? 'equality' : 'reference',
      }));
      const method = methodOfTerm(side, destructorNames, true);
      if (method !== null) {
        entries.push({
          kind: 'method',
          label: method.label,
          direction: method.direction,
          caption: captionOf(side),
          inputBindingIds: refs.map((ref) => ref.bindingId),
          outputBindingIds: [],
        });
      }
      entries.push({ kind: 'derived', text: renderTerm(side), chipKind: 'derived' });
      operands.push({ kind: 'chip', text: method?.label ?? renderTerm(side) });
      continue;
    }
    const refs = termBindingRefs(side);
    operands.push(refs.length === 1 && refs[0] !== undefined
      ? { kind: 'value', bindingId: refs[0].bindingId }
      : { kind: 'chip', text: renderTerm(side) });
  }
  return [...entries, {
    kind: 'check',
    op: condition.operator,
    operands,
    ...(connector === undefined ? {} : { connector }),
  }];
}

interface TermBindingRef {
  bindingId: string;
  equality: boolean;
}

function chainHeightOf(chain: readonly ChainEntry[]): number {
  return chain.reduce((total, entry) => {
    if (entry.kind === 'method') return total + METRICS.methodPitch;
    if (entry.kind === 'check') return total + METRICS.checkPitch;
    return total + METRICS.valuePitch;
  }, 0);
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
  forceDestruct = false,
): { label: string; direction: StructuredMethod['direction'] } | null {
  if (term.kind === 'application') {
    return {
      label: term.functor,
      direction: forceDestruct || destructorNames.has(term.functor) ? 'destruct' : 'construct',
    };
  }
  if (term.kind === 'tuple') {
    return forceDestruct
      ? { label: 'tuple', direction: 'destruct' }
      : { label: 'tuple', direction: 'construct' };
  }
  if (term.kind === 'conditional') return { label: '?:', direction: 'select' };
  return null;
}

/** 出消息上的构造盒：同一族梯形横置，落在生命线到信道的路径上。 */
function wireMethodOf(
  term: PvTerm,
  destructorNames: ReadonlySet<string>,
): { label: string; direction: StructuredMethod['direction']; inputBindingIds: readonly string[] } | null {
  // 元组不是算子：线上不为它画构造盒，信道帧已经把结构写全了（链内元组仍画）。
  if (term.kind === 'tuple') return null;
  const method = methodOfTerm(term, destructorNames);
  if (method === null) return null;
  return {
    label: method.label,
    direction: method.direction,
    inputBindingIds: termBindingRefs(term).map((ref) => ref.bindingId),
  };
}

/** 盒下小字：算子的实参元组（`adec` → `(m, skB)`），与原型 caption 同口径。 */
function captionOf(term: PvTerm): string {
  if (term.kind === 'application') return `(${term.args.map((arg) => renderTerm(arg)).join(', ')})`;
  return renderTerm(term);
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

/** 分支标记的可读标签；#03 会用等值检查盒与臂道替换这个占位。 */
function branchLabel(item: Extract<RoleItem, { kind: 'branch' }>): string {
  if (item.marker === 'else') return item.empty === true ? 'else ∅' : 'else';
  if (item.marker === 'join') return 'join';
  return item.guard === undefined ? 'if' : `if ${renderCondition(item.guard)}`;
}

function renderCondition(condition: Condition): string {
  if (condition.kind === 'comparison') {
    return `${renderTerm(condition.left)} ${condition.operator} ${renderTerm(condition.right)}`;
  }
  if (condition.kind === 'compound') {
    return condition.clauses.map((clause) => renderCondition(clause)).join(` ${condition.operator} `);
  }
  return condition.text;
}

/** 臂道轨道 x：从值方块右缘之外起算，避免压住方块。 */
function armRailX(lifelineX: number, lane: number): number {
  return lifelineX + METRICS.valueWidth / 2 + 6 + lane * METRICS.laneStep;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 把旧 StepPairing 转为 v2 统一 IR，给迁移中的调用方使用。 */
export function legacyPairingsToMessagePairings(pairings: readonly StepPairing[]): readonly MessagePairing[] {
  return pairings.map((pairing) => ({ outEnd: pairing.from, inEnd: pairing.to, origin: 'automatic' }));
}
