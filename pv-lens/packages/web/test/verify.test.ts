import { describe, expect, it, vi } from 'vitest';
import {
  describeVerifyFailure,
  describeVerifyFailureKind,
  requestVerification,
  VERIFY_ENDPOINT,
} from '../src/verify';
import type { VerifyFailure, VerifyFailureKind, VerifyFetch, VerifyOutcome } from '../src/verify';

// 全部离线：fetch 用 stub（node 有全局 Response），断言 HTTP 状态 / body → kind 的映射，
// 以及「本模块绝不抛异常」。

const SOURCE = 'free c: channel.\nprocess\n  out(c, x).\n';

/** 造一个只回一次固定响应的 stub fetch，并记录收到的请求。 */
function stubFetch(
  response: Response,
  onCall?: (input: string, init: RequestInit) => void,
): VerifyFetch {
  return (input, init) => {
    onCall?.(input, init);
    return Promise.resolve(response);
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function expectFailure(outcome: VerifyOutcome, kind: VerifyFailureKind): VerifyFailure {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error('期望失败结果，实际成功');
  expect(outcome.kind).toBe(kind);
  expect(outcome.message.trim().length).toBeGreaterThan(0);
  return outcome;
}

const SUCCESS_BODY = {
  ok: true,
  results: [
    { query: 'not attacker(RSA[])', verdict: 'false', goalReachable: 'goal reachable: attacker(RSA[])', counterexampleTrace: 'Derivation:\n\n1. ...' },
    { query: 'not attacker(Cocks[])', verdict: 'true', goalReachable: null, counterexampleTrace: null },
  ],
  stdout: 'Starting query ...\nRESULT not attacker(RSA[]) is false.\n',
};

describe('verify：requestVerification（HTTP 状态 / body → kind）', () => {
  it('200：POST /api/verify，解析出 results 与 stdout，并把 source/timeoutMs 发出去', async () => {
    let seen: { input: string; init: RequestInit } | null = null;
    const outcome = await requestVerification(SOURCE, {
      timeoutMs: 12_000,
      fetchFn: stubFetch(jsonResponse(200, SUCCESS_BODY), (input, init) => {
        seen = { input, init };
      }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[0]).toEqual({
      query: 'not attacker(RSA[])',
      verdict: 'false',
      goalReachable: 'goal reachable: attacker(RSA[])',
      counterexampleTrace: 'Derivation:\n\n1. ...',
    });
    expect(outcome.stdout).toBe(SUCCESS_BODY.stdout);

    expect(seen).not.toBeNull();
    const request = seen as unknown as { input: string; init: RequestInit };
    expect(request.input).toBe(VERIFY_ENDPOINT);
    expect(request.init.method).toBe('POST');
    expect(JSON.parse(String(request.init.body))).toEqual({
      source: SOURCE,
      timeoutMs: 12_000,
    });
  });

  it('200：不发 timeoutMs 时 body 里就没有这个字段（用适配器默认值）', async () => {
    let body: unknown = null;
    await requestVerification(SOURCE, {
      fetchFn: stubFetch(jsonResponse(200, SUCCESS_BODY), (_input, init) => {
        body = JSON.parse(String(init.body));
      }),
    });
    expect(body).toEqual({ source: SOURCE });
  });

  it('200 但 results 结构不对 → bad-response', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(jsonResponse(200, { ok: true, results: 'nope', stdout: '' })),
    });
    expectFailure(outcome, 'bad-response');
  });

  it('200 但 body 不是合法 JSON → bad-response（附响应片段）', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(new Response('<html>proxy error</html>', { status: 200 })),
    });
    const failure = expectFailure(outcome, 'bad-response');
    expect(failure.message).toContain('proxy error');
  });

  it('503 → missing-executable，message 带安装与路径指引', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(
        jsonResponse(503, {
          ok: false,
          kind: 'missing-executable',
          message:
            '未找到 ProVerif 可执行文件「proverif」（文件不存在）。请先安装 ProVerif 2.x，'
            + '或用环境变量 PROVERIF_PATH 指向其可执行文件路径（例如 ~/.opam/default/bin/proverif）。',
        }),
      ),
    });
    const failure = expectFailure(outcome, 'missing-executable');
    expect(failure.message).toContain('~/.opam/default/bin/proverif');
    expect(describeVerifyFailure(failure.kind, failure)).toContain('PROVERIF_PATH');
  });

  it('500 → proverif-error：透传 stdout / stderr / exitCode（模型自身错误）', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(
        jsonResponse(500, {
          ok: false,
          kind: 'proverif-error',
          message: 'ProVerif 报告模型或运行错误（退出码 1）。',
          stdout: 'File "model.pv", line 3, characters 9-10:\nSyntax error.\n',
          stderr: 'Fatal error: exception Failure("parse error")\n',
          exitCode: 1,
        }),
      ),
    });
    const failure = expectFailure(outcome, 'proverif-error');
    expect(failure.exitCode).toBe(1);
    expect(failure.stdout).toContain('Syntax error.');
    expect(failure.stderr).toContain('parse error');
    expect(failure.message).toContain('退出码 1');
  });

  it('504 → timeout（带已产生的 stdout）', async () => {
    const outcome = await requestVerification(SOURCE, {
      timeoutMs: 200,
      fetchFn: stubFetch(
        jsonResponse(504, {
          ok: false,
          kind: 'timeout',
          message: 'ProVerif 运行超过 200 ms 未结束，已终止。',
          stdout: 'Starting query not attacker(s[])\n',
        }),
      ),
    });
    const failure = expectFailure(outcome, 'timeout');
    expect(failure.stdout).toContain('Starting query');
  });

  it('400 → invalid-request；404 → not-found；405 → method-not-allowed', async () => {
    const cases: [number, string, VerifyFailureKind][] = [
      [400, '请求体 JSON 必须含字符串字段 source（.pv 文本）。', 'invalid-request'],
      [404, '未知路径 /api/verify（可用：GET /api/health、POST /api/verify）。', 'not-found'],
      [405, 'POST /api/verify 只接受 POST。', 'method-not-allowed'],
    ];
    for (const [status, message, kind] of cases) {
      const outcome = await requestVerification(SOURCE, {
        fetchFn: stubFetch(jsonResponse(status, { ok: false, kind, message })),
      });
      expectFailure(outcome, kind);
    }
  });

  it('状态码与 body 的 kind 都能判别时，以 body 的 kind 为准', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(
        jsonResponse(500, { ok: false, kind: 'cancelled', message: '验证已取消。' }),
      ),
    });
    expectFailure(outcome, 'cancelled');
  });

  it('未约定的失败状态码且无 kind → bad-response', async () => {
    const outcome = await requestVerification(SOURCE, {
      fetchFn: stubFetch(jsonResponse(502, { message: 'Bad Gateway' })),
    });
    expectFailure(outcome, 'bad-response');
  });

  it('R10：502/504 响应体非 JSON（代理错误页）→ unreachable，状态码入 message', async () => {
    const html502 = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    const failure502 = expectFailure(
      await requestVerification(SOURCE, { fetchFn: stubFetch(html502) }),
      'unreachable',
    );
    expect(failure502.message).toContain('HTTP 502');
    const text504 = new Response('Gateway Time-out', { status: 504 });
    const failure504 = expectFailure(
      await requestVerification(SOURCE, { fetchFn: stubFetch(text504) }),
      'unreachable',
    );
    expect(failure504.message).toContain('HTTP 504');
  });

  it('fetch 抛 TypeError（非 abort）→ unreachable，且不抛异常', async () => {
    const fetchFn: VerifyFetch = () => Promise.reject(new TypeError('Failed to fetch'));
    const failure = expectFailure(await requestVerification(SOURCE, { fetchFn }), 'unreachable');
    expect(failure.message).toContain('无法连接验证服务');
    expect(failure.message).toContain('Failed to fetch');
  });

  it('signal 已 abort → cancelled，且根本不发请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = vi.fn<VerifyFetch>();
    const outcome = await requestVerification(SOURCE, { fetchFn, signal: controller.signal });
    expectFailure(outcome, 'cancelled');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('运行中 abort（fetch 抛 AbortError）→ cancelled', async () => {
    const controller = new AbortController();
    const fetchFn: VerifyFetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });

    const pending = requestVerification(SOURCE, { fetchFn, signal: controller.signal });
    controller.abort();
    expectFailure(await pending, 'cancelled');
  });

  it('运行中 abort 但 fetch 抛的是普通错误 → 仍归 cancelled（signal 优先）', async () => {
    const controller = new AbortController();
    const fetchFn: VerifyFetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('socket closed'));
        });
      });

    const pending = requestVerification(SOURCE, { fetchFn, signal: controller.signal });
    controller.abort();
    expectFailure(await pending, 'cancelled');
  });
});

