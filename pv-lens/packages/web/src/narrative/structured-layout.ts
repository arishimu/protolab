import type {
  Binding,
  BranchItem,
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
import type { HorizontalNode, HorizontalSequence } from '@pv-lens/core';

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
  /** 分支守卫的臂道所在侧（+1 右 / -1 左）；折叠开关渲染在反侧。 */
  outward?: 1 | -1;
  /** 该检查盒是某个分支的守卫时，记录分支 item id 与守卫原文（折叠开关用）。 */
  branchId?: string;
  branchText?: string;
  sourceSpan: SourceSpan;
}

/**
 * 虚线芯片：派生值（解构输出未绑定）、条件芯片、表模式芯片不发值身份色；
 * `wire` 是未配对消息的线上词项（该词项在别处不再重复书写），描边用未配对橙。
 */
export interface StructuredChip {
  id: string;
  roleIndex: number;
  text: string;
  kind: 'derived' | 'condition' | 'pattern' | 'wire';
  color?: string;
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
  /** 臂道画在生命线的哪一侧：+1 右 / -1 左（= 远离信道的方向）。 */
  outward: 1 | -1;
  /** 因两道封顶而需要道内缩进的层数（0 = 不缩进）。 */
  overflow: number;
  /** 轨道 x 与它接回的生命线 x（两端横 tick 用）。 */
  railX: number;
  lifelineX: number;
  top: number;
  bottom: number;
  empty: boolean;
  label: string;
}

/** 折叠后的分支条：一整段 `branch…join` 收成一格，点它重新展开。 */
export interface StructuredBranchFold {
  /** 折叠键：分支标记 item 的稳定 id。 */
  branchId: string;
  roleIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 折叠条全文：`▸ if x = a · +3`。 */
  label: string;
  guardText: string;
  hiddenCount: number;
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
  /** 一条消息只在信道帧内写一遍的词项（取发送端 wire term）与帧的中轴 y。 */
  termText: string;
  termPresentation: StructuredEndpoint['termPresentation'];
  /** identity 接收去重时，接收绑定省略泳道方块，改在帧内词项旁标注值身份色带。 */
  termValueColor?: string;
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
  branchFolds: readonly StructuredBranchFold[];
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
  /** 已折叠的分支（按分支标记 item id）；折叠只作显式开关，默认展开。 */
  collapsedBranches?: readonly string[];
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
  /** 臂道轨道间距（臂道画在信道外侧，与 prototype 08 同口径）。 */
  laneStep: 22,
  /** 两道封顶后，更深层嵌套在同一道内的缩进步长。 */
  laneOverflowIndent: 12,
  /** 有分支角色的臂道翻到左侧时，给画布左边留出的额外余量。 */
  leftArmMargin: 56,
  /** 值层构造链：横置盒与输出值块相对生命线朝信道方向的偏移。 */
  chainConstructOffset: 46,
  chainOutputOffset: 88,
  /** 折叠分支条的高度与最大宽度。 */
  branchFoldHeight: 22,
  branchFoldMaxWidth: 200,
  chainPadding: 6,
  methodWidth: 66,
  methodHeight: 24,
  /** 构造盒落在「生命线 → 消息」路径上的横向偏移。 */
  wireMethodOffset: 58,
  /** 行标签起点相对生命线的缩进（避开方法盒右缘与值方块）。 */
  labelInset: 37,
  /** 未配对线上芯片：置于该行值层之下的间隙与宽度上限（不越出自身泳道）。 */
  wireChipGap: 6,
  wireChipMaxWidth: 132,
  /** 跨泳道消息线的禁置带半高：线两侧该范围内不放本列值层元素。 */
  crossReserveHalf: 11,
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
  // 臂道画在信道外侧、构造链画在内侧（朝信道）——与 prototype 08 同口径。
  const channelPositions = horizontal.nodes.flatMap((node, position) => node.kind === 'channel' ? [position] : []);
  const nearestChannelPosition = (position: number): number => channelPositions.reduce(
    (best, candidate) => Math.abs(candidate - position) < Math.abs(best - position) ? candidate : best,
    channelPositions[0] ?? position,
  );
  const outwardByColumn = new Map<string, 1 | -1>();
  horizontal.nodes.forEach((node, position) => {
    outwardByColumn.set(
      columnKey(node),
      channelPositions.length === 0 || nearestChannelPosition(position) >= position ? -1 : 1,
    );
  });
  const needsLeftArmMargin = roles.some((role) => outwardByColumn.get(`role:${role.name}`) === -1
    && role.items.some((item) => item.kind === 'branch' && item.marker === 'branch'));
  const margin = METRICS.margin + (needsLeftArmMargin ? METRICS.leftArmMargin : 0);
  const columnX = (index: number): number => margin + index * (METRICS.columnWidth + METRICS.columnGap);
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
  const branchFolds: StructuredBranchFold[] = [];
  const endpoints: StructuredEndpoint[] = [];
  const bindingColors = assignBindingColors(roles);
  const collapsedBranches = new Set(options.collapsedBranches ?? []);
  const bindingById = new Map(roles.flatMap((role) => role.bindings).map((binding) => [binding.id, binding]));
  const destructorNames = new Set(result.destructors.map((destructor) => destructor.name));
  let maxBottom = margin + METRICS.headerHeight;
  let maxTextRight = 0;
  const usedY = new Set<number>();

