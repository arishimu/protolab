# 07: 验证链（server + CLI 适配器 + stdout 解析）

**What to build:** 后端验证管道：接收 `.pv` 文本 → CLI 适配器写临时文件、spawn 本机 ProVerif（可执行路径可注入、超时、可取消，遵守 ADR-0002）→ core 把 stdout 解析成按查询的结构化结果。解析按实测事实实现：每查询一节（`Starting query` … `RESULT <归一化查询> is true|false|cannot be proved.`），`attacker(x)` 归一化为 `not attacker(x)`，判定只信 RESULT 行（退出码 0 不代表成立），`cannot be proved` 必须支持。适配器区分三类失败：找不到可执行文件 / proverif 自身错误（带输出）/ 超时。

**Blocked by:** 01

**Status:** resolved

- [x] 四个录制 stdout fixtures 解析出黄金判定（真/假各自断言、证伪节反例 trace 原文完整捕获、查询数正确）——无 ProVerif 环境也跑绿（Seam B）
- [x] 人工构造的 `cannot be proved` fixture 解析正确
- [x] 适配器本地集成冒烟：对四样例真实 spawn 各成功一次；缺可执行文件路径 / 超时两分支行为正确（不进 CI 必跑）
- [x] 服务接口：收 `.pv` 文本 → 返回结构化结果 + 完整原始输出；超时与取消由适配器负责
- [x] 路径可注入（默认读环境/配置），代码不写死二进制路径

## Comments

（2025-09-18，/implement #07）已落地。三段链路：core stdout 解析 → server CLI 适配器 → server HTTP 服务。

- **core（纯 TS，无 node/process/Buffer 依赖）**：新增 `packages/core/src/verify-result.ts`，公共接口
  `parseVerifyStdout(stdout: string): VerificationResult[]`，`VerificationResult = { query, verdict, goalReachable, counterexampleTrace }`，
  由 `src/index.ts` 末尾追加导出（ticket 03 也在此处追加，冲突由父代理处理）。
  解析只以 `Starting query` 行切节、只信 `RESULT` 行产出结论（退出码不参与判定）；query 以 `(` 开头的括号内衍生行（ns-original 的 `RESULT (even ...)`）排除。
  `counterexampleTrace` 为 `Derivation:` 起、到本节 RESULT 行前的原文逐字切片，`goalReachable` 保留 `goal reachable:` 行原文。缺 RESULT 行的残段不产出结果（proverif 中途失败/被杀）。
- **实测补充（与本票字面表述的差异，已按实测实现并记录）**：真实 ProVerif 2.05 的 `cannot be proved` **没有** `is`，形如 `RESULT <查询> cannot be proved.`
  （实测触发路径：`noninterf` 查询 → `RESULT Non-interference s cannot be proved.`）；解析器两种形态都兼容（含 ticket 字面形态 `RESULT <查询> is cannot be proved.`）。
  人工 fixture `fixtures/proverif/cannot-be-proved.stdout.txt` 用实测语法，并在 `fixtures/PROVENANCE.md` 新增「人工构造 fixture」一节说明。
- **server 适配器**：`packages/server/src/proverif-adapter.ts`，公共接口 `runProverif(source, { executablePath?, timeoutMs?, signal? }): Promise<ProverifRunResult>`，
  默认路径解析顺序：`executablePath` > `PROVERIF_PATH` 环境变量 > PATH 上的 `proverif`（不写死绝对路径）；写临时目录 `pv-lens-verify-*/model.pv`、跑完/失败都清理。
  失败分四类（判别式联合 `ProverifRunFailure.kind`）：`missing-executable`（ENOENT，带中文安装/路径指引）/ `proverif-error`（非零退出，原样带 stdout、stderr、exitCode）/ `timeout`（可区分，超时终止）/ `cancelled`。
  第四类 `cancelled` 是本票「支持取消」要求的落地结果，与「三类失败」不冲突：取消要能与超时区分（ticket 08 的「取消」与「超时提示」是两种 UI 行为）。
- **server 服务**：`packages/server/src/verify-service.ts`（`verifySource(runner, {source, timeoutMs?, signal?})`，适配器以函数注入）+ `packages/server/src/http-service.ts`（`createVerifyHttpServer` / `startVerifyHttpServer`，node:http，无第三方依赖）。
  `POST /api/verify` body `{ source, timeoutMs? }` → 成功 `200 { ok: true, results, stdout }`；失败状态码映射（供给前端按 kind 分派）：`400 invalid-request` / `404` 路径不存在 / `405` 方法不对 / `500 proverif-error·cancelled·internal-error` / `503 missing-executable` / `504 timeout`。
  `GET /api/health` → `{ ok: true, name, builtinSampleCount }`。取消绑定到客户端连接断开（`res.on('close')` 且响应未写完 → abort 适配器）。
  `serverInfo` 原样保留（移到 `server-info.ts` 后由 `index.ts` 再导出，避免 http-service ↔ index 循环导入）；既有冒烟测试不动。
- **`pnpm start`**：仓库根 `pv-lens/package.json` 新增 `start` 脚本（先 build core/server 再起服务），`pnpm start` 会打印
  `pv-lens-server ready · built-in samples: 4 · listening on http://127.0.0.1:8787`（端口读 `PORT`，默认 8787，仅监听 127.0.0.1）。
- **未做（留给 ticket 08）**：不加 CORS 头（最小服务，前端走 Vite dev proxy 或同源反代；如需直连可在 web 侧 `vite.config.ts` 配 proxy，或后续在本服务加头）。
- **测试**：core `verify-result.test.ts` 13 项（四样例黄金判定 / 查询数 2·3·2·6 / Lowe 节 trace 与切片逐字对照 / 括号衍生行排除 / cannot be proved / 残段不产结论 / CRLF）；
  server `proverif-adapter.test.ts` 9 项（stub 可执行文件覆盖成功·报错·超时·缺可执行文件·取消两分支·env 注入优先级·临时文件清理）；
  `http-service.test.ts` 11 项（临时端口 + 注入假适配器：正常返回与 JSON 形状、timeoutMs 透传、四类失败状态码、坏请求体、健康检查、404/405、断开→abort）；
  `proverif-integration.test.ts` 6 项真实 ProVerif 冒烟（本机 `proverif` 2.05 存在则跑、四样例各 spawn 一次并断言判定 + 真实语法错误分支；`PROVERIF_PATH` 指向不存在路径时整组 skip，已验证）。
  全仓：`pnpm test` 8 文件 64 项全绿；无 ProVerif 环境（PATH 去掉 opam）下 7 文件 58 项通过、1 文件 6 项 skip；`pnpm typecheck` 三包通过。
- **遗留风险**：真实 ProVerif 集成测试依赖本机安装（本机已实跑通过，2.05）；`/api/verify` 无鉴权、无请求体大小上限（本地工具、不上公网，与 spec 一致）。
