import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildOperationRegistry,
  coreSamples,
  deriveCryptoGroups,
  parsePv,
} from '@pv-lens/core';
import type { CryptoOperationGroup, ParseResult } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

function parseFixture(rel: string): ParseResult {
  return parsePv(readFixture(`pv/${rel}`));
}

function kindsOf(groups: readonly CryptoOperationGroup[]): string[] {
  return groups.map((group) => group.kind);
}

function childrenOf(groups: readonly CryptoOperationGroup[], parent: CryptoOperationGroup): CryptoOperationGroup[] {
  return groups.filter((group) => group.parentId === parent.id);
}

describe('阶段 1：reduc 方程结构化', () => {
  it('handshake-fixed 的方程保留析构子、参数、左右词项与 span', () => {
    const model = parseFixture('handshake-fixed.pv');
    expect(model.hasErrors).toBe(false);
    expect(model.equations.map((equation) => equation.destructor)).toEqual([
      'sdec',
      'adec',
      'getmess',
      'checksign',
    ]);

    const sdec = model.equations[0];
    expect(sdec.parameters.map((parameter) => [parameter.name, parameter.typeName])).toEqual([
      ['m', 'bitstring'],
      ['k', 'key'],
    ]);
    expect(sdec.left.term.kind).toBe('application');
    expect(sdec.right.term).toMatchObject({ kind: 'variable', name: 'm' });
    expect(sdec.span.start.line).toBe(5);
    expect(sdec.left.span.start.offset).toBeGreaterThanOrEqual(sdec.span.start.offset);
    expect(sdec.right.span.end.offset).toBeLessThanOrEqual(sdec.span.end.offset);
    expect(sdec.attributes).toEqual([]);
  });

  it('保留方程后缀属性并继续声明解析', () => {
    const model = parsePv(`
      type bitstring.
      fun f(bitstring): bitstring.
      reduc forall x: bitstring; f(x) = x [convergent].
      process 0.
    `);
    expect(model.hasErrors).toBe(false);
    expect(model.equations).toHaveLength(1);
    expect(model.equations[0].attributes).toEqual(['convergent']);
    expect(model.mainProcess?.name).toBe('main');
  });

  it('一个 reduc 可包含多条方程，逐条保留独立 span', () => {
    const model = parsePv(`
      type bitstring.
      reduc forall x: bitstring; unwrap(wrap(x)) = x; unwrap2(wrap2(x)) = x.
      process 0.
    `);
    expect(model.hasErrors).toBe(false);
    expect(model.equations.map((equation) => equation.destructor)).toEqual(['unwrap', 'unwrap2']);
    expect(model.destructors.map((destructor) => destructor.name)).toEqual(['unwrap', 'unwrap2']);
    expect(model.equations[0].span.start.offset).toBeLessThan(model.equations[1].span.start.offset);
    expect(model.equations[0].span.end.offset).toBeLessThan(model.equations[1].span.start.offset);
  });

  it('没有 forall 前缀时按单个方程解析', () => {
    const model = parsePv(`
      type bitstring.
      reduc f(a) = b.
      process 0.
    `);
    expect(model.hasErrors).toBe(false);
    expect(model.equations).toHaveLength(1);
    expect(model.equations[0].destructor).toBe('f');
    expect(model.equations[0].parameters).toEqual([]);
  });

  it('坏方程降级为诊断而不抛异常，也不进入方程列表', () => {
    const model = parsePv(`
      type bitstring.
      fun f(bitstring): bitstring.
      reduc forall x: bitstring; f(x = x.
      process 0.
    `);
    expect(model.hasErrors || model.hasDegraded).toBe(true);
    expect(model.equations).toEqual([]);
  });

  it('forall 参数缺失类型时降级并恢复解析后续声明', () => {
    const model = parsePv(`
      type bitstring.
      fun f(bitstring): bitstring.
      reduc forall x bitstring; f(x) = x.
      fun g(bitstring): bitstring.
      process 0.
    `);
    expect(model.hasErrors).toBe(true);
    expect(model.equations).toEqual([]);
    expect(model.functions.map((fn) => fn.name)).toEqual(['f', 'g']);
  });
});

