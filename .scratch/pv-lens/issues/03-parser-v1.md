# 03: core 解析器 v1（握手级子集 + 降级诊断）

**What to build:** core 库的第一个纯转换：`.pv` 文本 → 语义模型。覆盖「教科书式顺序协议」子集——信道/类型/函数/归约声明宽容解析（可跳过不解、不崩溃），命名进程（含参数）体内的 `in/out/new/let/if/event/0/;|/!` 线性展开为角色步骤；产出角色集、每角色有序消息步骤（方向/信道/词项/事件标注/fresh 名/复制与并行/守卫注释）、查询列表。不支持的语法产生带源码定位的**降级诊断**而非异常，语法错误产生带 span 的报错。

**Blocked by:** 01

**Status:** resolved

- [x] 握手修正版 fixture 解析出语义模型并通过黄金断言：角色集、每角色步骤序列（方向/信道/词项原文/事件）、查询列表
- [x] hello 这类内联主进程（无命名进程）也能产出模型不崩溃（最小冒烟语义：主进程作为角色处理或明确标注）
- [x] 手写的「不支持语法」用例 → 降级诊断（带源码 span 与原文片段），绝不抛异常
- [x] 手写的「语法错误」用例 → 带 span 的中文报错
- [x] 本包测试跑绿，纯 TS 无 Node/浏览器依赖（core 约束）

## Comments

### 交付物

新增 `packages/core/src/parser/`（6 个纯 TS 模块）：
`model.ts`（模型类型）、`lexer.ts`（词法）、`state.ts`（记号游标 + 诊断 + 括号/顶层扫描工具）、
`terms.ts`（词项/模式 → 结构化 `PvTerm`）、`process.ts`（进程体 → 有序步骤）、`parse.ts`（`parsePv` 编排）。
`src/index.ts` 末尾追加 Seam A 的 export 段；`test/public-api.test.ts` 的纯净性守卫扩展到 `src/**`；
新增 `test/parser.test.ts`。

### 公共接口（定稿）

```ts
parsePv(source: string): ParseResult;

interface ParseResult {
  hasErrors: boolean;      // 是否有 error 级诊断（语法错误）
  hasDegraded: boolean;    // 是否有 degraded 级诊断（不支持的语法，已跳过）
  roles: readonly PvRole[];        // 命名进程（协议角色），按源码顺序
  mainProcess: PvRole | null;      // 内联主进程（`process` 后），无则 null
  queries: readonly PvQuery[];     // 查询原文（text / variables / span）
  diagnostics: readonly PvDiagnostic[];  // 按源码位置排序
}

interface PvRole { name; parameters: RoleParameter[]; steps: MessageStep[];
                   replicated; parallel; span }
interface MessageStep { direction: 'out' | 'in'; channel: PvTerm; term: PvTerm;
                        annotations: StepAnnotations; span }
interface StepAnnotations { freshNames: FreshName[]; events: EventAnnotation[];
                            guards: GuardNote[]; replicated; parallel }
type PvTerm = variable | name | application(functor,args) | tuple | unknown;
```

类型与字段命名一律取自 `CONTEXT.md`（角色 / 信道 / 消息步骤 / 词项 / 查询 / 降级诊断）。
`PvTerm` 保留结构化词项（构造子 + 参数 + 变量 / 名字）与源码切片 `text`，供 ticket 04 做符号化渲染
（构造子名在 `application.functor`）。

### 取舍与决策（ticket 文案与现状冲突处）

- **主进程不混进 `roles`**：ticket 允许「主进程作为角色处理或明确标注」，选了后者——`ParseResult.mainProcess`
  独立字段、固定名 `main`（导出 `MAIN_PROCESS_NAME`）。理由：主进程是启动处而非协议参与方，
  握手样例的 `roles` 必须恰好是 clientA / serverB（ticket 04 的端到端验收要求两条泳道）。
  **给 04 的提示**：`roles` 为空而 `mainProcess` 非空时（hello），应把 mainProcess 渲染成一条 `main` 泳道，
  而不是落到「无角色结构」提示。
