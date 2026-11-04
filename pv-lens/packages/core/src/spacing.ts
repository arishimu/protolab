/**
 * 自适应纵向间距解算器（ticket 07 / decision 08 / ADR-0006）。
 *
 * 纯函数：输入每角色的布局单元序列与紧凑度，输出每单元 y、每角色底与显式冲突列表。
 * 硬约束（单元非重叠、全局消息端 y 唯一、跨列禁置带）永远压过等距偏好；不可满足时
 * 加高并显式标记（`reserve-avoidance` / `global-separation`），绝不压缩刚性单元内部、
 * 绝不静默重排。三层间距档位（tight = unit / row = max(34, 1.7u) / group = max(50, 2.4u)）
 * 数值可调、顺序规范性：压缩只随 compactness 缩小 unit，档位下限为绝对常量。
 */

export type GapTier = 'tight' | 'row' | 'group';

export interface SpacingUnit {
  id: string;
  roleIndex: number;
  /** 单元类别；解算器不按 kind 分支（高度不透明即刚性）——kind 供 07b 折叠团与调试定位。 */
  kind: 'parameter-cluster' | 'row' | 'branch-fold' | 'fold-group';
  height: number;
  /** 刚性声明（参数簇/折叠团）：内部间距已计入 height；解算器对任何单元都只整体放置，
   *  flag 是调用方契约自述，供读取方识别「该高度不可再分解」。 */
  rigid: boolean;
  /** 消息端行：y 进入全局唯一域，并对 crossedRoles 列产生禁置带。 */
  messageEndpoint: boolean;
  /** 该消息端水平线穿过的中间角色下标（调用方按列几何判定）。 */
  crossedRoles?: readonly number[];
  /** 消息端 y 的最小分离步长；配对端默认 4，未配对端用更大步长避免共线。 */
  endpointSeparation?: number;
  /** 与上一单元之间的间距档位；首单元用 startOffset。 */
  gapTier: GapTier;
}

/**
 * 跨角色因果约束：before 单元的底部必须早于 after 单元的顶部至少 minGap。
 * 同角色相邻单元的顺序边由解算器自动补齐；此处只放配对消息的 out → in 边。
 */
export interface SpacingOrderEdge {
  before: string;
  after: string;
  minGap?: number;
}

export interface SpacingRequest {
  unitsByRole: readonly (readonly SpacingUnit[])[];
  /** [0,1]：0 偏好间距、1 最紧凑；只影响纵向，不触碰水平序列。 */
  compactness: number;
  /** 跨列禁置带半高：线两侧该范围内不放被穿角色的单元。 */
  reserveHalf?: number;
  /** 每角色首单元上缘的起始偏移（画布头部/参数标签区），缺省 0。 */
  startOffsetByRole?: readonly number[];
  /** 跨角色因果边；缺省时退化为逐角色顺序放置。 */
  orderEdges?: readonly SpacingOrderEdge[];
}

export interface SpacingConflict {
  id: string;
  roleIndex: number;
  /** 硬约束让位后的单元 y（画布标记锚点）。 */
  y: number;
  message: string;
}

export interface SpacingSolution {
  yByUnitId: ReadonlyMap<string, number>;
  bottomByRole: readonly number[];
  conflicts: readonly SpacingConflict[];
  /** 收敛后的禁置带（roleIndex → 线 y 列表），供测试与调试。 */
  reservedByRole: ReadonlyMap<number, readonly number[]>;
}

const ROW_FLOOR = 34;
const GROUP_FLOOR = 50;

/** 紧凑度 → 基本单位 u ∈ [18, 26]（decision 08 与既有 gapUnit 口径一致）。 */
export function gapUnitOf(compactness: number): number {
  return 26 - Math.min(1, Math.max(0, compactness)) * 8;
}

/** 三层间距档位表：数值可调，档位与下限顺序规范性。 */
export function gapOf(tier: GapTier, unit: number): number {
  switch (tier) {
    case 'tight': return unit;
    case 'row': return Math.max(ROW_FLOOR, 1.7 * unit);
    case 'group': return Math.max(GROUP_FLOOR, 2.4 * unit);
  }
}