describe('阶段 1：操作注册表', () => {
  it('方程优先识别对称/非对称加解密与签名', () => {
    const registry = buildOperationRegistry(parseFixture('handshake-fixed.pv'));
    expect(registry.lookup('senc')).toMatchObject({
      kind: 'symmetric-encryption',
      direction: 'construct',
      origin: 'equation',
      confidence: 'high',
    });
    expect(registry.lookup('sdec')).toMatchObject({
      kind: 'symmetric-decryption',
      direction: 'destruct',
      origin: 'equation',
      confidence: 'high',
    });
    expect(registry.lookup('aenc')).toMatchObject({ kind: 'asymmetric-encryption', direction: 'construct' });
    expect(registry.lookup('adec')).toMatchObject({ kind: 'asymmetric-decryption', direction: 'destruct' });
    expect(registry.lookup('sign')).toMatchObject({ kind: 'signature', direction: 'construct' });
    expect(registry.lookup('checksign')).toMatchObject({ kind: 'signature', direction: 'destruct' });
    expect(registry.lookup('getmess')).toMatchObject({ kind: 'signature', direction: 'destruct' });
    expect(registry.lookup('pk')).toMatchObject({
      kind: 'key-derivation',
      origin: 'name',
      confidence: 'medium',
    });
    expect(registry.lookup('spk')).toMatchObject({ kind: 'key-derivation', origin: 'name' });
  });

  it('名称与方程冲突时方程胜出（ns-mutual-auth 的 encrypt/decrypt）', () => {
    const registry = buildOperationRegistry(parseFixture('ns-mutual-auth.pv'));
    expect(registry.lookup('encrypt')).toMatchObject({
      kind: 'asymmetric-encryption',
      origin: 'equation',
      confidence: 'high',
    });
    expect(registry.lookup('decrypt')).toMatchObject({
      kind: 'asymmetric-decryption',
      origin: 'equation',
      confidence: 'high',
    });
    expect(registry.lookup('sencrypt')).toMatchObject({ kind: 'symmetric-encryption', origin: 'equation' });
    expect(registry.lookup('sdecrypt')).toMatchObject({ kind: 'symmetric-decryption', origin: 'equation' });
    expect(registry.lookup('nonce_to_bitstring')).toBeUndefined();
    expect(registry.lookup('messtermI')).toBeUndefined();
    expect(registry.lookup('messtermR')).toBeUndefined();
  });

  it('无析构子的单参数哈希函数按名称启发识别', () => {
    const registry = buildOperationRegistry(parseFixture('crypto-nested.pv'));
    expect(registry.lookup('hash')).toMatchObject({
      kind: 'hash',
      direction: 'construct',
      origin: 'name',
      confidence: 'medium',
    });
    expect(registry.lookup('opaque')).toBeUndefined();
  });

  it('哈希与密钥派生别名只接受单参数函数', () => {
    const registry = buildOperationRegistry(parsePv(`
      type bitstring.
      fun hash(bitstring, bitstring): bitstring.
      fun pk(bitstring, bitstring): bitstring.
      fun digest(bitstring): hashvalue.
      process 0.
    `));
    expect(registry.lookup('hash')).toBeUndefined();
    expect(registry.lookup('pk')).toBeUndefined();
    expect(registry.lookup('digest')).toMatchObject({ kind: 'hash', origin: 'name' });
  });
});

