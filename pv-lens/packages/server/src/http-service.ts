/**
 * 最小 HTTP 服务（node:http，不引第三方框架）。
 *
 * - `POST /api/verify`：JSON body `{ source, timeoutMs? }` → JSON 结果
 *   （成功 200 带 `{ ok: true, results, stdout }`；失败按 kind 给状态码，见下）
 * - `GET /api/health`：`{ ok: true, name, builtinSampleCount }`
 *
 * 请求处理器注入适配器（默认 spawn 本机 proverif），取消绑定到客户端连接断开。
 *
 * 状态码映射（供前端按 kind 分派中文提示，ticket 08 消费）：
 * 200 成功 / 400 `invalid-request` / 405 方法不对 / 404 路径不存在 /
 * 500 `proverif-error` · `cancelled` · `internal-error` / 503 `missing-executable` / 504 `timeout`。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { serverInfo } from './server-info.js';
import {
  defaultVerifyRunner,
  verifySource,
  type VerifyOutcome,
  type VerifyRunner,
} from './verify-service.js';

/** 默认监听端口（可用 PORT 环境变量覆盖）。 */
export const DEFAULT_HTTP_PORT = 8787;

/** 默认监听地址：本地工具，不对外暴露。 */
export const DEFAULT_HTTP_HOST = '127.0.0.1';

export interface HttpServerOptions {
  /** 注入的验证适配器；默认 spawn 本机 proverif。 */
  runProverif?: VerifyRunner;
  /** 监听端口；默认读 PORT 环境变量，否则 DEFAULT_HTTP_PORT（传 0 表示随机端口）。 */
  port?: number;
  /** 监听地址；默认 DEFAULT_HTTP_HOST。 */
  host?: string;
}

/** 请求体：`{ source }`（+ 可选 timeoutMs）。 */
interface VerifyRequestBody {
  source?: unknown;
  timeoutMs?: unknown;
}

/** 创建一个（尚未 listen 的）HTTP 服务。 */
export function createVerifyHttpServer(options: HttpServerOptions = {}): Server {
  const runner = options.runProverif ?? defaultVerifyRunner;
  return createServer((req, res) => {
    void handleRequest(req, res, runner);
  });
}

export interface StartedHttpServer {
  server: Server;
  /** 实际监听端口（`port: 0` 时是内核分配的端口）。 */
  port: number;
  url: string;
  close: () => Promise<void>;
}

/** 创建并开始监听，返回实际端口。 */
export async function startVerifyHttpServer(
  options: HttpServerOptions = {},
): Promise<StartedHttpServer> {
  const host = options.host ?? DEFAULT_HTTP_HOST;
  const requestedPort = options.port ?? portFromEnv();
  const server = createVerifyHttpServer(options);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once('error', onError);
    server.listen(requestedPort, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : requestedPort;
  return {
    server,
    port,
    url: `http://${host}:${String(port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function portFromEnv(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return DEFAULT_HTTP_PORT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_HTTP_PORT;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runner: VerifyRunner,
): Promise<void> {
  const path = new URL(req.url ?? '/', `http://${DEFAULT_HTTP_HOST}`).pathname;

  if (path === '/api/health') {
    if (req.method !== 'GET') {
      sendJson(res, 405, invalidRequest('GET /api/health 只接受 GET。'));
      return;
    }
    sendJson(res, 200, { ok: true, ...serverInfo() });
    return;
  }

  if (path === '/api/verify') {
    if (req.method !== 'POST') {
      sendJson(res, 405, invalidRequest('POST /api/verify 只接受 POST。'));
      return;
    }
    await handleVerify(req, res, runner);
    return;
  }

  sendJson(res, 404, invalidRequest(`未知路径 ${path}。可用接口：GET /api/health、POST /api/verify。`));
}

async function handleVerify(
  req: IncomingMessage,
  res: ServerResponse,
  runner: VerifyRunner,
): Promise<void> {
  // 客户端断开（还没写完响应）即取消验证。
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    sendJson(res, 400, invalidRequest(`请求体必须是 JSON：${detail}`));
    return;
  }

  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as VerifyRequestBody;
  if (typeof body.source !== 'string') {
    sendJson(res, 400, invalidRequest('请求体 JSON 必须包含字符串字段 source，内容为 .pv 文本。'));
    return;
  }

  const timeoutMs = body.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    sendJson(res, 400, invalidRequest('可选字段 timeoutMs 必须是正数，单位为毫秒。'));
    return;
  }

  const outcome = await verifySource(runner, {
    source: body.source,
    timeoutMs,
    signal: controller.signal,
  });
  sendJson(res, statusFor(outcome), outcome);
}

function statusFor(outcome: VerifyOutcome): number {
  if (outcome.ok) return 200;
  switch (outcome.kind) {
    case 'missing-executable':
      return 503;
    case 'timeout':
      return 504;
    case 'proverif-error':
    case 'cancelled':
    case 'internal-error':
      return 500;
  }
}

function invalidRequest(message: string): { ok: false; kind: 'invalid-request'; message: string } {
  return { ok: false, kind: 'invalid-request', message };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) throw new Error('请求体为空。');
  return JSON.parse(text) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  } catch {
    // 客户端已断开（如取消验证后连接关闭）：无处可回，静默忽略。
  }
}