const SEPARATION_STEP = 4;
const BAND_MARGIN = 2;

/**
 * 解算纵向布局。禁置带依赖消息端 y、消息端 y 又依赖禁置带，故迭代至带集合稳定
 * （每遍用最新带重放；稳定 = 放置所用带与解自身导出的带一致，即自洽），上限 6 遍；
 * 输入确定则输出确定。互穿线过度约束、残留带命中时由 placeUnits 记为显式冲突。
 */
export function solveSpacing(request: SpacingRequest): SpacingSolution {
  const unit = gapUnitOf(request.compactness);
  const reserveHalf = request.reserveHalf ?? 11;
  let reserved = new Map<number, number[]>();
  let orderEdges = [...(request.orderEdges ?? [])];
  let solution = placeUnits(request, unit, reserveHalf, reserved, orderEdges);
  const causalConflicts: SpacingConflict[] = [];
  if (solution.cycle) {
    // 成环时丢弃环内因果边，保留其余约束；图仍完整，冲突显式记录。
    const remaining = solution.remainingIds;
    const dropped = orderEdges.filter((edge) => remaining.has(edge.before) && remaining.has(edge.after));
    orderEdges = orderEdges.filter((edge) => !dropped.includes(edge));
    solution = placeUnits(request, unit, reserveHalf, reserved, orderEdges);
    if (solution.cycle) {
      orderEdges = [];
      solution = placeUnits(request, unit, reserveHalf, reserved, orderEdges);
    }
    const anchor = dropped
      .flatMap((edge) => [edge.before, edge.after])
      .map((id) => solution.yByUnitId.get(id))
      .find((y) => y !== undefined) ?? 0;
    causalConflicts.push({
      id: 'order-cycle',
      roleIndex: 0,
      y: anchor,
      message: '配对消息的因果顺序无法同时满足，已保留图形并忽略环内顺序约束；请检查协议的设计意图。',
    });
  }
  for (let pass = 0; pass < 6; pass += 1) {
    const next = deriveReservations(request, solution);
    if (sameBands(next, reserved)) break;
    reserved = next;
    solution = placeUnits(request, unit, reserveHalf, reserved, orderEdges);
  }
  // 终检：互穿线 + 全局唯一性的贪心迭代可能周期振荡（稳定解存在但该路径找不到）。
  // 放置带与最终带不一致的残留命中必须显式标记，不静默重叠。
  const finalReserved = deriveReservations(request, solution);
  const residual: SpacingConflict[] = [];
  request.unitsByRole.forEach((units, roleIndex) => {
    const bands = finalReserved.get(roleIndex) ?? [];
    units.forEach((spacingUnit) => {
      const y = solution.yByUnitId.get(spacingUnit.id);
      if (y === undefined) return;
      const clashing = bands.some((bandY) =>
        y - spacingUnit.height / 2 - BAND_MARGIN < bandY + reserveHalf && y + spacingUnit.height / 2 + BAND_MARGIN > bandY - reserveHalf);
      if (clashing) {
        residual.push({
          id: `spacing-band:${spacingUnit.id}`,
          roleIndex,
          y,
          message: '空间不足，该步骤已下移避让跨列连线；生命线已延长。',
        });
      }
    });
  });
  const seen = new Set([...causalConflicts, ...solution.conflicts].map((conflict) => conflict.id));
  return {
    yByUnitId: solution.yByUnitId,
    bottomByRole: solution.bottomByRole,
    conflicts: [...causalConflicts, ...solution.conflicts, ...residual.filter((conflict) => !seen.has(conflict.id))],
    reservedByRole: finalReserved,
  };
}

function sameBands(a: ReadonlyMap<number, readonly number[]>, b: ReadonlyMap<number, readonly number[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, values] of a) {
    const other = b.get(key);
    if (other === undefined || other.length !== values.length) return false;
    if ([...values].sort((x, y) => x - y).some((value, index) => value !== [...other].sort((x, y) => x - y)[index])) return false;
  }
  return true;
}

