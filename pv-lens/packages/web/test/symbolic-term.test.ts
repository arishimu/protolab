import { describe, expect, it } from 'vitest';
import { parsePv } from '@pv-lens/core';
import type { PvTerm } from '@pv-lens/core';
import { NOTATION_LEGEND, renderTerm } from '../src/narrative/symbolic-term';

// 词项符号化渲染是纯函数：直接手写 PvTerm 做单元黄金断言（独立真源），
// 再用 fixture 的解析结果做一次端到端校验（构造子名来自真实 .pv）。

const name = (n: string): PvTerm => ({ kind: 'name', name: n, text: n });
const variable = (n: string): PvTerm => ({ kind: 'variable', name: n, text: n });
const apply = (functor: string, args: PvTerm[], text: string): PvTerm => ({
  kind: 'application',
  functor,
  args,
  text,
});
const tuple = (items: PvTerm[], text: string): PvTerm => ({ kind: 'tuple', items, text });
const equality = (term: PvTerm, text: string): PvTerm => ({ kind: 'equality', term, text });
const unknown = (text: string): PvTerm => ({ kind: 'unknown', text });

describe('renderTerm：密码学惯用记法（ticket 04）', () => {
  it('encrypt / aenc → {m}k；消息是元组时按 spec 铺开为 {Na,A}pkB', () => {
    expect(renderTerm(apply('aenc', [name('Na'), name('k')], 'aenc(Na,k)'))).toBe('{Na}k');
    expect(
      renderTerm(
        apply(
          'encrypt',
          [tuple([name('Na'), name('A')], '(Na,A)'), name('pkB')],
          'encrypt((Na,A),pkB)',
        ),
      ),
    ).toBe('{Na,A}pkB');
  });

  it('senc / sencrypt / enc → {|m|}k（对称加密）', () => {
    expect(renderTerm(apply('senc', [name('s'), name('k')], 'senc(s,k)'))).toBe('{|s|}k');
    expect(renderTerm(apply('sencrypt', [name('s'), name('k')], 'sencrypt(s,k)'))).toBe('{|s|}k');
    expect(renderTerm(apply('enc', [name('s'), name('k')], 'enc(s,k)'))).toBe('{|s|}k');
  });

  it('sign → [m]k；hash / h → H(m)', () => {
    expect(renderTerm(apply('sign', [name('m'), name('sk')], 'sign(m,sk)'))).toBe('[m]sk');
    expect(renderTerm(apply('hash', [name('m')], 'hash(m)'))).toBe('H(m)');
    expect(renderTerm(apply('h', [name('m')], 'h(m)'))).toBe('H(m)');
  });

  it('嵌套：aenc(sign((pkX,pkB,k),skB),pkX) → {[pkX,pkB,k]skB}pkX', () => {
    const term = apply(
      'aenc',
      [
        apply(
          'sign',
          [tuple([variable('pkX'), variable('pkB'), variable('k')], '(pkX,pkB,k)'), variable('skB')],
          'sign((pkX,pkB,k),skB)',
        ),
        variable('pkX'),
      ],
      'aenc(sign((pkX,pkB,k),skB),pkX)',
    );
    expect(renderTerm(term)).toBe('{[pkX,pkB,k]skB}pkX');
  });

  it('未知构造子（含 pk / messtermI）回退为函数调用写法；元组参数保留 (a, b)', () => {
    expect(renderTerm(apply('pk', [name('sk')], 'pk(sk)'))).toBe('pk(sk)');
    expect(
      renderTerm(apply('messtermI', [variable('xA'), variable('hostX')], 'messtermI(xA,hostX)')),
    ).toBe('messtermI(xA, hostX)');
    // 参数个数与模板不符时同样回退，而不是渲染出半截记法。
    expect(renderTerm(apply('aenc', [name('m')], 'aenc(m)'))).toBe('aenc(m)');
  });

  it('递归参数里的元组带 (a, b, c)，变量与名字取原名', () => {
    expect(renderTerm(tuple([name('a'), name('b'), name('c')], '(a,b,c)'))).toBe('(a, b, c)');
    expect(renderTerm(variable('Na'))).toBe('Na');
    expect(renderTerm(name('RSA'))).toBe('RSA');
  });

  it('equality → =M（如 =Na）；unknown → 原文兜底', () => {
    expect(renderTerm(equality(name('Na'), '=Na'))).toBe('=Na');
    expect(renderTerm(equality(tuple([name('Na'), name('NX')], '(Na,NX)'), '=(Na,NX)'))).toBe(
      '=(Na, NX)',
    );
    expect(renderTerm(unknown('???raw'))).toBe('???raw');
  });
});

describe('renderTerm：真实 fixture 端到端（构造子名来自 .pv）', () => {
  const nsOriginal = `free c: channel.
fun aenc(bitstring, pkey): bitstring.
fun pk(skey): pkey.
let processA(pkB: pkey, skA: skey) =
  in(c, pkX: pkey);
  out(c, aenc((Na, pk(skA)), pkX)).
process 0`;
  const model = parsePv(nsOriginal);
  const outStep = model.roles[0]?.steps[1];

  it('aenc((Na, pk(skA)), pkX) → {(Na,pk(skA))}pkX', () => {
    expect(outStep?.direction).toBe('out');
    expect(renderTerm(outStep!.term)).toBe('{Na,pk(skA)}pkX');
  });
});

describe('图例记法与映射表同源', () => {
  it('NOTATION_LEGEND 含加密/签名/哈希记法且不重复', () => {
    const notations = NOTATION_LEGEND.map((entry) => entry.notation);
    expect(notations).toContain('{m}k');
    expect(notations).toContain('{|m|}k');
    expect(notations).toContain('[m]k');
    expect(notations).toContain('H(m)');
    expect(new Set(notations).size).toBe(notations.length);
  });
});
