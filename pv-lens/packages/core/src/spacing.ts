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
  /** 单元类别；行（含消息行/事件/本地步骤/链）由调用方合并为 row 单元。 */
  kind: 'parameter-cluster' | 'row' | 'branch-fold' | 'fold-group';
  height: number;
  /** 刚性单元（参数簇/折叠团）：内部间距已计入 height，只整体放置，绝不压缩。 */
  rigid: boolean;
  /** 消息端行：y 进入全局唯一域，并对 crossedRoles 列产生禁置带。 */
  messageEndpoint: boolean;
  /** 该消息端水平线穿过的中间角色下标（调用方按列几何判定）。 */
  crossedRoles?: readonly number[];
  /** 与上一单元之间的间距档位；首单元用 startOffset。 */
  gapTier: GapTier;
}

export interface SpacingRequest {
  unitsByRole: readonly (readonly SpacingUnit[])[];
  /** [0,1]：0 偏好间距、1 最紧凑；只影响纵向，不触碰水平序列。 */
  compactness: number;
  /** 跨列禁置带半高：线两侧该范围内不放被穿角色的单元。 */
  reserveHalf?: number;
  /** 每角色首单元上缘的起始偏移（画布头部/参数标签区），缺省 0。 */
  startOffsetByRole?: readonly number[];
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
 * 解算纵向布局。禁置带依赖消息端 y、消息端 y 又依赖禁置带，故内部做三遍迭代
 * （第一遍无带求初始线位，随后每遍用最新带重放）；输入确定则输出确定。
 */
export function solveSpacing(request: SpacingRequest): SpacingSolution {
  const unit = gapUnitOf(request.compactness);
  const reserveHalf = request.reserveHalf ?? 11;
  let reserved = new Map<number, number[]>();
  let solution = placeUnits(request, unit, reserveHalf, reserved);
  for (let pass = 0; pass < 2; pass += 1) {
    reserved = deriveReservations(request, solution);
    solution = placeUnits(request, unit, reserveHalf, reserved);
  }
  return { ...solution, reservedByRole: deriveReservations(request, solution) };
}

interface Placement {
  yByUnitId: Map<string, number>;
  bottomByRole: number[];
  conflicts: SpacingConflict[];
}

function placeUnits(
  request: SpacingRequest,
  unit: number,
  reserveHalf: number,
  reserved: ReadonlyMap<number, readonly number[]>,
): Placement {
  const yByUnitId = new Map<string, number>();
  const bottomByRole: number[] = [];
  const conflicts: SpacingConflict[] = [];
  const usedY = new Set<number>();
  request.unitsByRole.forEach((units, roleIndex) => {
    const bands = reserved.get(roleIndex) ?? [];
    const startOffset = request.startOffsetByRole?.[roleIndex] ?? 0;
    let cursor = startOffset;
    units.forEach((spacingUnit) => {
      const gap = gapOf(spacingUnit.gapTier, unit);
      const nominalY = cursor + gap + spacingUnit.height / 2;
      let y = settleY(nominalY, spacingUnit.height, usedY, bands, reserveHalf);
      if (y > nominalY + 1e-9 && spacingUnit.messageEndpoint) {
        conflicts.push({
          id: `spacing:${spacingUnit.id}`,
          roleIndex,
          y,
          message: '消息端为满足跨列禁置带或全局 y 唯一性而下移，已延长生命线（非静默重排）。',
        });
      }
      usedY.add(y);
      yByUnitId.set(spacingUnit.id, y);
      cursor = y + spacingUnit.height / 2;
    });
    bottomByRole[roleIndex] = cursor;
  });
  return { yByUnitId, bottomByRole, conflicts };
}

/** 名义位置只下不上：先全局唯一分离，再避禁置带，循环至两者同时满足。
 *  避让步进带显式余量（0.5px）：`带沿 + R + h/2 + M` 的浮点和可能比判定式小一个 ulp，
 *  导致新 y 仍「命中」原带且 uniqueY 不步进——y 永远不变（ns-mutual 实测死循环）。 */
function settleY(
  nominal: number,
  height: number,
  usedY: ReadonlySet<number>,
  bands: readonly number[],
  reserveHalf: number,
): number {
  let y = uniqueY(nominal, usedY);
  const leap = reserveHalf + height / 2 + BAND_MARGIN + 0.5;
  for (let round = 0; round < 10_000; round += 1) {
    const clashing = bands.find((bandY) =>
      y - height / 2 - BAND_MARGIN < bandY + reserveHalf && y + height / 2 + BAND_MARGIN > bandY - reserveHalf);
    if (clashing === undefined) return y;
    y = uniqueY(clashing + leap, usedY);
  }
  throw new Error(`settleY 未收敛：nominal=${String(nominal)} y=${String(y)} h=${String(height)} bands=${bands.join(',')} reserveHalf=${String(reserveHalf)}`);
}

function uniqueY(value: number, usedY: ReadonlySet<number>): number {
  let y = value;
  for (let round = 0; usedY.has(y); round += 1) {
    if (round > 100_000) throw new Error(`uniqueY 未分离：y=${String(y)}`);
    y += SEPARATION_STEP;
  }
  return y;
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
