import { describe, expect, it } from 'vitest';
import { gapOf, gapUnitOf, solveSpacing } from '@pv-lens/core';
import type { SpacingUnit } from '@pv-lens/core';

const row = (id: string, roleIndex: number, extra: Partial<SpacingUnit> = {}): SpacingUnit => ({
  id,
  roleIndex,
  kind: 'row',
  height: 30,
  rigid: false,
  messageEndpoint: false,
  gapTier: 'row',
  ...extra,
});

describe('ticket #07：自适应纵向间距解算器（core 属性）', () => {
  it('三层档位表：tight=unit、row/group 带绝对下限，compactness 只缩小档位值', () => {
    for (const compactness of [0, 0.25, 0.5, 0.75, 1]) {
      const unit = gapUnitOf(compactness);
      expect(gapOf('tight', unit)).toBe(unit);
      expect(gapOf('row', unit)).toBe(Math.max(34, 1.7 * unit));
      expect(gapOf('group', unit)).toBe(Math.max(50, 2.4 * unit));
      // 下限是绝对常量：最紧凑也不击穿。
      expect(gapOf('row', unit)).toBeGreaterThanOrEqual(34);
      expect(gapOf('group', unit)).toBeGreaterThanOrEqual(50);
    }
    expect(gapUnitOf(0)).toBe(26);
    expect(gapUnitOf(1)).toBe(18);
  });

  it('刚性单元内部不被压缩：参数簇高度在任何紧凑度下原样占用', () => {
    const cluster: SpacingUnit = {
      id: 'params',
      roleIndex: 0,
      kind: 'parameter-cluster',
      height: 60,
      rigid: true,
      messageEndpoint: false,
      gapTier: 'row',
    };
    for (const compactness of [0, 1]) {
      const solution = solveSpacing({ unitsByRole: [[cluster, row('r1', 0)]], compactness });
      const clusterY = solution.yByUnitId.get('params');
      const rowY = solution.yByUnitId.get('r1');
      expect(clusterY).toBeDefined();
      expect(rowY! - clusterY!).toBeGreaterThanOrEqual(60 / 2 + 30 / 2 + gapOf('row', gapUnitOf(compactness)) - 1e-9);
    }
  });

  it('全局消息端 y 唯一：跨角色消息端互不占用同一 y', () => {
    const units = [
      row('a-msg', 0, { messageEndpoint: true }),
      row('b-msg', 1, { messageEndpoint: true }),
      row('c-msg', 2, { messageEndpoint: true }),
    ];
    const solution = solveSpacing({ unitsByRole: [[units[0]], [units[1]], [units[2]]], compactness: 0.5 });
    const ys = [solution.yByUnitId.get('a-msg'), solution.yByUnitId.get('b-msg'), solution.yByUnitId.get('c-msg')];
    expect(new Set(ys).size).toBe(3);
  });

  it('跨列禁置带：被穿角色的单元避让，消息端被迫离开名义位置时显式标记冲突', () => {
    // 角色 0 的消息线穿过角色 1；角色 1 恰有一条同 y 的行，必须避让。
    const solution = solveSpacing({
      unitsByRole: [
        [row('wire', 0, { messageEndpoint: true, crossedRoles: [1] })],
        [row('blocked', 1)],
      ],
      compactness: 0,
      startOffsetByRole: [100, 100],
    });
    const wireY = solution.yByUnitId.get('wire')!;
    const blockedY = solution.yByUnitId.get('blocked')!;
    // 名义上两者同 y（同起点同高度同档位）；禁置带把 blocked 推到线下方。
    expect(blockedY).toBeGreaterThan(wireY);
    expect(solution.reservedByRole.get(1)).toContain(wireY);
    // 消息端 wire 自身未被推（它是线的定义方），冲突标记挂在被迫让位侧的信息上：
    // 解算器约定：仅消息端行离开名义位置才标记（本例 wire 未动，blocked 是避让方，无标记）。
    expect(solution.conflicts).toHaveLength(0);
    // 反例：角色 1 也有消息端且与角色 0 的线同 y，全局唯一性迫使其中之一下移 → 显式标记。
    const clashed = solveSpacing({
      unitsByRole: [
        [row('wire2', 0, { messageEndpoint: true, crossedRoles: [1] })],
        [row('wire3', 1, { messageEndpoint: true })],
      ],
      compactness: 0,
      startOffsetByRole: [100, 100],
    });
    expect(clashed.conflicts.length).toBeGreaterThanOrEqual(1);
    // C8：冲突消息为用户语言（不再使用「非静默重排」等实现术语）。
    expect(clashed.conflicts[0]?.message).toContain('避免与跨列连线重叠');
  });

  it('紧凑度不改单元相对顺序与角色内结构，只改间距（确定性输出）', () => {
    const build = (): SpacingUnit[][] => [
      [row('a', 0), row('b', 0, { gapTier: 'group' }), row('c', 0, { messageEndpoint: true })],
      [row('d', 1)],
    ];
    const loose = solveSpacing({ unitsByRole: build(), compactness: 0 });
    const tight = solveSpacing({ unitsByRole: build(), compactness: 1 });
    const repeat = solveSpacing({ unitsByRole: build(), compactness: 1 });
    // 同输入同输出（确定性）。
    expect([...repeat.yByUnitId.entries()]).toEqual([...tight.yByUnitId.entries()]);
    // 紧凑方向的 y 只减不增、相对顺序保持。
    for (const [id, y] of loose.yByUnitId) {
      expect(tight.yByUnitId.get(id)!).toBeLessThanOrEqual(y);
    }
    expect(loose.bottomByRole[0]).toBeGreaterThan(tight.bottomByRole[0]);
  });

  it('下限触底顺序：compactness=1 时 row/group 停在绝对下限，tight=unit=18', () => {
    expect(gapUnitOf(1)).toBe(18);
    expect(gapOf('row', gapUnitOf(1))).toBe(34);
    expect(gapOf('group', gapUnitOf(1))).toBe(50);
  });

  it('本地步骤不占消息箭头的纵向位置：非消息行与消息端可同 y 且不产冲突', () => {
    const solution = solveSpacing({
      unitsByRole: [
        [row('local', 0)],
        [row('msg', 1, { messageEndpoint: true })],
      ],
      compactness: 0,
      startOffsetByRole: [100, 100],
    });
    expect(solution.yByUnitId.get('local')).toBe(solution.yByUnitId.get('msg'));
    expect(solution.conflicts).toHaveLength(0);
  });

  it('互穿消息线：要么自洽、要么振荡残留被显式标记，不允许静默重叠', () => {
    const solution = solveSpacing({
      unitsByRole: [
        [row('a1', 0, { messageEndpoint: true, crossedRoles: [1] })],
        [row('b1', 1, { messageEndpoint: true, crossedRoles: [0] })],
      ],
      compactness: 0,
      startOffsetByRole: [100, 100],
    });
    const ys = [solution.yByUnitId.get('a1')!, solution.yByUnitId.get('b1')!];
    expect(new Set(ys).size).toBe(2);
    // 自洽时无残留标记；振荡时残留命中必须以 spacing-band 冲突显式出现。
    const residual = solution.conflicts.filter((conflict) => conflict.id.startsWith('spacing-band:'));
    if (residual.length > 0) {
      // C8：用户语言口径——说明避让结果即可。
      expect(residual[0]?.message).toContain('避让跨列连线');
    }
  });
});
