# 03: 结构化条件与分支作用域

**What to build:** 让读者直接看出 `if` 与 `get` 的守卫、`then`/`else` 范围及分支内的值引用，并能区分控制流分支与产出单个值的条件表达式。

**Blocked by:** 01: 叙事 IR 兼容层与基线生命线; 02: 值绑定与词项追踪.

**Status:** resolved

- [x] `if` 与 `get` 在角色有序 `items` 中形成连续的 `branch`、可选 `else`、`join` 标记流；`join` 恒存在，分支范围由标记流恢复。
- [x] item 守卫与 `PvTerm.conditional` 共用结构化 `Condition`：比较 `=`/`<>`、`&&`/`||` 复合子句和无法结构化时的 `unknown` 原文。
- [x] 同名绑定按分支臂帧栈解析，`else` 引用不会误指向 `then` 的绑定；嵌套与离开分支后的引用也正确。
- [x] 守卫在分叉前显示等值检查盒；复合条件逐子句成行，内嵌解构有自己的方法盒和派生芯片，空 `else` 显示 `else ∅`。
- [x] `then` 恒占偏移臂道；嵌套主要臂道最多两条，更深层以缩进和角标表达；分支默认展开，并提供显式折叠开关。
- [x] `let x = if c then a else b` 显示带 `?:` 的选择盒和条件芯片，不产生分支臂道。
- [x] 测试覆盖连续标记、复合/未知条件、臂内同名绑定、单臂/空臂/嵌套分支及选择盒。

## Comments

2026-09-24，`/implement`（用户指定参照 `prototype/05-density-folding.html` 与 `prototype/08-conditional-constructors.html`，真浏览器截图对照）。提交 `de4391c`。

**已落地**：连续 `branch → then items → else? → else items → join` 标记流（`join` 恒发、空 else 带 `empty`）；守卫原文与来源进 IR；绑定按**臂帧栈**解析（else 不误引 then 的绑定、合流后臂内绑定出作用域）；等值检查盒（两操作数并排贴在盒上方、op 在盒内、无输出）；复合条件逐子句成行 + 连接词字形；条件内嵌解构的独立解构盒 + 派生虚线芯片；`then`/`else` 两道轨道 + 两端 tick（轨道落在值方块之外）；空臂 `else ∅` 桩；`?:` 选择盒 + 盒外条件芯片（不划臂道）；消息段只在跨中间生命线时上拱。

**当时剩余（已在本文件末尾新一轮补齐）**：
1. 嵌套更深的臂道尚未做「道内缩进 + 嵌套角标」（现在是封顶 2 道 + `then +1` 标签）。
2. `branch…join` 作为刚性单元的**显式折叠开关**尚未提供（当前默认展开且不参与压缩）。

**验证**：真浏览器（preview 构建）下 ns-original 3 个检查盒 / 3 条臂道、ns-mutual-auth 8 个检查盒（含 `∈`、`<>`、两处 `||`、一处 `&&`）+ 3 类芯片；core 5 项 + web 7 项专项测试；全量 23 文件 / 247 测试通过。

---

2026-09-24，`/implement` 续做剩余两项（本票收口）。

**已落地**：
1. **更深层嵌套的臂道封顶**：臂道号仍为 `min(2, 1 + 外层 else 数)`；第 3 层及更深不再新增道，改为在同一道内按 `overflow = 外层 else 数 − 1` 缩进（`laneOverflowIndent = 12`），标签变成 `↳ then +1` / `↳ else +1`；`StructuredArmRun` 暴露 `overflow`，臂道标签计入画布宽度预算。
2. **分支显式折叠开关**：`StructuredNarrativeLayout` 增 `branchFolds`，`StructuredLayoutOptions` 增 `collapsedBranches`；展开态守卫盒旁渲染 `▾` 开关（复合守卫只在第一行挂，一个分支一个开关），折叠态把整段 `branch…join` 收成一格 `▸ if … · +N` 折叠条，点它或按 Enter/Space 重新展开。折叠只作非默认开关，分支默认展开；折叠后该分支的守卫盒、臂道、值方块与消息端都不再绘制。
3. 顺带修正：复合守卫的多个检查盒此前共用同一个 React key（`${item.id}:check`），现带行号；`branchLabel` 对 `get` 守卫显示 `get …` 而非 `if`。

**验证**：workspace typecheck 通过；全量测试 23 文件 / 251 测试通过；workspace build 通过；`git diff --check` 通过。专项测试新增嵌套封顶（lane/overflow/label/缩进）、折叠默认态与折叠后隐藏、复合守卫单开关 + 独立 key、SSR 折叠开关与文字不越画布右缘。
