import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePv, parseVerifyStdout } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { mapResultsToQueries } from '../src/query-presentation';
import { QueryResultCard, VerifyFailureNotice, VerifyPanel } from '../src/VerifyPanel';
import type { VerifyFailure } from '../src/verify';

// 只做 node 环境的 renderToString 冒烟：初始态渲染、解析侧提示条、失败指引的分派。
// 不发网络、不 spawn（点击行为属于浏览器交互，本仓测试环境没有 DOM 测试库）。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureSource(name: string): string {
  return readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8');
}

function fixtureStdout(name: string): string {
  return readFileSync(join(packagesDir, 'core', 'fixtures', 'proverif', `${name}.stdout.txt`), 'utf8');
}

function renderPanel(source: string, parseResult?: ParseResult): string {
  return renderToString(
    createElement(VerifyPanel, { source, parseResult: parseResult ?? parsePv(source) }),
  );
}

describe('VerifyPanel 冒烟（ticket 08）', () => {
  it('初始态：渲染「运行验证」按钮、超时输入与用法说明，不渲染结果/进度', () => {
    const html = renderPanel(fixtureSource('hello'));

    expect(html).toContain('运行验证');
    expect(html).toContain('验证结果');
    expect(html).toContain('超时（毫秒）');
    expect(html).toContain('value="30000"');
    expect(html).not.toContain('正在运行 ProVerif');
    expect(html).not.toContain('按查询的结论');
    expect(html).not.toContain('验证未能完成');
  });

  it('判定措辞纪律写在面板说明里（归一化语义）', () => {
    const html = renderPanel(fixtureSource('hello'));
    expect(html).toContain('is true');
    expect(html).toContain('is false');
    expect(html).toContain('cannot be proved');
    expect(html).toContain('未证出');
  });

  it('解析无误时不显示降级/错误提示条', () => {
    const html = renderPanel(fixtureSource('ns-mutual-auth'));
    expect(html).not.toContain('解析器不支持的语法');
    expect(html).not.toContain('错误诊断');
  });

  it('解析降级 → 信息条（说明验证仍按原文运行）', () => {
    const source = [
      'free c: channel.',
      'let pA(pk: pkey) =',
      '  choice [true] out(c, Na).',
      'process',
      '  !pA(pkA).',
    ].join('\n');
    const result = parsePv(source);
    expect(result.hasDegraded).toBe(true);

    const html = renderPanel(source, result);
    expect(html).toContain('解析器不支持的语法');
    expect(html).toContain('验证仍按原始');
    expect(html).not.toContain('错误诊断');
  });

  it('解析失败 → 警告条列出带行/列的错误诊断（复用泳道图措辞）', () => {
    const source = ['free c: channel.', 'process', '  out(c, ).', '  in(c, x);', '  0'].join('\n');
    const result = parsePv(source);
    expect(result.hasErrors).toBe(true);

    const html = renderPanel(source, result);
    expect(html).toContain('错误诊断');
    expect(html).toContain('L3:10');
    expect(html).toContain('期望词项');
    expect(html).toContain('diagnostic-item--error');
  });
});

describe('QueryResultCard：逐条查询卡片的呈现（录制 stdout 真实数据）', () => {
  it('被证伪的那条：用户原文 + 归一化形态 + 判定徽标 + 可展开的反例 trace', () => {
    const source = fixtureSource('ns-original');
    const views = mapResultsToQueries(
      parseVerifyStdout(fixtureStdout('ns-original')),
      parsePv(source).queries,
    );
    const html = renderToString(createElement(QueryResultCard, { index: 0, view: views[0] }));

    expect(html).toContain('id="query-1"'); // 卡片锚点（cardId）
    expect(html).toContain('被证伪');
    expect(html).toContain('inj-event(endBparam(x)) ==&gt; inj-event(beginBparam(x))'); // 用户原文
    expect(html).toContain('归一化形态');
    expect(html).toContain('展开反例 / 攻击 trace 原文');
    expect(html).toContain('Derivation:');
    expect(html).toContain('不成立'); // 解释文案
  });

  it('成立的条目：徽标为「成立」且没有反例折叠块', () => {
    const source = fixtureSource('ns-mutual-auth');
    const views = mapResultsToQueries(
      parseVerifyStdout(fixtureStdout('ns-mutual-auth')),
      parsePv(source).queries,
    );
    const html = renderToString(createElement(QueryResultCard, { index: 0, view: views[0] }));

    expect(html).toContain('成立');
    expect(html).toContain('没有找到反例');
    expect(html).not.toContain('展开反例');
  });
});

describe('VerifyFailureNotice：按 kind 分派中文指引', () => {
  function renderFailure(failure: VerifyFailure): string {
    return renderToString(createElement(VerifyFailureNotice, { outcome: failure }));
  }

  it('缺 ProVerif：安装 + PROVERIF_PATH 注入说明（ADR-0002 口径）', () => {
    const html = renderFailure({ ok: false, kind: 'missing-executable', message: '未找到可执行文件' });
    expect(html).toContain('安装');
    expect(html).toContain('PROVERIF_PATH');
    expect(html).toContain('~/.opam/default/bin/proverif');
    expect(html).toContain('missing-executable');
  });

  it('模型报错：展示 exitCode / stdout / stderr，并提示按输出定位源码', () => {
    const html = renderFailure({
      ok: false,
      kind: 'proverif-error',
      message: 'ProVerif 报告模型或运行错误（退出码 1）。',
      stdout: 'File "model.pv", line 3, characters 9-10: Syntax error.',
      stderr: 'Fatal error: exception Failure("parse error")',
      exitCode: 1,
    });
    expect(html).toContain('退出码');
    expect(html).toContain('Syntax error.');
    expect(html).toContain('parse error');
    expect(html).toContain('定位模型源码');
  });

  it('超时：提示调大时限并区分「模型太复杂」', () => {
    const html = renderFailure({
      ok: false,
      kind: 'timeout',
      message: 'ProVerif 运行超过 200 ms 未结束，已终止。',
      stdout: 'Starting query not attacker(s[])',
    });
    expect(html).toContain('模型太复杂');
    expect(html).toContain('超时（毫秒）');
  });

  it('服务不可达：给出启动命令与默认地址', () => {
    const html = renderFailure({ ok: false, kind: 'unreachable', message: '无法连接验证服务：x' });
    expect(html).toContain('pnpm start');
    expect(html).toContain('127.0.0.1:8787');
  });

  it('取消 / 请求无效 / 坏响应都有可读中文呈现', () => {
    expect(renderFailure({ ok: false, kind: 'cancelled', message: '验证已取消。' })).toContain(
      '已取消',
    );
    expect(
      renderFailure({ ok: false, kind: 'invalid-request', message: '请求体必须含 source。' }),
    ).toContain('未通过服务端校验');
    expect(renderFailure({ ok: false, kind: 'bad-response', message: '不是合法 JSON' })).toContain(
      '无法识别的响应',
    );
  });
});
