/**
 * 验证请求层（ticket 08）：`.pv` 文本 → server 的 `POST /api/verify`（ticket 07 的服务契约）。
 *
 * 纯逻辑、node 可测（`fetch` 可注入）：本模块**绝不抛异常**，所有失败都归成
 * 判别式联合 `VerifyOutcome` 里的一种 `kind`，让 UI 按 kind 给中文指引
 * （`describeVerifyFailure`）。这样「服务不可达」「缺 ProVerif」「模型报错」
 * 「超时」「取消」「响应坏掉」在 UI 上是六种不同呈现（spec 的错误分类）。
 *
 * 状态码 → kind 映射（与 server 的 `http-service.ts` 一一对应，body 里的 `kind` 优先）：
 * 200 成功；400 `invalid-request`；404 `not-found`；405 `method-not-allowed`；
 * 500 `proverif-error` · `cancelled` · `internal-error`；503 `missing-executable`；504 `timeout`。
 */

import type { Verdict, VerificationResult } from '@pv-lens/core';

/** 前端请求的验证端点：dev / preview 时经 Vite proxy 转到本机 server（127.0.0.1:8787）。 */
export const VERIFY_ENDPOINT = '/api/verify';

/** 失败类别：server 侧的 kind 之外，前端补三类只有浏览器才看得见的失败。 */
export type VerifyFailureKind =
  | 'invalid-request'
  | 'not-found'
  | 'method-not-allowed'
  | 'missing-executable'
  | 'proverif-error'
  | 'timeout'
  | 'cancelled'
  | 'internal-error'
  /** 请求根本没到达服务（连接被拒 / DNS / 代理失败等）。 */
  | 'unreachable'
  /** 服务回了东西，但不是约定结构的 JSON。 */
  | 'bad-response';

export interface VerifySuccess {
  ok: true;
  results: VerificationResult[];
  /** ProVerif 的完整原始 stdout（「完整原始输出可折叠查看」消费它）。 */
  stdout: string;
}

export interface VerifyFailure {
  ok: false;
  kind: VerifyFailureKind;
  /** 人可读详情：优先用 server 给的 message，没有时是本地指引。 */
  message: string;
  /** `proverif-error` / `timeout` 会带上已产生的 stdout。 */
  stdout?: string;
  /** 仅 `proverif-error` 会带上 stderr。 */
  stderr?: string;
  /** 仅 `proverif-error` 会带上退出码（`null` 表示没有退出码，如无法 spawn）。 */
  exitCode?: number | null;
}

export type VerifyOutcome = VerifySuccess | VerifyFailure;

/** 注入点：默认是全局 `fetch`；测试里换成 stub 即可离线覆盖全部分支。 */
export type VerifyFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface RequestVerificationOptions {
  /** 超时毫秒（透传给 server，由 CLI 适配器执行）。 */
  timeoutMs?: number;
  /** 取消信号：abort 后本函数以 `cancelled` 收尾，不抛异常。 */
  signal?: AbortSignal;
  /** 替换 fetch（默认全局 fetch）。 */
  fetchFn?: VerifyFetch;
}

/** server 侧会出现的失败 kind（前端本地产生的 `unreachable` / `bad-response` 不在内）。 */
const SERVER_FAILURE_KINDS = [
  'invalid-request',
  'missing-executable',
  'proverif-error',
  'timeout',
  'cancelled',
  'internal-error',
] as const satisfies readonly VerifyFailureKind[];

const VERDICTS: readonly Verdict[] = ['true', 'false', 'cannot-be-proved'];

/** 默认 fetch 绑定：包一层只为让注入点的类型不依赖全局签名细节。 */
const defaultFetch: VerifyFetch = (input, init) => fetch(input, init);

/**
 * 发一次验证请求。`POST /api/verify`，body `{ source, timeoutMs? }`。
 *
 * 绝不抛异常：网络层、HTTP 状态、body 结构三类问题都被归类返回。
 */
