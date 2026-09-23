# core 模型扩展的最小形状：消息 / 本地步骤 / 值绑定与引用

Type: task
Status: resolved

## Question

v2 需要 core 产出今天模型没有的数据：

- **消息**升为一等对象（今天 `MessageStep` 是 `out` / `in` 各自一条）；
- **本地步骤**从 `MessageStep.annotations` 里独立出来（今天 `new` / `event` / 守卫都挂在消息步骤上）；
- **值绑定与引用**：哪一步引入了哪个绑定名（`new` / `in` / `let` / `get` / 角色参数），以及哪些词项引用了它。

已核对的现状（`packages/core/src/parser/process.ts`、`packages/core/src/parser/model.ts`）：扫描器里 `body.variables` 已在累积绑定名，`PvTerm` 的 `variable` 节点保留了名字；但 `let (NY, pkY) = adec(m, skB)` 若不含 `=` 就不产生任何 annotation，绑定也不带「由哪一步引入」。

要定的是**最小模型扩展的形状**（新字段与来源规则），供值层原型接真实数据、供 v2 规格引用；不含实现。

## Answer

**定稿（HITL，三轮 grilling，用户全部采纳推荐）**：core 模型按「**消息端 + 每角色有序步骤**」扩展；**两端的「消息」是 core 的派生 IR，不进 `ParseResult`**。

### 1. 分层落点

- `ParseResult` 保持「文本的派生视图数据」（ADR-0001），**只产出消息端**（每个 `out` / `in` 一个端）与每角色的有序局部序。
- 两端的**消息**（发送段 + 总线 + 接收段）由 core 的一个**纯函数**组合：自动配对（ADR-0003）+ 人工声明（ADR-0005）统一成 `MessagePairing { outEnd, inEnd, origin: 'auto' | 'manual' }`。
- 未配对端**不包装成消息**：视图行是 `MessageRow = MessagePairing | UnpairedEnd`——画对优先于画全，未配对是显式状态，不是 `in: null` 的退化消息。
- 理由：配对是保守启发式（多方直接关闭）、人工配对只活在会话内存；把它们折进 parse 会让 parse 依赖启发式，并让多方出现「另一端为空的 Message」。

### 2. `ParseResult` / `PvRole` 的形状

```ts
type RoleItem = MessageStep | LocalStep | EventMarker;

interface ItemBase {
  id: number;              // 稳定 id（解析顺序，全局唯一）；消息端与事件标记共用同一 id 空间
  replicated: boolean;     // 原 StepAnnotations 的这两个标志落到 item 上
  parallel: boolean;
  span: SourceSpan;
}

interface MessageStep extends ItemBase {
  kind: 'message';         // 名字沿用：CONTEXT 已定义「消息步骤 = 一条消息的一端」
  direction: 'out' | 'in';
  channel: PvTerm;
  term: PvTerm;            // out = 发送方实际词项；in = 接收模式
  bindings: readonly number[];   // 该端引入的绑定 id（仅 in，恒有；out 为空）
}

interface LocalStep extends ItemBase {
  text: string;            // 语句原文
  bindings: readonly number[];
}
// LocalStep 的 kind 细分（判别联合）：
//   { kind: 'new';      name: string; typeName?: string }
//   { kind: 'let';      pattern: PvTerm; bound: PvTerm }        // 左右两端都结构化（新）
//   { kind: 'get' }                                            // 表模式不解析，保 text
//   { kind: 'guard-if' }                                       // 条件保 text
//   { kind: 'insert' }

interface EventMarker extends ItemBase {
  kind: 'event';
  name: string;
  args: readonly PvTerm[]; // 首次结构化（ticket 03 的矩阵要「同参数共享」）
  text: string;
}

interface PvRole {
  name: string;
  parameters: readonly RoleParameter[];
  items: readonly RoleItem[];    // 替换 steps
  replicated: boolean;
  parallel: boolean;
  span: SourceSpan;
}

interface Binding {
  id: number;              // 稳定 id（解析顺序，全局唯一）
  name: string;
  typeName?: string;
  roleIndex: number;       // 与配对锚点同口径 = narrativeRoleOrder(result) 的下标
  introducedBy: { itemIndex: number } | 'role-parameter';
  span: SourceSpan;
}
```

