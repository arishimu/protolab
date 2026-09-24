import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, parsePv } from '@pv-lens/core';
import type { PvTerm } from '@pv-lens/core';

// 本测试文件位于 packages/core/test/，fixtures 位于 packages/core/fixtures/。
const coreDir = fileURLToPath(new URL('..', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

// 期望的词项结构直接按 fixture 原文手写（独立真源）：text 为源码原文切片。
const name = (n: string): PvTerm => ({ kind: 'name', name: n, text: n });
// 类型标注的原文写法各样例不一（handshake 写 `x:bitstring`，ns 写 `x: host`），故允许显式给出 text。
const variable = (n: string, typeName?: string, text?: string): PvTerm =>
  typeName
    ? { kind: 'variable', name: n, typeName, text: text ?? `${n}:${typeName}` }
    : { kind: 'variable', name: n, text: n };
const apply = (functor: string, args: PvTerm[], text: string): PvTerm => ({
  kind: 'application',
  functor,
  args,
  text,
});
const tuple = (items: PvTerm[], text: string): PvTerm => ({ kind: 'tuple', items, text });
const equality = (term: PvTerm, text: string): PvTerm => ({ kind: 'equality', term, text });

describe('Seam A：hello.pv（无命名进程的内联主进程）', () => {
  const model = parsePv(readFixture('pv/hello.pv'));

  it('不崩溃：没有命名角色，主进程作为伪角色产出', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
    expect(model.roles).toEqual([]);
    expect(model.mainProcess).not.toBeNull();
    expect(model.mainProcess?.name).toBe('main');
    expect(model.mainProcess?.parameters).toEqual([]);
    expect(model.mainProcess?.replicated).toBe(false);
    expect(model.mainProcess?.parallel).toBe(false);
  });

  it('主进程只有一条消息步骤：out(c, RSA)', () => {
    const steps = model.mainProcess?.steps ?? [];
    expect(steps.map((s) => s.direction)).toEqual(['out']);
    expect(steps[0].channel).toEqual(name('c'));
    expect(steps[0].term).toEqual(name('RSA'));
    expect(steps[0].annotations).toEqual({
      freshNames: [],
      events: [],
      guards: [],
      replicated: false,
      parallel: false,
    });
  });

  it('两条保密性查询按用户原文保留', () => {
    expect(model.queries.map((q) => q.text)).toEqual(['attacker(RSA)', 'attacker(Cocks)']);
    expect(model.queries.map((q) => q.variables)).toEqual([[], []]);
  });

  it('声明区（free / query）宽容解析，不产生任何诊断', () => {
    expect(model.diagnostics).toEqual([]);
  });
});

describe('Seam A：handshake-fixed.pv 黄金断言（握手级子集）', () => {
  const model = parsePv(readFixture('pv/handshake-fixed.pv'));

  it('声明区（type / fun / reduc / free / event）宽容解析：无任何诊断', () => {
    expect(model.diagnostics).toEqual([]);
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
  });

  it('角色集为 clientA / serverB，带展示用参数与类型', () => {
    expect(model.roles.map((r) => r.name)).toEqual(['clientA', 'serverB']);
    expect(model.roles[0].parameters).toEqual([
      { name: 'pkA', typeName: 'pkey' },
      { name: 'skA', typeName: 'skey' },
      { name: 'pkB', typeName: 'spkey' },
    ]);
    expect(model.roles[1].parameters).toEqual([
      { name: 'pkB', typeName: 'spkey' },
      { name: 'skB', typeName: 'sskey' },
      { name: 'pkA', typeName: 'pkey' },
    ]);
  });

  it('查询列表按用户原文保留（3 条：1 条保密性 + 2 条事件对应性）', () => {
    expect(model.queries.map((q) => q.text)).toEqual([
      'attacker(s)',
      'event(termClient(x,y))==>event(acceptsServer(x,y))',
      'inj-event(termServer(x))==>inj-event(acceptsClient(x))',
    ]);
    expect(model.queries.map((q) => q.variables)).toEqual([[], ['x', 'y'], ['x']]);
    expect(model.queries.map((q) => q.span.start.line)).toEqual([34, 41, 42]);
  });

  it('clientA：三条步骤（out / in / out），方向、信道、词项、事件标注正确', () => {
    const [clientA] = model.roles;
    expect(clientA.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['out', 45],
      ['in', 46],
      ['out', 50],
    ]);
    expect(clientA.steps.map((s) => s.channel)).toEqual([name('c'), name('c'), name('c')]);
    expect(clientA.steps.map((s) => s.term)).toEqual([
      variable('pkA'),
      variable('x', 'bitstring'),
      apply('senc', [name('s'), variable('k')], 'senc(s,k)'),
    ]);
  });

  it('clientA：事件标注（acceptsClient 在前、termClient 在尾部）、let 等值模式作守卫注释', () => {
    const [clientA] = model.roles;
    const [first, second, third] = clientA.steps;
    expect(first.annotations.events).toEqual([]);
    expect(second.annotations.events).toEqual([]);
    expect(third.annotations.events.map((e) => [e.name, e.text, e.placement])).toEqual([
      ['acceptsClient', 'acceptsClient(k)', 'before'],
      ['termClient', 'termClient(k,pkA)', 'after'],
    ]);
    expect(third.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['let-pattern', '(=pkA,=pkB,k:key)', 'before'],
    ]);
    expect(first.annotations.guards).toEqual([]);
    expect(third.annotations.freshNames).toEqual([]);
  });

  it('serverB：三条步骤，`new k:key` 标在包含它的那条步骤上', () => {
    const [, serverB] = model.roles;
    expect(serverB.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 54],
      ['out', 57],
      ['in', 58],
    ]);
    const [first, second, third] = serverB.steps;
    expect(first.term).toEqual(variable('pkX', 'pkey'));
    expect(first.annotations.freshNames).toEqual([]);
    expect(second.annotations.freshNames.map((f) => [f.name, f.typeName, f.text])).toEqual([
      ['k', 'key', 'new k:key'],
    ]);
    expect(second.annotations.events.map((e) => [e.name, e.text, e.placement])).toEqual([
      ['acceptsServer', 'acceptsServer(k,pkX)', 'before'],
    ]);
    expect(second.term).toEqual(
      apply(
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
      ),
    );
    expect(third.term).toEqual(variable('x', 'bitstring'));
    expect(third.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'pkX = pkA', 'after'],
    ]);
    expect(third.annotations.events.map((e) => [e.name, e.placement])).toEqual([['termServer', 'after']]);
  });

  it('两个角色都被主进程以 `!` 复制、且处于 `|` 并行组合中（每条步骤同样带上这两个标注）', () => {
    expect(model.roles.map((r) => [r.replicated, r.parallel])).toEqual([
      [true, true],
      [true, true],
    ]);
    for (const role of model.roles) {
      for (const step of role.steps) {
        expect([step.annotations.replicated, step.annotations.parallel], role.name).toEqual([true, true]);
      }
    }
  });

  it('主进程伪角色：两条 out（密钥注册）作为步骤，不混进 roles', () => {
    expect(model.mainProcess?.name).toBe('main');
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['out', 65],
      ['out', 66],
    ]);
    expect(model.mainProcess?.steps[0].term).toEqual(variable('pkA'));
    expect(model.mainProcess?.steps[0].annotations.freshNames.map((f) => [f.name, f.typeName])).toEqual([
      ['skA', 'skey'],
      ['skB', 'sskey'],
    ]);
    expect(model.mainProcess?.steps[1].term).toEqual(variable('pkB'));
    expect(model.mainProcess?.steps[1].annotations.freshNames).toEqual([]);
  });
});

