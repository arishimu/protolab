import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeMessagePairings, getSampleSource, parsePv } from '@pv-lens/core';
import {
  buildStructuredNarrativeLayout,
  channelLineStyleOf,
  frameLabelBudgetOf,
  messageFrameWidthOf,
} from '../src/narrative/structured-layout';
import { legendContentFor } from '../src/narrative/Legend';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string) => parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));

/** 超八值身份样例：10 个参数绑定 > 值色 8 色轮转，同色再现必须靠序号区分。 */
const OVER_EIGHT_VALUES = [
  'free c: channel.',
  'const a: bitstring.',
  'let A(x1: bitstring, x2: bitstring, x3: bitstring, x4: bitstring, x5: bitstring,',
  '\t\tx6: bitstring, x7: bitstring, x8: bitstring, x9: bitstring, x10: bitstring) =',
  '\tout(c, (x1, x2, x3, x4, x5, x6, x7, x8, x9, x10)).',
  'let B() = in(c, r: bitstring).',
  'process ( A(a,a,a,a,a,a,a,a,a,a) | B() )',
].join('\n');

describe('ticket #09：多信道视觉语法（multi-channel 三信道样例）', () => {
  const result = fixture('multi-channel.pv');
  const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
  const rendered = renderToString(createElement(NarrativeView, {
    result,
    pairings: composeMessagePairings(result).pairings,
    initialCollapsedCryptoGroups: [],
  }));

  it('各信道以并列中性总线呈现：序号字形唯一、边框线型轮转、无身份色内联样式', () => {
    const channels = layout.columns.filter((column) => column.kind === 'channel');
    expect(channels).toHaveLength(3);
    expect(rendered).toContain('①');
    expect(rendered).toContain('②');
    expect(rendered).toContain('③');
    // 三条信道分别落 solid / long-dash / dot 三种线型（第 4 条起才回卷）。
    expect(rendered).toContain('structured-channel--solid');
    expect(rendered).toContain('structured-channel--long-dash');
    expect(rendered).toContain('structured-channel--dot');
    // 信道不使用身份色：总线方块无内联 fill/stroke（颜色只留给消息与值，ADR-0010）。
    const channelRects = rendered.match(/<rect class="structured-channel structured-channel--[\w-]+"[^>]*>/g) ?? [];
    expect(channelRects).toHaveLength(3);
    channelRects.forEach((rect) => {
      expect(rect).not.toMatch(/\bfill=/);
      expect(rect).not.toMatch(/\bstroke=/);
    });
  });

  it('信道、角色、消息、值的可访问名称齐全（aria 冒烟）', () => {
    ['信道 c1', '信道 c2', '信道 c3', 'processA', 'processB', 'processS'].forEach((name) => {
      expect(rendered).toContain(name);
    });
    // 值与事件的可访问名称带身份序号 / 事件原文（票面第 6 条：值/事件也在断言之列）。
    expect(rendered).toContain('aria-label="绑定 kA，值 1"');
    expect(rendered).toContain('aria-label="引用 kA，值 1"');
    expect(rendered).toContain('aria-label="event beginA(nA)"');
    expect(rendered).toContain('aria-label="event endB(nB)"');
    expect(rendered).toContain('aria-label="图例"');
  });

  it('两方样例（握手）消息柱 aria 按 M 序号可寻（三方样例无自动配对，消息断言落在此处）', () => {
    const result = fixture('handshake-fixed.pv');
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const rendered = renderToString(createElement(NarrativeView, { result, pairings }));
    expect(layout.pillars.length).toBeGreaterThan(0);
    layout.pillars.forEach((pillar) => {
      expect(rendered).toContain(`消息 M${String(pillar.sequence)} · 信道`);
    });
  });

  it('单信道样例退化自然：一条信道、① 字形、solid 线型', () => {
    const hello = parsePv(getSampleSource('hello') ?? '');
    const helloRendered = renderToString(createElement(NarrativeView, {
      result: hello,
      pairings: composeMessagePairings(hello).pairings,
    }));
    expect(helloRendered).toContain('①');
    expect(helloRendered).toContain('structured-channel--solid');
    expect(helloRendered).not.toContain('structured-channel--long-dash');
    expect(helloRendered).not.toContain('②');
  });
});

