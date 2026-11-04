import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

// ticket 27：1) 未配对词项芯片以消息线居中；2) 布局冲突标记与列表按编号/角色/源码行一一对应。

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

describe('ticket #27：芯片对齐与冲突对应', () => {
  it('hello 的未配对词项芯片以消息线居中且居于自身角色列中轴', () => {
    const result = fixture('hello');
    const layout = buildStructuredNarrativeLayout(result);
    const chip = layout.chips.find((candidate) => candidate.kind === 'wire');
    const endpoint = layout.endpoints.find((candidate) => candidate.termText === 'RSA');
    expect(chip).toBeDefined();
    expect(endpoint).toBeDefined();
    // 无值层链：芯片中心与端点线同 y，矩形上下对称压住消息线。
    expect(chip!.y).toBeCloseTo(endpoint!.y, 5);
    expect(chip!.y - chip!.height / 2).toBeLessThan(endpoint!.y);
    expect(chip!.y + chip!.height / 2).toBeGreaterThan(endpoint!.y);
    const role = narrativeRoleOrder(result)[0];
    const column = layout.columns.find((candidate) => candidate.kind === 'role' && candidate.name === role?.name);
    expect(column).toBeDefined();
    expect(chip!.x).toBeCloseTo(column!.x + column!.width / 2, 5);
  });

  it('布局冲突标记与列表按“冲突 N + 角色 + 源码行”一一对应', () => {
    const result = fixture('ns-mutual-auth');
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    expect(layout.conflicts.length).toBeGreaterThanOrEqual(2);
    layout.conflicts.forEach((conflict) => {
      expect(conflict.roleName, `${conflict.id} 应带角色名`).toBeTruthy();
      expect(conflict.sourceLine, `${conflict.id} 应带源码行`).toBeGreaterThan(0);
    });

    const html = renderToString(createElement(NarrativeView, { result, pairings }));
    layout.conflicts.forEach((conflict, index) => {
      const number = index + 1;
      expect(html).toContain(`id="layout-conflict-marker-${String(number)}"`);
      expect(html).toContain(`id="layout-conflict-${String(number)}"`);
      expect(html).toContain(`冲突 ${String(number)}`);
      expect(html).toContain(conflict.roleName!);
      expect(html).toContain(`L${String(conflict.sourceLine)}`);

      // 标记必须锚定在角色名对应的列上（不能按 narrativeRoleOrder 下标直接套水平序列列序），
      // 且落在列间空隙：非末列向右、末列向左，避免压住列心的值方块与芯片。
      const roleColumn = layout.columns.find(
        (column) => column.kind === 'role' && column.name === conflict.roleName,
      );
      expect(roleColumn).toBeDefined();
      const columnIndex = layout.columns.indexOf(roleColumn!);
      const placeRight = columnIndex < layout.columns.length - 1;
      const anchorX = placeRight ? roleColumn!.x + roleColumn!.width - 9 : roleColumn!.x + 9;
      const marker = new RegExp(
        `id="layout-conflict-marker-${String(number)}"[\\s\\S]*?<path d="M ([\\d.]+) ([\\d.]+)`,
      ).exec(html);
      expect(marker, `冲突 ${String(number)} 标记应可解析`).not.toBeNull();
      expect(Number(marker![1])).toBeCloseTo(anchorX, 5);
      expect(Number(marker![2])).toBeCloseTo(conflict.y - 9, 5);

      const text = new RegExp(
        `id="layout-conflict-marker-${String(number)}"[\\s\\S]*?<text[^>]*x="([\\d.]+)"[^>]*text-anchor="(start|end)"`,
      ).exec(html);
      expect(text, `冲突 ${String(number)} 标签应可解析`).not.toBeNull();
      expect(Number(text![1])).toBeCloseTo(placeRight ? anchorX + 11 : anchorX - 6, 5);
      expect(text![2]).toBe(placeRight ? 'start' : 'end');
    });
  });

  it('冲突标记落在列间空隙，不覆盖同角色值方块或线上芯片', () => {
    // 10px 字号下“冲突 N”最宽约 34px（两位数）；用于构造保守的标记水平包络。
    const LABEL_WIDTH = 34;
    for (const name of ['ns-mutual-auth', 'multi-channel']) {
      const result = fixture(name);
      const layout = buildStructuredNarrativeLayout(result, {
        pairings: composeMessagePairings(result).pairings,
      });
      const columns = layout.columns;
      layout.conflicts.forEach((conflict) => {
        const roleColumn = columns.find(
          (column) => column.kind === 'role' && column.name === conflict.roleName,
        );
        if (roleColumn === undefined) return;
        const columnIndex = columns.indexOf(roleColumn);
        const placeRight = columnIndex < columns.length - 1;
        const anchorX = placeRight ? roleColumn.x + roleColumn.width - 9 : roleColumn.x + 9;
        const textX = placeRight ? anchorX + 11 : anchorX - 6;
        const markerLeft = Math.min(anchorX - 9, placeRight ? textX : textX - LABEL_WIDTH);
        const markerRight = Math.max(anchorX + 9, placeRight ? textX + LABEL_WIDTH : textX);

        if (placeRight) {
          expect(markerLeft).toBeGreaterThanOrEqual(roleColumn.x + roleColumn.width - 18);
          expect(markerRight).toBeLessThanOrEqual(columns[columnIndex + 1]!.x);
        } else if (columnIndex > 0) {
          expect(markerLeft).toBeGreaterThanOrEqual(
            columns[columnIndex - 1]!.x + columns[columnIndex - 1]!.width,
          );
          expect(markerRight).toBeLessThanOrEqual(roleColumn.x + 18);
        }

        // 同一垂直带内的同角色值方块不得与标记包络相交；芯片的最大宽度也落在列心 ±66 内。
        layout.valueBlocks
          .filter((block) => block.roleIndex === conflict.roleIndex
            && Math.abs(block.y - conflict.y) <= block.height / 2 + 9)
          .forEach((block) => {
            const blockLeft = block.x - block.width / 2;
            const blockRight = block.x + block.width / 2;
            expect(
              markerRight > blockLeft && markerLeft < blockRight,
              `${name} ${conflict.id} 不应压住值方块 ${block.label}`,
            ).toBe(false);
          });
      });
    }
  });
});