describe('Seam A：ns-mutual-auth.pv 黄金断言（NS 级子集）', () => {
  const model = parsePv(readFixture('pv/ns-mutual-auth.pv'));

  it('四角色按源码顺序建模，参数含无参的 processK；无任何诊断（v2 无降级）', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
    expect(model.diagnostics).toEqual([]);
    expect(model.roles.map((r) => r.name)).toEqual([
      'processInitiator',
      'processResponder',
      'processS',
      'processK',
    ]);
    expect(model.roles.map((r) => r.parameters)).toEqual([
      [
        { name: 'pkS', typeName: 'spkey' },
        { name: 'skA', typeName: 'skey' },
        { name: 'skB', typeName: 'skey' },
      ],
      [
        { name: 'pkS', typeName: 'spkey' },
        { name: 'skA', typeName: 'skey' },
        { name: 'skB', typeName: 'skey' },
      ],
      [{ name: 'skS', typeName: 'sskey' }],
      [],
    ]);
  });

  it('processInitiator：6 条步骤（in/out/...），含 `let (=Na, ...)` 等值模式守卫与两个事件', () => {
    const [initiator] = model.roles;
    expect(initiator.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 71],
      ['out', 77],
      ['in', 79],
      ['out', 84],
      ['in', 86],
      ['out', 92],
    ]);
    expect(initiator.steps.map((s) => s.term)).toEqual([
      tuple(
        [variable('xA', 'host', 'xA: host'), variable('hostX', 'host', 'hostX: host')],
        '(xA: host, hostX: host)',
      ),
      tuple([variable('xA'), variable('hostX')], '(xA, hostX)'),
      variable('ms', 'bitstring', 'ms: bitstring'),
      variable('m3'),
      variable('m', 'bitstring', 'm: bitstring'),
      tuple(
        [variable('m7'), apply('messtermI', [variable('xA'), variable('hostX')], 'messtermI(xA, hostX)')],
        '(m7, messtermI(xA, hostX))',
      ),
    ]);

    const [first, second, third, fourth, fifth, sixth] = initiator.steps;
    expect(first.annotations.guards).toEqual([]);
    expect(second.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'xA = A || xA = B', 'before'],
    ]);
    expect(fourth.annotations.freshNames.map((f) => [f.name, f.text])).toEqual([['Na', 'new Na: nonce']]);
    expect(fourth.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['let-pattern', '(pkX: pkey, =hostX)', 'before'],
    ]);
    expect(fifth.annotations.guards).toEqual([]);
    expect(sixth.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['let-pattern', '(=Na, NX2: nonce, =hostX)', 'before'],
    ]);
    expect(sixth.annotations.events.map((e) => [e.name, e.text, e.placement])).toEqual([
      ['termI', 'termI(xA, hostX, (m3, m))', 'before'],
      ['acceptsI', 'acceptsI(xA, hostX, (m3, m, m7))', 'before'],
    ]);
    expect(third.annotations.freshNames).toEqual([]);
  });

  it('processResponder：7 条步骤，`new Nb` 与 `if` 守卫都挂在正确的步骤上', () => {
    const [, responder] = model.roles;
    expect(responder.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 98],
      ['in', 104],
      ['out', 107],
      ['in', 109],
      ['out', 115],
      ['in', 117],
      ['out', 120],
    ]);
    const [, second, , , fifth, , seventh] = responder.steps;
    expect(second.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'xB = A || xB = B', 'before'],
    ]);
    expect(fifth.annotations.freshNames.map((f) => [f.name, f.text])).toEqual([['Nb', 'new Nb: nonce']]);
    expect(fifth.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['let-pattern', '(pkY: pkey,=hostY)', 'before'],
    ]);
    expect(fifth.annotations.events.map((e) => [e.name, e.placement])).toEqual([['acceptsR', 'before']]);
    expect(seventh.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'nonce_to_bitstring(Nb) = decrypt(m3, skB)', 'before'],
    ]);
    expect(seventh.annotations.events.map((e) => [e.name, e.placement])).toEqual([['termR', 'before']]);
    expect(seventh.term).toEqual(
      apply('messtermR', [variable('hostY'), variable('xB')], 'messtermR(hostY, xB)'),
    );
  });

  it('processS：`get keys(=b, sb) in out(...)` 展开为 in、out 两步，get 作 out 前的注释', () => {
    const [, , server] = model.roles;
    expect(server.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 124],
      ['out', 126],
    ]);
    expect(server.steps[0].term).toEqual(
      tuple([variable('a', 'host', 'a: host'), variable('b', 'host', 'b: host')], '(a: host, b: host)'),
    );
    expect(server.steps[0].annotations.guards).toEqual([]);
    expect(server.steps[1].annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['get', 'keys(=b, sb)', 'before'],
    ]);
    // `get` 模式里的 `sb` 进入变量作用域 ⇒ 后续 out 里的 `sb` 是变量；`=b` 里的 `b` 仍是被接收的变量。
    expect(server.steps[1].term).toEqual(
      apply('sign', [tuple([variable('sb'), variable('b')], '(sb,b)'), variable('skS')], 'sign((sb,b),skS)'),
    );
  });

  it('processK：无参命名进程建模为角色，1 条 in 步骤，if 与 insert 作尾部注释', () => {
    const [, , , keyRegistration] = model.roles;
    expect(keyRegistration.parameters).toEqual([]);
    expect(keyRegistration.steps.map((s) => [s.direction, s.span.start.line])).toEqual([['in', 130]]);
    expect(keyRegistration.steps[0].term).toEqual(
      tuple([variable('h', 'host', 'h: host'), variable('k', 'pkey', 'k: pkey')], '(h: host, k: pkey)'),
    );
    expect(keyRegistration.steps[0].annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'h <> A && h <> B', 'after'],
      ['insert', 'keys(h,k)', 'after'],
    ]);
  });

  it('主进程：3 条 out（pkA/pkB/pkS），各自带 new/let 标注与 insert 注释，序列不被打断', () => {
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['out', 135],
      ['out', 136],
      ['out', 137],
    ]);
    expect(model.mainProcess?.steps.map((s) => s.term)).toEqual([
      variable('pkA'),
      variable('pkB'),
      variable('pkS'),
    ]);
    expect(model.mainProcess?.steps.map((s) => s.annotations.freshNames.map((f) => [f.name, f.typeName, f.text]))).toEqual([
      [['skA', 'skey', 'new skA: skey']],
      [['skB', 'skey', 'new skB: skey']],
      [['skS', 'sskey', 'new skS: sskey']],
    ]);
    expect(model.mainProcess?.steps.map((s) => s.annotations.guards.map((g) => [g.kind, g.text, g.placement]))).toEqual([
      [],
      [['insert', 'keys(A, pkA)', 'before']],
      [['insert', 'keys(B, pkB)', 'before']],
    ]);
  });

  it('两条查询原文按用户写法保留（含变量声明前缀的变量名）', () => {
    expect(model.queries.map((q) => q.text)).toEqual([
      'inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m))',
      'inj-event(termR(A,x,m)) ==> inj-event(acceptsI(A,x,m))',
    ]);
    expect(model.queries.map((q) => q.variables)).toEqual([
      ['x', 'm'],
      ['x', 'm'],
    ]);
    expect(model.queries.map((q) => q.span.start.line)).toEqual([60, 62]);
  });
});

