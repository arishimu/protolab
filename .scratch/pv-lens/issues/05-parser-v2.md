# 05: core 解析器 v2（NS 级子集）

**What to build:** 把解析器从握手级扩到 Needham-Schroeder 级：元组/类型化模式变量/`=值` 等式模式、`if`/`let` 嵌套守卫内的消息步线性展开、主进程内 `new/let/.../table/insert/get` 序列、顶层并行与复制、命名进程参数的展示、查询列表保留用户原文（含事件对应查询与 attacker 查询）。仍守降级纪律：解析不了的不崩溃，产出带 span 的原文标注。

**Blocked by:** 03

**Status:** resolved

- [x] NS 修正版互认证 fixture 通过黄金断言：四角色（initiator/responder/server/密钥登记）泳道、各自步骤序列、守卫与查询原文
- [x] NS 原版 fixture 同样通过（含 Lowe 攻击样例的查询集，为 08 的验证演示备好语义侧）
- [x] 主进程序列（new/let/out/insert/get）与 `if/let` 守卫内消息步的展开正确
- [x] 新语法形态均有降级用例护航：不支持 → 带 span 原文标注而非崩溃
- [x] 语义模型仍不含验证副作用（与 07 的 stdout 解析互不依赖）

## Comments

### 交付物（2026-09-18，/implement #05）

只改 `packages/core/**`：`src/parser/model.ts`、`terms.ts`、`process.ts`、`parse.ts`、`src/index.ts`、
`test/parser.test.ts`（+372 行）。语义侧无新增模块，无新依赖。

### 公共接口变更（ticket 04 / 08 会消费）

1. **`PvTerm` 新增 `EqualityTerm`**（`{ kind:'equality'; term: PvTerm; text: string }`，`text` 为源码切片如 `=Na`），
   已从 `index.ts` 与 `PvTerm` 一并导出。`parseTerm` 遇 `=M` 产出它，**不再**产出 `unknown` + degraded。
   `UnknownTerm` 保留在联合类型里作为「真正解析不了」的兜底，但当前代码路径不再产生它。
2. **`GuardNote.kind` 扩展为 `'if' | 'let-pattern' | 'get' | 'insert'`**（字段名仍是 `guards`，`StepAnnotations.guards`）。文本约定：
   - `get`：`get` 与 `in` 之间的模式原文（压空白），如 `keys(=b, sb)`；
   - `insert`：`insert` 之后到语句末的原文（压空白），如 `keys(A, pkA)`；
   - 挂载规则与 `if`/`let-pattern` 一致：进 pending → 挂到其后最近的消息步（`before`），进程体末尾残留的挂最后一条步（`after`）。