  // —— 行几何预计算（F2/F3/F5）——
  // 先用与正式放置完全相同的游标推进规则算出每个 item 的行 y（并登记全局 usedY），
  // 才能在正式放置前给「被消息线穿过的中间角色列」登记禁置带。
  const roleIndexByName = new Map(roles.map((role, index) => [role.name, index]));
  const endpointChannelByRef = new Map<string, string>();
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item) => {
      if (item.kind !== 'message') return;
      endpointChannelByRef.set(`${roleIndex}:${item.endpoint.stepIndex}`, renderTerm(item.endpoint.channel));
    });
  });
  // 与消息柱构建同一条有效性规则（两端存在且同信道），无效配对不触发去重。
  const pairedKeys = new Set<string>();
  (options.pairings ?? []).forEach((pairing) => {
    const outKey = `${pairing.outEnd.roleIndex}:${pairing.outEnd.stepIndex}`;
    const inKey = `${pairing.inEnd.roleIndex}:${pairing.inEnd.stepIndex}`;
    const outChannel = endpointChannelByRef.get(outKey);
    const inChannel = endpointChannelByRef.get(inKey);
    if (outChannel === undefined || inChannel === undefined || outChannel !== inChannel) return;
    pairedKeys.add(outKey);
    pairedKeys.add(inKey);
  });

  /** identity 接收（F5）：`in(c, x)` 词项恰为绑定变量且已配对 → 泳道省略绑定方块，帧内标值身份色。 */
  const identityTermColorByRef = new Map<string, string>();
  const chainOfItem = (item: RoleItem, roleIndex: number): ChainEntry[] => {
    const chain = valueChainOf(item, bindingById, destructorNames);
    if (item.kind !== 'message' || item.endpoint.direction !== 'in') return chain;
    const ref = `${roleIndex}:${item.endpoint.stepIndex}`;
    const term = item.endpoint.term;
    if (!pairedKeys.has(ref) || term.kind !== 'variable' || term.bindingId === undefined) return chain;
    const filtered = chain.filter((entry) => !(entry.kind === 'value' && entry.bindingId === term.bindingId && entry.occurrence === 'binding'));
    if (filtered.length !== chain.length) {
      const color = bindingColors.get(term.bindingId);
      if (color !== undefined) identityTermColorByRef.set(ref, color);
    }
    return filtered;
  };

  /** 未配对端的线上芯片（F2）：词项不是裸绑定变量才画（裸变量已由泳道内的值方块写明）。 */
  const wireChipOf = (item: RoleItem, roleIndex: number): boolean => {
    if (item.kind !== 'message') return false;
    if (pairedKeys.has(`${roleIndex}:${item.endpoint.stepIndex}`)) return false;
    const term = item.endpoint.term;
    if (term.kind === 'variable' && term.bindingId !== undefined) return false;
    return channelColumns.has(renderTerm(item.endpoint.channel));
  };

  const baseHeightOf = (item: RoleItem): number => item.kind === 'branch'
    ? METRICS.branchHeight
    : item.kind === 'event'
      ? METRICS.eventHeight
      : item.kind === 'message'
        ? METRICS.messageHeight
        : METRICS.localHeight;
  const advanceAfterRow = (y: number, rowHeight: number, chip: boolean): number =>
    y + rowHeight / 2 + (chip ? METRICS.wireChipGap + METRICS.chipHeight : 0) + gapUnit;
  const startCursor = (role: PvRole): number => {
    const parameterCount = role.bindings.filter((binding) => binding.kind === 'parameter').length;
    return parameterCount === 0
      ? margin + METRICS.headerHeight + METRICS.parameterHeight
      : METRICS.headerHeight + METRICS.parameterLabelGap + 14 + parameterCount * METRICS.valuePitch;
  };

  interface RowInfo { y: number; rowHeight: number; chip: boolean }
  /**
   * 行 y 的分配（含行级禁置带避让）：整行与其链带若压到预留带，则整行下移。
   * 预留带来自其它角色的消息线，而线 y 又来自行 y——以三遍迭代收敛：
   * 第一遍无避让求出初始线位，随后每遍用最新带重算行 y 与线 y。
   */
  const computeRows = (reserved: ReadonlyMap<number, readonly number[]>): {
    rowInfo: Map<string, RowInfo>;
    foldYByBranch: Map<string, number>;
    endpointRows: Array<{ roleIndex: number; itemIndex: number; y: number }>;
  } => {
    const rowInfo = new Map<string, RowInfo>();
    const foldYByBranch = new Map<string, number>();
    const endpointRows: Array<{ roleIndex: number; itemIndex: number; y: number }> = [];
    const rowUsedY = new Set<number>();
    roles.forEach((role, roleIndex) => {
      const bands = reserved.get(roleIndex) ?? [];
      const clearsBands = (top: number, bottom: number): boolean =>
        bands.every((bandY) => bottom <= bandY - METRICS.crossReserveHalf || top >= bandY + METRICS.crossReserveHalf);
      let cursor = startCursor(role);
      let foldedDepth = 0;
      role.items.forEach((item, itemIndex) => {
        if (foldedDepth > 0) {
          if (isBranchStart(item)) foldedDepth += 1;
          else if (isBranchJoin(item)) foldedDepth -= 1;
          return;
        }
        if (isBranchStart(item) && collapsedBranches.has(item.id)) {
          let y = uniqueY(cursor + METRICS.branchFoldHeight / 2, rowUsedY);
          while (!clearsBands(y - METRICS.branchFoldHeight / 2 - 2, y + METRICS.branchFoldHeight / 2 + 2)) {
            y = uniqueY(y + METRICS.crossReserveHalf * 2 + METRICS.branchFoldHeight / 2 + 2, rowUsedY);
          }
          rowUsedY.add(y);
          foldYByBranch.set(item.id, y);
          cursor = y + METRICS.branchFoldHeight / 2 + gapUnit;
          foldedDepth = 1;
          return;
        }
        const rowHeight = Math.max(baseHeightOf(item), chainHeightOf(chainOfItem(item, roleIndex)) + METRICS.chainPadding);
        let y = uniqueY(cursor + rowHeight / 2, rowUsedY);
        while (!clearsBands(y - rowHeight / 2 - 2, y + rowHeight / 2 + 2)) {
          y = uniqueY(y + METRICS.crossReserveHalf * 2 + rowHeight + 4, rowUsedY);
        }
        rowUsedY.add(y);
        const chip = wireChipOf(item, roleIndex);
        rowInfo.set(`${roleIndex}:${String(itemIndex)}`, { y, rowHeight, chip });
        if (item.kind === 'message') endpointRows.push({ roleIndex, itemIndex, y });
        cursor = advanceAfterRow(y, rowHeight, chip);
      });
    });
    return { rowInfo, foldYByBranch, endpointRows };
  };

  /** 由端点行位推「被穿过的中间角色列」的预留带。 */
  const computeReservations = (endpointRows: readonly { roleIndex: number; itemIndex: number; y: number }[]): Map<number, number[]> => {
    const reservedYsByRole = new Map<number, number[]>();
    endpointRows.forEach((row) => {
      const role = roles[row.roleIndex];
      const item = role?.items[row.itemIndex];
      if (role === undefined || item === undefined || item.kind !== 'message') return;
      const column = roleColumns.get(role.name);
      if (column === undefined) return;
      const lifelineX = column.x + column.width / 2;
      const channel = channelColumns.get(renderTerm(item.endpoint.channel));
      if (channel === undefined) return;
      const channelCenterX = channel.x + channel.width / 2;
      const left = Math.min(lifelineX, channelCenterX);
      const right = Math.max(lifelineX, channelCenterX);
      columns.forEach((other) => {
        if (other.kind !== 'role' || other.name === role.name) return;
        const otherCenterX = other.x + other.width / 2;
        if (otherCenterX <= left || otherCenterX >= right) return;
        const otherIndex = roleIndexByName.get(other.name);
        if (otherIndex === undefined) return;
        const bands = reservedYsByRole.get(otherIndex) ?? [];
        bands.push(row.y);
        reservedYsByRole.set(otherIndex, bands);
      });
    });
    return reservedYsByRole;
  };

  let rows = computeRows(new Map());
  for (let pass = 0; pass < 2; pass += 1) {
    rows = computeRows(computeReservations(rows.endpointRows));
  }
  const { rowInfo, foldYByBranch } = rows;

  roles.forEach((role, roleIndex) => {
    const column = roleColumns.get(role.name);
    if (column === undefined) return;
    const outward = outwardByColumn.get(`role:${role.name}`) ?? 1;
    const inward: 1 | -1 = outward === 1 ? -1 : 1;
    const lifelineX = column.x + column.width / 2;
    /** 值层竖向链的当前列（守卫盒 / 芯片 / 解构盒仍贴生命线；构造链另朝信道偏移）。 */
    const rowX = lifelineX;
    const nextColumn = columns[(columnPosition.get(`role:${role.name}`) ?? 0) + 1];
    // 标签不越列（F7）：预算止于下一列左缘，不再借用信道总线——事件/守卫原文
    // 曾经穿过信道轨道压在总线块上；超预算由渲染方截断，全文进 title。
    const labelLimitX = nextColumn === undefined ? Number.POSITIVE_INFINITY : nextColumn.x - 8;

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
    let cursor = startCursor(role);

    // 折叠分支时跳过 `branch…join` 的整个区间；`foldedDepth` 记录剩余要吞掉的嵌套层数。
    let foldedDepth = 0;
    role.items.forEach((item, itemIndex) => {
      if (foldedDepth > 0) {
        if (isBranchStart(item)) foldedDepth += 1;
        else if (isBranchJoin(item)) foldedDepth -= 1;
        return;
      }
      if (isBranchStart(item) && collapsedBranches.has(item.id)) {
        const hiddenCount = countBranchItems(role.items, itemIndex);
        const height = METRICS.branchFoldHeight;
        const y = foldYByBranch.get(item.id) ?? uniqueY(cursor + height / 2, usedY);
        const label = `▸ ${branchLabel(item)} · +${String(hiddenCount)}`;
        // 折叠条封在自身泳道内（F8）：不再越列压到邻列元素，文字随宽截断。
        const width = Math.min(METRICS.branchFoldMaxWidth, METRICS.columnWidth - 8, 24 + label.length * CHAR_WIDTH);
        branchFolds.push({
          branchId: item.id,
          roleIndex,
          x: lifelineX,
          y,
          width,
          height,
          label,
          guardText: guardTextOf(item),
          hiddenCount,
          sourceSpan: item.span,
        });
        maxTextRight = Math.max(maxTextRight, lifelineX + width / 2);
        cursor = y + height / 2 + gapUnit;
        maxBottom = Math.max(maxBottom, cursor);
        foldedDepth = 1;
        return;
      }

      const stepItem = item.kind === 'message' ? item : undefined;
      let wireChipBottom = 0;
      const chain = chainOfItem(item, roleIndex);
      const baseHeight = baseHeightOf(item);
      const fallbackHeight = Math.max(baseHeight, chainHeightOf(chain) + METRICS.chainPadding);
      // 行 y 来自预计算（与禁置带、全局 usedY 同源）；兜底路径只在预计算缺失时用。
      const info = rowInfo.get(`${roleIndex}:${String(itemIndex)}`)
        ?? { y: uniqueY(cursor + fallbackHeight / 2, usedY), rowHeight: fallbackHeight, chip: wireChipOf(item, roleIndex) };
      const { y, rowHeight } = info;

      if (item.kind === 'branch') {
        if (item.marker === 'branch') {
          const enclosingElse = armStack.filter((frame) => frame.lane >= 2).length;
          const lane = Math.min(2, 1 + enclosingElse);
          const overflow = Math.max(0, enclosingElse - 1);
          const label = armRunLabel('then', false, overflow);
          const railX = armRailX(lifelineX, lane, outward, overflow);
          armRuns.push({
            id: item.id,
            roleIndex,
            arm: 'then',
            lane,
            outward,
            overflow,
            railX,
            lifelineX,
            top: y,
            bottom: y,
            empty: false,
            label,
          });
          if (outward > 0) maxTextRight = Math.max(maxTextRight, railX + 5 + label.length * CHAR_WIDTH);
          armStack.push({ runIndex: armRuns.length - 1, lane, enclosingElse });
        } else if (item.marker === 'else') {
          const frame = armStack[armStack.length - 1];
          if (frame !== undefined) {
            const run = armRuns[frame.runIndex];
            if (run !== undefined) armRuns[frame.runIndex] = { ...run, bottom: y };
            const lane = Math.min(2, 2 + frame.enclosingElse);
            const overflow = Math.max(0, frame.enclosingElse - 1);
            const empty = item.empty === true;
            const label = armRunLabel('else', empty, overflow);
            const railX = armRailX(lifelineX, lane, outward, overflow);
            armRuns.push({
              id: item.id,
              roleIndex,
              arm: 'else',
              lane,
              outward,
              overflow,
              railX,
              lifelineX,
              top: y,
              bottom: y,
              empty,
              label,
            });
            if (outward > 0) maxTextRight = Math.max(maxTextRight, railX + 5 + label.length * CHAR_WIDTH);
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

      const labelX = stepItem === undefined ? lifelineX + METRICS.labelInset : lifelineX;
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
      // 构造链例外：横置盒朝信道方向偏移，绑定的输出值块落在盒的远端（prototype 08 口径）。
      let slotTop = y - chainHeightOf(chain) / 2;
      const firstCheckIndex = chain.findIndex((entry) => entry.kind === 'check');
      let pendingConstruct: { entryIndex: number; boxY: number; outputX: number; outputBindingIds: readonly string[] } | null = null;
      chain.forEach((entry, entryIndex) => {
        if (entry.kind === 'value') {
          const binding = bindingById.get(entry.bindingId);
          if (binding === undefined) return;
          const outputSlot = pendingConstruct === null ? -1 : pendingConstruct.outputBindingIds.indexOf(entry.bindingId);
          if (pendingConstruct !== null && outputSlot >= 0 && entryIndex === pendingConstruct.entryIndex + 1 + outputSlot) {
            const outputCount = pendingConstruct.outputBindingIds.length;
            const outputY = pendingConstruct.boxY + (outputSlot - (outputCount - 1) / 2) * METRICS.valuePitch;
            valueBlocks.push(valueBlockOf(binding, roleIndex, pendingConstruct.outputX, outputY, 'binding', bindingColors, valueBlocks.length));
            return;
          }
          const slotY = slotTop + METRICS.valuePitch / 2;
          slotTop += METRICS.valuePitch;
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
            id: `${item.id}:check:${String(entryIndex)}`,
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
            // 复合守卫会有多行检查盒，折叠开关只挂在第一行，一个分支一个开关。
            ...(isBranchStart(item) && entryIndex === firstCheckIndex
              ? { branchId: item.id, branchText: guardTextOf(item), outward }
              : {}),
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
        // 构造 = 横置梯形，朝信道方向偏移；解构 / 选择留在生命线上竖置。
        const isConstruct = entry.direction === 'construct';
        const boxX = isConstruct ? lifelineX + inward * METRICS.chainConstructOffset : lifelineX;
        methods.push({
          id: `${item.id}:method`,
          roleIndex,
          label: entry.label,
          ...(entry.caption === undefined ? {} : { caption: entry.caption }),
          direction: entry.direction,
          ...(isConstruct ? { narrowTowards: inward > 0 ? 'right' as const : 'left' as const } : {}),
          x: boxX,
          y: boxCenterY,
          width: METRICS.methodWidth,
          height: METRICS.methodHeight,
          inputBindingIds: entry.inputBindingIds,
          outputBindingIds: entry.outputBindingIds,
          sourceSpan: item.span,
        });
        if (isConstruct) {
          pendingConstruct = {
            entryIndex,
            boxY: boxCenterY,
            outputX: lifelineX + inward * METRICS.chainOutputOffset,
            outputBindingIds: entry.outputBindingIds,
          };
          maxTextRight = Math.max(maxTextRight, boxX + METRICS.methodWidth / 2 + 8);
          maxTextRight = Math.max(maxTextRight, lifelineX + inward * (METRICS.chainOutputOffset + METRICS.valueWidth / 2));
        } else {
          pendingConstruct = null;
        }
        if (entry.caption !== undefined) {
          const captionChars = Math.min(entry.caption.length, 16);
          maxTextRight = Math.max(maxTextRight, boxX + (captionChars * CAPTION_CHAR_WIDTH) / 2);
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
          // 未配对端的线上词项芯片（F2）：落在自身泳道、该行值层之下，宽度按文字估算，
          // 描边用未配对橙与虚线/空心点同色——不再画在 0.72 分位点压住邻列文字。
          if (info.chip) {
            const text = renderTerm(stepItem.endpoint.term);
            const chipWidth = Math.min(METRICS.wireChipMaxWidth, 20 + text.length * CAPTION_CHAR_WIDTH);
            const chipY = Math.max(y + rowHeight / 2, slotTop) + METRICS.wireChipGap + METRICS.chipHeight / 2;
            chips.push({
              id: `${item.id}:wire-chip`,
              roleIndex,
              text,
              kind: 'wire',
              color: '#C2410C',
              x: lifelineX,
              y: chipY,
              width: chipWidth,
              height: METRICS.chipHeight,
              sourceSpan: item.span,
            });
            maxTextRight = Math.max(maxTextRight, lifelineX + chipWidth / 2);
            wireChipBottom = chipY + METRICS.chipHeight / 2;
          }
        }
      }

      // 芯片可能因禁置带/链下移而低于常规行底，游标取两者较大者。
      cursor = Math.max(advanceAfterRow(y, rowHeight, info.chip), wireChipBottom + gapUnit);
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
    // identity 接收去重时，接收绑定的值身份色转移到信道帧词项上（F5）。
    const termValueColor = identityTermColorByRef.get(`${pairing.inEnd.roleIndex}:${pairing.inEnd.stepIndex}`);
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
      ...(termValueColor === undefined ? {} : { termValueColor }),
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
    ? margin
    : columns[columns.length - 1].x + columns[columns.length - 1].width;
  const width = Math.max(columnsRight + margin, maxTextRight + 12);
  return {
    columns,
    nodes,
    valueBlocks,
    methods,
    chips,
    armRuns,
    branchFolds,
    endpoints: finalEndpoints,
    pillars: finalPillars,
    conflicts,
    horizontal,
    width,
    height: maxBottom + margin,
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
          caption: methodCaptionOf(item.pattern),
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
        caption: methodCaptionOf(item.term),
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
          caption: methodCaptionOf(side),
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

/**
 * 盒下小字（F6 收紧）：实参全部是已绑定变量时不写——操作数已以同色值方块排在盒旁，
 * caption 只补「方块写不出的实参」（自由名、字面量等）。
 */
function methodCaptionOf(term: PvTerm): string | undefined {
  if (term.kind === 'application' && term.args.every((arg) => arg.kind === 'variable' && arg.bindingId !== undefined)) {
    return undefined;
  }
  return captionOf(term);
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

/** 分支标记的可读标签。 */
function branchLabel(item: BranchItem): string {
  if (item.marker === 'else') return item.empty === true ? 'else ∅' : 'else';
  if (item.marker === 'join') return 'join';
  const keyword = item.guardKind === 'get' ? 'get' : 'if';
  const guard = guardTextOf(item);
  return guard.length === 0 ? keyword : `${keyword} ${guard}`;
}

/** 守卫的可读原文：结构化的 `Condition` 优先，回退到源码片段。 */
function guardTextOf(item: BranchItem): string {
  if (item.guard !== undefined) return renderCondition(item.guard);
  return item.guardText ?? '';
}

/** 臂道标签：两道封顶后，更深层嵌套在道内缩进并以 `↳ … +N` 标出。 */
function armRunLabel(arm: 'then' | 'else', empty: boolean, overflow: number): string {
  const base = arm === 'then' ? 'then' : empty ? 'else ∅' : 'else';
  return overflow > 0 ? `↳ ${base} +${String(overflow)}` : base;
}

/** 分支标记流的两种边界：`branch` 开始一层，`join` 关闭一层。 */
function isBranchStart(item: RoleItem): item is BranchItem {
  return item.kind === 'branch' && item.marker === 'branch';
}

function isBranchJoin(item: RoleItem): item is BranchItem {
  return item.kind === 'branch' && item.marker === 'join';
}

/** 折叠一个分支时要吞掉的可见步骤数（不含分支标记本身；嵌套分支一并计入）。 */
function countBranchItems(items: readonly RoleItem[], startIndex: number): number {
  let depth = 1;
  let count = 0;
  for (let index = startIndex + 1; index < items.length; index += 1) {
    const item = items[index];
    if (isBranchStart(item)) depth += 1;
    else if (isBranchJoin(item)) {
      depth -= 1;
      if (depth === 0) break;
    }
    if (item.kind !== 'branch') count += 1;
  }
  return count;
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

/** 臂道轨道 x：从值方块外侧起算，画在信道的外侧（远离消息方向）。 */
function armRailX(lifelineX: number, lane: number, outward: 1 | -1, overflow: number): number {
  return lifelineX + outward * (METRICS.valueWidth / 2 + 6 + lane * METRICS.laneStep + overflow * METRICS.laneOverflowIndent);
}

/** 水平序列节点的稳定键。 */
function columnKey(node: HorizontalNode): string {
  return `${node.kind}:${node.name}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 把旧 StepPairing 转为 v2 统一 IR，给迁移中的调用方使用。 */
export function legacyPairingsToMessagePairings(pairings: readonly StepPairing[]): readonly MessagePairing[] {
  return pairings.map((pairing) => ({ outEnd: pairing.from, inEnd: pairing.to, origin: 'automatic' }));
}
