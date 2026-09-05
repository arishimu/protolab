/**
 * pv-lens 后端入口（ticket 01 脚手架阶段的最小形态）。
 *
 * 当前职责：证明 @pv-lens/core 能被 Node 端按包名依赖并解析，
 * 并暴露一个最基本的运行信息。正式的 HTTP 服务与
 * ProVerif CLI 适配器（spawn / 超时 / 取消 / 缺可执行文件分类）见 ticket 07。
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreSamples } from '@pv-lens/core';

export interface ServerInfo {
  name: string;
  builtinSampleCount: number;
}

/** 运行信息：目前只回显从 core 读到的内置样例数。 */
export function serverInfo(): ServerInfo {
  return { name: 'pv-lens-server', builtinSampleCount: coreSamples.length };
}

// 直接执行（node dist/index.js）时打印就绪信息；被 import 时无副作用。
const thisFile = resolve(fileURLToPath(import.meta.url));
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === thisFile;

if (isMain) {
  const info = serverInfo();
  console.log(`${info.name} ready · built-in samples: ${info.builtinSampleCount}`);
}