interface Placement {
  yByUnitId: Map<string, number>;
  bottomByRole: number[];
  conflicts: SpacingConflict[];
  /** 拓扑排序是否因因果环而未能放置全部单元。 */
  cycle: boolean;
  /** 未能放置的单元 id（成环时的回退依据）。 */
  remainingIds: Set<string>;
}

interface PlacementNode {
  unit: SpacingUnit;
  roleIndex: number;
  index: number;
}

function compareNodes(a: PlacementNode, b: PlacementNode): number {
  return a.roleIndex - b.roleIndex || a.index - b.index;
}

/**
 * 跨角色拓扑放置。同角色相邻单元构成局部链；配对消息的 out → in 构成跨角色边。
 * Kahn 队列按角色下标、单元下标升序取最小，保证确定性；成环时返回未放置集合，
 * 由 solveSpacing 丢弃环内边后重试。
 */
function placeUnits(
  request: SpacingRequest,
  unit: number,
  reserveHalf: number,
  reserved: ReadonlyMap<number, readonly number[]>,
  orderEdges: readonly SpacingOrderEdge[],
): Placement {
  const yByUnitId = new Map<string, number>();
  const bottomByRole: number[] = request.unitsByRole.map((_, roleIndex) => request.startOffsetByRole?.[roleIndex] ?? 0);
  const conflicts: SpacingConflict[] = [];
  // 全局唯一域只收消息端 y：本地步骤/事件/折叠条不占消息箭头的纵向位置。
  const usedY = new Map<number, number>();
  const nodes: PlacementNode[] = [];
  request.unitsByRole.forEach((units, roleIndex) => {
    units.forEach((spacingUnit, index) => nodes.push({ unit: spacingUnit, roleIndex, index }));
  });
  const byId = new Map(nodes.map((node) => [node.unit.id, node]));
  const indegree = new Map<string, number>(nodes.map((node) => [node.unit.id, 0]));
  const successors = new Map<string, string[]>();
  const crossPredecessors = new Map<string, Array<{ id: string; minGap: number }>>();

  const addEdge = (before: string, after: string, minGap?: number): void => {
    if (before === after || !byId.has(before) || !byId.has(after)) return;
    successors.set(before, [...(successors.get(before) ?? []), after]);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
    if (minGap !== undefined) {
      crossPredecessors.set(after, [...(crossPredecessors.get(after) ?? []), { id: before, minGap }]);
    }
  };

  // 同角色局部顺序边。
  request.unitsByRole.forEach((units) => {
    for (let index = 1; index < units.length; index += 1) {
      const before = units[index - 1];
      const after = units[index];
      if (before !== undefined && after !== undefined) addEdge(before.id, after.id);
    }
  });
  // 配对消息的因果边。
  orderEdges.forEach((edge) => addEdge(edge.before, edge.after, edge.minGap ?? 16));

  const ready: PlacementNode[] = nodes
    .filter((node) => (indegree.get(node.unit.id) ?? 0) === 0)
    .sort(compareNodes);
  const placed = new Set<string>();

  while (ready.length > 0) {
    const node = ready.shift();
    if (node === undefined) break;
    const { unit: spacingUnit, roleIndex } = node;
    const gap = gapOf(spacingUnit.gapTier, unit);
    let nominalY = (bottomByRole[roleIndex] ?? 0) + gap + spacingUnit.height / 2;
    for (const predecessor of crossPredecessors.get(spacingUnit.id) ?? []) {
      const predecessorNode = byId.get(predecessor.id);
      const predecessorY = yByUnitId.get(predecessor.id);
      if (predecessorNode === undefined || predecessorY === undefined) continue;
      nominalY = Math.max(
        nominalY,
        predecessorY + predecessorNode.unit.height / 2 + predecessor.minGap + spacingUnit.height / 2,
      );
    }
    const bands = reserved.get(roleIndex) ?? [];
    const separation = spacingUnit.messageEndpoint ? spacingUnit.endpointSeparation ?? SEPARATION_STEP : SEPARATION_STEP;
    const y = settleY(nominalY, spacingUnit.height, usedY, bands, reserveHalf, separation);
    if (spacingUnit.messageEndpoint) {
      usedY.set(y, separation);
      if (y > nominalY + 1e-9) {
        conflicts.push({
          id: `spacing:${spacingUnit.id}`,
          roleIndex,
          y,
          message: '消息位置已下移，避免与跨列连线重叠；生命线已相应延长。',
        });
      }
    }
    // 残留带命中（互穿线过度约束、迭代上限内未自洽）→ 显式标记，不静默重叠。
    const clashing = bands.find((bandY) =>
      y - spacingUnit.height / 2 - BAND_MARGIN < bandY + reserveHalf && y + spacingUnit.height / 2 + BAND_MARGIN > bandY - reserveHalf);
    if (clashing !== undefined) {
      conflicts.push({
        id: `spacing-band:${spacingUnit.id}`,
        roleIndex,
        y,
        message: '空间不足，该步骤已下移避让跨列连线；生命线已延长。',
      });
    }
    yByUnitId.set(spacingUnit.id, y);
    bottomByRole[roleIndex] = y + spacingUnit.height / 2;
    placed.add(spacingUnit.id);
    for (const successor of successors.get(spacingUnit.id) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next !== 0) continue;
      const successorNode = byId.get(successor);
      if (successorNode !== undefined) {
        ready.push(successorNode);
        ready.sort(compareNodes);
      }
    }
  }

  const remainingIds = new Set(nodes.filter((node) => !placed.has(node.unit.id)).map((node) => node.unit.id));
  return { yByUnitId, bottomByRole, conflicts, cycle: placed.size < nodes.length, remainingIds };
}