describe('Seam A：ns-original.pv 黄金断言（NS 级子集，不回退）', () => {
  const model = parsePv(readFixture('pv/ns-original.pv'));

  it('无任何诊断（v2 已无降级）', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
    expect(model.diagnostics).toEqual([]);
  });

  it('两角色 processA / processB，步骤序列与 v1 一致', () => {
    expect(model.roles.map((r) => r.name)).toEqual(['processA', 'processB']);
    expect(model.roles.map((r) => r.parameters)).toEqual([
      [
        { name: 'pkB', typeName: 'pkey' },
        { name: 'skA', typeName: 'skey' },
      ],
      [
        { name: 'pkA', typeName: 'pkey' },
        { name: 'skB', typeName: 'skey' },
      ],
    ]);
    const [alice, bob] = model.roles;
    expect(alice.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 42],
      ['out', 45],
      ['in', 46],
      ['out', 48],
      ['out', 51],
      ['out', 52],
    ]);
    expect(bob.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 56],
      ['out', 60],
      ['in', 61],
      ['out', 65],
      ['out', 66],
    ]);
  });

  it('processA：`new Na` 与 `event beginBparam` 挂在该步骤、等值模式 `let` 仍为守卫注释原文', () => {
    const [alice] = model.roles;
    const [first, second, third, fourth] = alice.steps;
    expect(first.annotations.events).toEqual([]);
    expect(second.annotations.freshNames.map((f) => [f.name, f.text])).toEqual([['Na', 'new Na: bitstring']]);
    expect(second.annotations.events.map((e) => [e.name, e.text, e.placement])).toEqual([
      ['beginBparam', 'beginBparam(pkX)', 'before'],
    ]);
    expect(second.term).toEqual(
      apply(
        'aenc',
        [tuple([variable('Na'), apply('pk', [variable('skA')], 'pk(skA)')], '(Na, pk(skA))'), variable('pkX')],
        'aenc((Na, pk(skA)), pkX)',
      ),
    );
    // `let (=Na, NX: bitstring) = adec(m, skA) in` 的等值模式：v2 仍以 let-pattern 原文保留。
    expect(third.annotations.guards).toEqual([]);
    expect(fourth.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['let-pattern', '(=Na, NX: bitstring)', 'before'],
    ]);
    expect(fourth.term).toEqual(apply('aenc', [variable('NX'), variable('pkX')], 'aenc(NX, pkX)'));
    expect(alice.steps[4].annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'pkX = pkB', 'before'],
    ]);
    expect(alice.steps[4].annotations.events.map((e) => [e.name, e.placement])).toEqual([
      ['endAparam', 'before'],
    ]);
    expect(alice.steps[5].annotations.guards).toEqual([]);
  });

  it('processB：两个嵌套 if 的条件按源码顺序挂在同一条 out 上', () => {
    const [, bob] = model.roles;
    const fourth = bob.steps[3];
    expect(fourth.span.start.line).toBe(65);
    expect(fourth.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['if', 'Nb = adec(m3, skB)', 'before'],
      ['if', 'pkY = pkA', 'before'],
    ]);
    expect(fourth.annotations.events.map((e) => [e.name, e.placement])).toEqual([['endBparam', 'before']]);
    expect(fourth.term).toEqual(apply('senc', [name('secretBNa'), variable('NY')], 'senc(secretBNa, NY)'));
    expect(bob.steps[4].annotations.guards).toEqual([]);
  });

  it('六条查询原文保留（2 条 inj-event + 一条 `;` 分隔的 4 条 attacker）', () => {
    expect(model.queries.map((q) => q.text)).toEqual([
      'inj-event(endBparam(x)) ==> inj-event(beginBparam(x))',
      'inj-event(endAparam(x)) ==> inj-event(beginAparam(x))',
      'attacker(secretANa)',
      'attacker(secretANb)',
      'attacker(secretBNa)',
      'attacker(secretBNb)',
    ]);
    expect(model.queries.map((q) => q.variables)).toEqual([['x'], ['x'], [], [], [], []]);
    expect(model.queries.map((q) => q.span.start.line)).toEqual([29, 30, 35, 36, 37, 38]);
  });

  it('主进程两条 out（密钥注册）作为伪角色，不混进 roles', () => {
    expect(model.mainProcess?.name).toBe('main');
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['out', 70],
      ['out', 71],
    ]);
    expect(model.mainProcess?.steps[0].annotations.freshNames.map((f) => [f.name, f.text])).toEqual([
      ['skA', 'new skA: skey'],
    ]);
    expect(model.mainProcess?.steps[1].term).toEqual(variable('pkB'));
  });
});

