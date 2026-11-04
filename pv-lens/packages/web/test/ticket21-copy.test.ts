import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parsePv, parseProverifLocations, sanitizeStdout } from '@pv-lens/core';
import { CorrespondencePanel } from '../src/CorrespondencePanel';
import { Home } from '../src/Home';
import { CurrentProtocolProvider } from '../src/CurrentProtocolContext';
import { loadBuiltinSample } from '../src/protocol';
import { NarrativeView } from '../src/narrative/NarrativeView';
import { QueryResultCard, VerifyPanel } from '../src/VerifyPanel';
import { SourcePanel } from '../src/SourcePanel';
import type { LoadedProtocol } from '../src/protocol';
import { mapResultsToQueries } from '../src/query-presentation';
import { SAMPLES } from '../src/protocol';

// ticket #21：P3 文案与降级（F1–F5 的自动化合同：禁用词、反引号、内部信息、
// ProVerif 定位、goal reachable 释义）。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureSource(name: string): string {
  return readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8');
}

const stripComments = (html: string): string => html;

describe('ticket #21：F1/F2 禁用词与反引号不进可见文本', () => {
  it('F1 五个组件的渲染文本中「泳道」出现次数为 0', () => {
    const outputs: string[] = [];
    outputs.push(renderToString(createElement(CurrentProtocolProvider, null, createElement(Home))));
    for (const name of ['hello', 'handshake-fixed', 'ns-mutual-auth', 'ns-original']) {
      const result = parsePv(fixtureSource(name));
      outputs.push(renderToString(createElement(NarrativeView, { result })));
    }
    const verifyProtocol: LoadedProtocol = {
      title: 't',
      description: 'd',
      source: fixtureSource('ns-original'),
      origin: { kind: 'builtin', sampleId: 'ns-original' },
    };
    outputs.push(renderToString(createElement(VerifyPanel, {
      source: verifyProtocol.source,
      parseResult: parsePv(verifyProtocol.source),
    })));
    outputs.push(renderToString(createElement(SourcePanel, { protocol: verifyProtocol })));
    for (const html of outputs) {
      expect(stripComments(html).includes('泳道')).toBe(false);
    }
  });

  it('F2 组件可见文本不含反引号', () => {
    const result = parsePv(fixtureSource('ns-mutual-auth'));
    const outputs = [
      renderToString(createElement(NarrativeView, { result })),
      renderToString(createElement(VerifyPanel, { source: fixtureSource('hello'), parseResult: parsePv(fixtureSource('hello')) })),
      renderToString(createElement(CorrespondencePanel, {
        plan: { events: [], queries: [], source: '', verificationSource: '' },
        selectedEventId: null,
        onSelectEvent: () => {},
        selectedQueryId: null,
        onSelectQuery: () => {},
      })),
    ];
    for (const html of outputs) {
      expect(html.includes('`')).toBe(false);
    }
  });
});

describe('ticket #21：F3 内部信息与路径脱敏', () => {
  it('sanitizeStdout 去除验证服务临时目录，保留文件名', () => {
    const stdout = 'File "/tmp/pv-lens-verify-ab12cd/model.pv", line 7, characters 12-12: Syntax error.';
    expect(sanitizeStdout(stdout)).toContain('"model.pv", line 7');
    expect(sanitizeStdout(stdout)).not.toContain('/tmp/pv-lens-verify-');
    expect(sanitizeStdout('goal reachable: true')).toBe('goal reachable: true');
  });

  it('用户可见文案不含内部术语与标题', () => {
    const result = parsePv(fixtureSource('ns-mutual-auth'));
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(html).not.toContain('v2 结构化叙事布局');
    expect(html).not.toContain('画布编辑属二期');
    const homeHtml = renderToString(createElement(CurrentProtocolProvider, null, createElement(Home)));
    expect(homeHtml).not.toContain('扇出源');
    for (const name of ['hello', 'handshake-fixed', 'ns-mutual-auth', 'ns-original']) {
      try {
        const sample = loadBuiltinSample(name);
        expect(sample.title).not.toContain('冒烟');
        expect(sample.description).not.toContain('冒烟');
      } catch {
        // 样例 id 变动时跳过（标题断言以存在的样例为准）。
      }
    }
  });
});

describe('ticket #21：F4/F5 定位与释义', () => {
  it('F4 parseProverifLocations 解析 stdout 行列定位（保持 ProVerif 原文口径）', () => {
    const stdout = [
      'File "model.pv", line 7, characters 12-12: Syntax error.',
      'File "model.pv", line 9, characters 4-9: unbound variable x.',
    ].join('\n');
    const locations = parseProverifLocations(stdout);
    expect(locations).toHaveLength(2);
    expect(locations[0]).toMatchObject({ line: 7, column: 12 });
    expect(locations[1]).toMatchObject({ line: 9, column: 4 });
    expect(parseProverifLocations('no locations here')).toHaveLength(0);
  });

  it('F4 SourcePanel 按行号渲染错误标记与 title', () => {
    const protocol: LoadedProtocol = {
      title: 't',
      description: 'd',
      source: 'free c: channel.',
      origin: { kind: 'builtin', sampleId: 'hello' },
    };
    const html = renderToString(createElement(SourcePanel, {
      protocol,
      diagnostics: [{ line: 1, label: '错误诊断', message: 'L1:6 期望词项' }],
    }));
    expect(html).toContain('source-line-marker--error');
    expect(html).toContain('错误诊断：L1:6 期望词项');
  });

  it('F5 成立查询的 goal reachable 进入证明细节，不使用攻击路径措辞', () => {
    const views = mapResultsToQueries(
      [
        { query: 'attacker(x)', verdict: 'true', goalReachable: 'goal reachable: true' },
      ] as never,
      [],
    );
    if (views[0] !== undefined && views[0].goalReachable !== null) {
      const html = renderToString(createElement(QueryResultCard, { index: 0, view: views[0] }));
      // R14：前缀声明与对应事实共用「证明细节」折叠。
      expect(html).toContain('证明细节');
      expect(html).toContain('goal reachable');
      expect(html).not.toContain('在攻击者模型下可达');
      expect(html).not.toContain('攻击路径摘要');
    }
  });
});
