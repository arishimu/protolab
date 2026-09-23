# 水平序列编排原型（cut 曲线与三级 tie-break）

Type: prototype
Status: resolved

## Question

把 [生命线与信道的水平序列编排](11-role-channel-sequence.md) 的 Answer / [ADR-0009](../../../docs/adr/0009-role-channel-horizontal-sequence.md) 的算法做成可看的原型，验证它在真实与合成样例上「可预测、确定、cut 曲线符合 min-max 且同级最均匀」。

要交付 `prototype/09-role-side-assignment.html`（自包含单文件），内容：

- 实现 `σ* = argmin_σ max_{k} cut(k)`，`cut(k) = Σ_{(u,v)∈E} w_e·[σ(u) ≤ k < σ(v)]`，`E` = 每个消息步骤一条边（重边计次）；画出**每条缝隙的 cut 曲线**与序列。
- 跑 4 个真实 fixture：`hello`（1 角色 1 信道）、`handshake-fixed`（2 角色 1 信道）、`ns-original`（2 角色）、`ns-mutual-auth`（4 角色 1 信道，含 `processK` 的 `K–c` 边）。
- 合成样例：3 角色链（`I–R–S`）、三角、枢纽星；另加**一条多信道**合成图，验证「角色夹在两条总线之间」。
- 展示三级 tie-break 的生效：min-max → 降序 cut 曲线字典序最小（majorization）→ 源码序；并给出同分实例说明规则 2 确实在压曲线。
- 不动 core fixtures（`multi-channel.pv` 归 [多信道视觉](14-multi-channel-visuals.md)）。

判据：换样例时分侧/次序结果可预测；同输入两次运行完全一致；对每个样例打印 `max cut` 与 cut 曲线；`ns-mutual-auth` 给出含 K 的完整序列。

## Notes

- 输入：`11-role-channel-sequence.md` 的 Answer；`docs/adr/0009`。
- 词表：`CONTEXT.md` 的「水平序列」「信道」「消息步骤」。
- 原型基线：`prototype/07-broadcast-row-alignment.html`。
- 本票只验证**水平次序**；纵向间距解算（ticket 08 + 「y 全局唯一」硬约束）与信道视觉编码（ticket 14）不在本票。

## Comments

**会话 1（prototype，claim by agent）**

已交付 `prototype/09-role-side-assignment.html`（自包含单文件，双击即开）。纯逻辑模块 `cutCurve` / `solveSequence` 与页面壳分离，可整块搬进真实代码；页面用**全排列暴力枚举**逐条算 cut 曲线再套三级 tie-break（不验证 DP 实现，只验证目标函数与 tie-break 给出的答案）。

**实跑结果（无头复算，同输入两次 / 打乱枚举顺序均一致）**

| 样例 | n | σ*（左→右） | max cut | cut 曲线 | tie-break 存活 | min-sum 对照 |
| --- | --- | --- | --- | --- | --- | --- |
| hello | 2 | main · c | 1 | [1] | 2 → 2 → 1 | 1（max 1） |
| handshake-fixed | 3 | clientA · c · serverB | 3 | [3, 3] | 2 → 2 → 1 | 6（max 3） |
| ns-original | 3 | processA · c · processB | 6 | [6, 5] | 2 → 2 → 1 | 11（max 6） |
| **ns-mutual-auth** | 5 | **S · I · c · R · K** | 8 | [2, 8, 8, 1] | 8 → 2 → 1 | 19（max 8） |
| chain | 4 | I · S · c · R | 2 | [1, 2, 2] | 4 → 4 → 1 | 5（max 3） |
| triangle | 4 | I · R · c · S | 8 | [4, 8, 4] | 12 → 12 → 1 | 16（max 8） |
| hub | 6 | H · c · L1..L4 | 8 | [8, 4, 3, 2, 1] | 48 → 48 → 1 | 16（max 9） |
| multichannel | 5 | A · c1 · B · c2 · C | 2 | [2, 2, 2, 2] | 2 → 2 → 1 | 8（max 2） |
| tie | 5 | C · B · c · A · D | 5 | [2, 5, 5, 1] | 8 → 2 → 1 | 13（max 6） |
| isolated | 4 | A · c · B · Z | 2 | [2, 2, 0] | 8 → 4 → 1 | 4（max 2） |
| witness | 7 | r2 · c2 · r1 · c0 · r0 · c3 · c1 | 2 | [2, 1, 2, 2, 2, 0] | 14 → 4 → 1 | **8（max 3）** |

与 ticket 判据逐条对照：

