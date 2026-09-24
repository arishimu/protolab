import { describe, expect, it } from 'vitest';
import { parsePv } from '@pv-lens/core';
import { buildStructuredNarrativeLayout } from '../src/narrative/structured-layout';

describe('ticket #02：值层布局语义', () => {
  const result = parsePv([
    'type bitstring.',
    'type key.',
    'free c: channel.',
    'fun enc(bitstring, key): bitstring.',
    'reduc forall x: bitstring, k: key; dec(enc(x,k),k) = x.',
    'let role(k: key) =',
    '  new nonce: bitstring;',
    '  out(c, enc(nonce, k));',
    '  in(c, cipher: bitstring);',
    '  let plain = dec(cipher, k) in',
    '  let rebound = enc(plain, k) in',
    '  in(c, (=plain, peer: bitstring));',
    '  out(c, rebound).',
    'process role(secret).',
  ].join('\n'));
  const layout = buildStructuredNarrativeLayout(result);
  const role = result.roles[0];

  it('接收消息端连接到本地绑定，同一 bindingId 的引用与等值复制复用颜色', () => {
    const cipher = role.bindings.find((binding) => binding.name === 'cipher');
    const plain = role.bindings.find((binding) => binding.name === 'plain');
    expect(cipher).toBeDefined();
    expect(plain).toBeDefined();

    const receive = layout.endpoints.find((endpoint) => endpoint.id === 'role:message:1');
    const receivedBlock = layout.valueBlocks.find(
      (block) => block.bindingId === cipher!.id && block.occurrence === 'binding',
    );
    expect(receivedBlock?.y).toBe(receive?.y);

    const plainCopies = layout.valueBlocks.filter((block) => block.bindingId === plain!.id);
    expect(plainCopies.map((block) => block.occurrence)).toContain('equality');
    expect(new Set(plainCopies.map((block) => block.color))).toEqual(new Set([plainCopies[0].color]));
  });

  it('析构声明决定竖向方法盒，纯构造决定横向方法盒', () => {
    expect(layout.methods.map(({ label, direction }) => [label, direction])).toEqual(
      expect.arrayContaining([
        ['dec', 'destruct'],
        ['enc', 'construct'],
      ]),
    );
  });

  it('未绑定内联构造是 wire 词项，已绑定值引用不是 wire 词项', () => {
    expect(layout.endpoints.find((endpoint) => endpoint.id === 'role:message:0')?.termPresentation).toBe('wire');
    expect(layout.endpoints.find((endpoint) => endpoint.id === 'role:message:3')?.termPresentation).toBe('binding-reference');
  });

  it('值颜色按绑定身份而非名字分配，跨角色同名绑定不合并', () => {
    const sameNames = parsePv([
      'free c: channel.',
      'let left(x: bitstring) = out(c, x).',
      'let right(x: bitstring) = out(c, x).',
      'process left(a) | right(b).',
    ].join('\n'));
    const sameLayout = buildStructuredNarrativeLayout(sameNames);
    const parameters = sameLayout.valueBlocks.filter(
      (block) => block.label === 'x' && block.occurrence === 'binding',
    );
    expect(parameters).toHaveLength(2);
    expect(parameters[0].bindingId).not.toBe(parameters[1].bindingId);
    expect(parameters[0].color).not.toBe(parameters[1].color);
  });
});
