import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { coreSamples, getSampleSource } from '@pv-lens/core';
import { PROVERIF_PATH_ENV, runProverif } from '../src/index.js';

// 可选的真实 ProVerif 集成冒烟：本机没装 proverif（或路径不可执行）时整组 skip，
// 故干净环境 / CI 不受影响（stub 分支已由 proverif-adapter.test.ts 覆盖）。
const executablePath = process.env[PROVERIF_PATH_ENV] ?? 'proverif';
const probe = spawnSync(executablePath, ['-help'], { stdio: 'ignore' });
const hasProverif = probe.error === undefined;

describe.skipIf(!hasProverif)(`真实 ProVerif 集成冒烟（${executablePath}）`, () => {
  for (const sample of coreSamples) {
    it(`${sample.id}：真实 spawn 一次，判定与 expectedVerdicts 一致`, async () => {
      const result = await runProverif(getSampleSource(sample.id) ?? '', {
        executablePath,
        timeoutMs: 30_000,
      });
      expect(result.ok, `run 失败：${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) return;

      expect(result.results.map((r) => ({ query: r.query, verdict: r.verdict }))).toEqual([
        ...sample.expectedVerdicts,
      ]);
      expect(result.stdout).toContain('RESULT ');
    });
  }

  it('ns-original：真实输出的 Lowe 攻击反例 trace 被完整捕获', async () => {
    const result = await runProverif(getSampleSource('ns-original') ?? '', {
      executablePath,
      timeoutMs: 30_000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lowe = result.results[0];
    expect(lowe?.verdict).toBe('false');
    expect(lowe?.counterexampleTrace).toContain('A trace has been found.');
    expect(lowe?.counterexampleTrace).toContain('event endBparam(pk(skB_2)) at {30} in copy a_2 (goal)');
  });

  it('模型自身语法错误 → proverif-error（带 stdout 与退出码）', async () => {
    const result = await runProverif('free c: channel.\nquery secrecy: s.\n', {
      executablePath,
      timeoutMs: 30_000,
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'proverif-error') {
      throw new Error(`期望 proverif-error，实际 ${JSON.stringify(result)}`);
    }
    expect(result.stdout).toContain('Error');
    expect(result.exitCode).not.toBe(0);
  });
});