describe('verify：describeVerifyFailure', () => {
  const KINDS: readonly VerifyFailureKind[] = [
    'invalid-request',
    'not-found',
    'method-not-allowed',
    'missing-executable',
    'proverif-error',
    'timeout',
    'cancelled',
    'unreachable',
    'internal-error',
    'bad-response',
  ];

  it('每一类都有中文指引（非空且不含未替换的占位符）', () => {
    for (const kind of KINDS) {
      const text = describeVerifyFailure(kind);
      expect(text.length, kind).toBeGreaterThan(20);
      expect(/[\u4e00-\u9fa5]/.test(text), `${kind} 应为中文文案`).toBe(true);
      expect(text).not.toContain('undefined');
    }
  });

  it('每一类都有中文短标签（UI 标题不直接暴露机器 kind）', () => {
    for (const kind of KINDS) {
      const label = describeVerifyFailureKind(kind);
      expect(label.length, kind).toBeGreaterThan(0);
      expect(label, kind).not.toBe(kind);
      expect(/[\u4e00-\u9fa5]/.test(label), `${kind} 标签应为中文`).toBe(true);
    }
  });

  it('关键口径：缺 ProVerif 给安装 + PROVERIF_PATH；不可达给启动命令；超时区分「模型太复杂」', () => {
    expect(describeVerifyFailure('missing-executable')).toContain('opam install proverif');
    expect(describeVerifyFailure('missing-executable')).toContain('PROVERIF_PATH');
    expect(describeVerifyFailure('missing-executable')).toContain('~/.opam/default/bin/proverif');
    // R10：面向用户的指引不再出现 ADR 编号、MVP 等内部术语与字面反引号。
    expect(describeVerifyFailure('missing-executable')).not.toContain('ADR-');
    expect(describeVerifyFailure('missing-executable')).not.toContain('MVP');
    for (const kind of ['missing-executable', 'unreachable', 'bad-response', 'not-found', 'method-not-allowed'] as const) {
      expect(describeVerifyFailure(kind)).not.toContain('`');
    }
    expect(describeVerifyFailure('unreachable')).toContain('pnpm start');
    expect(describeVerifyFailure('unreachable')).toContain('pv-lens');
    expect(describeVerifyFailure('unreachable')).toContain('127.0.0.1:8787');
    expect(describeVerifyFailure('timeout')).toContain('模型太复杂');
    expect(describeVerifyFailure('proverif-error')).toContain('模型');
  });

  it('R10：启动指引统一为在 pv-lens 目录执行 pnpm start，不再指向仓库根目录', () => {
    expect(describeVerifyFailure('unreachable')).toContain('pv-lens 目录执行 pnpm start');
    expect(describeVerifyFailure('bad-response')).toContain('pv-lens 目录执行 pnpm start');
    expect(describeVerifyFailure('not-found')).not.toContain('仓库根目录');
    expect(describeVerifyFailure('unreachable')).not.toContain('仓库根目录');
  });

  it('带上 server 的 message 时附在指引之后（不吞掉服务端说明）', () => {
    const text = describeVerifyFailure('timeout', { message: 'ProVerif 运行超过 200 ms 未结束。' });
    expect(text).toContain('ProVerif 运行超过 200 ms 未结束。');
    expect(text.startsWith(describeVerifyFailure('timeout'))).toBe(true);
  });
});