export async function requestVerification(
  source: string,
  options: RequestVerificationOptions = {},
): Promise<VerifyOutcome> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const signal = options.signal;
  if (signal?.aborted === true) return cancelledFailure();

  const requestBody: { source: string; timeoutMs?: number } = { source };
  if (options.timeoutMs !== undefined) requestBody.timeoutMs = options.timeoutMs;

  let status: number;
  let text: string;
  try {
    const response = await fetchFn(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    return transportFailure(error, signal);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return badResponseFailure(status, text, 'body 不是合法 JSON');
  }
  if (!isRecord(payload)) return badResponseFailure(status, text, 'body JSON 不是对象');

  if (status >= 200 && status < 300) {
    const success = readSuccess(payload);
    if (success) return success;
    if (payload.ok === false) {
      const kind = isServerFailureKind(payload.kind) ? payload.kind : 'internal-error';
      return failureFromBody(kind, payload);
    }
    return badResponseFailure(status, text, '结构不是 { ok: true, results, stdout }');
  }

  const kind = isServerFailureKind(payload.kind) ? payload.kind : kindForStatus(status);
  if (kind === null) {
    return badResponseFailure(status, text, `未预期的失败状态码 ${String(status)}`);
  }
  return failureFromBody(kind, payload);
}

/** HTTP 状态码 → 失败 kind；未约定的状态码（如代理自己的 502）返回 null。 */
function kindForStatus(status: number): VerifyFailureKind | null {
  switch (status) {
    case 400:
      return 'invalid-request';
    case 404:
      return 'not-found';
    case 405:
      return 'method-not-allowed';
    case 500:
      return 'internal-error';
    case 503:
      return 'missing-executable';
    case 504:
      return 'timeout';
    default:
      return null;
  }
}

/** 按失败 kind 给中文指引，供 UI 直接显示；detail 里 server 的 message 会附在指引后。 */
export interface VerifyFailureDetail {
  message?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  exitCode?: number | null;
}

const FAILURE_GUIDANCE: Record<VerifyFailureKind, string> = {
  'invalid-request':
    '请求未通过服务端校验：常见原因是模型文本为空，或超时不是正数（毫秒）。修正后重新运行。',
  'not-found':
    '验证接口路径不存在（HTTP 404）：前端请求的 `/api/verify` 与当前 server 的版本不一致。'
    + '请更新代码后重启 server（仓库根目录 `pnpm start`），并确认 web 的 `/api` 代理指向 127.0.0.1:8787。',
  'method-not-allowed':
    '验证接口拒绝了该 HTTP 方法（HTTP 405）：`POST /api/verify` 只接受 POST。'
    + '若持续出现，说明代理或 server 版本与前端不一致，重启 server（`pnpm start`）后重试。',
  'missing-executable':
    '本机找不到 ProVerif 可执行文件。'
    + '安装：先装 OPAM（https://opam.ocaml.org/），再 `opam update` → `opam depext proverif` → `opam install proverif`；'
    + '若 `proverif` 不在当前 PATH 上，先在 shell 里 `eval "$(opam env)"`。'
    + '指定路径：启动 server 时用环境变量 `PROVERIF_PATH` 指向可执行文件，'
    + '例如 `PROVERIF_PATH=~/.opam/default/bin/proverif pnpm start`。'
    + '不随应用打包 ProVerif 是本项目的既定决策（ADR-0002），MVP 假设运行机器已自行安装 ProVerif 2.x。',
  'proverif-error':
    'ProVerif 报告了模型自身的问题（模型语法 / 类型 / 声明错误，不是工具故障）。'
    + '请按下面的退出码与 stdout / stderr 定位模型源码的出错位置'
    + '（ProVerif 会指明出错的行与语法元素），修正 `.pv` 后重新运行。',
  timeout:
    'ProVerif 在时限内没有给出结论，已被终止。多数情况下是模型太复杂（状态空间爆炸）而不是卡死：'
    + '把「超时（毫秒）」调大后重试；若仍然超时，考虑缩小模型（减少会话数 / 简化代数假设）。',
  cancelled:
    '验证已取消：本次运行没有产生结论（要重新验证就再点一次「运行验证」）。',
  unreachable:
    '无法连接验证服务。请先在仓库根目录启动 server：`pnpm start`'
    + '（等价于 `pnpm --filter @pv-lens/server start`），它默认监听 http://127.0.0.1:8787；'
    + 'web 通过 Vite 的 `/api` 代理访问它（dev 与 preview 的代理都已在 `vite.config.ts` 配好）。',
  'internal-error':
    '验证服务内部异常（server 未归类的错误）。请查看启动 server 的终端输出排查，然后重试。',
  'bad-response':
    '验证服务返回了无法识别的响应（不是约定结构的 JSON）。'
    + '最常见的原因是 server 没在跑：Vite 代理连不上 127.0.0.1:8787 时会回一个非 JSON 的错误页。'
    + '请先在仓库根目录 `pnpm start` 启动本仓库的 server 再重试；'
    + '若 server 已在运行，则可能是 server 版本与前端不匹配，重启 server 后再试。',
};

