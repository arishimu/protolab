import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { coreSamples, composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));
function coreFixture(path: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', path), 'utf8'));
}

describe('ticket #02：值层布局语义', () => {
  const result = parsePv([
    'type bitstring.',
    'type key.',
    'free c: channel.',
    'fun enc(bitstring, key): bitstring.',
    'reduc forall x: bitstring, k: key; dec(enc(x,k),k) = x.',
    'let role(k: key) =',
    '  new nonce: bitstring;',
    '  out(c, enc(nonce, k));',
    '  in(c, cipher: bitstring);',
    '  let plain = dec(cipher, k) in',
    '  let rebound = enc(plain, k) in',
    '  in(c, (=plain, peer: bitstring));',
    '  out(c, rebound).',
    'process role(secret).',
  ].join('\n'));
  const layout = buildStructuredNarrativeLayout(result);
  const role = result.roles[0];

  it('接收消息端连接到本地绑定，同一 bindingId 的引用与等值复制复用颜色', () => {
    const cipher = role.bindings.find((binding) => binding.name === 'cipher');
    const plain = role.bindings.find((binding) => binding.name === 'plain');
    expect(cipher).toBeDefined();
    expect(plain).toBeDefined();

    const receive = layout.endpoints.find((endpoint) => endpoint.id === 'role:message:1');
    const receivedBlock = layout.valueBlocks.find(
      (block) => block.bindingId === cipher!.id && block.occurrence === 'binding',
    );
    expect(receivedBlock?.y).toBe(receive?.y);

    const plainCopies = layout.valueBlocks.filter((block) => block.bindingId === plain!.id);
    expect(plainCopies.map((block) => block.occurrence)).toContain('equality');
    expect(new Set(plainCopies.map((block) => block.color))).toEqual(new Set([plainCopies[0].color]));
  });

  it('析构声明决定竖向方法盒，纯构造决定横向方法盒', () => {
    expect(layout.methods.map(({ label, direction }) => [label, direction])).toEqual(
      expect.arrayContaining([
        ['dec', 'destruct'],
        ['enc', 'construct'],
      ]),
    );
  });

  it('未绑定内联构造是 wire 词项，已绑定值引用不是 wire 词项', () => {
    expect(layout.endpoints.find((endpoint) => endpoint.id === 'role:message:0')?.termPresentation).toBe('wire');
    expect(layout.endpoints.find((endpoint) => endpoint.id === 'role:message:3')?.termPresentation).toBe('binding-reference');
  });

  it('值颜色按绑定身份而非名字分配，跨角色同名绑定不合并', () => {
    const sameNames = parsePv([
      'free c: channel.',
      'let left(x: bitstring) = out(c, x).',
      'let right(x: bitstring) = out(c, x).',
      'process left(a) | right(b).',
    ].join('\n'));
    const sameLayout = buildStructuredNarrativeLayout(sameNames);
    const parameters = sameLayout.valueBlocks.filter(
      (block) => block.label === 'x' && block.occurrence === 'binding',
    );
    expect(parameters).toHaveLength(2);
    expect(parameters[0].bindingId).not.toBe(parameters[1].bindingId);
    expect(parameters[0].color).not.toBe(parameters[1].color);
  });
});

