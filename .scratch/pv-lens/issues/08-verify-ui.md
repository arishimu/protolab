# 08: 验证 UI（运行 / 结果呈现）

**What to build:** 用户对当前协议点「运行验证」：前端把当前 `.pv` 文本发给后端（02 装载的状态在此被消费），运行中有进度且可取消；结果按查询逐条展示——查询原文（回到用户书写形式，不被归一化形态迷惑）+ 判定徽标（成立 / 被证伪 / 未能证明，措辞遵循 spec 的语义纪律），被证伪时**反例 trace 原文**可展开，完整原始输出可折叠查看。五类错误的各自中文指引：解析降级 / 解析失败 / 找不到 ProVerif（含安装与路径配置说明）/ 模型自身错误（带输出定位）/ 超时 / 服务不可达。

**Blocked by:** 02, 07

**Status:** resolved

- [x] NS 原版端到端：运行 → 逐条查询卡片，被证伪的那条（Lowe 攻击）可展开反例 trace 原文，成立条目标徽标正确
- [x] 判定措辞与归一化语义一致（`is true`→成立 / `is false`→被证伪 / `cannot be proved`→未能证明，并解释不等于不成立）
- [x] 运行中可取消；超时有提示
- [x] 找不到 ProVerif 时给出中文安装指引与路径注入说明（ADR-0002 后果）；模型报错与解析失败各有带定位的呈现
- [x] 界面中文，术语与代码保留英文

## Comments

（2025-09-18，/implement #08）已落地，只改 `packages/web/**`（外加本工单文件），未动 core / server，未加三方依赖。

### 交付文件

| 文件 | 作用 |
|---|---|
| `packages/web/src/verify.ts` | 验证请求层（纯逻辑、node 可测）：`requestVerification` / `describeVerifyFailure` / `VerifyOutcome` |
| `packages/web/src/query-presentation.ts` | 归一化结果 → 用户查询原文的映射 + `VERDICT_META` 判定措辞 |
| `packages/web/src/VerifyPanel.tsx` | 结果面板（React）：运行 / 取消 / 超时输入、逐条查询卡片、失败与解析侧提示 |
| `packages/web/src/App.tsx` | `parsePv` 提升到 `LoadedView` 记忆化一次，`NarrativeView` 与 `VerifyPanel` 共用；`NarrativeSection` 删除 |
| `packages/web/src/styles.css` | 验证面板样式（判定徽标三档 tone、trace/stdout 折叠块、诊断条） |
| `packages/web/vite.config.ts` | dev `server.proxy` + `preview.proxy`：`/api` → `http://127.0.0.1:8787`（保留 port 5173 / host 0.0.0.0） |
| `packages/web/test/verify.test.ts`、`query-presentation.test.ts`、`verify-panel.test.ts` | 见下「测试」 |

### 接口

- `requestVerification(source, { timeoutMs?, signal?, fetchFn? }): Promise<VerifyOutcome>`，`POST /api/verify`，body `{ source, timeoutMs? }`。**绝不抛异常**。
- `VerifyOutcome = { ok: true; results: VerificationResult[]; stdout: string } | { ok: false; kind; message; stdout?; stderr?; exitCode? }`。
- `VerifyFailureKind`：server 侧 6 种（`invalid-request` / `missing-executable` / `proverif-error` / `timeout` / `cancelled` / `internal-error`）+ 前端本地 4 种（`not-found` / `method-not-allowed` / `unreachable` / `bad-response`），共 10 个取值。
- `describeVerifyFailure(kind, detail?)`：每类一段中文指引，若 detail.message 是 server 的说明则附在其后。
- `mapResultsToQueries(results, queries): QueryResultView[]`；`QueryResultView.cardId` 为 1 基稳定代码 `query-1`/`query-2`…（React key + 卡片锚点），含 `normalizedQuery` / `userText` / `variables` / `verdict` / `verdictLabel` / `counterexampleTrace` / `goalReachable` / `matched`。

### 状态码 / 失败 kind 映射（前端只按 kind 分派 UI）

| HTTP | body.kind | 前端 kind | UI |
|---|---|---|---|
| 200 | `ok:true` | 成功 | 逐条查询卡片 + 原始 stdout |
| 400 | `invalid-request` | `invalid-request` | 请求未通过校验（空模型 / 超时非正数） |
| 404 | —（未知路径） | `not-found` | 接口路径与 server 版本不一致，重启 server |
| 405 | `invalid-request` | `method-not-allowed` | 方法不对，重启 server 后重试 |
| 503 | `missing-executable` | `missing-executable` | 安装指引（opam）+ `PROVERIF_PATH`（ADR-0002） |
| 504 | `timeout` | `timeout` | 超时提示 + 调大时限 + 区分「模型太复杂」，附已有 stdout |
| 500 | `proverif-error` | `proverif-error` | 模型自身错误：exitCode + stdout + stderr + 按输出定位源码 |
| 500 | `cancelled` | `cancelled` | 已取消 |
| 500 | `internal-error` | `internal-error` | server 未归类异常，看 server 终端 |
| 其它状态码且无 kind / body 非 JSON / 结构不符 | — | `bad-response` | 非预期响应（含「server 没在跑 ⇒ 代理回非 JSON」的常见原因） |
| fetch 抛错（非 abort） | — | `unreachable` | `pnpm start` 启动 server + 127.0.0.1:8787 + `/api` 代理 |

`body.kind` 优先于状态码（前端不重复实现状态码语义）；`signal.aborted` 与 `AbortError` 一律归 `cancelled`。

### 查询映射策略（query-presentation）

