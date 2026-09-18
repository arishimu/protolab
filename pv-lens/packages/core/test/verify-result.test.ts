import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, parseVerifyStdout } from '@pv-lens/core';

// 本测试文件位于 packages/core/test/，fixtures 位于 packages/core/fixtures/。
const coreDir = fileURLToPath(new URL('..', import.meta.url));

function readFixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

describe('Seam B：stdout → 按查询的结构化验证结果', () => {
  it('四个录制 stdout 的判定与 manifest 的 expectedVerdicts 逐条一致（黄金判定）', () => {
    for (const s of coreSamples) {
      const results = parseVerifyStdout(readFixture(s.stdoutFile));
      expect(
        results.map((r) => ({ query: r.query, verdict: r.verdict })),
        s.stdoutFile,
      ).toEqual([...s.expectedVerdicts]);
    }
  });

  it('按 RESULT 行切段，查询数正确（含一条语句展开成多节的情形）', () => {
    const counts: Record<string, number> = {
      'hello.stdout.txt': 2,
      'handshake-fixed.stdout.txt': 3,
      'ns-mutual-auth.stdout.txt': 2,
      // query not attacker(secretANa[]); ... secretBNb[] 一条语句展开成四节。
      'ns-original.stdout.txt': 6,
    };
    for (const [file, count] of Object.entries(counts)) {
      const results = parseVerifyStdout(readFixture(join('proverif', file)));
      expect(results.length, file).toBe(count);
    }
  });

  it('括号内衍生 RESULT 行不被当成查询（ns-original 的 `RESULT (even ...)`）', () => {
    const stdout = readFixture('proverif/ns-original.stdout.txt');
    // 前提：录制里确实有这行衍生说明。
    expect(stdout).toContain('RESULT (even event(endBparam(x)) ==> event(beginBparam(x)) is false.)');
    const results = parseVerifyStdout(stdout);
    expect(results.every((r) => !r.query.startsWith('('))).toBe(true);
    expect(results.map((r) => r.query)).not.toContain(
      'even event(endBparam(x)) ==> event(beginBparam(x))',
    );
  });

  it('归一化原文原样保留（attacker(x) 在输出中呈现为 not attacker(x)）', () => {
    const hello = parseVerifyStdout(readFixture('proverif/hello.stdout.txt'));
    expect(hello.map((r) => r.query)).toEqual(['not attacker(RSA[])', 'not attacker(Cocks[])']);

    const ns = parseVerifyStdout(readFixture('proverif/ns-original.stdout.txt'));
    expect(ns.map((r) => r.query)).toEqual([
      'inj-event(endBparam(x)) ==> inj-event(beginBparam(x))',
      'inj-event(endAparam(x)) ==> inj-event(beginAparam(x))',
      'not attacker(secretANa[])',
      'not attacker(secretANb[])',
      'not attacker(secretBNa[])',
      'not attacker(secretBNb[])',
    ]);
  });

  it('捕获 goal reachable: 行原文；没有该行的分节为 null', () => {
    const hello = parseVerifyStdout(readFixture('proverif/hello.stdout.txt'));
    expect(hello[0]?.goalReachable).toBe('goal reachable: attacker(RSA[])');
    expect(hello[1]?.goalReachable).toBeNull();

    const handshake = parseVerifyStdout(readFixture('proverif/handshake-fixed.stdout.txt'));
    expect(handshake[1]?.goalReachable).toBe(
      'goal reachable: b-event(acceptsServer(k_2,pk(skA[]))) -> event(termClient(k_2,pk(skA[])))',
    );
  });

  it('证伪节的反例 trace 原文完整捕获（ns-original 的 Lowe 攻击）', () => {
    const results = parseVerifyStdout(readFixture('proverif/ns-original.stdout.txt'));
    const lowe = results[0];
    expect(lowe?.verdict).toBe('false');
    const trace = lowe?.counterexampleTrace ?? '';
    expect(trace.startsWith('Derivation:\n')).toBe(true);
    expect(trace.endsWith('A trace has been found.')).toBe(true);
    // 逐步编号（1. … 15.）整段保留，未被截断。
    expect(trace).toContain('1. The message pk(skB[]) may be sent to the attacker at output {6}.');
    expect(trace).toMatch(
      /^15\. By 14, inj-event\(endBparam\(pk\(skB\[\]\)\),@occ30_1\)\.$/m,
    );
    // 反例的具体攻击序列（Lowe 攻击的对话）与 goal 步骤都在。
    expect(trace).toContain(
      'in(c, aenc((1-proj-2-tuple(adec(~M_2,a)),~M),~M_1)) with aenc((1-proj-2-tuple(adec(~M_2,a)),~M),~M_1) = aenc((Na_2,pk(skA_2)),pk(skB_2)) at {22} in copy a_2',
    );
    expect(trace).toContain('event endBparam(pk(skB_2)) at {30} in copy a_2 (goal)');
    // trace 不含判定行，也不含派生说明行（分节以 RESULT 行收尾）。
    expect(trace).not.toContain('RESULT');
    expect(trace).not.toContain('RESULT (even');
  });

  it('证伪节的反例 trace 原文与录制逐字一致（切片对照，未做任何加工）', () => {
    const stdout = readFixture('proverif/hello.stdout.txt');
    const results = parseVerifyStdout(stdout);
    // 从录制里按分节边界手工切片：`Derivation:` 起、RESULT 行前止。
    const start = stdout.indexOf('Derivation:');
    const end = stdout.indexOf('RESULT not attacker(RSA[]) is false.');
    const expected = stdout.slice(start, end).trimEnd();
    expect(results[0]?.counterexampleTrace).toBe(expected);
  });

  it('成立/未证出的分节没有反例 trace（null，而非空串）', () => {
    const ns = parseVerifyStdout(readFixture('proverif/ns-original.stdout.txt'));
    expect(ns[1]?.counterexampleTrace).toBeNull();
    expect(ns[2]?.counterexampleTrace).toBeNull();
  });

  it('人工构造 fixture：cannot be proved 判定可解析', () => {
    const results = parseVerifyStdout(readFixture('proverif/cannot-be-proved.stdout.txt'));
    expect(results.map((r) => ({ query: r.query, verdict: r.verdict }))).toEqual([
      { query: 'not attacker(s[])', verdict: 'cannot-be-proved' },
      { query: 'not attacker(k[])', verdict: 'true' },
    ]);
    expect(results[0]?.goalReachable).toBe('goal reachable: attacker(s[])');
  });

  it('cannot be proved 的假推导不算反例 trace：即使有 Derivation 段也返回 null', () => {
    // 真实形态：cannot be proved 来自「重复动作近似」，ProVerif 会打印一段推导，
    // 紧接着声明 Could not find a trace corresponding to this derivation.
    // 那不是攻击路径，UI 不得把它当反例 trace 展开（CONTEXT.md「反例 / 攻击 trace」）。
    const stdout = [
      'Starting query not attacker(s[])',
      'goal reachable: attacker(s[])',
      '',
      'Derivation:',
      '',
      '1. The message s[] may be sent to the attacker at output {1}.',
      '',
      'Could not find a trace corresponding to this derivation.',
      'RESULT not attacker(s[]) cannot be proved.',
      '',
    ].join('\n');
    const [only] = parseVerifyStdout(stdout);
    expect(only?.verdict).toBe('cannot-be-proved');
    expect(only?.counterexampleTrace).toBeNull();
  });

  it('兼容 ticket 字面形态 `RESULT <query> is cannot be proved.`', () => {
    const results = parseVerifyStdout(
      'Starting query not attacker(s[])\nRESULT not attacker(s[]) is cannot be proved.\n',
    );
    expect(results).toEqual([
      {
        query: 'not attacker(s[])',
        verdict: 'cannot-be-proved',
        goalReachable: null,
        counterexampleTrace: null,
      },
    ]);
  });

  it('判定只信 RESULT 行：缺 RESULT 的残段不产出结果', () => {
    expect(
      parseVerifyStdout('Starting query not attacker(s[])\nDerivation:\n1. attacker(s[]).\n'),
    ).toEqual([]);
  });

  it('无 RESULT 行（如 proverif 早退且 stdout 为空）→ 空数组', () => {
    expect(parseVerifyStdout('')).toEqual([]);
    expect(parseVerifyStdout('Translating the process into Horn clauses...\nCompleting...\n')).toEqual(
      [],
    );
  });

  it('容忍 CRLF 与行尾空白', () => {
    const results = parseVerifyStdout(
      'Starting query not attacker(s[])  \r\nRESULT not attacker(s[]) is true.  \r\n',
    );
    expect(results).toEqual([
      {
        query: 'not attacker(s[])',
        verdict: 'true',
        goalReachable: null,
        counterexampleTrace: null,
      },
    ]);
  });
});
