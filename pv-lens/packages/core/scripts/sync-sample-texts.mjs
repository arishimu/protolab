#!/usr/bin/env node
/**
 * 把 fixtures/pv/*.pv 原文嵌入为 core 的可导入数据模块（src/sample-texts.generated.ts）。
 *
 * 浏览器渲染路径不经 server、core 又是纯 TS（无 fs），故内置样例的 .pv 全文
 * 必须以数据形式随 core 发布。本脚本从 fixtures（提交文件、也是 Seam A 黄金原文）
 * 单向生成嵌入副本；core/test/fixtures.test.ts 的「嵌入 == fixture」守卫测试
 * 保证两者不漂移。用法：pnpm --filter @pv-lens/core sync:sample-texts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures', 'pv');
const outFile = join(here, '..', 'src', 'sample-texts.generated.ts');

// 与 src/index.ts 的 coreSamples 顺序一致；新样例需同步补录。
const ORDER = ['hello', 'handshake-fixed', 'ns-mutual-auth', 'ns-original'];

const entries = ORDER.map((id) => {
  const text = readFileSync(join(fixturesDir, `${id}.pv`), 'utf8');
  return `  ${JSON.stringify(id)}: ${JSON.stringify(text)},`;
}).join('\n');

const banner = `// AUTO-GENERATED — do not edit by hand.
// 由 scripts/sync-sample-texts.mjs 从 packages/core/fixtures/pv/*.pv 生成，
// 把内置样例的 .pv 原文嵌入为 core 的可导入数据（浏览器渲染路径不经 server、无 fs）。
// 修改样例原文请改 fixtures，再运行该脚本；drift 守卫见 core/test/fixtures.test.ts。
export const sampleTexts: Record<string, string> = {
${entries}
};
`;

writeFileSync(outFile, banner);
console.log(`wrote ${outFile}`);