- ✅ 可预测：每个样例的 max cut / 曲线 / 序列都打印在页面上（第 1、4、5 节）。
- ✅ 确定：同输入两次运行、打乱候选枚举顺序后结果都不变（规则 3 用源码下标比较，与枚举顺序无关）。
- ✅ `ns-mutual-auth` 给出含 K 的完整序列 `S · I · c · R · K`，K 与 R 同侧贴总线。
- ✅ 合成覆盖：3 角色链、三角、枢纽星、孤立角色、多信道（B 夹在 c1/c2 之间）。
- ✅ 回归 ADR-0009 的见证：min-max = 2，min-sum = 8 且其 max = 3，数字完全复现。

**一个需要写进规格的正面发现（tie-break 2 的副产物）**

规则 2「降序 cut 曲线字典序最小」**自动复现了 ADR-0007 点 5 的「最忙角色贴总线」**，不需要额外加规则。ns-mutual-auth 的 σ* `S · I · c · R · K` 里，每侧由总线向外权重递减：左内侧 I(6)、外侧 S(2)，右内侧 R(7)、外侧 K(1)。机制：一侧的缝隙割边由总线向外是 `T, T−a, T−a−b, …`（`a` = 贴总线角色的权重）；降序曲线里除两个「侧总和」外剩下就是这些外层前缀和，把它们压小 ⇒ 最重贴总线、最轻在最外。

→ 请确认：**是否把「每侧由总线向外权重递减」作为 ADR-0009 的已知后果写进规格 / CONTEXT**（它现在是 tie-break 2 的隐式结果，写下来可避免实现时误加一条「最忙贴总线」的显式规则而破坏 min-max 目标）。确认后写 `## Answer` 并把本票标 `resolved`。

## Answer

**HITL 定稿（用户确认「确认」）**：原型的交付物与全部判据通过；原型跑出的「tie-break 2 自动复现最忙角色贴总线」这一副产物被吸收进 [ADR-0009 §后果](../../../docs/adr/0009-role-channel-horizontal-sequence.md) 与 `CONTEXT.md` 的「水平序列」。

### 1. 交付物

`prototype/09-role-side-assignment.html` —— 自包含单文件（双击即开）。纯逻辑模块 `cutCurve` / `solveSequence` 与页面壳分离、可整块搬进真实代码；页面用全排列暴力枚举逐条算 cut 曲线再套三级 tie-break。UI：序列条 + 每条缝隙的 cut 值、cut 曲线 SVG、输入二分图、三级 tie-break 阶梯与同分候选曲线列表、全部样例一览表、6 个引导演练 tab、加减步数 / 加叶子角色的自由操作。

不动 core fixtures：真实样例的图由 `parsePv` + `narrativeRoleOrder` 实跑导出（每消息步骤一条边，`w` = 步数；角色按 `narrativeRoleOrder`、信道按 `free` 声明序编下标）。

### 2. 判据逐条通过

- **可预测**：每个样例的 σ* / max cut / cut 曲线都打印（页面第 1、4、5 节 与上方 Comments 的表格）。
- **确定**：同输入两次求解、以及打乱候选枚举顺序后求解，结果都不变（规则 3 用「项在源码中的下标」比较，与枚举顺序无关）。
- **`ns-mutual-auth` 含 K**：σ* = `S · I · c · R · K`，K 与 R 同侧、贴总线。
- **合成覆盖**：3 角色链、三角、枢纽星、孤立角色、多信道（B 夹在 c1/c2 之间）。
- **回归 ADR-0009 见证**：min-max = 2；min-sum = 8 且其 max = 3 —— ADR 的数字完全复现（原型另在枢纽星上也看到 min-max 8 / min-sum 16(max 9) 的分歧）。

### 3. 被吸收的结论

**「每侧由总线向外权重递减」（最忙角色贴总线、最轻的在最外）是 tie-break 2 的后果，不是独立规则。** 机制：一侧的缝隙割边由总线向外是 `T, T−a, T−a−b, …`；降序曲线里除两个「侧总和」外就是这些外层前缀和，压小它们 ⇒ 重者靠内。已验证：`ns-mutual-auth` 左内侧 I(6)/外侧 S(2)，右内侧 R(7)/外侧 K(1)。已写入 `docs/adr/0009` 的「后果」与 `CONTEXT.md` 的「水平序列」；实现时不要另加一条显式的「最忙贴总线」规则。

### 4. 资产

- `prototype/09-role-side-assignment.html`（本票交付物）。
- `docs/adr/0009-role-channel-horizontal-sequence.md` §后果（新增 tie-break 2 后果一条）。
- `CONTEXT.md` → 「水平序列」词条（补一句权重递减）。

本票只验证水平次序；纵向间距（ticket 08 与「y 全局唯一」硬约束）与信道视觉编码（ticket 14）不在本票，已由各自票据覆盖。