describe('Seam A：等值模式 `=M` 结构化（PvTerm equality）', () => {
  const model = parsePv(
    ['free c: channel.', 'process', '  in(c, (=Na, x: bitstring));', '  out(c, Na).'].join('\n'),
  );

  it('`=M` 解析为 equality 词项（保留 M 的结构与原文），不再降级', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
    expect(model.diagnostics).toEqual([]);
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 3],
      ['out', 4],
    ]);
    expect(model.mainProcess?.steps[0].term).toEqual(
      tuple([equality(name('Na'), '=Na'), variable('x', 'bitstring', 'x: bitstring')], '(=Na, x: bitstring)'),
    );
    // `=Na` 不绑定 `Na`：后续 out 里的 `Na` 仍是名字词项。
    expect(model.mainProcess?.steps[1].term).toEqual(name('Na'));
  });
});

describe('Seam A：`get ... in P else Q` 与 `if` 同构（else 分支也线性展开）', () => {
  const model = parsePv(
    [
      'free c: channel.',
      'process',
      '  in(c, b: host);',
      '  get keys(b, k) in out(c, sign(k)) else out(c, Na).',
    ].join('\n'),
  );

  it('两分支的消息步都进序列，且都带同一条 get 模式注释（不报 error、不降级）', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(false);
    expect(model.diagnostics).toEqual([]);
    const steps = model.mainProcess?.steps ?? [];
    expect(steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 3],
      ['out', 4],
      ['out', 4],
    ]);
    // `get` 模式里的 `k` 进入变量作用域 ⇒ in 分支里的 `sign(k)` 中 `k` 是变量。
    expect(steps[1].term).toEqual(apply('sign', [variable('k')], 'sign(k)'));
    expect(steps[2].term).toEqual(name('Na'));
    for (const step of steps.slice(1)) {
      expect(step.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
        ['get', 'keys(b, k)', 'before'],
      ]);
    }
  });
});