3. **无参命名进程 `let NAME = body .`** 现在建模为角色（`parameters: []`）。区分办法：`NAME` 后不是 `(`，
   且 `body` 首个记号是进程起始构造（`in/out/new/let/if/event/insert/get/table/phase/choice/not/!/`(`/`0`）→ 角色；
   否则仍是顶层词项绑定 → 降级跳过。`parseRoleDefinition` / `parse.ts` 契约注释已同步改写。

### 语义决策（两处由父代理拍板）

- **`if ... else` / `get ... else` 线性展开**：then（in）与 else 两条分支的消息步都按源码顺序进同一序列，
  **两个分支的首个消息步都带同一条条件 / 模式原文注释**（`before`）。不伪造 `!cond`——视图是线性的、
  if/else 的树结构不保留，渲染端据此提示「该步骤处于受守卫分支」但不区分 then / else。权衡写进了 `model.ts` 的 `GuardNote` doc 注释。
- **`get ... in P else Q` 与 `if` 完全同构**。依据：`docs/proverif/note/06-advanced.md:53` 明确写了该形态。
  若不做，合法语法会产出 **error**（实测 2 条），违反本票「不支持 → degraded，绝不 error」纪律。

### v2 降级画像（相对 v1）

| 样例 | v1 degraded | v2 degraded |
|---|---:|---:|
| hello | 0 | 0 |
| handshake-fixed | 0 | 0 |
| ns-mutual-auth | 4（1×get + 2×insert + 1×无参 `let processK`）| **0** |
| ns-original | 0 | 0 |

ns-mutual-auth 角色数 3 → **4**（新增无参 `processK`）；四样例均 0 degraded 0 error。
仍维持降级的语法：`choice`、`phase`、进程内 `not`、顶层词项绑定 `let x = M.`、进程内 `table`（声明区 `table` 仍整体跳过、不报不降）。

### 两 fixture 的最终解析画像

- **ns-mutual-auth**（4 角色，0 degraded，2 条查询）：`processInitiator` 6 步（L71/77/79/84/86/92）、`processResponder` 7 步（L98/104/107/109/115/117/120）、
  `processS` 2 步（L124 in、L126 out；`get keys(=b, sb)` 作 out 前的 `get` 注释，`sb` 进入作用域）、`processK` 1 步（L130 in；
  `if h <> A && h <> B` 与 `insert keys(h,k)` 作 `after` 尾部注释）；主进程 3 步（L135/136/137 的 pkA/pkB/pkS，各带自己的 `new`；
  `insert keys(A, pkA)` / `insert keys(B, pkB)` 分别作 pkB、pkS 步前的 `insert` 注释，序列不被打断）。
- **ns-original**（2 角色，0 degraded，6 条查询）：`processA` 6 步（L42/45/46/48/51/52）、`processB` 5 步（L56/60/61/65/66）；
  `let (=Na, NX: bitstring) = adec(m, skA) in` 等场景仍以 `let-pattern` 守卫原文保留（本次不结构化，无回退）；
  `processB` 的嵌套 `if` 条件按源码顺序挂在同一条 out（L65）上。

### 测试与验证

- `packages/core/test/parser.test.ts`：44 项（v1 的 25 项全部保留 + 新增 ns-mutual-auth / ns-original 黄金断言、
  `=M` 结构化、`get ... else` 同构、重写为 v2 口径的降级用例与四样例画像）。
- `cd pv-lens && pnpm test` → **9 files / 112 tests 全绿**；`pnpm typecheck` → core/web/server 三包通过。
- 单文件迭代：`pnpm vitest run packages/core/test/parser.test.ts` → 44 passed。
- 降级仍只有 degraded 无 error；core 纯净性守卫（`test/public-api.test.ts`）未动即通过（无新平台 API）。

### 遗留与风险

- **降级用例是合成的**：`choice` / `phase` / 进程内 `not` 只验证「不崩溃、带 span 原文、其余结构完整」，
  未在真实文件上验证这些形态的语法边界。
- **`if` / `get` 的 then（in）分支无消息步时**，守卫注释会一起落到 else 分支的首个消息步上（不重复添加），
  语义上可接受但渲染端会看到两分支共用一个 step。
- **无参进程判定是启发式**：`let foo = (a, b).` 这种顶层词项绑定恰好以 `(` 开头时会被误判成无参角色（0 步）。
  真实样例里没有此形态；若后续要在任意 `.pv` 上压测，需按声明区已出现的 `table` / `const` 名字再加一层判别。
- **变量作用域仍是扁平的**（v1 遗留）：`get` 绑定变量直接进同一个 set，不建模遮蔽。
- ticket 03 记录的三处内部重复（括号深度扫描 / 空白折叠 / replicated·parallel 传播）**本次未做**（本票未要求，避免扩大 diff）；
  仅把 `process.ts` 内两处内联的空白折叠换成既有的 `collapseWhitespace`。

### 给后续 ticket 的提示

- **ticket 04（叙事视图）**：`mainProcess` 仍不入 `roles`，但 ns-mutual-auth 现在有 4 条 `roles` 泳道；
  `guards` 现在可能带 `kind:'get'` / `'insert'`，渲染需给这两类文案（不是条件判断，而是「表查询/表插入」语句注释）；
  四样例现已 0 degraded，渲染层的「原文标注段」在四样例上不会再出现（降级路径靠合成 fixture 演示）。
- **ticket 06（配对）**：`processS` 的 out 现在能解析出来（v1 整条丢失），NS 握手可配对步增加了，
  但 `get` 注释说明该 out 依赖表查询命中——保守配对时不要把它当成无条件发出的消息。
- **ticket 08（验证 UI）**：ns-original 的 6 条查询原文与 `queries[].variables` 已按用户写法保留（`['x']` ×2 + `[]` ×4），
  可与 stdout 的归一化查询映射对照。

