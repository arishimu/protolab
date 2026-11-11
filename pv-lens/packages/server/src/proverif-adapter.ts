/**
 * ProVerif CLI 适配器（ADR-0002 落点）。
 *
 * 只通过 spawn 调用本机 proverif：把 .pv 文本写进临时文件、运行、清理临时文件。
 * 可执行路径可注入（默认读环境变量 PROVERIF_PATH，否则用 PATH 上的 `proverif`），
 * 支持超时与取消（AbortSignal），并把失败分成可判别的几类：
 *
 * - `missing-executable`：找不到可执行文件（ENOENT）→ UI 给缺 ProVerif 的安装/路径指引
 * - `proverif-error`：proverif 自身报错（非零退出）→ 原样带 stdout / stderr / 退出码
 * - `timeout`：超过时限被终止 → 可区分于前两类
 * - `cancelled`：调用方取消（如客户端断开）→ 可区分于超时
 *
 * 判定不给退出码解释：结论只来自 core 对 stdout 里 RESULT 行的解析（退出码 0 不代表成立）。
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVerifyStdout, type VerificationResult } from '@pv-lens/core';

/** 默认超时（毫秒）。四基准样例实测均 <20ms，默认值只兜底「卡死」。 */
export const DEFAULT_PROVERIF_TIMEOUT_MS = 30_000;

/** 指向 proverif 可执行文件的环境变量名。 */
export const PROVERIF_PATH_ENV = 'PROVERIF_PATH';

/** proverif 可执行文件路径：显式选项 > PROVERIF_PATH 环境变量 > PATH 上的 `proverif`。 */
const FALLBACK_EXECUTABLE = 'proverif';

export interface ProverifRunOptions {
  /** proverif 可执行文件路径；不传则读 PROVERIF_PATH，再回退到 `proverif`。 */
  executablePath?: string;
  /** 超时毫秒；不传则用 DEFAULT_PROVERIF_TIMEOUT_MS。 */
  timeoutMs?: number;
  /** 取消信号；abort 后立即终止 proverif 并返回 `cancelled`。 */
  signal?: AbortSignal;
}

export interface ProverifRunSuccess {
  ok: true;
  /** 按查询的结构化验证结论（core 的 stdout 解析器产出）。 */
  results: VerificationResult[];
  /** proverif 的完整原始 stdout。 */
  stdout: string;
}

export type ProverifFailureKind =
  | 'missing-executable'
  | 'proverif-error'
  | 'timeout'
  | 'cancelled';

export type ProverifRunFailure =
  | { ok: false; kind: 'missing-executable'; message: string }
  | {
      ok: false;
      kind: 'proverif-error';
      message: string;
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }
  | { ok: false; kind: 'timeout'; message: string; stdout: string }
  | { ok: false; kind: 'cancelled'; message: string };

export type ProverifRunResult = ProverifRunSuccess | ProverifRunFailure;

/** 解析实际要 spawn 的可执行文件路径（显式选项 > PROVERIF_PATH 环境变量 > PATH 上的 `proverif`）。 */
export function resolveExecutablePath(options: ProverifRunOptions): string {
  const explicit = options.executablePath?.trim();
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const fromEnv = process.env[PROVERIF_PATH_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return FALLBACK_EXECUTABLE;
}

function missingExecutableFailure(executablePath: string, reason: string): ProverifRunFailure {
  return {
    ok: false,
    kind: 'missing-executable',
    message:
      `未找到 ProVerif 可执行文件 ${executablePath}：${reason}。` +
      `请先安装 ProVerif 2.x，或用环境变量 ${PROVERIF_PATH_ENV} 指定可执行文件路径` +
      '，例如 ~/.opam/default/bin/proverif。',
  };
}

/** 运行 proverif 验证一段 .pv 文本。 */
export async function runProverif(
  source: string,
  options: ProverifRunOptions = {},
): Promise<ProverifRunResult> {
  const signal = options.signal;
  if (signal?.aborted === true) return cancelledFailure();

  const executablePath = resolveExecutablePath(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVERIF_TIMEOUT_MS;

  const workDir = await mkdtemp(join(tmpdir(), 'pv-lens-verify-'));
  const modelPath = join(workDir, 'model.pv');
  try {
    await writeFile(modelPath, source, 'utf8');
    return await runProverifFile(executablePath, modelPath, timeoutMs, signal);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function cancelledFailure(): ProverifRunFailure {
  return { ok: false, kind: 'cancelled', message: '验证已取消。' };
}

function runProverifFile(
  executablePath: string,
  modelPath: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<ProverifRunResult> {
  return new Promise<ProverifRunResult>((resolve) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(executablePath, [modelPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve(spawnErrorFailure(error, executablePath, '', ''));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const onAbort = (): void => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // 兜住「检查 aborted 与注册监听之间」的竞态：已 abort 的 signal 不会再触发事件。
    if (signal?.aborted === true) onAbort();

    const finish = (result: ProverifRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      finish(spawnErrorFailure(error, executablePath, stdout, stderr));
    });

    child.on('close', (exitCode) => {
      if (cancelled) {
        finish(cancelledFailure());
        return;
      }
      if (timedOut) {
        finish({
          ok: false,
          kind: 'timeout',
          message: `ProVerif 运行超过 ${timeoutMs} ms 未结束，已终止。`,
          stdout,
        });
        return;
      }
      if (exitCode !== 0) {
        finish({
          ok: false,
          kind: 'proverif-error',
          message: `ProVerif 报告模型或运行错误，退出码 ${String(exitCode)}。`,
          stdout,
          stderr,
          exitCode,
        });
        return;
      }
      finish({ ok: true, results: parseVerifyStdout(stdout), stdout });
    });
  });
}

/** spawn 层面的失败：ENOENT 归入缺可执行文件，其余归入 proverif-error（带原始输出）。 */
function spawnErrorFailure(
  error: unknown,
  executablePath: string,
  stdout: string,
  stderr: string,
): ProverifRunFailure {
  const code = (error as NodeJS.ErrnoException).code;
  const detail = error instanceof Error ? error.message : String(error);
  if (code === 'ENOENT') return missingExecutableFailure(executablePath, '文件不存在');
  return {
    ok: false,
    kind: 'proverif-error',
    message: `无法运行 ProVerif ${executablePath}：${detail}`,
    stdout,
    stderr,
    exitCode: null,
  };
}
