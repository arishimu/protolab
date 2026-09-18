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
const variable = (n: string, typeName?: string): PvTerm =>
  typeName
    ? { kind: 'variable', name: n, typeName, text: `${n}:${typeName}` }
    : { kind: 'variable', name: n, text: n };
const apply = (functor: string, args: PvTerm[], text: string): PvTerm => ({
  kind: 'application',
  functor,
  args,
  text,
});
const tuple = (items: PvTerm[], text: string): PvTerm => ({ kind: 'tuple', items, text });

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
            [tuple([variable('pkX'), variable('pkB'), name('k')], '(pkX,pkB,k)'), variable('skB')],
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

describe('Seam A：降级诊断（v1 不支持的语法）', () => {
  // 行号真源：
  //  3 let topLevel = pk(sk).          顶层 let 绑定（v1 只建模带参数列表的命名进程）
  //  7 insert keys(pkX, pkA);          v1 不支持表操作
  // 11 if ... then out else out          v1 只建模 then 分支
  const source = [
    'free c: channel.',
    'fun pk(skey): pkey.',
    'let topLevel = pk(sk).',
    '',
    'let server0(pkA: pkey) =',
    '  in(c, pkX: pkey);',
    '  insert keys(pkX, pkA);',
    '  out(c, pkX).',
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
    expect(model.diagnostics.map((d) => d.severity)).toEqual(['degraded', 'degraded', 'degraded']);
  });

  it('每条降级诊断都带源码 span（行号）与原文片段', () => {
    expect(model.diagnostics.map((d) => [d.span.start.line, d.span.start.column])).toEqual([
      [3, 1],
      [7, 3],
      [11, 37],
    ]);
    expect(model.diagnostics.map((d) => d.sourceText)).toEqual([
      'let topLevel = pk(sk).',
      'insert keys(pkX, pkA)',
      'out(c, Nb)',
    ]);
    for (const diagnostic of model.diagnostics) {
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it('降级之处以外的结构仍完整解析：角色、步骤与主进程都不丢', () => {
    expect(model.roles.map((r) => r.name)).toEqual(['server0', 'client0']);
    expect(model.roles[0].steps.map((s) => [s.direction, s.span.start.line])).toEqual([
      ['in', 6],
      ['out', 8],
    ]);
    expect(model.roles[1].steps.map((s) => [s.direction, s.span.start.line])).toEqual([['out', 11]]);
    expect(model.roles[1].steps[0].term).toEqual(name('Na'));
    expect(model.roles[1].steps[0].annotations.guards.map((g) => [g.kind, g.text])).toEqual([
      ['if', 'pkX = pkA'],
    ]);
    expect(model.mainProcess?.steps.map((s) => s.span.start.line)).toEqual([14]);
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

describe('Seam A：四个内置样例的鲁棒性（v1 未覆盖的语法降级而不可报错）', () => {
  for (const sample of coreSamples) {
    it(`${sample.id}：不抛异常、无语法错误，且查询条数与录制的 RESULT 条数一致`, () => {
      const model = parsePv(readFixture(sample.pvFile));

      expect(model.hasErrors, sample.id).toBe(false);
      expect(model.roles.length + (model.mainProcess === null ? 0 : 1), sample.id).toBeGreaterThan(0);
      // 交叉校验：解析出的查询条数 == 录制 stdout 里该样例的 RESULT 条数。
      expect(model.queries.length, sample.id).toBe(sample.expectedVerdicts.length);
    });
  }

  // v1 的降级画像：把「哪些样例需要 ticket 05 才能完整建模」钉下来。
  // 这不是实现细节——它直接决定渲染层在每个样例上会看到多少条原文标注卡片，
  // 也是「解析不了的语法降级而不报错」这条验收项在真实样例上的口径。
  const degradedCountBySample: Record<string, number> = {
    hello: 0,
    'handshake-fixed': 0,
    'ns-mutual-auth': 4, // 1×get + 2×insert + 1×无参顶层 let（processK 未入模型）
    'ns-original': 0,
  };

  for (const sample of coreSamples) {
    it(`${sample.id}：降级条数与 v1 画像一致，且全部是 degraded 不是 error`, () => {
      const model = parsePv(readFixture(sample.pvFile));
      const degraded = model.diagnostics.filter((d) => d.severity === 'degraded');
      expect(degraded, sample.id).toHaveLength(degradedCountBySample[sample.id] ?? -1);
      expect(model.hasDegraded, sample.id).toBe(degraded.length > 0);
      expect(model.diagnostics.every((d) => d.severity === 'degraded'), sample.id).toBe(true);
    });
  }
});
