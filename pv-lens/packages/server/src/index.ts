/**
 * pv-lens 后端入口。
 *
 * 组成（ticket 07）：
 * - `proverif-adapter`：CLI 适配器（写临时 .pv、spawn、超时/取消、失败分类，ADR-0002）
 * - `verify-service`：收 .pv 文本 → 结构化结果 + 完整原始 stdout 的用例层（可注入适配器）
 * - `http-service`：node:http 最小 HTTP 服务（POST /api/verify、GET /api/health）
 *
 * 直接执行（node dist/index.js）时启动 HTTP 服务并打印端口；被 import 时无副作用。
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startVerifyHttpServer } from './http-service.js';
// serverInfo / ServerInfo 在 server-info 模块定义，此处原样再导入并导出（保持既有公共接口）。
import { serverInfo } from './server-info.js';

export { SERVER_NAME, serverInfo, type ServerInfo } from './server-info.js';

export * from './proverif-adapter.js';
export * from './verify-service.js';
export * from './http-service.js';

// 直接执行（node dist/index.js）时启动服务并打印端口；被 import 时无副作用。
const thisFile = resolve(fileURLToPath(import.meta.url));
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === thisFile;

if (isMain) {
  const info = serverInfo();
  const { port } = await startVerifyHttpServer();
  console.log(
    `${info.name} ready · built-in samples: ${info.builtinSampleCount} · ` +
      `listening on http://127.0.0.1:${String(port)}`,
  );
}