describe('ticket #09：图例显示实际使用的消息/值序号（实化对照）', () => {
  it('消息条目枚举本图实际 M 序号与词项、值条目枚举值序号与绑定名', () => {
    // 两方样例（handshake-fixed）有自动配对消息柱；三方 multi-channel 默认不自动配对（ADR-0005）。
    const result = fixture('handshake-fixed.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const content = legendContentFor(layout, result);
    expect(layout.pillars.length).toBeGreaterThan(0);
    expect(content.messages.length).toBe(layout.pillars.length);
    content.messages.forEach((token) => {
      expect(token.termText.length).toBeGreaterThan(0);
      expect(token.color).toMatch(/^#/);
    });
    // 值 token：序号连续 1..n 且与画布方块同源（去重按绑定）。
    expect(content.values.map((token) => token.ordinal)).toEqual(
      content.values.map((_, index) => index + 1),
    );
    const rendered = renderToString(createElement(NarrativeView, {
      result,
      pairings: composeMessagePairings(result).pairings,
      initialCollapsedCryptoGroups: [],
    }));
    expect(rendered).toContain('本图消息序号');
    expect(rendered).toContain('本图值序号');
    // SSR 会在文本插值间插入 <!-- --> 注释节点，剥除后断言 token 全文。
    const plain = rendered.replace(/<!-- -->/g, '');
    content.messages.forEach((token) => {
      expect(plain).toContain(`M${String(token.sequence)} ${token.termText}`);
    });
  });

  it('三方样例（无自动配对）图例仍列值 token，消息条目按实际柱数缺省', () => {
    const result = fixture('multi-channel.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const content = legendContentFor(layout, result);
    expect(content.messages).toHaveLength(0);
    expect(content.values.length).toBeGreaterThan(8);
    const rendered = renderToString(createElement(NarrativeView, { result }));
    expect(rendered).toContain('本图值序号');
    expect(rendered).not.toContain('本图消息序号');
  });
});

describe('ticket #09：值身份超八色仍保持唯一（序号双通道）', () => {
  it('超八个绑定：一绑定一色，序号 1..11 唯一可区分', () => {
    const result = parsePv(OVER_EIGHT_VALUES);
    const layout = buildStructuredNarrativeLayout(result);
    const distinct = new Map<string, number>();
    layout.valueBlocks.forEach((block) => distinct.set(block.bindingId, block.ordinal));
    // 10 个参数绑定 + B 的接收绑定 r = 11 个值身份。
    expect(distinct.size).toBe(11);
    const ordinals = [...distinct.values()].sort((a, b) => a - b);
    expect(ordinals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 一绑定一色：颜色数等于身份数，不存在同色不同身份。
    const colorByBinding = new Map<string, string>();
    layout.valueBlocks.forEach((block) => colorByBinding.set(block.bindingId, block.color));
    expect(new Set(colorByBinding.values()).size).toBe(distinct.size);
    // 渲染出的序号角标数量与绑定身份一致。
    const rendered = renderToString(createElement(NarrativeView, { result }));
    expect((rendered.match(/structured-value-ordinal/g) ?? []).length).toBe(layout.valueBlocks.length);
  });
});

describe('ticket #09：R09 信道序号与水平位置一致', () => {
  it('序号字形与线型按水平序列位置生成：最左信道是 ①/solid，与声明顺序无关', () => {
    const result = fixture('multi-channel.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    // 按画布 x 坐标从左到右排信道列；channelOrder 必须随之 0、1、2 递增。
    const channelsByX = layout.columns
      .filter((column) => column.kind === 'channel')
      .sort((a, b) => a.x - b.x);
    expect(channelsByX).toHaveLength(3);
    expect(channelsByX.map((column) => column.channelOrder)).toEqual([0, 1, 2]);
    // u39 证据：水平顺序为 processS · c2 · processB · c1 · processA · c3，
    // 即最左信道是 c2（声明序号 2）——位置序号必须与声明序号不同。
    expect(channelsByX.map((column) => column.name)).toEqual(['c2', 'c1', 'c3']);
    expect(channelsByX.map((column) => column.index)).not.toEqual([0, 1, 2]);
    const rendered = renderToString(createElement(NarrativeView, {
      result,
      pairings: composeMessagePairings(result).pairings,
    }));
    const plain = rendered.replace(/<!-- -->/g, '');
    expect(plain).toContain('信道 c2 ①');
    expect(plain).toContain('信道 c1 ②');
    expect(plain).toContain('信道 c3 ③');
    // 线型与序号同源：位置 0 是 solid、1 是 long-dash、2 是 dot。
    expect(channelsByX.map((column) => channelLineStyleOf(column.channelOrder ?? 0)))
      .toEqual(['solid', 'long-dash', 'dot']);
    const c2Rect = rendered.match(/<g class="structured-column structured-column--channel"[^>]*data-identity="c2"[\s\S]*?<rect class="structured-channel structured-channel--(\w[\w-]*)"/);
    expect(c2Rect?.[1]).toBe('solid');
    const c1Rect = rendered.match(/<g class="structured-column structured-column--channel"[^>]*data-identity="c1"[\s\S]*?<rect class="structured-channel structured-channel--(\w[\w-]*)"/);
    expect(c1Rect?.[1]).toBe('long-dash');
  });

  it('channelLineStyleOf 按位置循环；图例文案与 (n) 形式说明同步', () => {
    expect(channelLineStyleOf(0)).toBe('solid');
    expect(channelLineStyleOf(1)).toBe('long-dash');
    expect(channelLineStyleOf(2)).toBe('dot');
    expect(channelLineStyleOf(3)).toBe('solid');
    // 负位置按镜像取整（与 messageLineStyleOf 同一口径），实际 channelOrder 恒为非负。
    expect(channelLineStyleOf(-1)).toBe(channelLineStyleOf(1));
    const result = fixture('multi-channel.pv');
    const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
    const rendered = renderToString(createElement(NarrativeView, { result, pairings: [] }));
    const plain = rendered.replace(/<!-- -->/g, '');
    expect(plain).toContain('超过五个信道时以 (n) 形式显示');
    expect(plain).toContain('灰度下仍可区分');
  });

  it('六信道合成模型：第六条信道以 (6) 形式显示且不与 ①–⑤ 冲突', () => {
    const source = [
      'free c1: channel.',
      'free c2: channel.',
      'free c3: channel.',
      'free c4: channel.',
      'free c5: channel.',
      'free c6: channel.',
      'let A() = out(c1, a).',
      'let B() = out(c2, b).',
      'let C() = out(c3, c).',
      'let D() = out(c4, d).',
      'let E() = out(c5, e).',
      'let F() = out(c6, f).',
      'process ( A() | B() | C() | D() | E() | F() )',
    ].join('\n');
    const result = parsePv(source);
    const layout = buildStructuredNarrativeLayout(result);
    const channelsByX = layout.columns
      .filter((column) => column.kind === 'channel')
      .sort((a, b) => a.x - b.x);
    expect(channelsByX).toHaveLength(6);
    expect(channelsByX.map((column) => column.channelOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    const rendered = renderToString(createElement(NarrativeView, { result, pairings: [] }));
    const plain = rendered.replace(/<!-- -->/g, '');
    expect(plain).toContain('(6)');
    expect(plain).not.toContain('⑥');
  });
});

describe('ticket #09：R17 信道线型灰度可辨', () => {
  it('信道边框线宽 2px，三线型墨迹密度拉开（dasharray 断言）', () => {
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.structured-channel\s*\{[^}]*stroke-width:\s*2/s);
    expect(v2).toMatch(/\.structured-channel--long-dash\s*\{[^}]*stroke-dasharray:\s*7 5/s);
    expect(v2).toMatch(/\.structured-channel--dot\s*\{[^}]*stroke-dasharray:\s*1\.5 4\.5/s);
  });
});

describe('ticket #09：信道帧动态加宽（ticket 11 移交项）', () => {
  it('帧宽公式：短词项取下限 56，长词项按字宽伸缩，上限 132', () => {
    expect(messageFrameWidthOf('a')).toBe(56);
    expect(messageFrameWidthOf('senc(nA, kB)')).toBe(Math.min(132, Math.max(56, 14 + 'senc(nA, kB)'.length * 5.6)));
    expect(messageFrameWidthOf('x'.repeat(40))).toBe(132);
  });

  it('基准样例帧内词项不再截断：预算容纳全部词项、渲染无省略号', () => {
    for (const name of ['handshake-fixed.pv', 'ns-mutual-auth.pv', 'multi-channel.pv']) {
      const result = fixture(name);
      const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
      const rendered = renderToString(createElement(NarrativeView, {
        result,
        pairings: composeMessagePairings(result).pairings,
      }));
      const frames = rendered.match(/<g class="structured-message-frame">[\s\S]*?<\/g>/g) ?? [];
      expect(frames.length).toBe(layout.pillars.length);
      layout.pillars.forEach((pillar) => {
        expect(pillar.frameWidth).toBeGreaterThanOrEqual(56);
        // 帧内文本预算足以容纳整个词项（基准样例最长词项 132 内放得下）。
        expect(frameLabelBudgetOf(pillar.frameWidth)).toBeGreaterThanOrEqual(pillar.termText.length);
      });
      frames.forEach((frame) => {
        expect(frame).not.toContain('…');
      });
    }
  });

  it('帧外扩不越列：半宽加余量不超过信道中轴到任一其它列中轴的距离', () => {
    for (const name of ['handshake-fixed.pv', 'multi-channel.pv']) {
      const result = fixture(name);
      const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
      const centers = layout.columns.map((column) => column.x + column.width / 2);
      layout.pillars.forEach((pillar) => {
        const nearest = Math.min(
          ...centers
            .filter((center) => Math.abs(center - pillar.channelX) > 1)
            .map((center) => Math.abs(center - pillar.channelX)),
        );
        expect(pillar.frameWidth / 2 + 8).toBeLessThanOrEqual(nearest);
      });
    }
  });
});
