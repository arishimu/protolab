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

// 合成夹具：源码里未建模 `free` 声明，故 out 侧的裸标识符是名字，in 侧的裸标识符是模式变量。
// 这正是「结构可确定」与「不可确定」的分界：元组 / 构造子应用 / 等值模式有区分力，裸变量没有。

const DETERMINATE = `
free c: channel.

let roleA = out(c, (n1, n2)); in(c, (n3, n4)).
let roleB = in(c, (x, y)); out(c, (n3, n4)).

process roleA | roleB.
`;

const SAME_SHAPE_AMBIGUOUS = `
free c: channel.

let alpha = out(c, (n1, n2)).
let beta = out(c, (n3, n4)).
let gamma = in(c, (x, y)).

process alpha | beta | gamma.
`;

const BARE_VARIABLE_PATTERN = `
free c: channel.

let sender = out(c, (n1, n2)).
let receiver = in(c, anything).

process sender | receiver.
`;

const CHANNEL_MISMATCH = `
free c1: channel.
free c2: channel.

let sender = out(c1, (n1, n2)).
let receiver = in(c2, (x, y)).

process sender | receiver.
`;

describe('pairSteps：结构可确定时产出连线', () => {
  it('两个角色各发一条结构可唯一确定的元组消息 → 两条双向连线', () => {
    expect(pairingKeys(DETERMINATE)).toEqual(['0:0->1:0', '1:1->0:1']);
  });

  it('构造子应用按形状与名字匹配：senc(n1,k) 对上 senc(m,k)', () => {
    const source = `
      free c: channel.
      let sender = out(c, senc(n1, k)).
      let receiver = in(c, senc(m, k)).
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

describe('pairSteps：歧义 / 无法确定时不连（零误配）', () => {
  it('同一形状的两个 out 争一个 in → 双向不唯一，整条丢弃', () => {
    expect(pairingKeys(SAME_SHAPE_AMBIGUOUS)).toEqual([]);
  });

  it('in 是裸变量（收到任何消息都成立）→ 不可确定，永远不连', () => {
    expect(pairingKeys(BARE_VARIABLE_PATTERN)).toEqual([]);
  });

  it('信道不同 → 同一角色间的收发不成立', () => {
    expect(pairingKeys(CHANNEL_MISMATCH)).toEqual([]);
  });

  it('自己角色内的 out / in 不与自己配对', () => {
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

describe('pairSteps：四个真实 fixture 的保守画像（全部零边）', () => {
  // Dolev-Yao 公共信道下，四样例的接收模式要么是裸变量（收到任何消息都成立），要么彼此同形
  // 争抢同一条 out；本引擎据此判定「不可确定」，产出零条边——这是预期而非缺陷。
  // 若将来为真实例补上结构不同的 in 模式，这里的断言应改为经人工核实的正确边。
  const expectedZeroEdgeSamples = coreSamples.map((sample) => ({
    id: sample.id,
    pvFile: sample.pvFile,
  }));

  for (const sample of expectedZeroEdgeSamples) {
    it(`${sample.id}：零条跨泳道连线`, () => {
      expect(pairingKeys(readFixture(sample.pvFile))).toEqual([]);
    });
  }
});
