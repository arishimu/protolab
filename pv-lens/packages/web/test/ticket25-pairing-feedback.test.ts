import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parsePv } from '@pv-lens/core';
import { NarrativeView } from '../src/narrative/NarrativeView';

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureParse(name: string) {
  return parsePv(readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

describe('ticket #25：人工配对反馈', () => {
  it('成功声明提示条提供撤销入口', () => {
    const html = renderToString(createElement(NarrativeView, {
      result: fixtureParse('multi-channel'),
      selectionNotice: '已声明配对：信道 c2 · processB 发送 → processS 接收',
      onUndoSelection: () => {},
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('已声明配对：信道 c2');
    expect(html).toContain('撤销上一条');
  });

  it('没有撤销回调时不渲染撤销按钮', () => {
    const html = renderToString(createElement(NarrativeView, {
      result: fixtureParse('multi-channel'),
      selectionNotice: '已声明配对：信道 c2 · processB 发送 → processS 接收',
    })).replace(/<!-- -->/g, '');
    expect(html).not.toContain('撤销上一条');
  });

  it('R06 线上词项芯片提供可点选命中区与端点同源交互', () => {
    const html = renderToString(createElement(NarrativeView, {
      result: fixtureParse('multi-channel'),
      onEndpointSelect: () => {},
      initialCollapsedCryptoGroups: [],
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('structured-chip--selectable');
    expect(html).toContain('structured-chip-hit');
    expect(html).toContain('可选为人工配对端，按 Enter 选择');
    expect(html).toContain('structured-endpoint-hit');
  });

  it('R06 没有同信道候选时禁用人工配对入口并说明原因', () => {
    const result = parsePv([
      'free c: channel.',
      'free a, b: bitstring.',
      'let A() = out(c, a).',
      'let B() = out(c, b).',
      'process A() | B().',
    ].join('\n'));
    const html = renderToString(createElement(NarrativeView, {
      result,
      onEndpointSelect: () => {},
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('当前没有同信道的未配对发送端与接收端');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>人工配对<\/button>/);
  });
});