describe('Seam A：降级诊断（v2 仍不支持的语法）', () => {
  // 行号真源：
  //  3 let topLevel = pk(sk).          顶层词项绑定（不是命名进程定义）
  //  9 phase 1;                        v2 不支持 phase
  // 10 choice [a, b] 0;                v2 不支持 choice
  // 11 not attacker(Na).               v2 不支持进程内 `not`
  // 对照组（v2 已支持，不再降级）：7 的 insert 作注释、14 的 if/else 两分支都展开。
  const source = [
    'free c: channel.',
    'fun pk(skey): pkey.',
    'let topLevel = pk(sk).',
    '',
    'let server0(pkA: pkey) =',
    '  in(c, pkX: pkey);',
    '  insert keys(pkX, pkA);',
    '  out(c, pkX);',
    '  phase 1;',
    '  choice [a, b] 0;',
    '  not attacker(Na).',
    '',
    'let client0() =',
    '  if pkX = pkA then out(c, Na) else out(c, Nb).',
    '',
    'process',
    '  out(c, pk(sk)).',
  ].join('\n');

  const model = parsePv(source);

  it('全部是 degraded（不是 error），绝不抛异常', () => {
    expect(model.hasErrors).toBe(false);
    expect(model.hasDegraded).toBe(true);
    expect(model.diagnostics.map((d) => d.severity)).toEqual([
      'degraded',
      'degraded',
      'degraded',
      'degraded',
    ]);
  });

  it('每条降级诊断都带源码 span（行/列）与原文片段', () => {
    expect(model.diagnostics.map((d) => [d.span.start.line, d.span.start.column])).toEqual([
      [3, 1],
      [9, 3],
      [10, 3],
      [11, 3],
    ]);
    expect(model.diagnostics.map((d) => d.sourceText)).toEqual([
      'let topLevel = pk(sk).',
      'phase 1',
      'choice [a, b] 0',
      'not attacker(Na)',
    ]);
    for (const diagnostic of model.diagnostics) {
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it('降级之处以外的结构仍完整解析：insert 注释与 if/else 展开都不丢步骤', () => {
    expect(model.roles.map((r) => r.name)).toEqual(['server0', 'client0']);
    expect(model.roles[0].steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 6],
      ['out', 8],
    ]);
    expect(model.roles[0].steps[1].annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
      ['insert', 'keys(pkX, pkA)', 'before'],
    ]);

    // `if ... then out(c, Na) else out(c, Nb)`：两分支的消息步都进序列，且都带同一条 if 条件原文。
    expect(model.roles[1].steps.map((s) => [s.direction, s.span.start.line, s.term])).toEqual([
      ['out', 14, name('Na')],
      ['out', 14, name('Nb')],
    ]);
    for (const step of model.roles[1].steps) {
      expect(step.annotations.guards.map((g) => [g.kind, g.text, g.placement])).toEqual([
        ['if', 'pkX = pkA', 'before'],
      ]);
    }

    expect(model.mainProcess?.steps.map((s) => s.span.start.line)).toEqual([17]);
    expect(model.mainProcess?.steps[0].term).toEqual(apply('pk', [name('sk')], 'pk(sk)'));
  });
});

