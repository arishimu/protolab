import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, getSampleSource } from '@pv-lens/core';
import {
  DEFAULT_PROVERIF_TIMEOUT_MS,
  PROVERIF_PATH_ENV,
  runProverif,
  type ProverifFailureKind,
  type ProverifRunFailure,
  type ProverifRunResult,
} from '../src/index.js';

// 本测试文件位于 packages/server/test/，core 的 fixtures 在 packages/core/fixtures/。
function readCoreFixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../core/fixtures/${rel}`, import.meta.url)), 'utf8');
}

/**
 * 不依赖真实 ProVerif：用临时生成的 stub 可执行文件（node 脚本 + shebang）覆盖
 * 成功 / proverif 报错 / 超时 / 找不到可执行文件 / 取消 五个分支。
 */
const stubRoot = mkdtempSync(join(tmpdir(), 'pv-lens-stub-'));

/** 写一个可执行的 stub：body 为 CommonJS 脚本正文，用 node 解释执行。 */
function writeStub(name: string, body: string): string {
  const path = join(stubRoot, name);
  writeFileSync(path, `#!${process.execPath}\n${body}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

/** 成功 stub：记录收到的模型文件路径与内容，并打印录制的 stdout。 */
function writeSuccessStub(name: string, cannedStdout: string, logPath: string): string {
  return writeStub(
    name,
    [
      "const fs = require('node:fs');",
      'const modelPath = process.argv[2];',
      'const model = fs.readFileSync(modelPath, "utf8");',
      `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({ modelPath, model, argv: process.argv.slice(2) }));`,
      `process.stdout.write(${JSON.stringify(cannedStdout)});`,
    ].join('\n'),
  );
}

function expectFailureOfKind<K extends ProverifFailureKind>(
  result: ProverifRunResult,
  kind: K,
): Extract<ProverifRunFailure, { kind: K }> {
  if (result.ok) throw new Error(`期望失败（${kind}），实际成功：${result.stdout.slice(0, 80)}`);
  if (result.kind !== kind) {
    throw new Error(`期望失败类型 ${kind}，实际 ${result.kind}：${result.message}`);
  }
  return result as Extract<ProverifRunFailure, { kind: K }>;
}

const helloSource = getSampleSource('hello') ?? '';
const helloStdout = readCoreFixture('proverif/hello.stdout.txt');
const helloExpected = coreSamples.find((s) => s.id === 'hello')?.expectedVerdicts ?? [];

