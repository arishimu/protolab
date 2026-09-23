import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePv, pairSteps } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildNarrativeLayout } from '../src/narrative/layout';

// 布局是纯函数：模型 → 坐标与文本。这里只做薄单测（泳道数 / 步骤数 / 未配对与配对接缝 /
// 诊断归属），不断言像素。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));
function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

describe('buildNarrativeLayout：四样例泳道与步骤（ticket 04）', () => {
  it('hello：roles 为空 → 把内联主进程画成一条 main 泳道', () => {
    const layout = buildNarrativeLayout(fixture('hello'));
    expect(layout.hasLanes).toBe(true);
    expect(layout.lanes).toHaveLength(1);
    expect(layout.lanes[0].name).toBe('main');
    expect(layout.lanes[0].kind).toBe('main');
    expect(layout.lanes[0].stepCount).toBe(1);
    expect(layout.lanes[0].cards.map((c) => c.direction)).toEqual(['out']);
  });

  it('handshake-fixed：clientA / serverB 两条泳道，各 3 步', () => {
    const layout = buildNarrativeLayout(fixture('handshake-fixed'));
    expect(layout.lanes.map((l) => l.name)).toEqual(['clientA', 'serverB']);
    expect(layout.lanes.map((l) => l.stepCount)).toEqual([3, 3]);
    expect(layout.lanes[0].signatureText).toBe('(pkA: pkey, skA: skey, pkB: spkey)');
  });

  it('ns-mutual-auth：四角色泳道（含无参 processK），步骤数正确', () => {
    const layout = buildNarrativeLayout(fixture('ns-mutual-auth'));
    expect(layout.lanes.map((l) => l.name)).toEqual([
      'processInitiator',
      'processResponder',
      'processS',
      'processK',
    ]);
    expect(layout.lanes.map((l) => l.stepCount)).toEqual([6, 7, 2, 1]);
  });

  it('ns-original：processA / processB 两条泳道，步骤序列无回退', () => {
    const layout = buildNarrativeLayout(fixture('ns-original'));
    expect(layout.lanes.map((l) => l.name)).toEqual(['processA', 'processB']);
    expect(layout.lanes.map((l) => l.stepCount)).toEqual([6, 5]);
  });

  it('没有角色也没有主进程时 hasLanes=false（视图据此给中文提示）', () => {
    const layout = buildNarrativeLayout(parsePv('free c: channel.\n'));
    expect(layout.hasLanes).toBe(false);
    expect(layout.lanes).toEqual([]);
  });
});

describe('未配对标注与 ticket 06 的配对接缝', () => {
  it('默认（无 pairing）：每个步骤卡片都标未配对、无跨泳道连线', () => {
    const layout = buildNarrativeLayout(fixture('handshake-fixed'));
    for (const lane of layout.lanes) {
      for (const card of lane.cards) {
        expect(card.unpaired, `${lane.name}#${card.stepIndex}`).toBe(true);
        expect(card.badges.some((b) => b.kind === 'unpaired')).toBe(true);
      }
    }
    expect(layout.crossLaneEdges).toEqual([]);
  });

  it('传入一条合成 pairing：两个端点转已配对、去掉未配对角标，并产出一条连线', () => {
    const result = fixture('handshake-fixed');
    const layout = buildNarrativeLayout(result, {
      pairings: [{ from: { roleIndex: 0, stepIndex: 0 }, to: { roleIndex: 1, stepIndex: 0 } }],
    });
    const from = layout.lanes[0].cards[0];
    const to = layout.lanes[1].cards[0];
    expect(from.unpaired).toBe(false);
    expect(to.unpaired).toBe(false);
    expect(from.badges.some((b) => b.kind === 'unpaired')).toBe(false);
    expect(layout.crossLaneEdges).toHaveLength(1);
    expect(layout.crossLaneEdges[0].from.roleIndex).toBe(0);
    expect(layout.crossLaneEdges[0].to.roleIndex).toBe(1);
    // 未参与配对的步骤仍标未配对（不误标）。
    expect(layout.lanes[0].cards[1].unpaired).toBe(true);
  });

  it('越界 / 同卡 pairing 一律忽略：不画线、也不去掉未配对标注', () => {
    const layout = buildNarrativeLayout(fixture('handshake-fixed'), {
      pairings: [
        { from: { roleIndex: 0, stepIndex: 0 }, to: { roleIndex: 9, stepIndex: 0 } },
        { from: { roleIndex: 0, stepIndex: 0 }, to: { roleIndex: 0, stepIndex: 0 } },
      ],
    });
    expect(layout.crossLaneEdges).toEqual([]);
    expect(layout.lanes[0].cards[0].unpaired).toBe(true);
  });

  it('core 的意图配对结果可直接喂给布局：结构确定的两条消息产出两条连线', () => {
    const result = parsePv(`
      free c: channel.
      let roleA = out(c, (n1, n2)); in(c, (n3, n4)).
      let roleB = in(c, (x, y)); out(c, (n3, n4)).
      process roleA | roleB.
    `);
    const layout = buildNarrativeLayout(result, { pairings: pairSteps(result) });
    expect(layout.crossLaneEdges).toHaveLength(2);
    expect(layout.lanes[0].cards[0].unpaired).toBe(false);
    expect(layout.lanes[1].cards[0].unpaired).toBe(false);
    expect(layout.lanes[0].cards[1].unpaired).toBe(false);
    expect(layout.lanes[1].cards[1].unpaired).toBe(false);
  });
});