- **事件不单独成步骤**：CONTEXT.md 的「消息步骤」定义是方向 + 信道 + 词项，事件是标注。
  挂载规则：`new` / `event` / 守卫条件挂到其后最近的消息步骤（`placement: 'before'`）；
  进程体结束时仍未消费的挂到最后一条步骤（`placement: 'after'`）。进程体没有任何消息步骤时记 degraded。
- **握手样例实际有 3 条 query**（ticket 文案写「查询原文两条」）：1 条保密性 + 2 条事件对应性。
  黄金断言覆盖全部 3 条（含 ticket 提到的那两条事件查询），条数与录制 stdout 的 RESULT 条数交叉校验。
- **查询保留原文**：`text` 只压缩空白（去 `query` 关键字与变量声明前缀），另存 `variables`
  （`query x:key,y:pkey; ...` → `['x','y']`）供 ticket 07 把 stdout 的归一化查询映射回用户原文。
- **无参命名进程 `let P = ... .`**：与顶层词项绑定 `let x = M.` 语法上无法区分，v1 一并降级跳过
  （ns 样例里的 `processK` 因此不入模型），ticket 05 覆盖。
- **声明区宽容**：`type`/`fun`/`reduc`/`free`/`const`/`event`/`table`/`not` 整体跳过、不建模、不报错；
  扩展点集中在 `parse.ts` 的 `skipDeclaration`（ticket 05 按种类细分时改这里）。
- **变量 / 名字分类**：变量作用域 = 角色参数 + `in` 模式变量 + `let` 绑定名（扁平作用域）；其余裸标识符
  判为名字（`free` 名、`new` 新鲜名、常量、角色引用）。`=x` 模式只取原文作守卫注释，其完整语义属 ticket 05。
- **角色级 `!` / `|`**：由启动处的调用形态决定（`!roleA(...)`、`(... | ...)`），并传给该角色的每条步骤；
  同一角色被多种形态调用时取 OR。
- **错误恢复**：语句级（`;` 缺失、`(` 未配对、声明缺 `.`）+ 调用级（`out(` / `in(` 实参出错时吃到配对 `)`）
  都继续解析后续内容；出错语句后的 `.` 会被当作残留分隔符吃掉落，使同一进程体后半段仍能解析。
  `parsePv` 外层还有 try/catch 兜底，保证「绝不把异常抛给调用者」。

### 测试

- `packages/core/test/parser.test.ts`：25 条。hello 冒烟、handshake-fixed 黄金断言（角色集/参数/步骤方向+行号/
  信道/嵌套词项结构/事件与守卫的 placement/fresh 名/`!`+`|`/主进程步骤）、手写降级用例、6 条语法错误用例、
  四个内置样例鲁棒性（不抛异常、无语法错误、查询条数 == 录制 RESULT 条数）。
- `packages/core/test/public-api.test.ts`：9 条（守卫扩展到 `src/**`，逐文件扫 8 类平台 API 用法；
  排除 `sample-texts.generated.ts` 这一 .pv 原文数据副本；`process` 只按 Node 全局用法形态禁用，
  因为解析器必须匹配 ProVerif 关键字 `process`）。
- 结果：`pnpm test` → 5 files / 52 tests 全绿（core 46，web 5，server 1）；`pnpm typecheck` → core/web/server 三包通过。

### 遗留与风险

- 渲染侧需按上文提示处理 `mainProcess`，否则 hello 会显示成「无角色结构」。
- `if` 的 `else` 分支、表操作（`insert`/`get`/`table`）、等值模式 `=M` 的语义、嵌套守卫展开、
  无参命名进程 → 全部降级，ticket 05 覆盖（ns-mutual-auth 现产出 4 条 degraded，ns-original 0 条）。
- 变量作用域是扁平的：不建模 `let` 的嵌套作用域与变量遮蔽，对展示足够，语义级使用需谨慎。
- 仅在 4 个内置样例与手写用例上验证，未在真实任意 `.pv` 上压测。