describe('ProVerif CLI 适配器（stub 可执行文件，不依赖本机 ProVerif）', () => {
  it('默认超时为正值', () => {
    expect(DEFAULT_PROVERIF_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('成功分支：写临时 .pv、spawn、解析 stdout，并清理临时文件', async () => {
    const logPath = join(stubRoot, 'success.log.json');
    const exe = writeSuccessStub('proverif-success.js', helloStdout, logPath);

    const result = await runProverif(helloSource, { executablePath: exe });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 结构化结果来自 core 的 stdout 解析器；原始 stdout 原样带出。
    expect(result.results.map((r) => ({ query: r.query, verdict: r.verdict }))).toEqual([
      ...helloExpected,
    ]);
    expect(result.stdout).toBe(helloStdout);

    // stub 看到的是 .pv 临时文件，内容与调用方给的文本一致。
    const log = JSON.parse(readFileSync(logPath, 'utf8')) as {
      modelPath: string;
      model: string;
      argv: string[];
    };
    expect(log.model).toBe(helloSource);
    expect(log.modelPath).toMatch(/\.pv$/);
    expect(log.modelPath.startsWith(tmpdir())).toBe(true);
    expect(log.argv).toEqual([log.modelPath]);
    // 运行结束（含临时目录）已清理。
    expect(existsSync(log.modelPath)).toBe(false);
  });

  it('proverif 自身报错分支：非零退出，原样带 stdout / stderr / 退出码', async () => {
    const logPath = join(stubRoot, 'error.log.json');
    const exe = writeStub(
      'proverif-error.js',
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({ modelPath: process.argv[2] }));`,
        "process.stdout.write('File \"model.pv\", line 3, character 17:\\nError: Syntax error.\\n');",
        "process.stderr.write('proverif-fatal\\n');",
        'process.exit(2);',
      ].join('\n'),
    );

    const result = await runProverif('free c: channel.\n', { executablePath: exe });
    const failure = expectFailureOfKind(result, 'proverif-error');
    expect(failure.exitCode).toBe(2);
    expect(failure.stdout).toContain('Error: Syntax error.');
    expect(failure.stderr).toContain('proverif-fatal');
    // 报错路径同样清理临时文件。
    const log = JSON.parse(readFileSync(logPath, 'utf8')) as { modelPath: string };
    expect(existsSync(log.modelPath)).toBe(false);
  });

  it('超时分支：到时限即终止并区别于其它失败（已产生的 stdout 仍带出）', async () => {
    const logPath = join(stubRoot, 'timeout.log.json');
    const exe = writeStub(
      'proverif-hang.js',
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({ modelPath: process.argv[2] }));`,
        "process.stdout.write('Starting query not attacker(s[])\\n');",
        'setTimeout(() => {}, 60_000);',
      ].join('\n'),
    );

    const startedAt = Date.now();
    const result = await runProverif('free c: channel.\n', { executablePath: exe, timeoutMs: 300 });
    const failure = expectFailureOfKind(result, 'timeout');
    expect(failure.stdout).toContain('Starting query not attacker(s[])');
    expect(Date.now() - startedAt).toBeLessThan(10_000);

    const log = JSON.parse(readFileSync(logPath, 'utf8')) as { modelPath: string };
    expect(existsSync(log.modelPath)).toBe(false);
  });

  it('找不到可执行文件分支（ENOENT）：给出缺 ProVerif 的指引，且不落临时文件', async () => {
    const result = await runProverif(helloSource, {
      executablePath: join(stubRoot, 'no-such-proverif-binary'),
    });
    const failure = expectFailureOfKind(result, 'missing-executable');
    expect(failure.message).toContain('ProVerif');
    expect(failure.message).toContain(PROVERIF_PATH_ENV);
  });

  it('取消分支：AbortSignal 运行中取消 → cancelled（区别于 timeout）', async () => {
    const exe = writeStub('proverif-hang-cancel.js', 'setTimeout(() => {}, 60_000);');
    const controller = new AbortController();
    const pending = runProverif(helloSource, {
      executablePath: exe,
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);

    const failure = expectFailureOfKind(await pending, 'cancelled');
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it('取消分支：已 abort 的 signal 直接返回 cancelled，不启动进程', async () => {
    const logPath = join(stubRoot, 'cancelled-pre.log.json');
    const exe = writeSuccessStub('proverif-success-never-run.js', helloStdout, logPath);
    const controller = new AbortController();
    controller.abort();

    const result = await runProverif(helloSource, { executablePath: exe, signal: controller.signal });
    expectFailureOfKind(result, 'cancelled');
    expect(existsSync(logPath)).toBe(false);
  });

  it('可执行路径可注入：默认读环境变量，显式 executablePath 覆盖环境变量', async () => {
    const logPath = join(stubRoot, 'env.log.json');
    const exe = writeSuccessStub('proverif-from-env.js', helloStdout, logPath);
    const previous = process.env[PROVERIF_PATH_ENV];
    try {
      process.env[PROVERIF_PATH_ENV] = exe;
      const fromEnv = await runProverif(helloSource);
      expect(fromEnv.ok).toBe(true);

      // 环境变量指向不存在的路径时，显式参数优先。
      process.env[PROVERIF_PATH_ENV] = join(stubRoot, 'no-such-from-env');
      const explicit = await runProverif(helloSource, { executablePath: exe });
      expect(explicit.ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env[PROVERIF_PATH_ENV];
      else process.env[PROVERIF_PATH_ENV] = previous;
    }
  });

  it('判定只信 RESULT 行：退出码 0 但没有 RESULT 时不编造结论', async () => {
    const exe = writeStub('proverif-silent.js', "process.stdout.write('Completing...\\n');");
    const result = await runProverif(helloSource, { executablePath: exe });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toEqual([]);
  });
});
