import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, narrativeRoleOrder, pairSteps, parsePv } from '@pv-lens/core';

// 本测试文件位于 packages/core/test/，fixtures 位于 packages/core/fixtures/。
const coreDir = fileURLToPath(new URL('..', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

/** 把配对结果压成 `outRole:outStep->inRole:inStep` 形式，便于黄金断言。 */
function pairingKeys(source: string): string[] {
  return pairSteps(parsePv(source)).map(
    (pairing) =>
      `${pairing.from.roleIndex}:${pairing.from.stepIndex}->${pairing.to.roleIndex}:${pairing.to.stepIndex}`,
  );
}

// 意图配对（ADR-0003）：连线表达「设计上这条 out 发给这条 in」，类型 + 顺序，只服务两方协议。

describe('pairSteps：类型确定的两方协议产出连线', () => {
  it('类型兼容的形状匹配 → 连线', () => {
    const source = `
      type skey. type pkey. type bitstring.
      fun pk(skey): pkey.
      fun aenc(bitstring, pkey): bitstring.
      free c: channel.
      let alice = out(c, aenc(secret, pkB)).
      let bob(pkB: pkey) = in(c, m: bitstring).
      process alice | bob(pk(skB)).
    `;
    // alice.out 的 aenc 返回 bitstring，bob.in 是 m: bitstring → 兼容。
    expect(pairingKeys(source)).toEqual(['0:0->1:0']);
  });

  it('两侧都无类型标注时按形状通配匹配（裸变量接收也连）', () => {
    const source = `
      free c: channel.
      let sender = out(c, (n1, n2)).
      let receiver = in(c, anything).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual(['0:0->1:0']);
  });

  it('等值模式 =n1 要求值同名：匹配则连线', () => {
    const source = `
      free c: channel.
      let sender = out(c, (n1, n2)).
      let receiver = in(c, (=n1, y)).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual(['0:0->1:0']);
  });

  it('等值模式 =n9 与发送值 n1 不同名 → 不连（零误配）', () => {
    const source = `
      free c: channel.
      let sender = out(c, (n1, n2)).
      let receiver = in(c, (=n9, y)).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });
});

describe('pairSteps：类型不符 / 缺类型时保守不连', () => {
  it('aenc(...)（bitstring）配到 pkX: pkey 的接收 → 类型不符，不连', () => {
    const source = `
      type skey. type pkey. type bitstring.
      fun pk(skey): pkey.
      fun aenc(bitstring, pkey): bitstring.
      free c: channel.
      let sender = out(c, aenc(n, pkB)).
      let receiver = in(c, pkX: pkey).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });

  it('out 侧取不到类型、in 侧有类型 → 保守不连', () => {
    const source = `
      type bitstring.
      free c: channel.
      let sender = out(c, unknownThing).
      let receiver = in(c, m: bitstring).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });

  it('信道不同 → 不连', () => {
    const source = `
      free c1: channel.
      free c2: channel.
      let sender = out(c1, (n1, n2)).
      let receiver = in(c2, (x, y)).
      process sender | receiver.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });
});

describe('pairSteps：两方协议按源码顺序贪心配对，一对一消费', () => {
  it('同一角色两条同型 out 对两条同型 in → 按源码顺序一一对应，不交叉', () => {
    const source = `
      type bitstring.
      fun pair(bitstring, bitstring): bitstring.
      free c: channel.
      let alice = out(c, pair(a, b)); out(c, pair(c2, d)).
      let bob = in(c, x: bitstring); in(c, y: bitstring).
      process alice | bob.
    `;
    expect(pairingKeys(source)).toEqual(['0:0->1:0', '0:1->1:1']);
  });

  it('同型 out 数多于 in 数 → 只消费最早的几个', () => {
    const source = `
      type bitstring.
      fun pair(bitstring, bitstring): bitstring.
      free c: channel.
      let alice = out(c, pair(a, b)); out(c, pair(c2, d)); out(c, pair(e, f)).
      let bob = in(c, x: bitstring).
      process alice | bob.
    `;
    expect(pairingKeys(source)).toEqual(['0:0->1:0']);
  });
});

describe('pairSteps：非两方协议不自动连线（ADR-0003）', () => {
  it('三条泳道 → 空集（多方消息路由不可静态推断）', () => {
    const source = `
      free c: channel.
      let alpha = out(c, (n1, n2)).
      let beta = in(c, (x, y)).
      let gamma = in(c, (p, q)).
      process alpha | beta | gamma.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });

  it('单角色不与自己配对', () => {
    const source = `
      free c: channel.
      let solo = out(c, (n1, n2)); in(c, (x, y)).
      process solo.
    `;
    expect(pairingKeys(source)).toEqual([]);
  });
});

describe('pairSteps：泳道顺序与主进程伪角色', () => {
  it('hello 无命名角色：泳道退回内联主进程，仅一条 out 无 in → 零边', () => {
    const model = parsePv(readFixture('pv/hello.pv'));
    expect(narrativeRoleOrder(model).map((role) => role.name)).toEqual(['main']);
    expect(pairSteps(model)).toEqual([]);
  });
});

describe('pairSteps：四个真实 fixture 的意图流', () => {
  // 两方教科书写法：源码顺序即消息顺序。类型门槛挡住预共享公钥类的错位。

  it('handshake-fixed：三条教科书连线', () => {
    // clientA.out pkA → serverB.in pkX；clientA.out senc → serverB.in x；
    // serverB.out aenc → clientA.in x。
    expect(pairingKeys(readFixture('pv/handshake-fixed.pv'))).toEqual([
      '0:0->1:0',
      '0:2->1:2',
      '1:1->0:1',
    ]);
  });

  it('ns-original：三条 aenc 消息按序配对，预共享公钥接收不误配', () => {
    // processA.out1 aenc → processB.in m；processA.out2 aenc → processB.in m3；
    // processB.out1 aenc → processA.in m。processA.in pkX(pkey) 不匹配任何 bitstring out。
    expect(pairingKeys(readFixture('pv/ns-original.pv'))).toEqual([
      '0:1->1:0',
      '0:3->1:2',
      '1:1->0:2',
    ]);
  });

  it('ns-mutual-auth：四角色，自动配对关闭 → 零边', () => {
    expect(pairingKeys(readFixture('pv/ns-mutual-auth.pv'))).toEqual([]);
  });

  it('hello：单个主进程，无接收方 → 零边', () => {
    expect(pairingKeys(readFixture('pv/hello.pv'))).toEqual([]);
  });

  it('四样例都仍是两条或以下泳道判定下的确定行为', () => {
    for (const sample of coreSamples) {
      const model = parsePv(readFixture(sample.pvFile));
      const roles = narrativeRoleOrder(model);
      const keys = pairSteps(model).length;
      if (roles.length === 2) expect(keys, sample.id).toBeGreaterThan(0);
      else expect(keys, sample.id).toBe(0);
    }
  });
});
