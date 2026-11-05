import type {
  Binding,
  BranchItem,
  Condition,
  CryptoOperationGroup,
  GroupConfidence,
  GroupingOrigin,
  MessagePairing,
  OperationDirection,
  OperationKind,
  PairingOrigin,
  ParseResult,
  PvDiagnostic,
  PvRole,
  PvTerm,
  RoleItem,
  SourceSpan,
} from '@pv-lens/core';
import { deriveCryptoGroups, narrativeRoleOrder, renderTerm, solveHorizontalSequence } from '@pv-lens/core';
import { diagnosticSeverityLabel } from './layout';
import { gapUnitOf, solveSpacing } from '@pv-lens/core';
import type { SpacingUnit } from '@pv-lens/core';
import type { HorizontalNode, HorizontalSequence } from '@pv-lens/core';
import { MESSAGE_COLOR_TOKENS, buildMessagePalette, valueColorsOf } from './identity-color';
import { OPERATION_DIRECTION_LABELS, OPERATION_KIND_LABELS } from './crypto-group-labels';

export const MESSAGE_COLORS = MESSAGE_COLOR_TOKENS;
export const VALUE_COLORS = ['#BFDBFE', '#A5F3FC', '#BBF7D0', '#FED7AA', '#FECACA', '#DDD6FE', '#FBCFE8', '#CBD5E1'] as const;
/** 未配对端点统一用色（虚线/空心圆点/线上词项芯片），与 v2.css 的 #c2410c 同值。 */
export const UNPAIRED_COLOR = '#C2410C';

/** 端点引用键：角色下标 + 消息步序，配对、预留带与去重共用同一表示。 */
const refOf = (roleIndex: number, stepIndex: number): string => `${roleIndex}:${stepIndex}`;

/** 行键：角色下标 + item 下标（预计算与正式放置之间按它对行 y 达成一致）。 */
const rowKeyOf = (roleIndex: number, itemIndex: number): string => `${roleIndex}:${String(itemIndex)}`;
/** 算子簇键：折叠决策（内部 Map）与公开 clusterId 共用同一拼装（07b）。 */
const clusterKeyOf = (roleIndex: number, itemIndex: number): string => `opcluster:${String(roleIndex)}:${String(itemIndex)}`;
/** 折叠条宽度：封在自身角色列内，随文字截断（分支折叠条与算子折叠条同式，F8 口径）。 */
function foldBarWidthOf(label: string): number {
  return Math.min(METRICS.branchFoldMaxWidth, METRICS.columnWidth - 8, 24 + label.length * CHAR_WIDTH);
}

/** 密码操作组摘要宽度：首行要放下「类型 · 方向」与右侧隐藏计数，次行放载荷/密钥。 */
function cryptoGroupWidthOf(label: string, detail: string): number {
  const labelWidth = 18 + label.length * 8.8 + 6 + 30 + 7;
  const detailWidth = 18 + detail.length * 5.6 + 7;
  return Math.min(METRICS.columnWidth - 8, Math.max(141, labelWidth, detailWidth));
}

/** C10：分支折叠条宽度——守卫文本与右侧固定徽标（+N）分开计宽，徽标不参与截断。 */
function branchFoldWidthOf(guard: string, badge: string): number {
  return Math.min(
    METRICS.branchFoldMaxWidth,
    METRICS.columnWidth - 8,
    20 + (guard.length + badge.length) * CHAR_WIDTH + 16,
  );
}