- **删除** `StepAnnotations` / `AnnotationPlacement` / `FreshName` / `EventAnnotation` / `GuardNote`：`before` / `after` 挂载制、以及「进程体结束时把残留标注补挂到最后一条消息步骤」的规则一并消失——`new` / `event` / 守卫在源码里的**真实位置**就是它在序列里的位置。
- **绑定表放 `ParseResult` 顶层**（`bindings: readonly Binding[]`），由角色参数 / `new` / `in` / `let` / `get` 各产生一条；**不预计算反向引用**（04 的折叠点由视图决定，模型不该出一份会与视图分歧的副本；消费者遍历一次即可）。

### 3. 词项层

```ts
interface VariableTerm {   // 增一个可选字段
  kind: 'variable';
  name: string;
  typeName?: string;
  bindingId?: number;      // 该引用指向的绑定；解析不到则缺省
  text: string;
}

interface ConditionalTerm { // PvTerm 新增节点：let 右端的 if-then-else 表达式
  kind: 'conditional';
  conditionText: string;   // 布尔式（含 `||` / `<>`）保文本，见「未决残余」
  then: PvTerm;
  else: PvTerm;
  text: string;
}
```

- `NameTerm` **不带** `bindingId`：`free` / 常量 / 字面量不是值层节点。
- `new` 名并入变量作用域后，值层节点 = 本地绑定只剩一个概念（角色参数 / `new` / `in` / `let` / `get`）。

### 4. 派生 IR（core 纯函数，不进 `ParseResult`）

```ts
interface EndRef { roleIndex: number; itemIndex: number; id: number }

interface MessagePairing {
  outEnd: EndRef;
  inEnd: EndRef;
  origin: 'auto' | 'manual';   // 自动（ADR-0003）与人工（ADR-0005）汇进同一类型
}

type MessageRow =
  | { kind: 'message'; pairing: MessagePairing; channel: PvTerm; term: PvTerm /* 发送方实际词项 */ }
  | { kind: 'unpaired'; roleIndex: number; itemIndex: number; end: MessageStep };
```

`pairSteps` 改为返回 `MessagePairing[]`（`origin: 'auto'`）；人工声明产出同类型，09 的意图边直接复用，不另起一套。

### 5. 来源规则（扫描）

1. **`new`**：名字**立即进 `body.variables`**（本票新增的行为——今天不进，导致 `out(c, aenc(Na, …))` 的 `Na` 解析成 `name`），并产生一条绑定。
2. **`in`**：先按现有 token 预扫（`collectPatternBinders`）把绑定名进作用域，再解析模式；`bindings` = 解析树里**非 `equality` 子树下、且在该模式里首次出现**的 `variable` 叶子（`=Na` 是引用不是绑定；同名重复出现按一次绑定处理）。
3. **`let`**：同样先 token 预扫（`=` 与 `in` 之间的名字）；左侧模式与右侧表达式都解析为 `PvTerm`（右侧可能是 `conditional`）；绑定 = 左侧模式首次出现的变量叶子。
4. **`get`**：token 预扫的绑定名照常产生绑定；**表模式保持文本**，不解析。
5. **`event`**：参数解析为 `PvTerm[]`（沿用 `parseTermList` 口径），不再跳过括号内容。
6. **引用解析**（解析后一遍）：遍历每角色所有 item 的词项叶子；`variable` 叶子按名字取**该点作用域里最近的一条同名绑定**（后绑定遮蔽先绑定）写入 `bindingId`；解析不到（预扫误纳的伪绑定）留空。
7. **解析不了的 `let` 右端** → 沿用现有约定：`UnknownTerm` 兜底 + `degraded` 诊断，不抛异常。

### 6. 边界与后续

- **不含实现**：`pairing.ts`（锚点改 `EndRef`、`inferType` 的 `roleFresh` 分支改走绑定表）、`web/src/narrative/*` 与各测试的改动，留给实现 ticket。
- 原型仍是自包含 HTML（无构建），「接真实数据」在本票只到**形状可表达**为止，真正接线属实现 effort。
- **未决残余（交回 map 的 Not yet specified）**：`if` 守卫的**分支边界**——线性展开后 `then` / `else` 的边界不在 item 序列里表达，`guard-if` 之后到下一段为止都算在它的作用域内；与「`if` 守卫怎么呈现」一起等后续 ticket。
