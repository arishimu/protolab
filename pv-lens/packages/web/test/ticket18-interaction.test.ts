import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, createCorrespondencePlan, parsePv } from '@pv-lens/core';
import type { PairingIntent } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';
import { CorrespondencePanel } from '../src/CorrespondencePanel';
import { firstReferenceSpanOf } from '../src/source-reference';

// ticket #18：P2 交互整改的自动化合同（H1 唯一 key、D3 引用定位、D4 自反对、
// D5 强弱高亮、D7 类型警告、V4 端点键盘）。滚动与撤销的浏览器级验收记录在整改文档第 7 节。

const packagesDir = fileURLToPath(new URL('../..', import.meta.url));

function fixtureParse(name: string) {
  return parsePv(readFileSync(join(packagesDir, 'core', 'fixtures', 'pv', `${name}.pv`), 'utf8'));
}

describe('ticket #18：P2 交互（H1/D3/D4/D5/D7/V4）', () => {
  it('H1 复合守卫模型中五类布局 id 各自唯一，无 duplicate key', () => {
    for (const name of ['ns-mutual-auth', 'ns-original', 'handshake-fixed']) {
      const result = fixtureParse(name);
      const { pairings } = composeMessagePairings(result);
      const layout = buildStructuredNarrativeLayout(result, { pairings });
      const collections: ReadonlyArray<readonly { id: string }[]> = [
        layout.nodes,
        layout.valueBlocks,
        layout.methods,
        layout.chips,
        layout.pillars,
      ];
      for (const collection of collections) {
        const ids = collection.map((entry) => entry.id);
        expect(new Set(ids).size, `${name} 存在重复 id`).toBe(ids.length);
      }
    }
  });

  it('D3 绑定的首个引用区间：与声明区间不同且行号更大；无引用时返回 null', () => {
    const result = fixtureParse('ns-original');
    const { pairings } = composeMessagePairings(result);
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const pkX = layout.valueBlocks.find((block) => block.label === 'pkX' && block.occurrence === 'binding');
    expect(pkX, 'ns-original 应有 pkX 绑定方块').toBeDefined();
    const reference = firstReferenceSpanOf(result, pkX!.bindingId, pkX!.sourceSpan);
    expect(reference, 'pkX 首引用在 L45 out 的词项里').not.toBeNull();
    expect(reference!.start.offset).toBeGreaterThan(pkX!.sourceSpan.start.offset);
    expect(reference!.start.line).toBeGreaterThan(pkX!.sourceSpan.start.line);
    // pkB 只出现在 if 守卫、从不出现在消息词项中：无引用时只显示声明行主高亮。
    const pkB = layout.valueBlocks.find((block) => block.label === 'pkB' && block.occurrence === 'binding');
    expect(pkB).toBeDefined();
    expect(firstReferenceSpanOf(result, pkB!.bindingId, pkB!.sourceSpan)).toBeNull();
  });

  it('D4 选中事件后矩阵面板提供自反对应性查询按钮', () => {
    const result = fixtureParse('handshake-fixed');
    const plan = createCorrespondencePlan('', result);
    const event = plan.events[0]!;
    const plain = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: event.id,
      onSelectEvent: () => {},
      selectedQueryId: null,
      onSelectQuery: () => {},
    })).replace(/<!-- -->/g, '');
    expect(plain).toContain(`查询 ${event.name} 的自反对应性`);
  });

  it('D5 选中非自反单元后强高亮表头恰 2 个、弱高亮恰 2 个', () => {
    const result = fixtureParse('handshake-fixed');
    const plan = createCorrespondencePlan('', result);
    const query = plan.queries.find((candidate) => candidate.from.id !== candidate.to.id);
    expect(query, '应存在非自反有序对').toBeDefined();
    const html = renderToString(createElement(CorrespondencePanel, {
      plan,
      selectedEventId: null,
      onSelectEvent: () => {},
      selectedQueryId: query!.id,
      onSelectQuery: () => {},
    }));
    expect((html.match(/correspondence-head--selected/g) ?? []).length).toBe(2);
    expect((html.match(/correspondence-head--related/g) ?? []).length).toBe(2);
  });

  it('D7 类型不符的人工声明返回含类型名的 warning，声明保留', () => {
    // 接收端用等值模式 =n（NameTerm）：与 out 端 host 变量形状不兼容，类型 host vs bitstring。
    const model = parsePv([
      'free c: channel.',
      'free n: bitstring.',
      'let A(x: host) = out(c, x).',
      'let B = in(c, =n).',
      'process A(x) | B.',
    ].join('\n'));
    const intents: PairingIntent[] = [
      { outEnd: { roleIndex: 0, stepIndex: 0 }, inEnd: { roleIndex: 1, stepIndex: 0 } },
    ];
    const { pairings, diagnostics } = composeMessagePairings(model, intents);
    expect(diagnostics.filter((diagnostic) => diagnostic.kind !== 'order-cycle')).toHaveLength(0);
    const manual = pairings.find((entry) => entry.origin === 'manual');
    expect(manual, '类型不符不阻止声明（U3.10）').toBeDefined();
    expect(manual!.warning).toContain('类型不符');
    expect(manual!.warning).toContain('host');
    expect(manual!.warning).toContain('bitstring');
    expect(manual!.warning).toContain('声明已保留');
  });

  it('V4 可配对端点可键盘聚焦：role=button、tabIndex、Enter 触发选择', () => {
    const result = fixtureParse('ns-mutual-auth');
    const { pairings } = composeMessagePairings(result);
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      onEndpointSelect: () => {},
    }));
    const keyboardEndpoint = /<g class="structured-endpoint[^"]*structured-endpoint--selectable[^"]*"[^>]*role="button"/.exec(html);
    expect(keyboardEndpoint, '可选端点应带 role=button').not.toBeNull();
    expect(/role="button"[^>]*tabindex="0"/.exec(html), '可选端点应可 Tab 聚焦').not.toBeNull();
    expect(html).toContain('Enter 选择');
  });

  it('R20 事件旗标可键盘聚焦：role=button 与 Enter/Space 同一状态机', () => {
    const result = fixtureParse('handshake-fixed');
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings: composeMessagePairings(result).pairings,
      eventCorrespondence: { rolesByOffset: new Map(), selectedOffset: null, onSelect: () => {}, onReflexive: () => {} },
      sourceLink: { selectedSpan: null, onSelectSpan: () => {} },
    }));
    const keyboardEvent = /<g class="structured-event[^"]*structured-event--clickable[^"]*"[^>]*role="button"/.exec(html);
    expect(keyboardEvent, '事件旗标应带 role=button').not.toBeNull();
    expect(/role="button"[^>]*tabindex="0"/.exec(html), '事件旗标应可 Tab 聚焦').not.toBeNull();
  });

  it('R20 本地/降级节点可键盘聚焦，与 insert 胶囊一并覆盖', () => {
    const source = [
      'free c: channel.',
      'table keys: bitstring.',
      'let A = insert(keys, k); phase 1; out(c, k).',
      'let B = in(c, x: bitstring).',
      'process A | B.',
    ].join('\n');
    const result = parsePv(source);
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings: composeMessagePairings(result).pairings,
      sourceLink: { selectedSpan: null, onSelectSpan: () => {} },
    }));
    const degradedGroup = /<g class="structured-node[^"]*structured-node--degraded[^"]*"[^>]*role="button"/.exec(html);
    expect(degradedGroup, '降级节点应带 role=button').not.toBeNull();
    const insertGroup = /<g class="structured-node[^"]*structured-node--insert[^"]*"[^>]*role="button"/.exec(html);
    expect(insertGroup, 'insert 节点应带 role=button').not.toBeNull();
  });

  it('R20 源码行为 roving tabindex：仅当前行 Tab 停留，行带 role=button', () => {
    const sourcePanel = readFileSync(join(packagesDir, 'web', 'src', 'SourcePanel.tsx'), 'utf8');
    expect(sourcePanel).toContain('tabIndex={lineNo === focusedLine ? 0 : -1}');
    expect(sourcePanel).toMatch(/handleLineKeyDown/);
    expect(sourcePanel).toMatch(/ArrowDown|ArrowUp/);
    const styles = readFileSync(join(packagesDir, 'web', 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.source-line:focus-visible/);
    const v2 = readFileSync(join(packagesDir, 'web', 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.structured-event--clickable:focus-visible/);
    expect(v2).toMatch(/\.structured-node:focus-visible/);
  });
});
