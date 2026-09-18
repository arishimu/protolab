/**
 * 运行信息：服务名与内置样例数（供 /api/health 与既有冒烟测试用）。
 *
 * 单独成模块是为了避免 `http-service` ↔ `index` 的循环导入。
 */

import { coreSamples } from '@pv-lens/core';

/** 服务名（`serverInfo().name`，既有冒烟测试依赖此值）。 */
export const SERVER_NAME = 'pv-lens-server';

export interface ServerInfo {
  name: string;
  builtinSampleCount: number;
}

/** 运行信息：服务名 + 从 core 读到的内置样例数。 */
export function serverInfo(): ServerInfo {
  return { name: SERVER_NAME, builtinSampleCount: coreSamples.length };
}
