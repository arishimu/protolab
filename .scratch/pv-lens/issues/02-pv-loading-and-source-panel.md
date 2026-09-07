# 02: 装载 .pv（内置样例 / 本地导入）+ 只读源码面板

**What to build:** 用户打开应用先看到一个内置样例列表（四个基准协议），也可以从本地磁盘导入自己的 `.pv` 文件；选定后当前协议成为全局状态，右侧/侧栏有可折叠的只读源码面板展示其文本。这个「当前 .pv 文本」状态是渲染与验证两条管道共用的入口。

**Blocked by:** 01

**Status:** resolved

- [x] 首页样例列表展示四个内置协议（中文名 + 简述），任选其一即装载
- [x] 「导入 .pv 文件」可读取本地文件并把内容装载为当前协议
- [x] 只读源码面板可折叠/展开，展示当前协议全文，界面中文
- [x] 当前协议文本有清晰的状态入口，供后续「渲染」与「运行验证」消费（本票不要求任何图或验证，只到文本与源码展示为止）

## Comments

（2025-09-05，/implement #02）已落地。四样内置样例与导入均装载为同一「当前协议文本」状态入口；只读源码面板可折叠。

- 状态入口：`packages/web/src/protocol.ts`（纯函数层，node 可测：内置 id → LoadedProtocol / 本地文件文本 → LoadedProtocol）+ `CurrentProtocolContext.tsx`（浏览器全局 holder，暴露 current/samples/loadSample/loadLocalText/clear）。渲染（ticket 04）与运行验证（07/08）将来都从此取 .source。
- 内置样例原文以数据形式嵌入 core：`core/scripts/sync-sample-texts.mjs` 从 `fixtures/pv/*.pv` 生成 `core/src/sample-texts.generated.ts`，新增 `getSampleSource(id)` / `listLoadableSamples()`；drift 守卫测试保证嵌入副本与 fixture 逐字一致（改原文须重跑脚本）。浏览器渲染路径不经 server、core 无 fs，故原文必须随包发布。
- UI（中文）：首页四样例卡（中文名 + 简述 + 形态标签）+「导入 .pv 文件」；装载后展示只读源码面板（可折叠/展开）。core manifest 新增每样例中文 `description`。
- 测试：core 20 项（含 drift 守卫、description、getSampleSource、listLoadableSamples）+ web 5 项纯函数测试；typecheck 三包通过。
- 遗留：泳道图（04）与结果面板（08）在此页预留占位文案，后续工单扩展。
