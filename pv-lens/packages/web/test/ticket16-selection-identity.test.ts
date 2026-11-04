import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('ticket #16：画布选中按绑定身份命中', () => {
  it('点击 pkB 只选中 processA 的 pkB，不连带 skA 与 pkX', () => {
    const result = fixture('ns-original.pv');
    const roles = narrativeRoleOrder(result);
    const roleA = roles.find((role) => role.name === 'processA');
    const pkB = roleA?.bindings.find((binding) => binding.name === 'pkB');
    const skA = roleA?.bindings.find((binding) => binding.name === 'skA');
    const pkX = roleA?.bindings.find((binding) => binding.name === 'pkX');
    expect(pkB).toBeDefined();
    expect(skA).toBeDefined();
    expect(pkX).toBeDefined();
    // 参数绑定指向声明行（NS 原版第 41 行），不再共享首个消息步骤的 span。
    expect(pkB!.span.start.line).toBe(41);
    expect(skA!.span.start.line).toBe(41);
    expect(pkX!.span.start.line).toBe(42);
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      sourceLink: {
        selectedSpan: pkB!.span,
        selectedId: pkB!.id,
        onSelectSpan: () => undefined,
        onSelectIdentity: () => undefined,
      },
    }));

    const groupOf = (bindingId: string) =>
      html.match(new RegExp(`<g class="structured-value-block[^"]*" data-binding-id="${escape(bindingId)}"[^>]*>`))?.[0] ?? '';
    expect(groupOf(pkB!.id)).toContain('structured-source-selected');
    expect(layout.valueBlocks.filter((block) => block.bindingId === pkB!.id).length).toBeGreaterThan(1);
    expect(groupOf(skA!.id)).not.toContain('structured-source-selected');
    expect(groupOf(pkX!.id)).not.toContain('structured-source-selected');
  });

  it('点击端点只选中该端点，不按同一消息步的其它对象扩散', () => {
    const result = fixture('handshake-fixed.pv');
    const pairings = composeMessagePairings(result).pairings;
    const layout = buildStructuredNarrativeLayout(result, { pairings });
    const endpoint = layout.endpoints.find((candidate) => candidate.direction === 'out');
    expect(endpoint).toBeDefined();
    const html = renderToString(createElement(NarrativeView, {
      result,
      pairings,
      sourceLink: {
        selectedSpan: endpoint!.sourceSpan,
        selectedId: endpoint!.id,
        onSelectSpan: () => undefined,
        onSelectIdentity: () => undefined,
      },
    }));
    const groupOf = (id: string) =>
      html.match(new RegExp(`<g class="structured-endpoint[^"]*" data-identity="${escape(id)}"[^>]*>`))?.[0] ?? '';
    expect(groupOf(endpoint!.id)).toContain('structured-source-selected');
    for (const other of layout.endpoints.filter((candidate) => candidate.id !== endpoint!.id)) {
      expect(groupOf(other.id)).not.toContain('structured-source-selected');
    }
  });
});