1. **位置优先**：`results.length === queries.length` 时按序配对（四样例实测顺序一致；一条 `query a; b;` 由 parser 按序展开成多条 `PvQuery`）。不能靠文本相等——ProVerif 会重命名变量（`x` → `x_2`）。
2. 条数不等时退回**归一化文本匹配**：两边去 `not ` 前缀、去 `[]` 空参数括号、去空白后比较，每条用户查询只认领一次。
3. 仍匹配不到 → `userText:null, matched:false`，UI 显示归一化原文并标注「未匹配到用户查询原文」。

四样例黄金结果（`mapResultsToQueries(parseVerifyStdout(fixture), parsePv(fixture.pv).queries)`）：

| 样例 | 条数 | 顺序与原文 | 判定 |
|---|---|---|---|
| hello | 2 | `attacker(RSA)` / `attacker(Cocks)` | 被证伪（含 trace）/ 成立 |
| handshake-fixed | 3 | `attacker(s)` / `event(termClient(x,y))==>event(acceptsServer(x,y))` / `inj-event(termServer(x))==>inj-event(acceptsClient(x))` | 全部成立 |
| ns-mutual-auth | 2 | `inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m))` / `inj-event(termR(A,x,m)) ==> inj-event(acceptsI(A,x,m))` | 全部成立 |
| ns-original | 6 | `inj-event(endBparam(x)) ==> inj-event(beginBparam(x))` / `inj-event(endAparam(x)) ==> inj-event(beginAparam(x))` / `attacker(secretANa)` … `attacker(secretBNb)` | 被证伪 / 成立 / 成立 / 成立 / 被证伪 / 被证伪 |

- `handshake-fixed` 的归一化 `event(termClient(x_2,y_1)) ==> event(acceptsServer(x_2,y_1))` 映射回用户原文 `event(termClient(x,y))==>event(acceptsServer(x,y))`，`variables` = `['x','y']`（消费了此前无消费者的 `PvQuery.variables`）。
- 被证伪条目的 `counterexampleTrace` 非空且含 `Derivation:`；所有 `true` 条目的 trace 为 null。
- 人工 fixture `cannot-be-proved.stdout.txt` → `未能证明`、无 trace（假推导不算反例，沿用 #07 修正后的语义）；解释文案含「不等于『不成立』」。

### 测试 / 校验（确切命令与结果）

- `pnpm vitest run packages/web/test/verify.test.ts packages/web/test/query-presentation.test.ts packages/web/test/verify-panel.test.ts` → 3 文件 39 项通过。
- `pnpm test`（全量）→ **15 文件 / 178 项全绿**。
- `pnpm typecheck`（三包）→ core / server / web 全通过。
- 端到端（本地真机）：`pnpm --filter @pv-lens/core build && pnpm --filter @pv-lens/server build` + 起 server（8787）与 `vite` dev（5173）/`vite preview`（4173），
  `curl http://127.0.0.1:5173/api/health` 与 `:4173/api/health` 均回 `{"ok":true,...,"builtinSampleCount":4}`；
  经 5173 代理 `POST /api/verify` 提交 ns-original.pv，真 ProVerif 回 6 条：Lowe 攻击那条 `is false` 带 trace、两条 B 侧泄密 `is false` 带 trace、其余 `is true`，stdout 16999 字节。验证完已停掉临时进程（5173/4173/8787 端口已释放）。
- 面板侧浏览器交互（点击运行 / 取消）不在 `pnpm test` 内：本仓测试环境只有 node（无 jsdom、无 DOM 测试库，且不允许加三方依赖），故按工单口径做 `react-dom/server` 冒烟 + 纯函数覆盖；点击路径由上述 curl 端到端与纯函数测试共同覆盖。

### 遗留风险

- 点击态（运行中 → 取消 → 失败/成功）没有自动化测试，只能靠人工在浏览器里点；若要进 CI 需引入 DOM 测试库（当时明确不加依赖）。
- `bad-response` 的另一常见成因（server 未启动 ⇒ Vite 代理回非 JSON 错误页）与 `unreachable` 存在语义重叠：代理模式下拿不到更精确的信号，故已把「先 `pnpm start`」写进 `bad-response` 指引。
- 面板在「重新运行中」会先隐藏上一次结果、跑完覆盖；若将来要求「跑动中保留旧结果」，需再改状态机。
- ProVerif 侧仍是本机安装依赖（ADR-0002），缺可执行文件路径只能在真实环境验证（已由 #07 的本地集成冒烟覆盖）。

### code-review 后处理（2026-09-18，提交 04/05/08 后）

两轴 review（Standards + Spec）对 04/05/08 的合并 diff 给出 OK with notes。已修：

- **Standards：Mysterious Name / 枚举泄漏**：失败面板标题原先直接拼机器枚举 `outcome.kind`。新增 `FAILURE_KIND_LABEL` + `describeVerifyFailureKind(kind)`（verify.ts），标题显示中文类别、`kind` 以 `<code>` 附后供排查；`verify.test.ts` 增加「每类都有中文短标签」回归。

**保留但记录**：

- **位置优先的查询映射**（条数相等即按序配对、条数不等退回文本匹配）：四样例实测顺序一致；ProVerif 会重命名变量（`x` → `x_2`），文本匹配对事件查询不可靠，故位置优先是必要策略，文本匹配只作兜底。已在 `query-presentation.ts` 头注释写明依据与局限。
- 失败 kind 比 spec 的「五类」更细（10 类）；这是按 server 状态码与 body.kind 的实测事实落地的，属于超额细化而非偏差。
- 运行中/取消态无自动化测试（无 jsdom、禁加依赖），由纯函数测试 + 真实 curl 端到端覆盖。