describe('ticket #02 视觉合同（P0/P1 回归）', () => {
  const decode = (text: string): string => text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

  /** 按 App.tsx 的默认（自动配对）渲染成 SVG。 */
  function renderSvg(result: ParseResult): string {
    const html = renderToString(createElement(NarrativeView, { result, pairings: composeMessagePairings(result).pairings }));
    return /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? '';
  }

  it('任何文字都不越过画布右缘（原来事件标签会被裁掉）', () => {
    for (const sample of coreSamples) {
      const result = coreFixture(sample.pvFile);
      const svg = renderSvg(result);
      const width = Number(/\bwidth="([\d.]+)"/.exec(svg)?.[1] ?? 0);
      expect(width, sample.id).toBeGreaterThan(0);
      for (const match of svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
        const x = Number(/x="([-\d.]+)"/.exec(match[1])?.[1] ?? NaN);
        const text = decode(match[2]);
        if (!text.trim() || Number.isNaN(x)) continue;
        const right = x + text.length * 6.2;
        expect(right, `${sample.id} 的「${text}」越出画布`).toBeLessThanOrEqual(width + 1);
      }
    }
  });

  it('长标签在画布内截断并保留全文 title', () => {
    const svg = renderSvg(coreFixture('pv/handshake-fixed.pv'));
    // 事件标签含全文 title（ticket 08 起后缀事件角色与联动操作说明），且可见文字被截断过。
    expect(svg).toContain('<title>event acceptsServer(k,pkX)');
    expect(svg).toContain('event acceptsServer(k,pkX)');
  });

  it('同一角色的值方块互不重叠（竖向紧密链；检查盒的两个操作数同 y 但 x 错开）', () => {
    for (const sample of coreSamples) {
      const layout = buildStructuredNarrativeLayout(coreFixture(sample.pvFile));
      const byRole = new Map<number, (typeof layout.valueBlocks)[number][]>();
      for (const block of layout.valueBlocks) {
        byRole.set(block.roleIndex, [...(byRole.get(block.roleIndex) ?? []), block]);
      }
      for (const [roleIndex, blocks] of byRole) {
        for (let i = 0; i < blocks.length; i++) {
          for (let j = i + 1; j < blocks.length; j++) {
            const a = blocks[i];
            const b = blocks[j];
            const overlaps = Math.abs(a.y - b.y) < a.height && Math.abs(a.x - b.x) < a.width;
            expect(overlaps, `${sample.id} 角色 ${String(roleIndex)} 的值方块重叠：${a.label}/${b.label}`).toBe(false);
          }
        }
      }
    }
  });

  it('一条配对消息只在信道帧里写一次词项，未配对端才各自带芯片', () => {
    const result = coreFixture('pv/handshake-fixed.pv');
    const layout = buildStructuredNarrativeLayout(result, {
      pairings: composeMessagePairings(result).pairings,
    });
    const svg = renderSvg(result);
    const frames = (svg.match(/structured-message-frame/g) ?? []).length;
    // 芯片 class 自带修饰类，按修饰类计数 = 一枚芯片一次。
    const chips = (svg.match(/structured-term-chip--/g) ?? []).length;
    const unpaired = layout.endpoints.filter((endpoint) => endpoint.unpaired).length;
    expect(layout.pillars.length).toBeGreaterThan(0);
    expect(frames).toBe(layout.pillars.length);
    expect(chips).toBe(layout.pillars.length + unpaired);
  });

  it('方法盒 caption 只补值方块写不出的实参，构造盒落在生命线到信道的路径上', () => {
    const layout = buildStructuredNarrativeLayout(coreFixture('pv/handshake-fixed.pv'));
    const checksign = layout.methods.find((method) => method.label === 'checksign');
    // ticket 11（F6）：checksign(y, pkB) 的实参全部是已绑定变量，操作数已是相邻同色值方块，
    // caption 省略；只有含自由名/字面量实参（方块写不出）的方法盒才写 caption。
    expect(checksign?.caption).toBeUndefined();
    expect(checksign?.direction).toBe('destruct');
    const wire = layout.methods.find((method) => method.id.endsWith(':wire-method'));
    expect(wire?.direction).toBe('construct');
    // 线上构造盒不写 caption：紧邻的信道帧已经写全了同一个词项，两者会打架。
    expect(wire?.caption).toBeUndefined();
    // 构造盒的窄底朝消息（原型口径），长底贴生命线侧：serverB 在信道右侧，所以窄端朝左。
    const roleIndex = layout.columns.filter((column) => column.kind === 'role').findIndex((column) => column.name === 'serverB');
    const serverWire = layout.methods.find((method) => method.roleIndex === roleIndex && method.id.endsWith(':wire-method'));
    const lifelineX = layout.columns.find((column) => column.kind === 'role' && column.name === 'serverB')!.x + 77;
    expect(serverWire?.narrowTowards).toBe('left');
    // 夹在生命线与信道之间，不压值方块。
    expect(Math.abs((serverWire?.x ?? 0) - lifelineX)).toBeGreaterThan(50);
  });

  it('箭头只指向抵达目标：配对消息的发送段没有箭头，接收段有', () => {
    const result = coreFixture('pv/handshake-fixed.pv');
    const svg = renderSvg(result);
    const groupOf = (id: string) => {
      const start = svg.indexOf(`data-identity="${id}"`);
      expect(start, id).toBeGreaterThan(-1);
      return svg.slice(start, svg.indexOf('</g>', start));
    };
    expect(groupOf('clientA:message:0')).not.toContain('marker-end');
    expect(groupOf('serverB:message:0')).toContain('marker-end');
    // 发送端在生命线侧留一个同色起点圆点。
    expect(groupOf('clientA:message:0')).toContain('structured-sender-dot');
  });

  it('线上不为元组画构造盒（元组不是算子）', () => {
    const layout = buildStructuredNarrativeLayout(coreFixture('pv/ns-original.pv'));
    const wireLabels = layout.methods
      .filter((method) => method.id.endsWith(':wire-method'))
      .map((method) => method.label);
    expect(wireLabels).not.toContain('tuple');
    expect(wireLabels).toContain('aenc');
  });
});
