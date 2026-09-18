/**
 * 验证用例层：.pv 文本 → 结构化结果 + 完整原始 stdout。
 *
 * 只做「调用适配器 + 归类结果」，不碰 HTTP（`http-service` 才是传输层）。
 * 适配器以函数形式注入，便于测试与将来替换后端（容器 / 打包二进制 / 别的验证器）。
 */

import { runProverif, type ProverifRunOptions, type ProverifRunResult } from './proverif-adapter.js';

/** 注入点：默认是 proverif-adapter 的 runProverif。 */
export type VerifyRunner = (
  source: string,
  options?: ProverifRunOptions,
) => Promise<ProverifRunResult>;

/** 默认适配器（spawn 本机 proverif）。 */
export const defaultVerifyRunner: VerifyRunner = runProverif;

export interface VerifyRequest {
  /** 待验证的 .pv 文本。 */
  source: string;
  /** 超时毫秒（覆盖适配器默认值）。 */
  timeoutMs?: number;
  /** 取消信号（HTTP 层绑定到客户端连接断开）。 */
  signal?: AbortSignal;
}

/** 服务自身异常（适配器抛错等），区分于 proverif 的三类失败。 */
export interface InternalErrorResult {
  ok: false;
  kind: 'internal-error';
  message: string;
}

export type VerifyOutcome = ProverifRunResult | InternalErrorResult;

/** 对一段 .pv 文本跑一次验证。 */
export async function verifySource(
  runner: VerifyRunner,
  request: VerifyRequest,
): Promise<VerifyOutcome> {
  try {
    return await runner(request.source, {
      timeoutMs: request.timeoutMs,
      signal: request.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: 'internal-error', message: `验证服务异常：${detail}` };
  }
}