/** C10：分支折叠条守卫文本的截断预算（为右侧徽标预留 28px）。 */
export function foldGuardBudgetOf(width: number): number {
  return Math.max(4, Math.floor((width - 12 - 28) / CHAR_WIDTH));
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
export type ChannelLineStyle = (typeof CHANNEL_STYLES)[number];
/** 消息线型按 M 序号循环：实线、短虚线、点线；序号是权威标识。 */
export const MESSAGE_LINE_STYLES = ['solid', 'short-dash', 'dot'] as const;
export type MessageLineStyle = (typeof MESSAGE_LINE_STYLES)[number];
/** 值方块的二阶图案，按值序号循环，供灰度与打印条件区分身份。 */
export const VALUE_PATTERNS = ['none', 'slash', 'backslash', 'dots'] as const;
export type ValuePattern = (typeof VALUE_PATTERNS)[number];

/** R09/R17：信道线型按水平序列位置循环（实线、长虚线、点线）；位置与序号字形同源，
 * 使线型、序号、图例三者从同一位置派生，灰度下按线型即可指认信道。 */
export function channelLineStyleOf(position: number): ChannelLineStyle {
  const slot = Math.abs(Math.trunc(position)) % CHANNEL_STYLES.length;
  return CHANNEL_STYLES[slot] ?? 'solid';
}

export function patternKindOf(ordinal: number): ValuePattern {
  const index = Math.abs(Math.trunc(ordinal)) % VALUE_PATTERNS.length;
  return VALUE_PATTERNS[index] ?? 'none';
}

export function messageLineStyleOf(index: number): MessageLineStyle {
  const slot = Math.abs(Math.trunc(index)) % MESSAGE_LINE_STYLES.length;
  return MESSAGE_LINE_STYLES[slot] ?? 'solid';
}

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
  /** R09：信道列在水平序列中从左到右的序号（0 基，只数信道列）；序号字形与线型以它为准，
   * 与图例“按水平序列从左到右编号”的描述一致。index 是声明收集序号，不再用于信道指认。 */
  channelOrder?: number;
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
  labelAnchor: 'start' | 'middle' | 'end';
  labelMaxChars: number;
  /** 事件标记的横向/纵向中心；仅事件节点有值。 */
  markerX?: number;
  markerY?: number;
  /** 事件连接线的生命线锚点 x；仅事件节点有值。 */
  anchorX?: number;
  span: SourceSpan;
  /** C14：解析器不支持的语句按原文保留的行单元。 */
  degraded?: boolean;
  /** C4：insert 插入事实行单元（文本宽度胶囊）。 */
  inserted?: boolean;
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
  /** 二阶图案：按序号循环，灰度下补充身份识别。 */
  pattern: ValuePattern;
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
  /** 该方法盒对应的密码操作组（点击盒体折叠 / 展开）。 */
  groupId?: string;
  groupExpanded?: boolean;
  /** 嵌套组的方法盒带缩进标记（当前仅在组摘要上体现，保留给渲染方）。 */
  groupNested?: boolean;
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
  /** 派生芯片对应的嵌套密码操作组（点击芯片折叠 / 展开子组）。 */
  groupId?: string;
  groupExpanded?: boolean;
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

/**
 * 折叠后的密码操作组摘要（ADR-0018 / 阶段 2）：占据该 item 值层链的纵向单元，
 * 展开时退回基线方法盒与值方块。组摘要本身是折叠态专有对象，展开态不额外占几何。
 */
export interface StructuredCryptoGroupFold {
  /** 组 id（与 core `CryptoOperationGroup.id` 相同，用户覆盖与折叠状态共用）。 */
  groupId: string;
  roleIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: OperationKind;
  direction: OperationDirection;
  origin: GroupingOrigin | 'user';
  confidence: GroupConfidence;
  /** 首行：`非对称加密 · 解构`。 */
  label: string;
  /** 次行：`载荷 sign(...) · 密钥 pkX · 隐藏 4`。 */
  detail: string;
  hiddenCount: number;
  childCount: number;
  functor: string;
  /** 是否为父组内的嵌套摘要。 */
  nested: boolean;
  sourceSpan: SourceSpan;
  equationSpan?: SourceSpan;
  ghostBindingIds: readonly string[];
}

export interface StructuredEndpoint {
  roleIndex: number;
  stepIndex: number;
  id: string;
  direction: 'out' | 'in';
  roleX: number;
  channelX: number;
  /** 未配对端点落在信道壁上的横向位置；配对端点仍以 channelX 为锚。 */
  wireX?: number;
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
  /** 消息线型：按 M 序号循环。 */
  lineStyle: MessageLineStyle;
  /** 信道内消息道序号与横向位置；多条消息的 y 区间重叠时使用不同道。 */
  lane: number;
  laneX: number;
  /** 柱来源：自动配对或含人工声明（广播分组按发送端归并，ADR-0007）。 */
  origin: PairingOrigin;
  channelName: string;
  channelX: number;
  top: number;
  bottom: number;
  /** 一条消息只在信道帧内写一遍的词项（取发送端 wire term）与帧的中轴 y。 */
  termText: string;
  termPresentation: StructuredEndpoint['termPresentation'];
  /** identity 接收去重时，接收绑定的值身份色以帧内色带标注，角色列省略同名词块。 */
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
  /** 冲突锚定角色名（标记与列表按“冲突 N + 角色 + 源码行”一一对应）。 */
  roleName?: string;
  /** 冲突锚定消息步骤的源码行（1 基）；全局冲突或非行单元时为 undefined。 */
  sourceLine?: number;
}

/**
 * 角色内诊断条（ticket 10 / spec 71）：按源码区间归属该角色的降级/错误诊断，
 * 以带位置的原文标注段画在角色角色列顶部（参数簇之下、首行之上）。
 * 每条 chip 的 y 与文字预算由布局给出，渲染器只画（几何单一来源）。
 */
export interface StructuredRoleDiagnosticEntry {
  diagnostic: PvDiagnostic;
  /** chip 中心 y。 */
  y: number;
  /** 可见文字（降级带原文、错误带中文消息；severity 与行列前缀由布局拼好）。 */
  text: string;
  /** 文字截断预算（按 CAPTION_CHAR_WIDTH 派生）。 */
  textBudget: number;
  /** title/aria 全文（中文消息 + 原文）。 */
  fullText: string;
}

export interface StructuredRoleDiagnostics {
  roleIndex: number;
  x: number;
  width: number;
  entries: readonly StructuredRoleDiagnosticEntry[];
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
  /** 本次布局使用的自动/覆盖后密码操作组（审计面板与测试共用同一份）。 */
  cryptoGroups: readonly CryptoOperationGroup[];
  /** 折叠态的密码操作组摘要；展开态为空（不额外占几何）。 */
  cryptoGroupFolds: readonly StructuredCryptoGroupFold[];
  roleDiagnostics: readonly StructuredRoleDiagnostics[];
  endpoints: readonly StructuredEndpoint[];
  pillars: readonly MessagePillar[];
  conflicts: readonly StructuredConflict[];
  /** 未归属任何角色的诊断（画布下方平铺；每条诊断「角色内或未归属」只出现一次）。 */
  unassignedDiagnostics: readonly PvDiagnostic[];
  horizontal: HorizontalSequence;
  width: number;
  height: number;
  hasLanes: boolean;
  compactness: number;
  gapUnit: number;
}

/**
 * 诊断的角色归属（ticket 10，与 v1 `diagnosticInRole` 同语义）：按诊断 span 起点
 * offset 落在哪个角色的源码区间判定（前闭后开）；命中的进角色内标注段，
 * 其余为未归属（保留画布下方平铺，各诊断只出现一次）。
 */
export function attributeDiagnostics(
  roles: readonly PvRole[],
  diagnostics: readonly PvDiagnostic[],
): { byRole: ReadonlyMap<number, PvDiagnostic[]>; unassigned: readonly PvDiagnostic[] } {
  const byRole = new Map<number, PvDiagnostic[]>();
  const unassigned: PvDiagnostic[] = [];
  diagnostics.forEach((diagnostic) => {
    const offset = diagnostic.span.start.offset;
    const roleIndex = roles.findIndex(
      (role) => offset >= role.span.start.offset && offset < role.span.end.offset,
    );
    if (roleIndex < 0) {
      unassigned.push(diagnostic);
      return;
    }
    byRole.set(roleIndex, [...(byRole.get(roleIndex) ?? []), diagnostic]);
  });
  return { byRole, unassigned };
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
  /** 已折叠的密码操作组 id；缺省为空 = 全部展开（展开态保持基线结构）。 */
  collapsedCryptoGroups?: readonly string[];
  /** 已用用户覆盖派生好的操作组；缺省时由 result 自动派生。 */
  cryptoGroups?: readonly CryptoOperationGroup[];
  /** 用户覆盖（组 id → 操作种类）；与 cryptoGroups 同时传入时后者优先。 */
  cryptoGroupOverrides?: Readonly<Record<string, OperationKind>>;
}

const METRICS = {
  margin: 32,
  columnWidth: 168,
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
  /** 折叠密码操作组摘要的高度与槽位（两行：种类/方向 + 载荷/密钥/计数）。 */
  cryptoGroupHeight: 22,
  cryptoGroupPitch: 24,
  chainPadding: 6,
  methodWidth: 66,
  methodHeight: 24,
  /** 构造盒落在「生命线 → 消息」路径上的横向偏移。 */
  wireMethodOffset: 58,
  /** 行标签起点相对生命线的缩进（避开方法盒右缘与值方块）。 */
  labelInset: 37,
  /** 未配对线上芯片：置于该行值层之下的间隙与宽度上限（不越出自身角色列）。 */
  wireChipGap: 6,
  wireChipMaxWidth: 132,
  /** 跨角色列消息线的禁置带半高：线两侧该范围内不放本列值层元素。 */
  crossReserveHalf: 11,
  /** 信道帧宽度的下限 / 上限与文字内边距（09：下限沿用 ticket02 定稿 56，上限与线上芯片同宽）。 */
  messageFrameMinWidth: 56,
  messageFrameMaxWidth: 132,
  messageFramePad: 14,
  /** 角色内诊断条（10）：每条诊断的行距与整条最大宽度（封在自身角色列内）。 */
  diagnosticPitch: 18,
  diagnosticStripMaxWidth: 200,
} as const;

/** 从解算器冲突 id 还原锚定的消息行：`spacing:<role>:<item>` / `spacing-band:<role>:<item>`。
 *  参数簇、诊断条、折叠条与全局 order-cycle 没有消息行锚点，返回 undefined。 */
function conflictLineOf(
  id: string,
  roles: readonly PvRole[],
): { roleIndex: number; line: number } | undefined {
  const match = /^spacing(?:-band)?:(\d+):(\d+)$/.exec(id);
  if (match === null) return undefined;
  const roleIndex = Number(match[1]);
  const itemIndex = Number(match[2]);
  const item = roles[roleIndex]?.items[itemIndex];
  return item === undefined ? undefined : { roleIndex, line: item.span.start.line };
}

/** v2 的内容驱动几何：各角色保留本地顺序，只有信道柱跨角色共享。 */
export function buildStructuredNarrativeLayout(
  result: ParseResult,
  options: StructuredLayoutOptions = {},
): StructuredNarrativeLayout {
  const roles = narrativeRoleOrder(result);
  const compactness = clamp(options.compactness ?? 0, 0, 1);
  const gapUnit = gapUnitOf(compactness);
  const horizontal = solveHorizontalSequence(result);
  const cryptoGroups = options.cryptoGroups
    ?? deriveCryptoGroups(result, options.cryptoGroupOverrides === undefined ? {} : { overrides: options.cryptoGroupOverrides });
  const collapsedCryptoGroups = new Set(options.collapsedCryptoGroups ?? []);
  const cryptoGroupsByItem = new Map<string, CryptoOperationGroup[]>();
  for (const group of cryptoGroups) {
    const list = cryptoGroupsByItem.get(group.itemId) ?? [];
    list.push(group);
    cryptoGroupsByItem.set(group.itemId, list);
  }
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
  // C9/R05：最左角色的事件标签向外画在生命线左侧，必须给画布左缘留出足够槽位；
  // 否则标签会被 SVG 视口裁掉只剩后半段。按该角色最长事件标签估算，仅左侧列需要。
  const firstRoleNode = horizontal.nodes.find((node) => node.kind === 'role');
  const firstRole = firstRoleNode === undefined ? undefined : roleByName.get(firstRoleNode.name);
  const firstRoleOutward = firstRoleNode === undefined
    ? 1
    : outwardByColumn.get(columnKey(firstRoleNode)) ?? 1;
  const firstRoleEventChars = firstRole?.items.reduce(
    (longest, item) => item.kind === 'event' ? Math.max(longest, `event ${item.text}`.length) : longest,
    0,
  ) ?? 0;
  const baseMargin = METRICS.margin + (needsLeftArmMargin ? METRICS.leftArmMargin : 0);
  const leftEventMargin = firstRoleOutward === -1 && firstRoleEventChars > 0
    ? Math.max(0, firstRoleEventChars * CHAR_WIDTH + 8 + (METRICS.valueWidth / 2 + 14) + 10
      - METRICS.columnWidth / 2 - baseMargin)
    : 0;
  const margin = baseMargin + leftEventMargin;
  // ticket 26：信道列按该信道最长消息帧加宽。帧宽上限 132；信道矩形左右各内缩 6px，
  // 再给帧两侧各留 2px 余量，故列宽 = max(72, 最长帧宽 + 16)。只有有效配对会产生帧，
  // 未配对消息不参与加宽，避免多信道样例被无帧词项整体撑宽。
  const endpointInfoByRef = new Map<string, { channel: string; term: string }>();
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item) => {
      if (item.kind !== 'message') return;
      endpointInfoByRef.set(refOf(roleIndex, item.endpoint.stepIndex), {
        channel: renderTerm(item.endpoint.channel),
        term: renderTerm(item.endpoint.term),
      });
    });
  });
  const frameWidthByChannel = new Map<string, number>();
  (options.pairings ?? []).forEach((pairing) => {
    const out = endpointInfoByRef.get(refOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex));
    const incoming = endpointInfoByRef.get(refOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex));
    if (out === undefined || incoming === undefined || out.channel !== incoming.channel) return;
    frameWidthByChannel.set(
      out.channel,
      Math.max(frameWidthByChannel.get(out.channel) ?? 0, messageFrameWidthOf(out.term)),
    );
  });
  // R09：信道序号字形与线型按水平序列中从左到右的位置生成，与图例描述一致。
  const channelOrderByName = new Map<string, number>();
  for (const node of horizontal.nodes) {
    if (node.kind === 'channel' && !channelOrderByName.has(node.name)) {
      channelOrderByName.set(node.name, channelOrderByName.size);
    }
  }
  let columnCursorX = margin;
  const columns: StructuredColumn[] = horizontal.nodes.map((node) => {
    const role = node.kind === 'role' ? roleByName.get(node.name) : undefined;
    const channelOrder = node.kind === 'channel' ? channelOrderByName.get(node.name) : undefined;
    const width = node.kind === 'channel'
      ? Math.max(METRICS.channelWidth, (frameWidthByChannel.get(node.name) ?? 0) + 16)
      : METRICS.columnWidth;
    const column: StructuredColumn = {
      kind: node.kind,
      name: node.name,
      index: node.index,
      x: columnCursorX,
      width,
      ...(channelOrder === undefined ? {} : { channelOrder }),
      ...(role === undefined ? {} : {
        signatureText: signatureOf(role),
        replicated: role.replicated,
        parallel: role.parallel,
        ...(role.parameters.length === 0 ? {} : { parameterLabelY: METRICS.headerHeight + METRICS.parameterLabelGap }),
      }),
    };
    columnCursorX += width + METRICS.columnGap;
    return column;
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
  const cryptoGroupFolds: StructuredCryptoGroupFold[] = [];
  const roleDiagnostics: StructuredRoleDiagnostics[] = [];
  // 归属只算一次（byRole 供角色列内诊断条，unassigned 随布局输出供画布下方平铺）。
  const diagnosticAttribution = attributeDiagnostics(roles, result.diagnostics);
  const diagnosticsByRole = diagnosticAttribution.byRole;
  // C14：已 item 化的语句级降级诊断不再进角色诊断条（原文芯片已按源码位置呈现，避免双份）。
  const degradedItemSpans = new Set(
    roles.flatMap((role) => role.items
      .filter((item): item is Extract<typeof item, { kind: 'local' }> => item.kind === 'local' && item.operation === 'degraded')
      .map((item) => item.span.start.offset)),
  );
  const filteredByRole = new Map(diagnosticsByRole);
  for (const [roleIndex, list] of filteredByRole) {
    const kept = list.filter((diagnostic) =>
      !(diagnostic.severity === 'degraded' && degradedItemSpans.has(diagnostic.span.start.offset)));
    if (kept.length !== list.length) filteredByRole.set(roleIndex, kept);
  }
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
  const messageItemIndexByRef = new Map<string, number>();
  roles.forEach((role, roleIndex) => {
    role.items.forEach((item, itemIndex) => {
      if (item.kind !== 'message') return;
      endpointChannelByRef.set(refOf(roleIndex, item.endpoint.stepIndex), renderTerm(item.endpoint.channel));
      messageItemIndexByRef.set(refOf(roleIndex, item.endpoint.stepIndex), itemIndex);
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

  /** identity 接收（F5）：`in(c, x)` 词项恰为绑定变量且已配对 → 角色列省略绑定方块，帧内标值身份色。 */
  const identityTermColorByRef = new Map<string, string>();
  const rootGroupOfItem = (itemId: string): CryptoOperationGroup | undefined =>
    (cryptoGroupsByItem.get(itemId) ?? []).find((group) => group.parentId === null);
  const rootGroupCollapsed = (itemId: string): boolean => {
    const group = rootGroupOfItem(itemId);
    return group !== undefined && collapsedCryptoGroups.has(group.id);
  };

  const chainOfItem = (item: RoleItem, roleIndex: number): ChainEntry[] => {
    const chain = valueChainOf(item, bindingById, destructorNames);
    if (item.kind !== 'message' || item.endpoint.direction !== 'in') return applyCryptoGroupFolding(item, chain);
    const ref = refOf(roleIndex, item.endpoint.stepIndex);
    const term = item.endpoint.term;
    if (!pairedKeys.has(ref) || term.kind !== 'variable' || term.bindingId === undefined) return applyCryptoGroupFolding(item, chain);
    const filtered = chain.filter((entry) => !(entry.kind === 'value' && entry.bindingId === term.bindingId && entry.occurrence === 'binding'));
    if (filtered.length !== chain.length) {
      const color = bindingColors.get(term.bindingId);
      if (color !== undefined) identityTermColorByRef.set(ref, color);
    }
    return applyCryptoGroupFolding(item, filtered);
  };

  /**
   * 语义分组折叠（ADR-0018 / 阶段 2）：只替换该 item 的值层链，不动消息行与角色列。
   * 展开态原样返回基线链，仅给方法盒/派生芯片挂组开关；折叠态以组摘要 + 幽灵值替换。
   */
  const applyCryptoGroupFolding = (item: RoleItem, chain: ChainEntry[]): ChainEntry[] => {
    const groups = cryptoGroupsByItem.get(item.id) ?? [];
    if (groups.length === 0) return chain;
    const roots = groups.filter((group) => group.parentId === null);
    // 多根并列（元组消息等）不猜视觉归属：保持基线，审计面板仍可逐组覆盖。
    if (roots.length !== 1) return chain;
    const root = roots[0];
    if (root === undefined) return chain;

    if (collapsedCryptoGroups.has(root.id)) {
      const ghosts: ChainEntry[] = root.ghostBindingIds
        .filter((bindingId) => bindingById.has(bindingId))
        .map((bindingId) => ({ kind: 'value', bindingId, occurrence: 'binding', ghost: true }));
      return [{ kind: 'group-summary', group: root, nested: false }, ...ghosts];
    }

    const children = groups.filter((group) => group.parentId !== null);
    const usedChildren = new Set<string>();
    const result = chain.map((entry): ChainEntry => {
      if (entry.kind === 'derived') {
        const child = children.find((candidate) => !usedChildren.has(candidate.id) && candidate.termText === entry.text);
        if (child !== undefined) {
          usedChildren.add(child.id);
          if (collapsedCryptoGroups.has(child.id)) {
            return { kind: 'group-summary', group: child, nested: true };
          }
          return { ...entry, groupId: child.id, groupExpanded: true };
        }
      }
      if (entry.kind === 'method' && entry.label === root.functor) {
        return { ...entry, groupId: root.id, groupExpanded: true };
      }
      return entry;
    });
    // 线上构造没有内层派生芯片：折叠的子组仍以摘要追加在链尾，保证逐层展开可见。
    for (const child of children) {
      if (usedChildren.has(child.id) || !collapsedCryptoGroups.has(child.id)) continue;
      result.push({ kind: 'group-summary', group: child, nested: true });
    }
    return result;
  };

  /** 未配对端的线上芯片（F2）：词项不是裸绑定变量才画（裸变量已由角色列内的值方块写明）。 */
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
        chip: wireChipOf(item, roleIndex) && !rootGroupCollapsed(item.id),
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
  // 绑定全局序：按角色与绑定在 IR 中的插入序去重；幽灵值块与值序号按它排列。
  const globalBindingOrder = new Map(
    [...new Set(roles.flatMap((role) => role.bindings.map((binding) => binding.id)))]
      .map((id, index) => [id, index] as const),
  );
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
          return (meta?.chain ?? []).flatMap((entry) => entry.kind === 'method'
            ? [entry.label]
            : entry.kind === 'check'
              ? [entry.op]
              : entry.kind === 'group-summary'
                ? [entry.group.functor]
                : []);
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
      const hasBox = (meta?.chain ?? []).some((entry) => entry.kind === 'method' || entry.kind === 'check' || entry.kind === 'group-summary');
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
    // 角色内诊断条（ticket 10）：归属本角色的诊断整组占一个单元，紧随参数簇。
    const roleDiagList = filteredByRole.get(roleIndex);
    if (roleDiagList !== undefined && roleDiagList.length > 0) {
      units.push({
        id: `diag:${String(roleIndex)}`,
        roleIndex,
        kind: 'row',
        height: roleDiagList.length * METRICS.diagnosticPitch,
        rigid: false,
        messageEndpoint: false,
        gapTier: 'row',
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
      const chip = meta?.chip ?? (wireChipOf(item, roleIndex) && !rootGroupCollapsed(item.id));
      const message = item.kind === 'message';
      const key = rowKeyOf(roleIndex, itemIndex);
      // ticket 27：未配对词项芯片并入消息行单元。无值层链时芯片以消息线 y 居中（压在线上，
      // 与原型 wireChip 同式）；有值层链时置于值层底部下方，行框下缘按芯片位置扩展。
      // 行单元高度仍按芯片下缘预留，保持既有行距/冲突位置稳定。
      const chipExtra = chip ? METRICS.wireChipGap + METRICS.chipHeight : 0;
      const unitHeight = chip
        ? 2 * Math.max(rowHeight / 2, (chain.length > 0 ? rowHeight / 2 : 0) + chipExtra)
        : rowHeight;
      units.push({
        id: key,
        roleIndex,
        kind: 'row',
        height: unitHeight,
        rigid: false,
        messageEndpoint: message,
        ...(message
          ? {
              crossedRoles: crossedRolesOf(role.name, renderTerm(item.endpoint.channel)),
              endpointSeparation: pairedKeys.has(refOf(roleIndex, item.endpoint.stepIndex)) ? 4 : 12,
            }
          : {}),
        gapTier: prevIsBoundary ? 'group' : 'row',
      });
      prevIsBoundary = item.kind === 'branch' && item.marker === 'join';
    });
  });
  const orderEdges = (options.pairings ?? []).flatMap((pairing) => {
    const outRef = refOf(pairing.outEnd.roleIndex, pairing.outEnd.stepIndex);
    const inRef = refOf(pairing.inEnd.roleIndex, pairing.inEnd.stepIndex);
    if (!pairedKeys.has(outRef) || !pairedKeys.has(inRef)) return [];
    if (pairing.outEnd.roleIndex === pairing.inEnd.roleIndex) return [];
    const outItemIndex = messageItemIndexByRef.get(outRef);
    const inItemIndex = messageItemIndexByRef.get(inRef);
    if (outItemIndex === undefined || inItemIndex === undefined) return [];
    return [{
      before: rowKeyOf(pairing.outEnd.roleIndex, outItemIndex),
      after: rowKeyOf(pairing.inEnd.roleIndex, inItemIndex),
      minGap: 16,
    }];
  });
  const spacing = solveSpacing({
    unitsByRole,
    compactness,
    reserveHalf: METRICS.crossReserveHalf,
    startOffsetByRole: startOffsets,
    orderEdges,
  });
  const rowYOf = (key: string, fallback: number): number => spacing.yByUnitId.get(key) ?? fallback;

  roles.forEach((role, roleIndex) => {
    const column = roleColumns.get(role.name);
    if (column === undefined) return;
    const outward = outwardByColumn.get(`role:${role.name}`) ?? 1;
    const inward: 1 | -1 = outward === 1 ? -1 : 1;
    const lifelineX = column.x + column.width / 2;
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

    // 角色内诊断条（ticket 10）：y 取解算输出（单元中心），条内按 pitch 逐条铺开；
    // 每条的可见文字（降级带原文、错误带中文消息，spec 71/72）与截断预算都在布局拼好。
    const roleDiagList = filteredByRole.get(roleIndex);
    if (roleDiagList !== undefined && roleDiagList.length > 0) {
      const width = Math.min(METRICS.diagnosticStripMaxWidth, METRICS.columnWidth);
      const centerY = rowYOf(`diag:${String(roleIndex)}`, startOffsets[roleIndex] ?? margin);
      roleDiagnostics.push({
        roleIndex,
        x: lifelineX,
        width,
        entries: roleDiagList.map((diagnostic, index) => {
          const position = `L${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)}`;
          const severityLabel = diagnosticSeverityLabel(diagnostic.severity);
          // 降级以原文标注段呈现（spec 71）；错误显示中文消息（spec 72），两者 title/aria 都带全文。
          const text = diagnostic.severity === 'error'
            ? `${severityLabel} ${position} ${diagnostic.message}`
            : `${severityLabel} ${position} ${diagnostic.sourceText}`;
          return {
            diagnostic,
            y: centerY - ((roleDiagList.length - 1) * METRICS.diagnosticPitch) / 2 + index * METRICS.diagnosticPitch,
            text,
            textBudget: Math.floor((width - 8) / CAPTION_CHAR_WIDTH),
            fullText: `${severityLabel} ${position} ${diagnostic.message}（${diagnostic.sourceText}）`,
          };
        }),
      });
    }

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
        // C10：徽标 +N 固定在右端不参与截断；守卫文本按剩余预算截断（全文在 title/aria）。
        const width = branchFoldWidthOf(branchLabel(item), `+${String(hiddenCount)}`);
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
        // 折叠条封在自身角色列内（同分支折叠条 F8 口径），宽随文字截断。
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

      // C7：分支臂内的事件与本地节点以臂道轨为基线（值层随之偏移、消息端点仍锚生命线）。
      const armFrame = armStack[armStack.length - 1];
      const armFrameRailX = armFrame === undefined ? undefined : armRuns[armFrame.runIndex]?.railX;
      const inBranchArm = armFrameRailX !== undefined && (item.kind === 'event' || item.kind === 'local');
      const baseX = inBranchArm ? armFrameRailX! : lifelineX;
      // C4：insert 独立为文本宽度胶囊，标签居中（不再画空矩形）。
      const isInsertNode = item.kind === 'local' && item.operation === 'insert';
  // C14：降级语句以原文芯片入图（按源码位置占行单元，不再挂角色列顶端）。
  const isDegradedNode = item.kind === 'local' && item.operation === 'degraded';
      const labelX = stepItem === undefined ? baseX + METRICS.labelInset : baseX;
      const labelAnchor: StructuredNode['labelAnchor'] = isInsertNode || isDegradedNode
        ? 'middle'
        : stepItem === undefined ? 'start' : 'middle';
      const labelBudget = labelAnchor === 'start'
        ? Math.max(1, Math.floor((labelLimitX - labelX) / CHAR_WIDTH))
        : Math.max(6, Math.floor((METRICS.nodeHeight * 2) / CHAR_WIDTH) + 2);
      const eventMarkerX = item.kind === 'event' ? baseX + outward * (METRICS.valueWidth / 2 + 14) : undefined;
      const nodeLabelX = eventMarkerX === undefined ? labelX : eventMarkerX + outward * 10;
      const nodeLabelAnchor: StructuredNode['labelAnchor'] = eventMarkerX === undefined ? labelAnchor : outward > 0 ? 'start' : 'end';
      const rolePosition = columnPosition.get(`role:${role.name}`) ?? 0;
      const previousColumn = columns[rolePosition - 1];
      const leftLabelLimitX = previousColumn === undefined ? 0 : previousColumn.x + previousColumn.width + 8;
      const eventBudget = nodeLabelAnchor === 'start'
        ? (Number.isFinite(labelLimitX) ? Math.max(1, Math.floor((labelLimitX - nodeLabelX) / CHAR_WIDTH)) : 24)
        : Math.max(1, Math.floor((nodeLabelX - leftLabelLimitX - 8) / CHAR_WIDTH));
      const nodeLabelBudget = item.kind === 'event' ? eventBudget : labelBudget;
      const label = stepItem !== undefined
        ? `${stepItem.endpoint.direction === 'out' ? '发出' : '接收'} · ${renderTerm(stepItem.endpoint.term)}`
        : item.kind === 'event'
          ? `event ${item.text}`
          : item.kind === 'branch'
            ? branchLabel(item)
            : item.kind === 'local'
              // C4：insert 的 item.text 只含实参，显示补 `insert` 前缀标注插入事实。
              ? item.operation === 'insert' ? `insert${item.text}` : item.text
              : '';
      const nodeWidth = isInsertNode || isDegradedNode
        ? Math.min(148, 20 + label.length * CAPTION_CHAR_WIDTH)
        : METRICS.nodeHeight * 2;
      nodes.push({
        id: item.id,
        roleIndex,
        itemIndex,
        kind: item.kind,
        x: baseX - nodeWidth / 2,
        y: y - baseHeightOf(item) / 2,
        width: nodeWidth,
        height: baseHeightOf(item),
        label,
        labelX: nodeLabelX,
        labelAnchor: nodeLabelAnchor,
        labelMaxChars: nodeLabelBudget,
        ...(eventMarkerX === undefined ? {} : { markerX: eventMarkerX, markerY: y, anchorX: lifelineX }),
        span: item.span,
        ...(isDegradedNode ? { degraded: true } : {}),
        ...(isInsertNode ? { inserted: true } : {}),
        ...(stepItem === undefined ? {} : { stepIndex: stepItem.endpoint.stepIndex, direction: stepItem.endpoint.direction, channelName: renderTerm(stepItem.endpoint.channel) }),
        bindingIds: item.kind === 'local' && item.bindingId !== undefined ? [item.bindingId] : [],
      });
      if (nodeLabelAnchor === 'start') {
        maxTextRight = Math.max(maxTextRight, nodeLabelX + Math.min(label.length, nodeLabelBudget) * CHAR_WIDTH);
      }

      // 值层竖向链：紧贴生命线，值方块 20px 一格、方法盒 38px 一格（盒下留 caption），行高随链长增长。
      // 构造链例外：横置盒朝信道方向偏移，绑定的输出值块落在盒的远端（prototype 08 口径）。
      let slotTop = y - chainHeightOf(chain) / 2;
      // C7：值层竖向链以节点基线为准（分支臂内随臂轨偏移，避免与主生命线值层混排）。
      const chainX = baseX;
      const firstCheckIndex = chain.findIndex((entry) => entry.kind === 'check');
      let pendingConstruct: { entryIndex: number; boxY: number; outputX: number; outputBindingIds: readonly string[] } | null = null;
      chain.forEach((entry, entryIndex) => {
        if (entry.kind === 'group-summary') {
          const group = entry.group;
          const height = METRICS.cryptoGroupHeight;
          const centerY = slotTop + height / 2;
          slotTop += METRICS.cryptoGroupPitch;
          const label = `${OPERATION_KIND_LABELS[group.kind]} · ${OPERATION_DIRECTION_LABELS[group.direction]}${group.origin === 'user' ? ' · 用户声明' : ''}`;
          const payload = group.operands.payload === undefined ? undefined : renderTerm(group.operands.payload.term);
          const key = group.operands.key === undefined ? undefined : renderTerm(group.operands.key.term);
          const detail = [
            key === undefined ? undefined : `密钥 ${key}`,
            payload === undefined ? undefined : `载荷 ${payload}`,
          ].filter((part): part is string => part !== undefined).join(' · ') || '无关键参数';
          const width = cryptoGroupWidthOf(label, detail);
          cryptoGroupFolds.push({
            groupId: group.id,
            roleIndex,
            x: chainX,
            y: centerY,
            width,
            height,
            kind: group.kind,
            direction: group.direction,
            origin: group.origin,
            confidence: group.confidence,
            label: entry.nested ? `└ ${label}` : label,
            detail,
            hiddenCount: group.hiddenCount,
            childCount: cryptoGroups.filter((candidate) => candidate.parentId === group.id).length,
            functor: group.functor,
            nested: entry.nested,
            sourceSpan: group.sourceSpan,
            ...(group.equationSpan === undefined ? {} : { equationSpan: group.equationSpan }),
            ghostBindingIds: group.ghostBindingIds,
          });
          maxTextRight = Math.max(maxTextRight, chainX + width / 2);
          return;
        }
        if (entry.kind === 'value') {
          const binding = bindingById.get(entry.bindingId);
          if (binding === undefined) return;
          if (entry.ghost === true) {
            const slotY = slotTop + METRICS.valuePitch / 2;
            slotTop += METRICS.valuePitch;
            valueBlocks.push({
              ...valueBlockOf(binding, roleIndex, chainX, slotY, entry.occurrence, bindingColors, ordinalOf(binding.id), valueBlocks.length),
              ghost: true,
            });
            maxTextRight = Math.max(maxTextRight, chainX + METRICS.valueWidth / 2);
            return;
          }
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
            chainX,
            slotY,
            entry.occurrence,
            bindingColors,
            ordinalOf(binding.id),
            valueBlocks.length,
          ));
          maxTextRight = Math.max(maxTextRight, chainX + METRICS.valueWidth / 2);
          return;
        }
        if (entry.kind === 'check') {
          const operandY = slotTop + 9;
          entry.operands.forEach((operand, index) => {
            const operandX = chainX + (entry.operands.length > 1 ? (index === 0 ? -27 : 27) : 0);
            if (operand.kind === 'value') {
              const binding = bindingById.get(operand.bindingId);
              if (binding === undefined) return;
              valueBlocks.push(valueBlockOf(binding, roleIndex, operandX, operandY, 'reference', bindingColors, ordinalOf(binding.id), valueBlocks.length));
              return;
            }
            chips.push({
              id: `${item.id}:operand:${String(entryIndex)}:${String(index)}`,
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
            x: chainX,
            y: boxY,
            width: METRICS.methodWidth,
            height: METRICS.methodHeight,
            inputBindingIds: entry.operands.filter((operand) => operand.kind === 'value').map((operand) => operand.bindingId),
            outputBindingIds: [],
            ...(entry.groupId === undefined ? {} : { groupId: entry.groupId, groupExpanded: true }),
            // 复合守卫会有多行检查盒，折叠开关只挂在第一行，一个分支一个开关。
            ...(isBranchStart(item) && entryIndex === firstCheckIndex
              ? { branchId: item.id, branchText: guardTextOf(item), outward }
              : {}),
            sourceSpan: item.span,
          });
          maxTextRight = Math.max(maxTextRight, chainX + 27 + METRICS.chipWidth / 2);
          return;
        }

        if (entry.kind === 'derived') {
          const chipY = slotTop + METRICS.chipHeight / 2;
          slotTop += METRICS.valuePitch;
          chips.push({
            id: `${item.id}:chip:${String(entryIndex)}`,
            roleIndex,
            text: entry.text,
            kind: entry.chipKind,
            x: chainX,
            y: chipY,
            width: METRICS.chipWidth,
            height: METRICS.chipHeight,
            ...(entry.groupId === undefined ? {} : { groupId: entry.groupId, groupExpanded: true }),
            sourceSpan: item.span,
          });
          maxTextRight = Math.max(maxTextRight, chainX + METRICS.chipWidth / 2);
          return;
        }

        const boxCenterY = slotTop + METRICS.methodHeight / 2;
        slotTop += METRICS.methodPitch;
        // 构造 = 横置梯形，朝信道方向偏移；解构 / 选择留在生命线上竖置。
        const isConstruct = entry.direction === 'construct';
        const boxX = isConstruct ? chainX + inward * METRICS.chainConstructOffset : chainX;
        // C6：构造盒宽端覆盖全部输入方块的整体跨度（max(66, 输入数 × 值距 + 12)）。
        const methodWidth = isConstruct
          ? Math.max(METRICS.methodWidth, entry.inputBindingIds.length * METRICS.valuePitch + 12)
          : METRICS.methodWidth;
        methods.push({
          id: `${item.id}:method:${String(entryIndex)}`,
          roleIndex,
          label: entry.label,
          ...(entry.caption === undefined ? {} : { caption: entry.caption }),
          direction: entry.direction,
          ...(isConstruct ? { narrowTowards: inward > 0 ? 'right' as const : 'left' as const } : {}),
          x: boxX,
          y: boxCenterY,
          width: methodWidth,
          height: METRICS.methodHeight,
          inputBindingIds: entry.inputBindingIds,
          outputBindingIds: entry.outputBindingIds,
          ...(entry.groupId === undefined ? {} : {
            groupId: entry.groupId,
            groupExpanded: entry.groupExpanded ?? true,
            groupNested: entry.groupNested ?? false,
          }),
          sourceSpan: item.span,
        });
        if (isConstruct) {
          pendingConstruct = {
            entryIndex,
            boxY: boxCenterY,
            outputX: chainX + inward * METRICS.chainOutputOffset,
            outputBindingIds: entry.outputBindingIds,
          };
          maxTextRight = Math.max(maxTextRight, boxX + METRICS.methodWidth / 2 + 8);
          maxTextRight = Math.max(maxTextRight, chainX + inward * (METRICS.chainOutputOffset + METRICS.valueWidth / 2));
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
          const towardsChannel = Math.sign(channelCenterX - lifelineX) || 1;
          const wireX = channelCenterX - towardsChannel * (channel.width / 2 - 6);
          endpoints.push({
            roleIndex,
            stepIndex: stepItem.endpoint.stepIndex,
            id: stepItem.endpoint.id,
            direction: stepItem.endpoint.direction,
            roleX: lifelineX,
            channelX: channelCenterX,
            wireX,
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
            const rootGroup = rootGroupOfItem(item.id);
            if (wire !== null && !rootGroupCollapsed(item.id)) {
              methods.push({
                id: `${item.id}:wire-method`,
                roleIndex,
                label: wire.label,
                direction: wire.direction,
                ...(wire.direction === 'construct' ? { narrowTowards: towardsChannel > 0 ? 'right' as const : 'left' as const } : {}),
                x: lifelineX + towardsChannel * METRICS.wireMethodOffset,
                y,
                // C6：线上构造盒同样覆盖全部输入方块跨度。
                width: wire.direction === 'construct'
                  ? Math.max(METRICS.methodWidth, wire.inputBindingIds.length * METRICS.valuePitch + 12)
                  : METRICS.methodWidth,
                height: METRICS.methodHeight,
                inputBindingIds: wire.inputBindingIds,
                outputBindingIds: [],
                ...(rootGroup === undefined ? {} : { groupId: rootGroup.id, groupExpanded: true }),
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
              y: chain.length > 0
                ? y + rowHeight / 2 + METRICS.wireChipGap + METRICS.chipHeight / 2
                : y,
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
  const orderedGroups = [...groups.values()].sort((a, b) =>
    a.out.y - b.out.y || a.out.sourceSpan.start.offset - b.out.sourceSpan.start.offset);
  // 信道内消息道：按柱的 y 区间重叠关系做贪心分配；排序键已由 orderedGroups 固定。
  const laneIntervals: Array<Array<{ top: number; bottom: number }>> = [];
  const laneOfGroup = new Map<string, number>();
  for (const group of orderedGroups) {
    const members = [group.out, ...group.ins];
    const top = Math.min(...members.map((member) => member.y)) - 6;
    const bottom = Math.max(...members.map((member) => member.y)) + 6;
    let lane = 0;
    while (laneIntervals[lane] !== undefined && laneIntervals[lane]?.some((item) => top < item.bottom && bottom > item.top)) {
      lane += 1;
      if (lane >= 4) {
        lane = 3;
        break;
      }
    }
    laneIntervals[lane] = [...(laneIntervals[lane] ?? []), { top, bottom }];
    laneOfGroup.set(group.out.id, lane);
  }
  const laneCount = Math.max(1, laneIntervals.length);
  const messagePalette = buildMessagePalette(orderedGroups.length);
  orderedGroups.forEach((group, index) => {
    const channel = channelColumns.get(group.out.channelName);
    if (channel === undefined) return;
    const channelX = channel.x + channel.width / 2;
    const members = [group.out, ...group.ins];
    const lane = laneOfGroup.get(group.out.id) ?? 0;
    const laneX = channelX + (lane - (laneCount - 1) / 2) * 12;
    const frameWidth = messageFrameWidthOf(group.out.termText);
    // identity 接收去重的值身份色带（F5）：广播取第一个定义了 identity 色的接收端。
    const termValueColor = group.ins.flatMap((incoming) => {
      const color = identityTermColorByRef.get(refOf(incoming.roleIndex, incoming.stepIndex));
      return color === undefined ? [] : [color];
    })[0];
    const top = Math.min(...members.map((member) => member.y));
    const bottom = Math.max(...members.map((member) => member.y));
    pillars.push({
      id: `message-${String(index + 1)}`,
      color: messagePalette[index] ?? MESSAGE_COLORS[index % MESSAGE_COLORS.length],
      sequence: index + 1,
      lineStyle: messageLineStyleOf(index),
      lane,
      laneX,
      origin: group.manual ? 'manual' : 'automatic',
      channelName: group.out.channelName,
      channelX,
      top,
      bottom,
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
  // ticket 27：补角色名与源码行，并自上而下编号（标记与列表共用同一顺序），
  // 让“冲突 N”在画布与列表中一眼对应。
  const conflicts: StructuredConflict[] = spacing.conflicts.map((conflict) => {
    const line = conflictLineOf(conflict.id, roles);
    const roleIndex = line?.roleIndex ?? conflict.roleIndex;
    const roleName = conflict.id === 'order-cycle' || roleIndex === undefined
      ? undefined
      : roles[roleIndex]?.name;
    return {
      id: conflict.id,
      message: conflict.message,
      y: conflict.y,
      ...(roleIndex === undefined ? {} : { roleIndex }),
      ...(roleName === undefined ? {} : { roleName }),
      ...(line === undefined ? {} : { sourceLine: line.line }),
    };
  }).sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
    cryptoGroups,
    cryptoGroupFolds,
    roleDiagnostics,
    endpoints: finalEndpoints,
    pillars: finalPillars,
    conflicts,
    unassignedDiagnostics: diagnosticAttribution.unassigned,
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
  | { kind: 'value'; bindingId: string; occurrence: StructuredValueBlock['occurrence']; ghost?: boolean }
  | {
      kind: 'method';
      label: string;
      direction: StructuredMethod['direction'];
      caption?: string;
      connector?: '&&' | '||';
      inputBindingIds: readonly string[];
      outputBindingIds: readonly string[];
      groupId?: string;
      groupExpanded?: boolean;
      groupNested?: boolean;
    }
  | { kind: 'check'; op: string; operands: readonly CheckOperand[]; connector?: '&&' | '||'; groupId?: string }
  | {
      kind: 'derived';
      text: string;
      chipKind: 'derived' | 'condition';
      groupId?: string;
      groupExpanded?: boolean;
    }
  | { kind: 'group-summary'; group: CryptoOperationGroup; nested: boolean };

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
  // C14：降级语句无值链，仅作为原文芯片行单元发射。
  if (item.operation === 'degraded') return entries;

  const introduced = new Set(item.bindingIds);
  if (item.operation === 'get') {
    // C5/U4.7：`get` 只保留分支侧的表模式 ∈ 检查盒（guardEntries），不再重复生成方法盒。
    const patternRefs = item.pattern === undefined ? [] : termBindingRefs(item.pattern);
    pushValues(patternRefs);
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
    // C6：嵌套构造的可见性——外层词项内联的内层构造子以派生芯片标注原文，弥补逐层盒的列宽约束。
    if (item.term.kind === 'application') {
      item.term.args.forEach((argument) => {
        if (argument.kind === 'application') entries.push({ kind: 'derived', text: renderTerm(argument), chipKind: 'derived' });
      });
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
    if (entry.kind === 'group-summary') return total + METRICS.cryptoGroupPitch;
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
  return valueColorsOf(roles.flatMap((role) => role.bindings.map((binding) => binding.id)));
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
    pattern: patternKindOf(ordinal),
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
