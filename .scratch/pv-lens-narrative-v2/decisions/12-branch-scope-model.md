# `if` 分支作用域与构造算子进 item 序列（模型）

Type: grilling
Status: resolved

## Question

「core 模型扩展的最小形状」定稿了「消息端 + 每角色有序 `items`」，但**没有**表达 `if … then … else` 的**分支边界**：线性展开后 `then` / `else` 的归属只能靠「`guard-if` 之后到下一段为止都算在其作用域内」这种口头约定（该约定本身也还是 fog）。同时，纯构造算子（`encrypt` / `sign` / 元组构造）在模型里是否与解构算子区分，也从未定过 —— 它直接决定画法票能拿到什么数据。

要定的是**最小模型扩展的形状**（字段与来源规则），不含实现：

- **分支边界怎么进 item 序列**：显式 `branch` / `join` 标记；每条 item 带 `branchPath`；还是维持「作用域 = 从 `guard-if` 到下一个 `guard-if`」并由派生 IR 反推？各方案对 08 的竖向栈、10 的广播行对齐、13 的画法分别意味着什么。
- **`then` / `else` 两侧是否都保留**：今天解析器怎么处理 `else`（是展开成两支，还是只留 `guard-if` 一处）；需不需要 `else` 的起点标记。
- **与 `PvTerm.conditional` 的分工**：07 已给 `PvTerm` 增了 `conditional` 节点（`if` 出现在**词项内部**，如 `if Nb = adec(m3)`）；item 级 `if` 与之如何区分、如何互引，避免同一条守卫在两处各表达一半。
- **构造 vs 解构**：`encrypt` / `sign` / 元组构造这类「只构造不解构」的算子，在模型（与派生 IR）里是否要与 `adec` / `sdec` 等解构区分？若区分，用什么字段表达（这决定 13 能否分画法）。

产出：core 模型的最小扩展形状；不实现。

## Notes

- 输入：`07-core-value-model.md` 的 Answer；`02-value-layer.md` 的「未决残余」。
- 现状代码（读，不改）：`pv-lens/packages/core/src/parser/process.ts`、`pv-lens/packages/core/src/parser/model.ts`。
- 素材：`ns-original` 的两处守卫（`if pkX = pkB` / `if Nb = adec(m3)`）与构造链。
- 下游：本票**阻塞** [「`if` 守卫与纯构造方法的呈现（画法）」](13-conditional-rendering.md) —— 画法票要拿本票的字段才能在原型里判断。
- 词表：`CONTEXT.md` 的「本地步骤」「值绑定」「派生 IR」。

## Answer

**定稿（HITL，三轮 grilling，用户全部采纳推荐）**：分支边界进 item 序列的形态、条件的结构化、构造/解构的表达位置、分支下的引用解析规则。**只定模型形状，不含实现。**

### 1. 分支边界 = 显式标记流（`BranchMarker`）

- `guard-if` **不再是 LocalStep**：`RoleItem = MessageStep | LocalStep | EventMarker | BranchMarker`。分支是**结构**，不是本地步骤。

```ts
interface BranchMarker extends ItemBase {   // 复用 id / replicated / parallel / span
  kind: 'branch';
  guard:
    | { type: 'if'; condition: Condition }
    | { type: 'get'; pattern: string };   // 表模式保原文（07 口径）
  text: string;
}
interface ElseMarker extends ItemBase { kind: 'else'; branchId: number; text: string }
interface JoinMarker extends ItemBase { kind: 'join'; branchId: number; text: string }
```

- 一条 `if cond then P [else Q]` 展开为 `branch → [P items] → else? → [Q items] → join`；`get 模式 in P else Q` 复用**同一组标记**，只有 `guard.type` 不同。
- `else` / `join` 的 `branchId` = 对应 `branch` 的 `id`；嵌套由 id + **最内层配对**（dangling-else 归最近 `if`）表达。
- `join` **恒发**（无 `else` 也发；到进程体结尾也发）；空臂（`else 0`）= `else` 紧跟 `join`，不造空节点。
- 不变量：`branch…join` 之间（含 `else`）是一段**连续区间**——13 按它取两臂，08 视需要把整段当一个刚性单元（是否成单元归 08 / 13 原型，本票不替它决定）。

### 2. 臂范围不存

`branch` 标记**不携带** then / else 的 item 范围；下游按 `branchId` 扫一次栈即得。理由同 07 的「不预计算反向引用」：模型不存会与标记分歧的副本。

### 3. 条件结构化，两处共用 `Condition`

```ts
type Condition =
  | { op: '=' | '<>'; left: PvTerm; right: PvTerm; text: string }
  | { op: '&&' | '||'; clauses: readonly Condition[]; text: string }
  | { op: 'unknown'; text: string };
```

- `branch.guard.condition` 与 `PvTerm.conditional` **同型共享**；07 的 `ConditionalTerm.conditionText: string` 由 `condition: Condition` **取代**（`then` / `else` 不变）。这就是「同一条守卫不在两处各表一半」的落地。
- **不建括号节点**（靠 `clauses` 嵌套表达，原文进 `text`）；`<>` 保留为独立 `op`（不化简成 `not =`）；裸布尔式 / `not` / 解析不了一律 `unknown + text` 兜底，不报错。
- `EqualityTerm`（`let (=Na, …)` 的 `=Na`）**不动**：它是模式内位置约束，不是布尔条件；视图层两者都归「等值检查」呈现。

### 4. 构造 vs 解构 = 声明表

- `ParseResult` 新增 `destructors: readonly string[]`，取 `reduc` 的**表头名**（`adec` / `sdec` / `getmess` / `checksign` / `decrypt` / `sdecrypt` …）。
- `ApplicationTerm` **不加字段**：构造 / 解构是**声明**的性质，不是使用点的性质；视图按 `functor` 查 `destructors.includes(...)`。
- 元组 `(Na, pk(skA))` 是 `TupleTerm`，按**结构性构造**处理（无需声明）。
- 未声明的 functor 当**构造**（画法照常）、不报错；解构信息**不进 07 的 `inferType` / 配对**（配对是两方启发式、用返回类型，加解构不改现有签名）。

### 5. 分支下的引用解析 = arm 帧栈（修正 07 来源规则 6）

- 07 的「按该点作用域里**最近**的一条同名绑定」在分支下会错：线性展开后 then 臂绑定排在 else 臂之前，`else` 里的同名引用会被解析成 then 臂那条绑定。改为 **arm 帧栈**：遇 `branch` 入新帧、遇 `else` 换帧、遇 `join` 弹帧；引用在**帧栈自内向外**取最近同名绑定，找不到留空。
- `branch.guard.condition` 在**外层帧**解析（进入任一臂之前求值）；`PvTerm.conditional.condition` 在其 item 所在帧解析。
- `Binding.introducedBy` 不变、**不加 branchId**；帧在遍历标记时即时得出。

### 6. 下游接口与边界

- **13（画法，本票已解除阻塞）**：拿到 `branch` / `else` / `join` 三标记、两臂的连续区间、结构化的 `Condition` 操作数，以及 `destructors` 表。
- **08**：分支标记是梯子上的节点；「`branch…join` 整段是否作刚性计算单元」归 08 / 13 原型判断。
- **词表**：`CONTEXT.md` 收窄「本地步骤」（不再列 `if` / `get`），新增「分支 / 作用域」，补齐 13 引用却缺失的「值方块 / 方法盒 / 等值检查」。
- **未决残余**：无。本票**部分修订 07**（`guard-if` 不再是 LocalStep）与 07 来源规则 6（作用域改帧栈）。