describe('Seam A：语法错误（带 span 的中文报错，不抛异常）', () => {
  it('out 缺少词项：一条 error 诊断，带上定位，后续语句仍被解析', () => {
    const source = ['free c: channel.', 'process', '  out(c, ).', '  in(c, x);', '  0'].join('\n');
    const model = parsePv(source);

    expect(model.hasErrors).toBe(true);
    expect(model.diagnostics).toHaveLength(1);
    const [diagnostic] = model.diagnostics;
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('期望词项');
    expect([diagnostic.span.start.line, diagnostic.span.start.column]).toEqual([3, 10]);
    expect(diagnostic.sourceText).toBe(')');
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([['in', 4]]);
  });

  it('out 缺少结尾的 `)`：一条 error 诊断指向那个 `(`', () => {
    const source = [
      'free c: channel.',
      'let client0(pkA: pkey) =',
      '  out(c, pkA;',
      '  in(c, x).',
      'process',
      '  !client0(pkA).',
    ].join('\n');
    const model = parsePv(source);

    expect(model.diagnostics).toHaveLength(1);
    const [diagnostic] = model.diagnostics;
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('缺少结尾的 `)`');
    expect([diagnostic.span.start.line, diagnostic.span.start.column]).toEqual([3, 6]);
    expect(diagnostic.sourceText).toBe('(');
    // 坏语句被跳过，但它后面的 `in` 与主进程的 `!client0(...)` 仍被解析。
    expect(model.roles[0].steps.map((s) => [s.direction, s.span.start.line])).toEqual([['in', 4]]);
    expect(model.roles[0].replicated).toBe(true);
  });

  it('括号未闭合：error 诊断指向那个 `(`，已解析的步骤都保留', () => {
    const source = ['free c: channel.', 'process', '  in(c, x);', '  (out(c, Na)'].join('\n');
    const model = parsePv(source);

    expect(model.diagnostics).toHaveLength(1);
    const [diagnostic] = model.diagnostics;
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('配对的 `)`');
    expect([diagnostic.span.start.line, diagnostic.span.start.column]).toEqual([4, 3]);
    expect(diagnostic.sourceText).toBe('(');
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 3],
      ['out', 4],
    ]);
  });

  it('声明缺少结尾的 `.`：error 诊断吃掉该声明但不吞掉 `process`', () => {
    const source = ['free c: channel', 'process', '  out(c, Na).'].join('\n');
    const model = parsePv(source);

    expect(model.diagnostics).toHaveLength(1);
    const [diagnostic] = model.diagnostics;
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('缺少结尾的 `.`');
    expect([diagnostic.span.start.line, diagnostic.span.start.column]).toEqual([1, 1]);
    expect(diagnostic.sourceText).toBe('free c: channel');
    expect(model.mainProcess?.steps.map((s) => s.span.start.line)).toEqual([3]);
  });

  it('注释 `(*` 未闭合：词法层报 error，其余结构照常产出', () => {
    const source = ['process', '  out(c, Na).', '(* 未闭合'].join('\n');
    const model = parsePv(source);

    expect(model.diagnostics).toHaveLength(1);
    expect(model.diagnostics[0].severity).toBe('error');
    expect(model.diagnostics[0].message).toContain('未闭合');
    expect(model.diagnostics[0].span.start.line).toBe(3);
    expect(model.diagnostics[0].sourceText).toBe('(* 未闭合');
    expect(model.mainProcess?.steps.map((s) => s.span.start.line)).toEqual([2]);
  });

  it('语句之间缺少 `;`：报 error，但两侧语句都保留', () => {
    const source = ['free c: channel.', 'process', '  out(c, Na)', '  in(c, x).'].join('\n');
    const model = parsePv(source);

    expect(model.diagnostics).toHaveLength(1);
    const [diagnostic] = model.diagnostics;
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('缺少 `;`');
    expect([diagnostic.span.start.line, diagnostic.span.start.column]).toEqual([4, 3]);
    expect(model.mainProcess?.steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['out', 3],
      ['in', 4],
    ]);
  });
});

