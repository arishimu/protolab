import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { coreSamples, parseVerifyStdout } from '@pv-lens/core';
import {
  PROVERIF_PATH_ENV,
  createVerifyHttpServer,
  type ProverifRunOptions,
  type ProverifRunResult,
  type VerifyRunner,
} from '../src/index.js';

function readCoreFixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../core/fixtures/${rel}`, import.meta.url)), 'utf8');
}

const helloStdout = readCoreFixture('proverif/hello.stdout.txt');
const helloExpected = coreSamples.find((s) => s.id === 'hello')?.expectedVerdicts ?? [];

interface RecordedCall {
  source: string;
  timeoutMs: number | undefined;
  signal: AbortSignal | undefined;
}

/** 起一个监听临时端口（port 0）的测试服务，注入假适配器。 */
async function startTestServer(runner: VerifyRunner): Promise<{
  baseUrl: string;
  calls: RecordedCall[];
  close: () => Promise<void>;
}> {
  const calls: RecordedCall[] = [];
  const recordingRunner: VerifyRunner = (source, options) => {
    calls.push({ source, timeoutMs: options?.timeoutMs, signal: options?.signal });
    return runner(source, options);
  };
  const server = createVerifyHttpServer({ runProverif: recordingRunner, port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function successRunner(results: ProverifRunResult): VerifyRunner {
  return () => Promise.resolve(results);
}

const servers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.();
});

async function start(runner: VerifyRunner) {
  const started = await startTestServer(runner);
  servers.push(started.close);
  return started;
}

describe('服务接口：POST /api/verify', () => {
  it('正常返回：结构化结果 + 完整原始输出，JSON 形状稳定', async () => {
    const { baseUrl, calls } = await start(
      successRunner({ ok: true, results: parseVerifyStdout(helloStdout), stdout: helloStdout }),
    );

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'free c: channel.\nprocess out(c, RSA)' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = (await response.json()) as {
      ok: boolean;
      results: Array<{ query: string; verdict: string; counterexampleTrace: string | null }>;
      stdout: string;
    };
    expect(body.ok).toBe(true);
    expect(body.results.map((r) => ({ query: r.query, verdict: r.verdict }))).toEqual([
      ...helloExpected,
    ]);
    expect(body.results[0]?.counterexampleTrace).toContain('A trace has been found.');
    expect(body.stdout).toBe(helloStdout);

    // 请求体里的 .pv 文本按原样交给适配器。
    expect(calls[0]?.source).toBe('free c: channel.\nprocess out(c, RSA)');
    expect(calls[0]?.timeoutMs).toBeUndefined();
    expect(calls[0]?.signal).toBeDefined();
  });

  it('请求体可带 timeoutMs（可调整时限），透传给适配器', async () => {
    const { baseUrl, calls } = await start(successRunner({ ok: true, results: [], stdout: '' }));

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0', timeoutMs: 1234 }),
    });
    expect(response.status).toBe(200);
    expect(calls[0]?.timeoutMs).toBe(1234);
  });

  it('适配器报 proverif 错误 → 500，原样带 stdout / stderr / 退出码', async () => {
    const { baseUrl } = await start(
      successRunner({
        ok: false,
        kind: 'proverif-error',
        message: 'ProVerif 报告模型或运行错误（退出码 2）。',
        stdout: 'Error: Syntax error.\n',
        stderr: '',
        exitCode: 2,
      }),
    );

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'free c: channel.\n' }),
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      kind: 'proverif-error',
      stdout: 'Error: Syntax error.\n',
      stderr: '',
      exitCode: 2,
    });
  });

  it('缺 proverif（ENOENT）→ 503，message 含安装与路径注入指引', async () => {
    const { baseUrl } = await start(
      successRunner({
        ok: false,
        kind: 'missing-executable',
        message: `未找到 ProVerif 可执行文件「proverif」。请先安装 ProVerif 2.x，或用环境变量 ${PROVERIF_PATH_ENV} 指向其可执行文件路径。`,
      }),
    );

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'free c: channel.\n' }),
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; kind: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.kind).toBe('missing-executable');
    expect(body.message).toContain(PROVERIF_PATH_ENV);
  });

  it('超时 → 504，与其它失败可区分（带已产生的 stdout）', async () => {
    const { baseUrl } = await start(
      successRunner({
        ok: false,
        kind: 'timeout',
        message: 'ProVerif 运行超过 300 ms 未结束，已终止。',
        stdout: 'Starting query not attacker(s[])\n',
      }),
    );

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0', timeoutMs: 300 }),
    });
    expect(response.status).toBe(504);
    const body = (await response.json()) as { kind: string; stdout: string };
    expect(body.kind).toBe('timeout');
    expect(body.stdout).toContain('Starting query');
  });

  it('取消 → 500 cancelled（与 timeout 区分）', async () => {
    const { baseUrl } = await start(
      successRunner({ ok: false, kind: 'cancelled', message: '验证已取消。' }),
    );

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0' }),
    });
    expect(response.status).toBe(500);
    expect((await response.json()) as { kind: string }).toMatchObject({ kind: 'cancelled' });
  });

  it('适配器抛出意外异常 → 500 internal-error，服务不崩', async () => {
    const { baseUrl } = await start(() => Promise.reject(new Error('boom')));

    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0' }),
    });
    expect(response.status).toBe(500);
    expect((await response.json()) as { kind: string }).toMatchObject({ kind: 'internal-error' });

    // 服务仍能继续服务。
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
  });

  it('请求体不合规 → 400（非 JSON / 缺 source / timeoutMs 非正数）', async () => {
    const { baseUrl, calls } = await start(successRunner({ ok: true, results: [], stdout: '' }));

    const notJson = await fetch(`${baseUrl}/api/verify`, { method: 'POST', body: 'free c: channel.' });
    expect(notJson.status).toBe(400);
    expect((await notJson.json()) as { kind: string }).toMatchObject({ kind: 'invalid-request' });

    const noSource = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeoutMs: 1000 }),
    });
    expect(noSource.status).toBe(400);

    const badTimeout = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0', timeoutMs: -1 }),
    });
    expect(badTimeout.status).toBe(400);

    // 不合法请求不落到适配器。
    expect(calls).toEqual([]);
  });

  it('取消绑定到客户端连接断开：请求中断时 signal 被 abort', async () => {
    let seenSignal: AbortSignal | undefined;
    const { baseUrl } = await start((_source: string, options?: ProverifRunOptions) => {
      seenSignal = options?.signal;
      // 等信号 abort 后再返回 cancelled，模拟适配器被取消。
      return new Promise<ProverifRunResult>((resolve) => {
        options?.signal?.addEventListener('abort', () => {
          resolve({ ok: false, kind: 'cancelled', message: '验证已取消。' });
        });
      });
    });

    const controller = new AbortController();
    const pending = fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'process 0' }),
      signal: controller.signal,
    }).catch(() => undefined);

    // 等请求到达服务端（适配器已被调用）再断开客户端连接。
    const deadline = Date.now() + 3000;
    while (seenSignal === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(seenSignal).toBeDefined();

    controller.abort();
    await pending;

    // 连接断开 → 服务的 AbortController 被 abort，验证随之取消。
    while (seenSignal?.aborted !== true && Date.now() < deadline + 3000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(seenSignal?.aborted).toBe(true);
  });
});

describe('服务接口：GET /api/health', () => {
  it('回显服务运行信息（沿用 serverInfo 的字段）', async () => {
    const { baseUrl } = await start(successRunner({ ok: true, results: [], stdout: '' }));

    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      name: 'pv-lens-server',
      builtinSampleCount: coreSamples.length,
    });
  });

  it('未知路径 404、路径存在但方法不对 405', async () => {
    const { baseUrl } = await start(successRunner({ ok: true, results: [], stdout: '' }));

    expect((await fetch(`${baseUrl}/api/nope`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/verify`)).status).toBe(405);
    expect((await fetch(`${baseUrl}/api/health`, { method: 'POST' })).status).toBe(405);
  });
});