/** 名义位置只下不上：先全局唯一分离，再避禁置带，循环至两者同时满足。
 *  避让步进带显式余量（0.5px）：`带沿 + R + h/2 + M` 的浮点和可能比判定式小一个 ulp，
 *  导致新 y 仍「命中」原带且 uniqueY 不步进——y 永远不变（ns-mutual 实测死循环）。 */
function settleY(
  nominal: number,
  height: number,
  usedY: ReadonlyMap<number, number>,
  bands: readonly number[],
  reserveHalf: number,
  separation: number,
): number {
  let y = uniqueY(nominal, usedY, separation);
  const leap = reserveHalf + height / 2 + BAND_MARGIN + 0.5;
  for (let round = 0; round < 10_000; round += 1) {
    const clashing = bands.find((bandY) =>
      y - height / 2 - BAND_MARGIN < bandY + reserveHalf && y + height / 2 + BAND_MARGIN > bandY - reserveHalf);
    if (clashing === undefined) return y;
    y = uniqueY(clashing + leap, usedY, separation);
  }
  throw new Error(`settleY 未收敛：nominal=${String(nominal)} y=${String(y)} h=${String(height)} bands=${bands.join(',')} reserveHalf=${String(reserveHalf)}`);
}

/** 与已用 y 保持至少 max(本次步长, 已用步长) 的距离；只向上移动到最近可行位置。 */
function uniqueY(value: number, usedY: ReadonlyMap<number, number>, separation: number): number {
  let y = value;
  for (let round = 0; round < 100_000; round += 1) {
    let next = y;
    for (const [used, usedSeparation] of usedY) {
      const gap = Math.max(separation, usedSeparation);
      if (Math.abs(next - used) < gap) next = used + gap;
    }
    if (next === y) return y;
    y = next;
  }
  throw new Error(`uniqueY 未分离：y=${String(y)}`);
}

/** 由消息端解算 y 推导被穿角色的禁置带。 */
function deriveReservations(request: SpacingRequest, placement: Placement): Map<number, number[]> {
  const reserved = new Map<number, number[]>();
  request.unitsByRole.forEach((units) => {
    units.forEach((spacingUnit) => {
      if (!spacingUnit.messageEndpoint) return;
      const y = placement.yByUnitId.get(spacingUnit.id);
      if (y === undefined) return;
      (spacingUnit.crossedRoles ?? []).forEach((crossed) => {
        const bands = reserved.get(crossed) ?? [];
        bands.push(y);
        reserved.set(crossed, bands);
      });
    });
  });
  return reserved;
}