describe('诊断卡片归属（降级诊断以原文标注卡片入图）', () => {
  // `choice`（v2 仍不支持）在 pA 体内 → 归入 pA 泳道；顶层词项绑定落在所有角色之外 → 未归属。
  const source = [
    'free c: channel.',
    'let topLevel = pk(sk).',
    'let pA(pk: pkey) =',
    '  choice [true] out(c, Na).',
    'let pB(pk: pkey) =',
    '  in(c, x).',
    'process',
    '  (!pA(pkA)) | (!pB(pkB)).',
  ].join('\n');
  const result = parsePv(source);
  const layout = buildNarrativeLayout(result);

  it('fixture 本身确实产生降级诊断（保住测试前提）', () => {
    expect(result.hasDegraded).toBe(true);
    expect(result.diagnostics.every((d) => d.severity === 'degraded')).toBe(true);
  });

  it('角色体内的诊断归入该泳道，带严重级别/行号/原文', () => {
    const pA = layout.lanes.find((lane) => lane.name === 'pA');
    expect(pA?.diagnosticCards).toHaveLength(1);
    const card = pA!.diagnosticCards[0];
    expect(card.severity).toBe('degraded');
    expect(card.severityLabel).toBe('降级诊断');
    expect(card.lineNumber).toBe(4);
    expect(card.sourceText.length).toBeGreaterThan(0);
    // US17：诊断卡片带行:列定位。
    expect(card.lines[0].text).toContain('L4:');
  });

  it('落不进任何角色的诊断进入「未归属诊断」区', () => {
    expect(layout.unassignedSection?.title).toBe('未归属诊断');
    expect(layout.unassignedDiagnostics).toHaveLength(1);
    expect(layout.unassignedDiagnostics[0].sourceText).toContain('let topLevel');
    // 归属之后不再重复出现在泳道里。
    for (const lane of layout.lanes) {
      for (const card of lane.diagnosticCards) {
        expect(card.sourceText).not.toContain('let topLevel');
      }
    }
  });
});

describe('布局坐标的确定性', () => {
  it('同一模型两次布局结果结构相同，且坐标/尺寸互不重叠于画布外', () => {
    const result = fixture('ns-mutual-auth');
    const a = buildNarrativeLayout(result);
    const b = buildNarrativeLayout(result);
    expect(a).toEqual(b);
    for (const lane of a.lanes) {
      expect(lane.x).toBeGreaterThanOrEqual(0);
      expect(lane.x + lane.width).toBeLessThanOrEqual(a.width);
      for (const card of [...lane.cards, ...lane.diagnosticCards]) {
        expect(card.x).toBeGreaterThanOrEqual(lane.x);
        expect(card.x + card.width).toBeLessThanOrEqual(lane.x + lane.width);
        expect(card.y + card.height).toBeLessThanOrEqual(lane.y + lane.height);
        expect(card.lines.length).toBeGreaterThan(0);
      }
    }
  });
});
