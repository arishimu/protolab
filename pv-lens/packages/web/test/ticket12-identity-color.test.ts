import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeMessagePairings, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { buildMessagePalette, valueColorsOf } from '../src/narrative/identity-color';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(name: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', name), 'utf8'));
}

function colorByBinding(result: ParseResult): Map<string, string> {
  const layout = buildStructuredNarrativeLayout(result, { pairings: composeMessagePairings(result).pairings });
  const colors = new Map<string, string>();
  layout.valueBlocks.forEach((block) => {
    const existing = colors.get(block.bindingId);
    if (existing !== undefined) expect(block.color).toBe(existing);
    else colors.set(block.bindingId, block.color);
  });
  return colors;
}

describe('ticket #12：身份色单射', () => {
  it('四个基准样例：绑定颜色数等于绑定身份数，同绑定同色', () => {
    for (const file of ['hello.pv', 'handshake-fixed.pv', 'ns-mutual-auth.pv', 'ns-original.pv']) {
      const result = fixture(file);
      const colors = colorByBinding(result);
      expect(new Set(colors.values()).size, `${file}：颜色不应复用`).toBe(colors.size);
    }
  });

  it('握手修正版：跨角色同名绑定不同色，不同名绑定也不同色', () => {
    const result = fixture('handshake-fixed.pv');
    const roles = narrativeRoleOrder(result);
    const colors = colorByBinding(result);
    const bindingOf = (roleName: string, bindingName: string): string => {
      const role = roles.find((candidate) => candidate.name === roleName);
      const binding = role?.bindings.find((candidate) => candidate.name === bindingName);
      expect(binding, `${roleName}.${bindingName} 应存在`).toBeDefined();
      return binding!.id;
    };
    const colorOf = (roleName: string, bindingName: string): string => {
      const color = colors.get(bindingOf(roleName, bindingName));
      expect(color, `${roleName}.${bindingName} 应有颜色`).toBeDefined();
      return color!;
    };
    expect(colorOf('clientA', 'pkA')).not.toBe(colorOf('serverB', 'pkA'));
    expect(colorOf('clientA', 'x')).not.toBe(colorOf('serverB', 'x'));
    expect(colorOf('clientA', 'skA')).not.toBe(colorOf('serverB', 'pkX'));
    expect(colorOf('clientA', 'pkB')).not.toBe(colorOf('serverB', 'k'));
  });

  it('消息色前八条沿用既有 token，第九条起继续生成且不重复', () => {
    const palette = buildMessagePalette(12);
    expect(palette.slice(0, 3)).toEqual(['#2563EB', '#0891B2', '#16A34A']);
    expect(new Set(palette).size).toBe(12);
  });

  it('超过二十四个身份仍保持值色唯一', () => {
    const ids = Array.from({ length: 40 }, (_, index) => `role:parameter:${String(index)}:v`);
    const colors = valueColorsOf(ids);
    expect(colors.size).toBe(40);
    expect(new Set(colors.values()).size).toBe(40);
  });
});
