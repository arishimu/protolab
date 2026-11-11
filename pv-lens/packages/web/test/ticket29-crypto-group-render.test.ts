import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveCryptoGroups, parsePv } from '@pv-lens/core';
import type { CryptoOperationGroup, ParseResult } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';
import { NarrativeView } from '../src/narrative/NarrativeView';
import { GroupAuditPanel } from '../src/narrative/GroupAuditPanel';

const webDir = fileURLToPath(new URL('..', import.meta.url));

function coreFixture(path: string): ParseResult {
  return parsePv(readFileSync(join(webDir, '..', 'core', 'fixtures', path), 'utf8'));
}

function groupOf(groups: readonly CryptoOperationGroup[], predicate: (group: CryptoOperationGroup) => boolean): CryptoOperationGroup {
  const found = groups.find(predicate);
  if (found === undefined) throw new Error('crypto group not found');
  return found;
}

describe('阶段 2：密码操作组折叠布局', () => {
  const result = coreFixture('pv/handshake-fixed.pv');
  const groups = deriveCryptoGroups(result);
  const adec = groupOf(groups, (group) => group.roleName === 'clientA' && group.kind === 'asymmetric-decryption');

  it('折叠态用组摘要替换方法盒，行高与画布高度下降', () => {
    const expanded = buildStructuredNarrativeLayout(result);
    const folded = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [adec.id] });
    expect(expanded.cryptoGroupFolds).toHaveLength(0);
    expect(folded.cryptoGroupFolds).toHaveLength(1);
    expect(folded.cryptoGroupFolds[0]).toMatchObject({
      groupId: adec.id,
      kind: 'asymmetric-decryption',
      direction: 'destruct',
      hiddenCount: adec.hiddenCount,
      nested: false,
    });
    expect(folded.cryptoGroupFolds[0]?.hiddenCount).toBe(adec.hiddenCount);
    expect(folded.cryptoGroupFolds[0]?.detail).toContain('密钥 skA');
    expect(expanded.methods.some((method) => method.label === 'adec')).toBe(true);
    expect(folded.methods.some((method) => method.label === 'adec')).toBe(false);
    // 折叠减少本角色后续行 y；画布总高还可能由最高角色决定，故比较同角色后续节点。
    const eventY = (layout: ReturnType<typeof buildStructuredNarrativeLayout>) =>
      layout.nodes.find((node) => node.roleIndex === 0 && node.kind === 'event')?.y;
    expect(eventY(folded)).toBeLessThan(eventY(expanded) ?? 0);
    expect(folded.height).toBeLessThanOrEqual(expanded.height);
  });

  it('折叠后组外仍被引用的产出以同色幽灵值块保留', () => {
    const expanded = buildStructuredNarrativeLayout(result);
    const folded = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [adec.id] });
    expect(adec.ghostBindingIds.length).toBeGreaterThan(0);
    const binding = result.roles
      .find((role) => role.name === 'clientA')
      ?.bindings.find((candidate) => candidate.name === 'y');
    expect(binding).toBeDefined();
    const real = expanded.valueBlocks.find((block) => block.bindingId === binding?.id && block.ghost !== true);
    const ghost = folded.valueBlocks.find((block) => block.bindingId === binding?.id && block.ghost === true);
    expect(real).toBeDefined();
    expect(ghost).toBeDefined();
    expect(ghost?.color).toBe(real?.color);
    expect(ghost?.ordinal).toBe(real?.ordinal);
    expect(ghost?.pattern).toBe(real?.pattern);
  });

  it('折叠只改本角色值层，其他角色的消息 y 不变', () => {
    const expanded = buildStructuredNarrativeLayout(result);
    const folded = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [adec.id] });
    const serverOut = (layout: ReturnType<typeof buildStructuredNarrativeLayout>) =>
      layout.endpoints.find((endpoint) => endpoint.roleIndex === 1 && endpoint.direction === 'out' && endpoint.termText.includes('aenc'));
    expect(serverOut(folded)?.y).toBe(serverOut(expanded)?.y);
  });

  it('默认展开与显式空折叠集合都退回基线结构', () => {
    const baseline = buildStructuredNarrativeLayout(result);
    const explicit = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [] });
    expect(explicit.methods.map((method) => [method.id, method.x, method.y, method.label]))
      .toEqual(baseline.methods.map((method) => [method.id, method.x, method.y, method.label]));
    expect(explicit.chips.map((chip) => [chip.id, chip.x, chip.y]))
      .toEqual(baseline.chips.map((chip) => [chip.id, chip.x, chip.y]));
    expect(explicit.endpoints.map((endpoint) => [endpoint.id, endpoint.y]))
      .toEqual(baseline.endpoints.map((endpoint) => [endpoint.id, endpoint.y]));
  });

  it('嵌套子组可以单独折叠，父组保持展开', () => {
    const nestedResult = coreFixture('pv/crypto-nested.pv');
    const nestedGroups = deriveCryptoGroups(nestedResult);
    const hash = groupOf(nestedGroups, (group) => group.roleName === 'alice' && group.kind === 'hash');
    const child = groupOf(nestedGroups, (group) => group.parentId === hash.id && group.kind === 'symmetric-encryption');

    const expanded = buildStructuredNarrativeLayout(nestedResult);
    const childFolded = buildStructuredNarrativeLayout(nestedResult, { collapsedCryptoGroups: [child.id] });
    const chipOfChild = (layout: ReturnType<typeof buildStructuredNarrativeLayout>) =>
      layout.chips.some((chip) => chip.id.startsWith(child.itemId) && chip.text === child.termText);
    expect(chipOfChild(expanded)).toBe(true);
    expect(chipOfChild(childFolded)).toBe(false);
    expect(childFolded.cryptoGroupFolds).toHaveLength(1);
    expect(childFolded.cryptoGroupFolds[0]).toMatchObject({ groupId: child.id, nested: true });
    expect(childFolded.methods.some((method) => method.label === 'hash')).toBe(true);

    const parentFolded = buildStructuredNarrativeLayout(nestedResult, { collapsedCryptoGroups: [hash.id, child.id] });
    expect(parentFolded.cryptoGroupFolds.map((fold) => fold.groupId)).toEqual([hash.id]);
    expect(parentFolded.methods.some((method) => method.label === 'hash')).toBe(false);
  });

  it('线上构造的子组单独折叠时，父组方法盒保留并出现内层摘要', () => {
    const aenc = groupOf(groups, (group) => group.roleName === 'serverB' && group.kind === 'asymmetric-encryption');
    const sign = groupOf(groups, (group) => group.parentId === aenc.id);
    const folded = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [sign.id] });
    expect(folded.methods.some((method) => method.id === `${sign.itemId}:wire-method` && method.label === 'aenc')).toBe(true);
    const nested = folded.cryptoGroupFolds.find((fold) => fold.groupId === sign.id);
    expect(nested).toMatchObject({ nested: true, kind: 'signature' });
  });

  it('组摘要保留源码区间与方程区间，可回到源码', () => {
    const folded = buildStructuredNarrativeLayout(result, { collapsedCryptoGroups: [adec.id] });
    const fold = folded.cryptoGroupFolds[0];
    expect(fold?.sourceSpan.start.offset).toBe(adec.sourceSpan.start.offset);
    expect(fold?.sourceSpan.end.offset).toBe(adec.sourceSpan.end.offset);
    expect(fold?.equationSpan?.start.offset).toBe(adec.equationSpan?.start.offset);
    expect(fold?.functor).toBe('adec');
  });

  it('未知函数不产生可折叠组（crypto-unknown）', () => {
    const unknown = coreFixture('pv/crypto-unknown.pv');
    const unknownGroups = deriveCryptoGroups(unknown);
    expect(unknownGroups.map((group) => group.functor)).toEqual(['senc']);
    const layout = buildStructuredNarrativeLayout(unknown);
    expect(layout.cryptoGroups.map((group) => group.functor)).toEqual(['senc']);
    expect(layout.cryptoGroupFolds).toHaveLength(0);
  });
});

