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
 * 解算纵向布局。禁置带依赖消息端 y、消息端 y 又依赖禁置带，故迭代至带集合稳定
 * （每遍用最新带重放；稳定 = 放置所用带与解自身导出的带一致，即自洽），上限 6 遍；
 * 输入确定则输出确定。互穿线过度约束、残留带命中时由 placeUnits 记为显式冲突。
 */
export function solveSpacing(request: SpacingRequest): SpacingSolution {
  const unit = gapUnitOf(request.compactness);
  const reserveHalf = request.reserveHalf ?? 11;
  let reserved = new Map<number, number[]>();
  let solution = placeUnits(request, unit, reserveHalf, reserved);
  for (let pass = 0; pass < 6; pass += 1) {
    const next = deriveReservations(request, solution);
    if (sameBands(next, reserved)) break;
    reserved = next;
    solution = placeUnits(request, unit, reserveHalf, reserved);
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
          message: '跨列消息线与该单元的禁置带约束未能在迭代内自洽，已显式保留并延长生命线。',
        });
      }
    });
  });
  const seen = new Set(solution.conflicts.map((conflict) => conflict.id));
  return {
    ...solution,
    conflicts: [...solution.conflicts, ...residual.filter((conflict) => !seen.has(conflict.id))],
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
  // 全局唯一域只收消息端 y：本地步骤/事件/折叠条不占消息箭头的纵向位置
  // （票面「本地步骤不占消息箭头」；跨角色行也不承诺对齐）。
  const usedY = new Set<number>();
  request.unitsByRole.forEach((units, roleIndex) => {
    const bands = reserved.get(roleIndex) ?? [];
    const startOffset = request.startOffsetByRole?.[roleIndex] ?? 0;
    let cursor = startOffset;
    units.forEach((spacingUnit) => {
      const gap = gapOf(spacingUnit.gapTier, unit);
      const nominalY = cursor + gap + spacingUnit.height / 2;
      const y = settleY(nominalY, spacingUnit.height, usedY, bands, reserveHalf);
      if (spacingUnit.messageEndpoint) {
        usedY.add(y);
        if (y > nominalY + 1e-9) {
          conflicts.push({
            id: `spacing:${spacingUnit.id}`,
            roleIndex,
            y,
            message: '消息端为满足跨列禁置带或全局 y 唯一性而下移，已延长生命线（非静默重排）。',
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
          message: '跨列消息线与该单元的禁置带约束未能在迭代内自洽，已显式保留并延长生命线。',
        });
      }
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
