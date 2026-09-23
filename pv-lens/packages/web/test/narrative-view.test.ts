import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { pairSteps, parsePv } from '@pv-lens/core';
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
  return renderToString(createElement(NarrativeView, { result, pairings: pairSteps(result) }));
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

  it('图例解释记法；中文 UI', () => {
    const html = render(fixture('hello'));
    expect(html).toContain('图例');
    expect(html).toContain('{m}k');
    expect(html).toContain('复制');
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
