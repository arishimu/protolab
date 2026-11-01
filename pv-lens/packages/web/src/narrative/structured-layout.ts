import type {
  Binding,
  BranchItem,
  Condition,
  MessagePairing,
  PairingOrigin,
  ParseResult,
  PvRole,
  PvTerm,
  RoleItem,
  SourceSpan,
} from '@pv-lens/core';
import { narrativeRoleOrder, renderTerm, solveHorizontalSequence } from '@pv-lens/core';
import { gapUnitOf, solveSpacing } from '@pv-lens/core';
import type { SpacingUnit } from '@pv-lens/core';
import type { HorizontalNode, HorizontalSequence } from '@pv-lens/core';

export const MESSAGE_COLORS = ['#2563EB', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#475569'] as const;
export const VALUE_COLORS = ['#BFDBFE', '#A5F3FC', '#BBF7D0', '#FED7AA', '#FECACA', '#DDD6FE', '#FBCFE8', '#CBD5E1'] as const;
/** 未配对端点统一用色（虚线/空心圆点/线上词项芯片），与 v2.css 的 #c2410c 同值。 */
export const UNPAIRED_COLOR = '#C2410C';

/** 端点引用键：角色下标 + 消息步序，配对、预留带与去重共用同一表示。 */
const refOf = (roleIndex: number, stepIndex: number): string => `${roleIndex}:${stepIndex}`;

/** 行键：角色下标 + item 下标（预计算与正式放置之间按它对行 y 达成一致）。 */
const rowKeyOf = (roleIndex: number, itemIndex: number): string => `${roleIndex}:${String(itemIndex)}`;
/** 算子簇键：折叠决策（内部 Map）与公开 clusterId 共用同一拼装（07b）。 */
const clusterKeyOf = (roleIndex: number, itemIndex: number): string => `opcluster:${String(roleIndex)}:${String(itemIndex)}`;
/** 折叠条宽度：封在自身泳道内，随文字截断（分支折叠条与算子折叠条同式，F8 口径）。 */
function foldBarWidthOf(label: string): number {
  return Math.min(METRICS.branchFoldMaxWidth, METRICS.columnWidth - 8, 24 + label.length * CHAR_WIDTH);
}

/** 折叠条内文字的截断预算（与 foldBarWidthOf 的宽度公式同源；渲染方 SVG 用）。 */
export function foldLabelBudgetOf(width: number): number {
  return Math.max(4, Math.floor((width - 12) / CHAR_WIDTH));
}

/**
 * 信道帧宽度（09，ticket 11 移交项）：随词项长度伸缩，[56, 132]（METRICS 具名常量）——
 * 56 沿用 ticket02 定稿下限，132 与线上芯片同上限；帧居信道中轴，列间距 38 可容纳
 * 132/2=66 的外扩不触邻列生命线（最近邻生命线距信道中轴 ≥113）。
 */
export function messageFrameWidthOf(termText: string): number {
  return Math.min(
    METRICS.messageFrameMaxWidth,
    Math.max(METRICS.messageFrameMinWidth, METRICS.messageFramePad + termText.length * CAPTION_CHAR_WIDTH),
  );
}

/** 信道帧内词项的截断预算（渲染方 SVG 用；与 messageFrameWidthOf 同源）。 */
export function frameLabelBudgetOf(frameWidth: number): number {
  return Math.max(3, Math.floor((frameWidth - 10) / CAPTION_CHAR_WIDTH));
}
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
  /** 值身份序号（09 / spec 65）：绑定全局序 1 起；色轮转超八后靠它区分同名色。 */
  ordinal: number;
  occurrence: 'binding' | 'reference' | 'equality';
  x: number;
  y: number;
  width: number;
  height: number;
  /** 折叠算子簇的幽灵值块（spec 52）：虚线描边，表示折叠区仍被后续引用的产出。 */
  ghost?: boolean;
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

/** 高密度算子簇阈值（spec 故事 51）：角色内连续的算子步骤达到该数量即默认折叠为一格。 */
export const OPERATOR_CLUSTER_MIN = 3;

/**
 * 折叠后的算子簇条（spec 51–53）：一格列出主导算子名与算子数，点击展开；
 * 悬停浮卡（title）列全部内含算子与仍被后续引用的值；簇下方是虚线幽灵值块。
 */
export interface StructuredOperatorClusterFold {
  /** 折叠键：`opcluster:{roleIndex}:{firstItemIndex}`。 */
  clusterId: string;
  roleIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 折叠条全文：`主导算子名 ×算子数`。 */
  label: string;
  /** 内含算子标签清单（hover 全文与测试断言用）。 */
  memberLabels: readonly string[];
  /** 仍被簇外后续引用的产出绑定名（虚线幽灵值块清单）。 */
  ghostLabels: readonly string[];
  /** 被折叠隐藏的步骤数。 */
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
  /** 柱来源：自动配对或含人工声明（广播分组按发送端归并，ADR-0007）。 */
  origin: PairingOrigin;
  channelName: string;
  channelX: number;
  top: number;
  bottom: number;
  /** 一条消息只在信道帧内写一遍的词项（取发送端 wire term）与帧的中轴 y。 */
  termText: string;
  termPresentation: StructuredEndpoint['termPresentation'];
  /** identity 接收去重时，接收绑定的值身份色以帧内色带标注，泳道省略同名词块。 */
  termValueColor?: string;
  /** 信道帧宽度（09：随词项长度在 [56,132] 内伸缩，列间隙容纳不越列；截断预算由它派生）。 */
  frameWidth: number;
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
  operatorFolds: readonly StructuredOperatorClusterFold[];
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
  /**
   * 显式展开的算子簇（spec 51 与分支相反）：高密度算子簇默认折叠，
   * 集合语义为「用户已点开的簇」，缺省为空 = 全部折叠。
   */
  expandedOperatorClusters?: readonly string[];
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
  /** 折叠算子簇格的高度（spec 51：一格列算子名与数量）。 */
  operatorFoldHeight: 24,
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
  /** 信道帧宽度的下限 / 上限与文字内边距（09：下限沿用 ticket02 定稿 56，上限与线上芯片同宽）。 */
  messageFrameMinWidth: 56,
  messageFrameMaxWidth: 132,
  messageFramePad: 14,
} as const;

/** v2 的内容驱动几何：各角色保留本地顺序，只有信道柱跨角色共享。 */
export function buildStructuredNarrativeLayout(
  result: ParseResult,
  options: StructuredLayoutOptions = {},
): StructuredNarrativeLayout {
  const roles = narrativeRoleOrder(result);
  const compactness = clamp(options.compactness ?? 0, 0, 1);
  const gapUnit = gapUnitOf(compactness);
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
  const operatorFolds: StructuredOperatorClusterFold[] = [];
  const endpoints: StructuredEndpoint[] = [];
  const bindingColors = assignBindingColors(roles);
  const collapsedBranches = new Set(options.collapsedBranches ?? []);
  const bindingById = new Map(roles.flatMap((role) => role.bindings).map((binding) => [binding.id, binding]));
  const destructorNames = new Set(result.destructors.map((destructor) => destructor.name));
  let maxBottom = margin + METRICS.headerHeight;
  let maxTextRight = 0;

  // —— 间距解算准备（F2/F3/F5 → ticket 07 三段式）——
  // 配对键先行推导（identity 去重与芯片判定在单元构建阶段就要用）；y 分配、
  // 禁置带收敛与显式冲突统一交给 core 的 solveSpacing（见下方单元构建段）。
  const roleIndexByName = new Map(roles.map((role, index) => [role.name, index]));
  const endpointChannelByRef = new Map<string, string>();
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item) => {
      if (item.kind !== 'message') return;
      endpointChannelByRef.set(refOf(roleIndex, item.endpoint.stepIndex), renderTerm(item.endpoint.channel));
    });
  });
  // 与消息柱构建同一条有效性规则（两端存在且同信道），无效配对不触发去重。
  const pairedKeys = new Set<string>();
  (options.pairings ?? []).forEach((pairing) => {
    const outKey = refOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex);
    const inKey = refOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex);
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
    const ref = refOf(roleIndex, item.endpoint.stepIndex);
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
    if (pairedKeys.has(refOf(roleIndex, item.endpoint.stepIndex))) return false;
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
  /** 该消息端的水平线穿过的中间角色下标（解算器据此产生禁置带；几何判定只在此处）。 */
  const crossedRolesOf = (roleName: string, channelName: string): number[] => {
    const column = roleColumns.get(roleName);
    const channel = channelColumns.get(channelName);
    if (column === undefined || channel === undefined) return [];
    const lifelineX = column.x + column.width / 2;
    const channelCenterX = channel.x + channel.width / 2;
    const left = Math.min(lifelineX, channelCenterX);
    const right = Math.max(lifelineX, channelCenterX);
    const crossed: number[] = [];
    columns.forEach((other) => {
      if (other.kind !== 'role' || other.name === roleName) return;
      const otherCenterX = other.x + other.width / 2;
      if (otherCenterX <= left || otherCenterX >= right) return;
      const otherIndex = roleIndexByName.get(other.name);
      if (otherIndex !== undefined) crossed.push(otherIndex);
    });
    return crossed;
  };

  interface RowMeta { chain: readonly ChainEntry[]; rowHeight: number; chip: boolean; refs: readonly string[] }
  /**
   * 三段式（ticket 07）：一次遍历构建每角色的布局单元（参数簇 / 行 / 芯片 / 折叠条），
   * 交给 core 的 `solveSpacing` 分配 y（三层档位、禁置带收敛、显式冲突都在解算器内），
   * 发射阶段只按解算结果摆放。参数簇与折叠条是刚性单元；未配对线上芯片是紧跟其行的
   * 独立 tight 单元（decision 08 把芯片列为闭集单元，不并入行高）；群组边界
   * （参数簇后首行 / join 后 / 折叠条后）用 group 档。动作区起点全图统一：
   * 所有角色的首行 top = max(各角色参数簇底) + group 档（decision 08 §4）。
   *
   * 07b 密度折叠：行元数据先全部预算（chain 只算一遍），再识别高密度算子簇并按
   * `expandedOperatorClusters` 决策折叠——折叠簇在组装与发射两个阶段都以
   * 「折叠格 + 幽灵值单元」替换簇内全部行。
   */
  const rowMetaByKey = new Map<string, RowMeta>();
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item, itemIndex) => {
      const chain = chainOfItem(item, roleIndex);
      const rowHeight = Math.max(baseHeightOf(item), chainHeightOf(chain) + METRICS.chainPadding);
      rowMetaByKey.set(rowKeyOf(roleIndex, itemIndex), {
        chain,
        rowHeight,
        chip: wireChipOf(item, roleIndex),
        refs: chainBindingIds(chain),
      });
    });
  });

  // —— 07b 算子簇识别与折叠决策（spec 51–53）——
  interface ClusterRange {
    clusterId: string;
    roleIndex: number;
    startIndex: number;
    endIndex: number;
    /** 每个成员的算子标签（method 的 label / check 的 op）。 */
    memberLabels: readonly string[];
    /** 折叠条全文：主导算子名 ×算子数。 */
    label: string;
    /** 簇产出且簇外仍引用的绑定 id（幽灵值块，按绑定全局序）。 */
    ghostBindingIds: readonly string[];
  }
  const expandedClusters = new Set(options.expandedOperatorClusters ?? []);
  const foldedClusterByStart = new Map<string, ClusterRange>();
  // 绑定全局序（assignBindingColors 的插入序）：幽灵值块按它排列，稳定且与值身份色同源。
  const globalBindingOrder = new Map([...bindingColors.keys()].map((id, index) => [id, index] as const));
  // 值身份序号（09 / spec 65）：绑定全局序 1 起，色与序号双通道（超八色同名靠序号区分）。
  // ?? -1 是防御性兜底：调用方传入的绑定都来自 role.bindings（与 assignBindingColors 同源），不可达。
  const ordinalOf = (bindingId: string): number => (globalBindingOrder.get(bindingId) ?? -1) + 1;
  // 「仍被后续引用」判定（spec 52）：绑定是角色本地的（id 带角色前缀），角色内 item 按源码序
  // 展开，对某绑定的引用只可能出现在引入它的 item 之上（源码序之后）——因此「全图引用集」
  // 与「簇外后续引用」等价，无需按位置过滤。
  const allRefs = new Set<string>();
  rowMetaByKey.forEach((meta) => meta.refs.forEach((id) => allRefs.add(id)));
  roles.forEach((role, roleIndex) => {
    let branchDepth = 0;
    let run: number[] = [];
    const flushRun = (): void => {
      if (run.length >= OPERATOR_CLUSTER_MIN) {
        const startIndex = run[0] ?? 0;
        const endIndex = run[run.length - 1] ?? 0;
        const memberLabels = run.flatMap((itemIndex) => {
          const meta = rowMetaByKey.get(rowKeyOf(roleIndex, itemIndex));
          return (meta?.chain ?? []).flatMap((entry) => entry.kind === 'method' ? [entry.label] : entry.kind === 'check' ? [entry.op] : []);
        });
        // 主导算子名：出现最多者，并列取先出现者；数量按算子盒总数（spec 51）。
        const counts = new Map<string, number>();
        memberLabels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
        let dominant = memberLabels[0] ?? '算子';
        let bestCount = 0;
        counts.forEach((count, name) => {
          if (count > bestCount) {
            bestCount = count;
            dominant = name;
          }
        });
        const clusterId = clusterKeyOf(roleIndex, startIndex);
        // 幽灵值（spec 52）：产出绑定中仍被簇外引用者，按绑定全局序排列。
        const produced: string[] = [];
        const innerRefs = new Set<string>();
        for (let index = startIndex; index <= endIndex; index += 1) {
          const item = role.items[index];
          if (item !== undefined && item.kind === 'local') produced.push(...item.bindingIds);
          rowMetaByKey.get(rowKeyOf(roleIndex, index))?.refs.forEach((id) => innerRefs.add(id));
        }
        const ghostBindingIds = produced
          .filter((id, index) => produced.indexOf(id) === index)
          .filter((id) => !innerRefs.has(id) && allRefs.has(id))
          .sort((a, b) => (globalBindingOrder.get(a) ?? 0) - (globalBindingOrder.get(b) ?? 0));
        if (!expandedClusters.has(clusterId)) {
          foldedClusterByStart.set(clusterKeyOf(roleIndex, startIndex), {
            clusterId,
            roleIndex,
            startIndex,
            endIndex,
            memberLabels,
            label: `${dominant} ×${String(memberLabels.length)}`,
            ghostBindingIds,
          });
        }
      }
      run = [];
    };
    role.items.forEach((item, itemIndex) => {
      if (item.kind === 'branch') {
        if (item.marker === 'branch') branchDepth += 1;
        else if (item.marker === 'join') branchDepth = Math.max(0, branchDepth - 1);
        flushRun();
        return;
      }
      // 分支内部与被折叠分支吞掉的区间都不参与成簇；非算子本地步骤（new/insert/纯绑定）断簇。
      const inFoldedBranch = branchDepth > 0;
      const meta = rowMetaByKey.get(rowKeyOf(roleIndex, itemIndex));
      const hasBox = (meta?.chain ?? []).some((entry) => entry.kind === 'method' || entry.kind === 'check');
      if (!inFoldedBranch && item.kind === 'local' && hasBox) {
        run.push(itemIndex);
        return;
      }
      flushRun();
    });
    flushRun();
  });
  const foldedClusterAt = (roleIndex: number, itemIndex: number): ClusterRange | undefined =>
    foldedClusterByStart.get(clusterKeyOf(roleIndex, itemIndex));
  const unitsByRole: SpacingUnit[][] = roles.map(() => []);
  const parameterClusterHeight = roles.reduce(
    (max, role) => Math.max(max, role.bindings.filter((binding) => binding.kind === 'parameter').length * METRICS.valuePitch),
    0,
  );
  const parameterTop = METRICS.headerHeight + METRICS.parameterLabelGap + 14;
  // 无参数簇的角色从统一动作线起步；有簇角色的簇固定画在 paramTop，簇后首行经 group 档落在同一条线上。
  const actionStart = parameterTop + parameterClusterHeight + Math.max(50, 2.4 * gapUnit);
  const startOffsets: number[] = [];
  roles.forEach((role, roleIndex) => {
    const parameterCount = role.bindings.filter((binding) => binding.kind === 'parameter').length;
    startOffsets[roleIndex] = parameterCount > 0 ? parameterTop : actionStart;
    const units = unitsByRole[roleIndex] ?? [];
    unitsByRole[roleIndex] = units;
    if (parameterCount > 0) {
      units.push({
        id: `params:${String(roleIndex)}`,
        roleIndex,
        kind: 'parameter-cluster',
        height: parameterCount * METRICS.valuePitch,
        rigid: true,
        messageEndpoint: false,
        gapTier: 'tight',
      });
    }
    let foldedDepth = 0;
    let prevIsBoundary = parameterCount > 0;
    // 07b：折叠算子簇吞掉 `[start, end]` 区间——区间内的行不进单元序列（forEach 无法跳区间，
    // 用哨兵变量把区间内 item 短路成空操作）。
    let clusterSkipUntil = -1;
    role.items.forEach((item, itemIndex) => {
      if (itemIndex <= clusterSkipUntil) return;
      if (foldedDepth > 0) {
        if (isBranchStart(item)) foldedDepth += 1;
        else if (isBranchJoin(item)) foldedDepth -= 1;
        return;
      }
      if (isBranchStart(item) && collapsedBranches.has(item.id)) {
        units.push({
          id: `fold:${item.id}`,
          roleIndex,
          kind: 'branch-fold',
          height: METRICS.branchFoldHeight,
          rigid: true,
          messageEndpoint: false,
          gapTier: prevIsBoundary ? 'group' : 'row',
        });
        prevIsBoundary = true;
        foldedDepth = 1;
        return;
      }
      const foldedCluster = foldedClusterAt(roleIndex, itemIndex);
      if (foldedCluster !== undefined) {
        // 折叠算子簇（spec 51）：一格 rigid 折叠团；下方幽灵值块仍是后续引用的数据流
        // （spec 52），作为独立刚性单元紧跟其后。折叠不改消息行距——簇内没有消息行。
        units.push({
          id: foldedCluster.clusterId,
          roleIndex,
          kind: 'fold-group',
          height: METRICS.operatorFoldHeight,
          rigid: true,
          messageEndpoint: false,
          gapTier: prevIsBoundary ? 'group' : 'row',
        });
        if (foldedCluster.ghostBindingIds.length > 0) {
          units.push({
            id: `${foldedCluster.clusterId}:ghost`,
            roleIndex,
            kind: 'row',
            height: foldedCluster.ghostBindingIds.length * METRICS.valuePitch,
            rigid: true,
            messageEndpoint: false,
            gapTier: 'tight',
          });
        }
        prevIsBoundary = true;
        clusterSkipUntil = foldedCluster.endIndex;
        return;
      }
      const meta = rowMetaByKey.get(rowKeyOf(roleIndex, itemIndex));
      const chain = meta?.chain ?? chainOfItem(item, roleIndex);
      const rowHeight = meta?.rowHeight ?? Math.max(baseHeightOf(item), chainHeightOf(chain) + METRICS.chainPadding);
      const chip = meta?.chip ?? wireChipOf(item, roleIndex);
      const message = item.kind === 'message';
      const key = rowKeyOf(roleIndex, itemIndex);
      units.push({
        id: key,
        roleIndex,
        kind: 'row',
        height: rowHeight,
        rigid: false,
        messageEndpoint: message,
        ...(message
          ? { crossedRoles: crossedRolesOf(role.name, renderTerm(item.endpoint.channel)) }
          : {}),
        gapTier: prevIsBoundary ? 'group' : 'row',
      });
      if (chip) {
        // 芯片是独立 tight 单元：不占消息箭头的唯一域，只随行栈推进。
        units.push({
          id: `${key}:chip`,
          roleIndex,
          kind: 'row',
          height: METRICS.chipHeight,
          rigid: false,
          messageEndpoint: false,
          gapTier: 'tight',
        });
      }
      prevIsBoundary = item.kind === 'branch' && item.marker === 'join';
    });
  });
  const spacing = solveSpacing({
    unitsByRole,
    compactness,
    reserveHalf: METRICS.crossReserveHalf,
    startOffsetByRole: startOffsets,
  });
  const rowYOf = (key: string, fallback: number): number => spacing.yByUnitId.get(key) ?? fallback;

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
        ordinalOf(binding.id),
        valueBlocks.length,
      ));
    });
    const armStack: Array<{ runIndex: number; lane: number; enclosingElse: number }> = [];

    // 折叠分支时跳过 `branch…join` 的整个区间；`foldedDepth` 记录剩余要吞掉的嵌套层数。
    // 07b：折叠算子簇同样以哨兵短路区间内的常规发射，簇本身在首 item 处一次发射。
    let foldedDepth = 0;
    let clusterSkipUntil = -1;
    role.items.forEach((item, itemIndex) => {
      if (itemIndex <= clusterSkipUntil) return;
      if (foldedDepth > 0) {
        if (isBranchStart(item)) foldedDepth += 1;
        else if (isBranchJoin(item)) foldedDepth -= 1;
        return;
      }
      if (isBranchStart(item) && collapsedBranches.has(item.id)) {
        const hiddenCount = countBranchItems(role.items, itemIndex);
        const height = METRICS.branchFoldHeight;
        const y = rowYOf(`fold:${item.id}`, startOffsets[roleIndex] ?? margin);
        const label = `▸ ${branchLabel(item)} · +${String(hiddenCount)}`;
        // 折叠条封在自身泳道内（F8）：不再越列压到邻列元素，文字随宽截断。
        const width = foldBarWidthOf(label);
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
        foldedDepth = 1;
        return;
      }

      const emittingCluster = foldedClusterAt(roleIndex, itemIndex);
      if (emittingCluster !== undefined) {
        const y = rowYOf(emittingCluster.clusterId, startOffsets[roleIndex] ?? margin);
        // 折叠条封在自身泳道内（同分支折叠条 F8 口径），宽随文字截断。
        const width = foldBarWidthOf(emittingCluster.label);
        operatorFolds.push({
          clusterId: emittingCluster.clusterId,
          roleIndex,
          x: lifelineX,
          y,
          width,
          height: METRICS.operatorFoldHeight,
          label: emittingCluster.label,
          memberLabels: emittingCluster.memberLabels,
          ghostLabels: emittingCluster.ghostBindingIds.flatMap((bindingId) => {
            const binding = bindingById.get(bindingId);
            return binding === undefined ? [] : [binding.name];
          }),
          hiddenCount: emittingCluster.endIndex - emittingCluster.startIndex + 1,
          sourceSpan: role.items[emittingCluster.startIndex]?.span ?? item.span,
        });
        maxTextRight = Math.max(maxTextRight, lifelineX + width / 2);
        // 幽灵值块（spec 52）：虚线描边，从幽灵单元中心按值槽距对称展开。
        const ghostCount = emittingCluster.ghostBindingIds.length;
        if (ghostCount > 0) {
          const ghostY = rowYOf(`${emittingCluster.clusterId}:ghost`, y + METRICS.operatorFoldHeight);
          emittingCluster.ghostBindingIds.forEach((bindingId, ghostIndex) => {
            const binding = bindingById.get(bindingId);
            if (binding === undefined) return;
            const blockY = ghostY - ((ghostCount - 1) * METRICS.valuePitch) / 2 + ghostIndex * METRICS.valuePitch;
            valueBlocks.push({ ...valueBlockOf(binding, roleIndex, lifelineX, blockY, 'binding', bindingColors, ordinalOf(binding.id), valueBlocks.length), ghost: true });
          });
          maxTextRight = Math.max(maxTextRight, lifelineX + METRICS.valueWidth / 2);
        }
        clusterSkipUntil = emittingCluster.endIndex;
        return;
      }

      const stepItem = item.kind === 'message' ? item : undefined;
      // 行几何来自预算缓存（07b 起预计算覆盖全部 item，chain 只算一遍），y 来自 core 解算器。
      const meta = rowMetaByKey.get(rowKeyOf(roleIndex, itemIndex));
      if (meta === undefined) return;
      const { chain, rowHeight, chip } = meta;
      const y = rowYOf(rowKeyOf(roleIndex, itemIndex), startOffsets[roleIndex] ?? margin);

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
        y: y - baseHeightOf(item) / 2,
        width: METRICS.nodeHeight * 2,
        height: baseHeightOf(item),
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
            valueBlocks.push(valueBlockOf(binding, roleIndex, pendingConstruct.outputX, outputY, 'binding', bindingColors, ordinalOf(binding.id), valueBlocks.length));
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
            ordinalOf(binding.id),
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
              valueBlocks.push(valueBlockOf(binding, roleIndex, operandX, operandY, 'reference', bindingColors, ordinalOf(binding.id), valueBlocks.length));
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
          // 未配对端的线上词项芯片（F2）：独立的 tight 单元（ticket 07），y 由解算器分配，
          // 宽度按文字估算；描边用未配对橙与虚线/空心点同色。
          if (chip && stepItem !== undefined) {
            const text = renderTerm(stepItem.endpoint.term);
            const chipWidth = Math.min(METRICS.wireChipMaxWidth, 20 + text.length * CAPTION_CHAR_WIDTH);
            chips.push({
              id: `${item.id}:wire-chip`,
              roleIndex,
              text,
              kind: 'wire',
              color: UNPAIRED_COLOR,
              x: lifelineX,
              y: rowYOf(`${rowKeyOf(roleIndex, itemIndex)}:chip`, y + rowHeight / 2 + METRICS.chipHeight / 2),
              width: chipWidth,
              height: METRICS.chipHeight,
              sourceSpan: item.span,
            });
            maxTextRight = Math.max(maxTextRight, lifelineX + chipWidth / 2);
          }
        }
      }
    });
  });

  maxBottom = Math.max(maxBottom, ...spacing.bottomByRole);

  const endpointByRef = new Map(endpoints.map((endpoint) => [refOf(endpoint.roleIndex, endpoint.stepIndex), endpoint]));
  const paired = new Set<string>();
  const pillars: MessagePillar[] = [];
  // 广播扇出按发送端归并（ADR-0007 边界 4：分组是视图层派生，不进 IR）：
  // 同一 out 的全部有效配对合成一根多端柱——一条发送段进信道、N 条接收段出信道；
  // 合流是不同 out 组共享同一 in，各柱独立（信道是扇出/合流唯一结点，ADR-0008）。
  const groups = new Map<string, { out: StructuredEndpoint; ins: StructuredEndpoint[]; manual: boolean }>();
  (options.pairings ?? []).forEach((pairing) => {
    const out = endpointByRef.get(refOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex));
    const incoming = endpointByRef.get(refOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex));
    if (out === undefined || incoming === undefined || out.channelName !== incoming.channelName) return;
    paired.add(out.id);
    paired.add(incoming.id);
    const channel = channelColumns.get(out.channelName);
    if (channel === undefined) return;
    const key = out.id;
    const group = groups.get(key) ?? { out, ins: [], manual: false };
    if (!group.ins.some((candidate) => candidate.id === incoming.id)) group.ins.push(incoming);
    group.manual = group.manual || pairing.origin === 'manual';
    groups.set(key, group);
  });
  [...groups.values()].forEach((group, index) => {
    const channel = channelColumns.get(group.out.channelName);
    if (channel === undefined) return;
    const channelX = channel.x + channel.width / 2;
    const members = [group.out, ...group.ins];
    const frameWidth = messageFrameWidthOf(group.out.termText);
    // identity 接收去重的值身份色带（F5）：广播取第一个定义了 identity 色的接收端。
    const termValueColor = group.ins.flatMap((incoming) => {
      const color = identityTermColorByRef.get(refOf(incoming.roleIndex, incoming.stepIndex));
      return color === undefined ? [] : [color];
    })[0];
    pillars.push({
      id: `message-${String(index + 1)}`,
      color: MESSAGE_COLORS[index % MESSAGE_COLORS.length],
      sequence: index + 1,
      origin: group.manual ? 'manual' : 'automatic',
      channelName: group.out.channelName,
      channelX,
      top: Math.min(...members.map((member) => member.y)),
      bottom: Math.max(...members.map((member) => member.y)),
      termText: group.out.termText,
      termPresentation: group.out.termPresentation,
      ...(termValueColor === undefined ? {} : { termValueColor }),
      frameWidth,
      // 帧对齐到发送端那一端：弧的走向固定（发出→信道→接收），帧不必浮在两端中间。
      frameY: group.out.y,
      endpoints: members,
    });
    maxTextRight = Math.max(maxTextRight, channelX + frameWidth / 2);
  });
  const finalEndpoints = endpoints.map((endpoint) => ({ ...endpoint, unpaired: !paired.has(endpoint.id) }));
  const finalPillars = pillars.map((pillar) => ({
    ...pillar,
    endpoints: pillar.endpoints.map((endpoint) => finalEndpoints.find((candidate) => candidate.id === endpoint.id) ?? endpoint),
  }));
  // 冲突全部来自解算器（ticket 07）：消息端为禁置带或全局 y 唯一性让位时显式标记并加高，
  // 不静默重排；解算器已保证 y 唯一，旧的事后 global-y 兜底检查随之退役。
  const conflicts: StructuredConflict[] = spacing.conflicts.map((conflict) => ({
    id: conflict.id,
    message: conflict.message,
    y: conflict.y,
    ...(conflict.roleIndex === undefined ? {} : { roleIndex: conflict.roleIndex }),
  }));
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
    operatorFolds,
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

/**
 * 一条值层链「引用」到的绑定 id（幽灵值判定用）：引用/等值 value 条目、检查盒操作数与
 * 盒的输入。产出（binding 条目、盒的输出）不是引用——产出是否被引用由其他行决定，
 * 计入会让簇内自产自销的中间值误判为「仍被引用」。
 */
function chainBindingIds(chain: readonly ChainEntry[]): string[] {
  const ids: string[] = [];
  chain.forEach((entry) => {
    if (entry.kind === 'value') {
      if (entry.occurrence !== 'binding') ids.push(entry.bindingId);
    } else if (entry.kind === 'check') {
      entry.operands.forEach((operand) => {
        if (operand.kind === 'value') ids.push(operand.bindingId);
      });
    } else if (entry.kind === 'method') {
      ids.push(...entry.inputBindingIds);
    }
  });
  return ids;
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
  ordinal: number,
  index: number,
): StructuredValueBlock {
  return {
    id: `${binding.id}:${occurrence}:${String(index)}`,
    roleIndex,
    bindingId: binding.id,
    label: binding.name,
    color: colors.get(binding.id) ?? VALUE_COLORS[0],
    ordinal,
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