describe('Seam A：四个内置样例的鲁棒性（解析不了的语法降级而不可报错）', () => {
  for (const sample of coreSamples) {
    it(`${sample.id}：不抛异常、无语法错误，且查询条数与录制的 RESULT 条数一致`, () => {
      const model = parsePv(readFixture(sample.pvFile));

      expect(model.hasErrors, sample.id).toBe(false);
      expect(model.roles.length + (model.mainProcess === null ? 0 : 1), sample.id).toBeGreaterThan(0);
      // 交叉校验：解析出的查询条数 == 录制 stdout 里该样例的 RESULT 条数。
      expect(model.queries.length, sample.id).toBe(sample.expectedVerdicts.length);
    });
  }

  // v2 的降级画像：四个内置样例都已被完整建模，不再产生任何降级（v1 时 ns-mutual-auth 有 4 条：
  // 1×get + 2×insert + 1×无参顶层 let）。这不是实现细节——它直接决定渲染层在每个样例上
  // 会看到多少条原文标注卡片，也是「解析不了的语法降级而不报错」这条验收项在真实样例上的口径。
  const degradedCountBySample: Record<string, number> = {
    hello: 0,
    'handshake-fixed': 0,
    'ns-mutual-auth': 0,
    'ns-original': 0,
  };

  for (const sample of coreSamples) {
    it(`${sample.id}：降级条数与 v2 画像一致，且全部是 degraded 不是 error`, () => {
      const model = parsePv(readFixture(sample.pvFile));
      const degraded = model.diagnostics.filter((d) => d.severity === 'degraded');
      expect(degraded, sample.id).toHaveLength(degradedCountBySample[sample.id] ?? -1);
      expect(model.hasDegraded, sample.id).toBe(degraded.length > 0);
      expect(model.diagnostics.every((d) => d.severity === 'degraded'), sample.id).toBe(true);
    });
  }
});