describe('阶段 2：画布渲染与审计面板', () => {
  const result = coreFixture('pv/handshake-fixed.pv');
  const groups = deriveCryptoGroups(result);
  const adec = groupOf(groups, (group) => group.roleName === 'clientA' && group.kind === 'asymmetric-decryption');

  it('默认折叠全部组；显式空折叠集合恢复展开态', () => {
    const folded = renderToString(createElement(NarrativeView, {
      result,
      initialCollapsedCryptoGroups: [adec.id],
    }));
    expect(folded).toContain('structured-crypto-group');
    expect(folded).toContain(`data-group-id="${adec.id}"`);
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).toContain('非对称解密');
    expect(folded).toContain('隐藏 ');

    const defaultCollapsed = renderToString(createElement(NarrativeView, { result }));
    expect(defaultCollapsed).toContain('structured-crypto-group');
    expect(defaultCollapsed).not.toContain('structured-group-toggle');

    const expanded = renderToString(createElement(NarrativeView, {
      result,
      initialCollapsedCryptoGroups: [],
    }));
    expect(expanded).toContain('structured-group-toggle');
    expect(expanded).toContain('aria-expanded="true"');
  });

  it('审计面板列出种类、来源、隐藏计数与源码行；覆盖后显示用户声明', () => {
    const roleNames = new Set(result.roles.map((role) => role.name));
    const auto = deriveCryptoGroups(result).filter((group) => roleNames.has(group.roleName));
    const html = renderToString(createElement(GroupAuditPanel, {
      groups: auto,
      autoGroups: auto,
      collapsed: new Set([adec.id]),
      overrides: new Map(),
      onToggle: () => undefined,
      onOverride: () => undefined,
      onReset: () => undefined,
      onCollapseAll: () => undefined,
      onExpandAll: () => undefined,
      onLocate: () => undefined,
    })).replace(/<!-- -->/g, '');
    expect(html).toContain('密码操作审计');
    expect(html).toContain('方程匹配');
    expect(html).toContain('高置信');
    expect(html).toContain(`源码 L${String(adec.sourceSpan.start.line)}`);
    expect(html).toContain('重置');

    const overridden = buildStructuredNarrativeLayout(result, {
      cryptoGroupOverrides: { [adec.id]: 'hash' },
    });
    const changed = overridden.cryptoGroups.find((group) => group.id === adec.id);
    expect(changed).toMatchObject({ kind: 'hash', origin: 'user', confidence: 'user' });
    expect(deriveCryptoGroups(result).find((group) => group.id === adec.id)).toEqual(adec);
  });

  it('图例区分语义折叠与未识别操作', () => {
    const layout = buildStructuredNarrativeLayout(result);
    expect(layout.cryptoGroups.length).toBeGreaterThan(0);
    const html = renderToString(createElement(NarrativeView, { result }));
    expect(html).toContain('密码操作组表示语义折叠');
    expect(html).toContain('未识别函数不建组也不折叠');
  });
});
