import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeMessagePairings, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';

// ticket 26：视觉整改的回归约束——
// 1. 信道帧完整落在按内容加宽后的信道墙内；
// 2. client/server 数据元素字号提升，对应性面板说明解除 70ch 限宽。

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

describe('ticket #26：视觉整改', () => {
  it('消息帧完整落在信道矩形内，长词项信道按需加宽、无帧信道保持 72px', () => {
    for (const name of ['handshake-fixed', 'ns-original']) {
      const result = fixture(name);
      const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
      expect(layout.pillars.length, `${name} 应有消息帧`).toBeGreaterThan(0);
      for (const pillar of layout.pillars) {
        const channel = layout.columns.find(
          (candidate) => candidate.kind === 'channel' && candidate.name === pillar.channelName,
        );
        expect(channel, `${name} ${pillar.id} 的信道列应存在`).toBeDefined();
        // 信道矩形左右各内缩 6px，帧两侧各留 2px；窗口宽度 = 列宽 - 16。
        expect(pillar.frameWidth).toBeLessThanOrEqual(channel!.width - 16 + 0.01);
        const left = pillar.channelX - pillar.frameWidth / 2;
        const right = pillar.channelX + pillar.frameWidth / 2;
        expect(left).toBeGreaterThanOrEqual(channel!.x + 6 - 0.01);
        expect(right).toBeLessThanOrEqual(channel!.x + channel!.width - 6 + 0.01);
      }
    }

    const handshake = fixture('handshake-fixed');
    const handshakeLayout = buildStructuredNarrativeLayout(handshake, {
      pairings: composeMessagePairings(handshake).pairings,
    });
    const handshakeChannel = handshakeLayout.columns.find((column) => column.kind === 'channel');
    expect(handshakeChannel?.width).toBeGreaterThan(72);

    const hello = buildStructuredNarrativeLayout(fixture('hello'));
    expect(hello.columns.find((column) => column.kind === 'channel')?.width).toBe(72);

    const multi = fixture('multi-channel');
    const multiLayout = buildStructuredNarrativeLayout(multi, { pairings: composeMessagePairings(multi).pairings });
    // c3 只有一个未配对 out，不产生帧，列宽保持基础值。
    expect(multiLayout.columns.find((column) => column.kind === 'channel' && column.name === 'c3')?.width).toBe(72);
  });

  it('数据元素字号提升：值方块 11px、序号 8px、列签名 10.5px，方法盒保持 9px', () => {
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.structured-value-block text\s*\{[^}]*font-size:\s*11px/s);
    expect(v2).toMatch(/\.structured-value-block \.structured-value-ordinal\s*\{[^}]*font-size:\s*8px/s);
    expect(v2).toMatch(/\.structured-column-signature\s*\{[^}]*font-size:\s*10\.5px/s);
    expect(v2).toMatch(/\.structured-method text\s*\{[^}]*font-size:\s*9px/s);
  });

  it('对应性面板说明占满面板宽度，全局 .hint 的 70ch 限宽保留', () => {
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.correspondence \.hint\s*\{[^}]*max-width:\s*none/s);
    expect(styles).toMatch(/\.hint\s*\{[^}]*max-width:\s*70ch/s);
  });
});
