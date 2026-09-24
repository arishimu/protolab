import { describe, expect, it } from 'vitest';
import { parsePv } from '@pv-lens/core';
import type { PvTerm, RoleItem } from '@pv-lens/core';

function variables(term: PvTerm): Extract<PvTerm, { kind: 'variable' }>[] {
  const found: Extract<PvTerm, { kind: 'variable' }>[] = [];
  const visit = (current: PvTerm): void => {
    if (current.kind === 'variable') found.push(current);
    if (current.kind === 'application') current.args.forEach(visit);
    if (current.kind === 'tuple') current.items.forEach(visit);
    if (current.kind === 'equality') visit(current.term);
  };
  visit(term);
  return found;
}

function markers(items: readonly RoleItem[]): string[] {
  return items.map((item) => (item.kind === 'branch' ? item.marker : item.kind));
}

describe('ticket #03 core：分支标记流与臂作用域', () => {
  const twoArms = parsePv([
    'free c: channel.',
    'let p(x: bitstring) =',
    '  if x = a then out(c, n1) else out(c, n2).',
    'process p(t).',
  ].join('\n'));

  it('if / else 展开成 branch → then items → else → else items → join 的连续标记流', () => {
    const items = twoArms.roles[0].items;
    expect(markers(items)).toEqual(['branch', 'message', 'else', 'message', 'join']);
    const [branch, , elseItem, , join] = items;
    if (branch.kind !== 'branch' || elseItem.kind !== 'branch' || join.kind !== 'branch') throw new Error('形状不符');
    expect(branch.linkId).toBeDefined();
    expect(elseItem.linkId).toBe(branch.linkId);
    expect(join.linkId).toBe(branch.linkId);
    expect(new Set([branch.id, elseItem.id, join.id]).size).toBe(3);
    expect([branch.arm, elseItem.arm, join.arm]).toEqual(['then', 'else', 'main']);
    expect([branch.depth, elseItem.depth, join.depth]).toEqual([0, 0, 0]);
    expect(elseItem.empty).toBe(false);
  });

  it('守卫结构化保留：if 给 Condition，get 给表模式原文与来源标记', () => {
    const [branch] = twoArms.roles[0].items;
    if (branch.kind !== 'branch') throw new Error('形状不符');
    expect(branch.guardKind).toBe('if');
    expect(branch.guardText).toBe('x = a');
    expect(branch.guard?.kind).toBe('comparison');

    const get = parsePv([
      'free c: channel.',
      'table keys(host, pkey).',
      'let p(b: host) = get keys(b, k) in out(c, k).',
      'process p(a).',
    ].join('\n'));
    const getBranch = get.roles[0].items.find((item) => item.kind === 'branch' && item.marker === 'branch');
    if (getBranch?.kind !== 'branch') throw new Error('形状不符');
    expect(getBranch.guardKind).toBe('get');
    expect(getBranch.guardText).toBe('keys(b, k)');
  });

  it('单臂 if 也发 join，空 else 标记 empty=true', () => {
    const single = parsePv([
      'free c: channel.',
      'let p(x: bitstring) = if x = a then out(c, n1).',
      'process p(t).',
    ].join('\n'));
    expect(markers(single.roles[0].items)).toEqual(['branch', 'message', 'join']);

    const emptyElse = parsePv([
      'free c: channel.',
      'let p(x: bitstring) = if x = a then out(c, n1) else 0.',
      'process p(t).',
    ].join('\n'));
    expect(markers(emptyElse.roles[0].items)).toEqual(['branch', 'message', 'else', 'join']);
    const elseItem = emptyElse.roles[0].items.find((item) => item.kind === 'branch' && item.marker === 'else');
    expect(elseItem?.kind === 'branch' && elseItem.empty).toBe(true);
  });

  it('两臂按臂帧栈解析：同名绑定不跨臂遮蔽，合流后引用看不到臂内绑定', () => {
    // ProVerif 的 else 臂会吞掉到所在块结尾为止的语句，所以要测「合流之后」必须在外面再套一层括号。
    const result = parsePv([
      'free c: channel.',
      'let p(x: bitstring) =',
      '  (if x = a then (in(c, y: bitstring); out(c, y)) else (in(c, y: bitstring); out(c, y)));',
      '  out(c, y).',
      'process p(t).',
    ].join('\n'));
    const role = result.roles[0];
    const yBindings = role.bindings.filter((binding) => binding.name === 'y' && binding.kind === 'in');
    expect(yBindings).toHaveLength(2);
    const messages = role.items.filter((item) => item.kind === 'message');
    // then 臂的 out 指向 then 臂的 in；else 臂的 out 指向 else 臂的 in（顺序与源码一致）。
    expect(variables(messages[1].endpoint.term).map((term) => term.bindingId)).toEqual([yBindings[0].id]);
    expect(variables(messages[3].endpoint.term).map((term) => term.bindingId)).toEqual([yBindings[1].id]);
    // 合流之后的 `out(c, y)` 不在任何臂帧里：`y` 已出作用域，按解析器约定落回名字叶子，不再指向任何绑定。
    expect(messages[4].endpoint.term.kind).toBe('name');
    expect(variables(messages[4].endpoint.term)).toEqual([]);
    expect(role.bindings.filter((binding) => binding.name === 'y')).toHaveLength(2);
  });

  it('嵌套分支的 depth 递增，且 join 关闭最内层', () => {
    const nested = parsePv([
      'free c: channel.',
      'let p(x: bitstring) =',
      '  if x = a then if x = b then out(c, n1) else out(c, n2) else out(c, n3).',
      'process p(t).',
    ].join('\n'));
    const items = nested.roles[0].items;
    expect(markers(items)).toEqual(['branch', 'branch', 'message', 'else', 'message', 'join', 'else', 'message', 'join']);
    const depths = items.filter((item) => item.kind === 'branch').map((item) => item.depth);
    expect(depths).toEqual([0, 1, 1, 1, 0, 0]);
  });
});