export function describeVerifyFailure(
  kind: VerifyFailureKind,
  detail: VerifyFailureDetail = {},
): string {
  const guidance = FAILURE_GUIDANCE[kind];
  const serverMessage = detail.message?.trim();
  if (serverMessage === undefined || serverMessage.length === 0 || guidance.includes(serverMessage)) {
    return guidance;
  }
  return `${guidance}\n服务返回：${serverMessage}`;
}

function cancelledFailure(): VerifyFailure {
  return { ok: false, kind: 'cancelled', message: '验证已取消。' };
}

/** fetch / 读 body 抛错：abort 归 `cancelled`，其余归 `unreachable`。 */
function transportFailure(error: unknown, signal: AbortSignal | undefined): VerifyFailure {
  if (signal?.aborted === true || isAbortError(error)) return cancelledFailure();
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, kind: 'unreachable', message: `无法连接验证服务：${detail}` };
}

function badResponseFailure(status: number, text: string, reason: string): VerifyFailure {
  return {
    ok: false,
    kind: 'bad-response',
    message: `验证服务返回了无法识别的响应（HTTP ${String(status)}，${reason}）：${snippet(text)}`,
  };
}

function failureFromBody(
  kind: VerifyFailureKind,
  payload: Record<string, unknown>,
): VerifyFailure {
  const message =
    typeof payload.message === 'string' && payload.message.trim().length > 0
      ? payload.message
      : describeVerifyFailure(kind);
  const failure: VerifyFailure = { ok: false, kind, message };
  if (typeof payload.stdout === 'string') failure.stdout = payload.stdout;
  if (typeof payload.stderr === 'string') failure.stderr = payload.stderr;
  if (typeof payload.exitCode === 'number' || payload.exitCode === null) {
    failure.exitCode = payload.exitCode;
  }
  return failure;
}

function readSuccess(payload: Record<string, unknown>): VerifySuccess | null {
  if (payload.ok !== true) return null;
  if (!Array.isArray(payload.results)) return null;
  if (typeof payload.stdout !== 'string') return null;
  const results: VerificationResult[] = [];
  for (const raw of payload.results) {
    const result = readResult(raw);
    if (result === null) return null;
    results.push(result);
  }
  return { ok: true, results, stdout: payload.stdout };
}

/** 单条结果：`query` 与 `verdict` 必须合法，另两个可空字段缺失时归一化为 null。 */
function readResult(raw: unknown): VerificationResult | null {
  if (!isRecord(raw)) return null;
  const { query, verdict } = raw;
  if (typeof query !== 'string') return null;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as Verdict)) return null;
  return {
    query,
    verdict: verdict as Verdict,
    goalReachable: typeof raw.goalReachable === 'string' ? raw.goalReachable : null,
    counterexampleTrace:
      typeof raw.counterexampleTrace === 'string' ? raw.counterexampleTrace : null,
  };
}

function isServerFailureKind(value: unknown): value is VerifyFailureKind {
  return (
    typeof value === 'string' && (SERVER_FAILURE_KINDS as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 是否 abort 导致的异常：DOMException / Error 都以 `name === 'AbortError'` 标识。 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** 把响应体片段压成一行用于报错（bad-response 时用户需要一眼看出回的是什么）。 */
function snippet(text: string, maxChars = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return '（响应体为空）';
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat;
}