describe('阶段 1：密码操作组派生', () => {
  it('handshake-fixed 覆盖六类操作，且没有未知组', () => {
    const groups = deriveCryptoGroups(parseFixture('handshake-fixed.pv'));
    expect(new Set(kindsOf(groups))).toEqual(
      new Set([
        'key-derivation',
        'asymmetric-decryption',
        'signature',
        'symmetric-encryption',
        'asymmetric-encryption',
        'symmetric-decryption',
      ]),
    );
    expect(groups.every((group) => group.kind !== 'unknown')).toBe(true);
    expect(groups.every((group) => group.origin === 'equation' || group.origin === 'name')).toBe(true);
    expect(groups.every((group) => group.sourceSpan.start.offset >= 0)).toBe(true);
    expect(groups.every((group) => group.sourceSpan.end.offset > group.sourceSpan.start.offset)).toBe(true);
  });

  it('aenc(sign(...)) 建立父子嵌套，父组隐藏计数包含子组', () => {
    const groups = deriveCryptoGroups(parseFixture('handshake-fixed.pv'));
    const aenc = groups.find((group) => group.kind === 'asymmetric-encryption');
    expect(aenc).toBeDefined();
    const children = aenc === undefined ? [] : childrenOf(groups, aenc);
    expect(children.map((group) => group.kind)).toEqual(['signature']);
    expect(children[0]?.parentId).toBe(aenc?.id);
    expect(aenc?.hiddenCount).toBe((aenc?.members.length ?? 0) + (children[0]?.hiddenCount ?? 0));
    expect(aenc?.hiddenCount ?? 0).toBeGreaterThan(aenc?.members.length ?? 0);
  });

  it('ns-mutual-auth 识别加解密、签名与密钥派生，未知函数不建组', () => {
    const groups = deriveCryptoGroups(parseFixture('ns-mutual-auth.pv'));
    const kinds = new Set(kindsOf(groups));
    expect(kinds).toContain('asymmetric-encryption');
    expect(kinds).toContain('asymmetric-decryption');
    expect(kinds).toContain('signature');
    expect(kinds).toContain('key-derivation');
    expect(groups.every((group) => group.kind !== 'unknown')).toBe(true);
  });

  it('multi-channel 按角色建组，不跨角色合并', () => {
    const groups = deriveCryptoGroups(parseFixture('multi-channel.pv'));
    expect(new Set(kindsOf(groups))).toEqual(
      new Set(['symmetric-encryption', 'symmetric-decryption']),
    );
    const roles = new Set(groups.map((group) => group.roleName));
    expect(roles).toEqual(new Set(['processA', 'processB', 'processS']));
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
  });

  it('hello 没有密码操作，不产生组', () => {
    expect(deriveCryptoGroups(parseFixture('hello.pv'))).toEqual([]);
  });

  it('crypto-nested 覆盖七类操作，并保留两层嵌套', () => {
    const groups = deriveCryptoGroups(parseFixture('crypto-nested.pv'));
    expect(new Set(kindsOf(groups))).toEqual(
      new Set([
        'symmetric-encryption',
        'symmetric-decryption',
        'asymmetric-encryption',
        'asymmetric-decryption',
        'signature',
        'hash',
        'key-derivation',
      ]),
    );

    const hash = groups.find((group) => group.kind === 'hash');
    expect(hash?.origin).toBe('name');
    expect(hash?.confidence).toBe('medium');
    expect(hash === undefined ? [] : childrenOf(groups, hash).map((group) => group.kind)).toEqual([
      'symmetric-encryption',
    ]);

    const decrypt = groups.find((group) => group.kind === 'symmetric-decryption');
    expect(decrypt === undefined ? [] : childrenOf(groups, decrypt).map((group) => group.kind)).toEqual([
      'symmetric-encryption',
    ]);

    const encrypt = groups.find((group) => group.kind === 'asymmetric-encryption');
    expect(encrypt === undefined ? [] : childrenOf(groups, encrypt).map((group) => group.kind)).toEqual([
      'signature',
    ]);
    expect(encrypt?.operands.payload).toBeDefined();
    expect(encrypt?.operands.key).toBeDefined();
  });

  it('crypto-unknown 只为已知操作建组，未知函数保留原名但不分组', () => {
    const model = parseFixture('crypto-unknown.pv');
    const registry = buildOperationRegistry(model);
    expect(registry.lookup('opaque')).toBeUndefined();
    expect(registry.lookup('mix')).toBeUndefined();
    expect(registry.lookup('mystery')).toBeUndefined();

    const groups = deriveCryptoGroups(model);
    expect(kindsOf(groups)).toEqual(['symmetric-encryption']);
    expect(groups[0]?.origin).toBe('equation');
  });

  it('派生结果确定，id 唯一，parentId 指向现存组', () => {
    const model = parseFixture('crypto-nested.pv');
    const first = deriveCryptoGroups(model);
    const second = deriveCryptoGroups(model);
    expect(second).toEqual(first);

    const ids = new Set(first.map((group) => group.id));
    expect(ids.size).toBe(first.length);
    for (const group of first) {
      if (group.parentId !== null) expect(ids.has(group.parentId)).toBe(true);
      expect(group.hiddenCount).toBeGreaterThanOrEqual(group.members.length);
    }
  });

  it('用户覆盖改变种类与来源，但不修改解析结果；重新派生即重置', () => {
    const model = parseFixture('crypto-nested.pv');
    const auto = deriveCryptoGroups(model);
    const target = auto.find((group) => group.kind === 'hash');
    expect(target).toBeDefined();
    if (target === undefined) return;

    const overridden = deriveCryptoGroups(model, {
      overrides: new Map([[target.id, 'signature']]),
    });
    const changed = overridden.find((group) => group.id === target.id);
    expect(changed).toMatchObject({
      kind: 'signature',
      origin: 'user',
      confidence: 'user',
      direction: target.direction,
    });

    expect(deriveCryptoGroups(model).find((group) => group.id === target.id)).toEqual(target);
    expect(model.hasErrors).toBe(false);
  });
});

describe('阶段 1：四个内置样例的分类回归', () => {
  it('全部内置样例都有方程或名称依据，且不产生未知组', () => {
    for (const sample of coreSamples) {
      const model = parsePv(readFixture(`pv/${sample.pvFile.split('/').pop() ?? ''}`));
      expect(model.hasErrors).toBe(false);
      const registry = buildOperationRegistry(model);
      const groups = deriveCryptoGroups(model);
      expect(groups.every((group) => group.kind !== 'unknown')).toBe(true);
      for (const equation of model.equations) {
        expect(registry.lookup(equation.destructor)).toBeDefined();
      }
    }
  });
});
