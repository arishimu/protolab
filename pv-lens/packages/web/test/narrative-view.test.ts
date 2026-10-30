import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { composeMessagePairings, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { NarrativeView } from '../src/narrative/NarrativeView';

// 渲染层只做冒烟：四样例能 renderToString 不抛错，且输出含关键泳道名与符号化词项。
// SVG 像素断言不做（spec 的 Testing Decisions）。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));
function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}
function render(result: ParseResult): string {
  return renderToString(createElement(NarrativeView, { result }));
}

/** 装配 App 实际传入的意图配对（ADR-0003），验证渲染端能画出连线。 */
function renderWithPairings(result: ParseResult): string {
  return renderToString(createElement(NarrativeView, { result, pairings: composeMessagePairings(result).pairings }));
}

describe('NarrativeView 冒烟（react-dom/server，ticket 04）', () => {
  it('四个基准样例都渲染不抛错，并含各自的泳道名', () => {
    const expectations: Record<string, string[]> = {
      // hello 没有命名角色：mainProcess 渲染为 main 泳道。
      hello: ['规范叙事视图', '>main<'],
      'handshake-fixed': ['clientA', 'serverB'],
      'ns-mutual-auth': ['processInitiator', 'processResponder', 'processS', 'processK'],
      'ns-original': ['processA', 'processB'],
    };
    for (const [id, needles] of Object.entries(expectations)) {
      const html = render(fixture(id));
      for (const needle of needles) {
        expect(html, `${id} 应含 ${needle}`).toContain(needle);
      }
    }
  });

  it('词项以密码学惯用记法出现在图上（handshake-fixed 的签名+加密）', () => {
    const html = render(fixture('handshake-fixed'));
    expect(html).toContain('{[pkX,pkB,k]skB}pkX');
    expect(html).toContain('{|s|}k');
  });

  it('未配对步骤有明确视觉标注，且默认（不传配对）不画跨泳道连线', () => {
    const html = render(fixture('handshake-fixed'));
    expect(html).toContain('未配对');
    expect(html).toContain('narrative-card--unpaired');
    expect(html).not.toContain('narrative-edge"'); // 无连线 path
  });

  it('两方协议经意图配对后画出跨泳道连线、端点去掉未配对标注', () => {
    const html = renderWithPairings(fixture('handshake-fixed'));
    expect(html).toContain('narrative-edge');
    expect(html).toContain('2 条泳道，3 条跨泳道连线');
  });

  it('多方协议（ns-mutual-auth）不自动连线，保持全部未配对', () => {
    const html = renderWithPairings(fixture('ns-mutual-auth'));
    expect(html).not.toContain('narrative-edge"');
    expect(html).toContain('0 条跨泳道连线');
  });

  it('图例解释记法且按画布内容过滤（ticket 11）；中文 UI', () => {
    const html = render(fixture('hello'));
    expect(html).toContain('图例');
    // hello 只有未配对消息：图例只剩未配对/线上词项/方向三条，加密记法与复制标记不出现。
    expect(html).toContain('未配对');
    expect(html).toContain('线上词项');
    expect(html).not.toContain('{m}k');
    expect(html).not.toContain('复制作用域');
  });

  it('ticket #01：角色参数簇和多信道生命线可从 v2 视图读取', () => {
    const handshake = render(fixture('handshake-fixed'));
    expect(handshake).toContain('(pkA: pkey, skA: skey, pkB: spkey)');
    expect(handshake).toContain('structured-column-signature');

    const multiChannel = render(fixture('multi-channel'));
    expect(multiChannel).toContain('信道 c1');
    expect(multiChannel).toContain('信道 c2');
    expect(multiChannel).toContain('信道 c3');
    expect(multiChannel).toContain('structured-channel');
  });
  it('ticket #02：值方块、方法方向和 wire 词项进入可查询的 SVG 语义', () => {
    const result = parsePv([
      'type bitstring.',
      'type key.',
      'free c: channel.',
      'fun enc(bitstring, key): bitstring.',
      'reduc forall x: bitstring, k: key; dec(enc(x,k),k) = x.',
      'let p(k: key) = new n: bitstring; out(c, enc(n,k)); in(c, m: bitstring); let x = dec(m,k) in out(c, x).',
      'process p(secret).',
    ].join('\n'));
    const html = render(result);
    expect(html).toContain('structured-value-block');
    expect(html).toContain('data-binding-id="p:new:');
    expect(html).toContain('structured-method--construct');
    expect(html).toContain('structured-method--destruct');
    // ticket 11（F2）：未配对线上词项改为泳道内芯片（structured-chip--wire），不再画在信道分位点上。
    expect(html).toContain('structured-chip--wire');
  });

  it('完全没有角色结构时给中文提示而非白屏', () => {
    const html = render(parsePv('free c: channel.\n'));
    expect(html).toContain('没有可识别的角色结构');
    expect(html).not.toContain('narrative-canvas');
  });

  it('降级诊断以原文标注卡片进泳道（含中文级别、行号与原文）', () => {
    const source = [
      'free c: channel.',
      'let pA(pk: pkey) =',
      '  choice [true] out(c, Na).',
      'process',
      '  !pA(pkA).',
    ].join('\n');
    const html = render(parsePv(source));
    expect(html).toContain('降级诊断');
    expect(html).toContain('choice [true]');
  });
});
