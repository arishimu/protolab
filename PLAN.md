# pv-lens 语义分组实施规划

| 项 | 内容 |
|---|---|
| 状态 | 阶段 0 已完成并验收（ADR-0018 已接受，2026-11-05）；阶段 1、2、3 已实现，待验收（2026-11-05） |
| 适用分支 | `dev` |
| 基线提交 | `98dfeec` |
| 基线测试 | 51 个测试文件、444 项测试 |
| 编制日期 | 2026-11-05 |
| 依据 | `CONTEXT.md`、`docs/adr/0001`–`0017`、`requirements.md`、`docs/gui-test/gui-test-remediation-2.md` 第 10 节 |

本文把“降低 ProVerif 与协议判定的知识门槛”落实为两级语义分组：值层的密码操作组与消息层的交换段。分组是派生视图，不写回 `.pv`，不改变 ProVerif 的输入与判定。本文给出实施步骤、边界、自动化验收与视觉验收口径，作为后续票据拆分与阶段结项的依据。

## 目录

1. 目标与范围
2. 术语与不变量
3. 总体设计
4. 实施步骤
5. 边界与禁止项
6. 验收标准
7. 视觉验收
8. 交付物与分支工作流
9. 风险与缓解
10. 附录

---

## 1 目标与范围

### 1.1 问题

当前规范叙事视图把密码操作展开为逐个方法盒，把消息展开为逐条消息行。阅读者需要先掌握算子语法，才能看出“这里做了一次签名”或“这一段是一次握手往返”。值层与消息层的细节密度构成第一道门槛。

第二道门槛在判定侧。验证结论按查询逐条给出，但查询与画布、源码之间没有稳定的锚定；阅读者需要自行把一条 `RESULT` 翻译回协议中的某一步。分组只能降低第一道门槛，不能替代第二道门槛的解释与归因。

### 1.2 目标

| 编号 | 目标 | 主要交付 |
|---|---|---|
| G1 | 值层可按密码操作折叠与展开 | 密码操作组、操作注册表、分类器、审计面板 |
| G2 | 消息层可按交换段折叠与展开 | 因果凸交换段、段框、消息列表选择、边界校验 |
| G3 | 分组标签可解释 | 概念注解、图例、源码锚点 |
| G4 | 判定可回到协议问题 | 查询三行翻译、覆盖摘要、判定归因 |

G1 与 G2 是本次规划的主线；G3 承接上一版计划的解释层；G4 在 G1 与 G2 稳定后推进。

### 1.3 非目标

以下条目不在本次规划内，不得在实施中顺带引入：

- 画布编辑、拖拽生命线或端点、分组结果回写 `.pv`。
- 新的协议模型格式、DSL 或独立图存储。
- 交换段的自动识别、嵌套段、多方段、跨信道段。
- 把广播扇出或合流拆到两个交换段。
- 反例的几何攻击路径、`-graph` 或 `-html` 攻击图导出。
- 完整 ProVerif 语法、观察等价、`choice` 等进阶语义。
- 多用户、账号、云端保存、公网部署、ProVerif 分发。

## 2 术语与不变量

### 2.1 新增术语

以下术语为本次规划自创，阶段 0 决策通过后写入 `CONTEXT.md`；在写入前以本节定义为临时口径。

| 术语 | 定义 | 禁用替代 |
|---|---|---|
| 密码操作组 | 值层中由一次密码操作出现所覆盖的方法盒与值方块组成的语义单元。折叠态显示操作种类、方向、关键参数、密钥身份与隐藏计数；展开态恢复方法盒与值方块。组按词项结构嵌套，不跨操作合并。 | 密码算法块、加密块 |
| 操作种类 | 密码操作组标注的语义类别，取值为签名、对称加密、对称解密、非对称加密、非对称解密、哈希、密钥派生、未识别。种类来自方程匹配、名称启发或用户声明，不构成安全性断言。 | 算法类型 |
| 语义折叠 | 以当前阅读层次不需要该细节为由折叠密码操作组或交换段，区别于以空间不足为由的密度折叠。语义折叠的隐藏项须计数并可展开。 | 折叠 |
| 分组来源 | 密码操作组或交换段的来源，取值为方程匹配、名称启发、用户声明、未识别。来源须在审计面板可见。 | 自动分组 |
| 交换段 | 规范叙事视图中一段因果凸的消息集合。段内消息整体折叠为段框，段框显示参与角色、消息编号区间、消息条数与隐藏项计数；展开态恢复消息行。段不切断任何消息，跨段因果边保留在段框外。 | 协议阶段、握手阶段 |
| 因果凸 | 集合性质：若段内存在消息 A 与 C，且 A 到 C 的因果路径经过消息 B，则 B 属于该段。交换段的成员按此性质确定。 | 连续区间 |
| 段框 | 交换段折叠态在画布上的呈现，由段头、段带与边界标记组成。段头承载参与角色、消息编号区间与计数；段带跨越段内消息涉及的角色的本地梯子。 | 分组框、泳道 |
| 跨段边 | 一端在交换段内、另一端在段外的消息因果边。跨段边不得被段框遮挡；若无法清晰保留，则该消息集合不得声明为交换段。 | 跨组消息 |
| 审计面板 | 列出当前画布全部密码操作组与交换段的来源、种类、隐藏计数与源码位置的折叠面板，供用户核对与覆盖分类。 | 分组列表 |

### 2.2 不变量

I1 至 I10 为硬约束，任一阶段不得违反。

| 编号 | 不变量 |
|---|---|
| I1 | `.pv` 文本是唯一真源；分组结果、段框与展开状态均为派生数据。 |
| I2 | 分组不改变 ProVerif 的输入文本、查询集合与验证结论。 |
| I3 | 分组不改变水平序列、角色顺序与消息因果序。 |
| I4 | 隐藏项须计数并可展开；不得静默隐藏。 |
| I5 | 跨组引用与跨段边须可见；无法保留时不得折叠。 |
| I6 | 值身份颜色在折叠前后一致；被后续引用的输出保留幽灵值块。 |
| I7 | 分组标签只表示操作种类或阅读单位，不构成保密性、认证或可达性结论。 |
| I8 | 用户声明仅存会话内存，切换协议或刷新即清除，不回写 `.pv`。 |
| I9 | 交换段每次只包含完整消息；一条消息的任一端点在段外时，该范围非法。 |
| I10 | 展开全部时，布局须与改动前的基线在结构上一致；不得因分组引入新的冲突、重叠或裁切。 |

## 3 总体设计

### 3.1 数据流

```text
.pv 文本
  └─ parsePv ──> ParseResult
                   ├─ deriveCryptoGroups(result, overrides) ──> CryptoOperationGroup[]
                   ├─ composeMessagePairings(result, intents) ──> MessagePairing[]
                   └─ deriveExchangeSegments(result, pairings, segments) ──> ExchangeSegment[]
                                                                        │
                                                              NarrativeModel
                                                                        │
                                                              确定性布局
                                                                        │
                                                                   SVG 视图
```

分组 IR 由 core 的纯函数派生，不进入 `ParseResult`。这样解析模型保持协议语义，视图语义留在独立模块，符合 `ADR-0001` 与三包职责划分。

### 3.2 对象模型

```ts
type OperationKind =
  | 'signature'
  | 'symmetric-encryption'
  | 'symmetric-decryption'
  | 'asymmetric-encryption'
  | 'asymmetric-decryption'
  | 'hash'
  | 'key-derivation'
  | 'unknown';

type GroupingOrigin = 'equation' | 'name' | 'user' | 'unknown';
type Confidence = 'high' | 'medium' | 'low';

/** 指向 PvTerm 的稳定引用；实施时按现有 IR 命名，不复制词项文本。 */
type TermReference = {
  term: PvTerm;
  span: SourceSpan;
};

interface CryptoOperationGroup {
  id: string;
  roleName: string;
  kind: OperationKind;
  direction: 'construct' | 'destruct';
  origin: GroupingOrigin;
  confidence: Confidence;
  members: readonly string[];
  operands: {
    payload?: TermReference;
    key?: TermReference;
  };
  sourceSpan: SourceSpan;
  parentId: string | null;
  hiddenCount: number;
}

interface ExchangeSegment {
  id: string;
  messageIds: readonly string[];
  roles: readonly string[];
  channels: readonly string[];
  origin: 'manual' | 'suggested';
  label: string | null;
  hiddenCounts: {
    messages: number;
    unpaired: number;
    branches: number;
    conflicts: number;
  };
  sourceSpans: readonly SourceSpan[];
}
```

字段约束：

- `id` 由角色名、操作种类、首个方法盒的稳定 id 与源码偏移生成；同一输入必须得到同一 id。
- `members` 保存被折叠的方法盒与值方块 id，不保存坐标。
- `operands.payload` 与 `operands.key` 只引用词项位置，不复制词项文本。
- `parentId` 表达嵌套；同一层不合并不同操作。
- `ExchangeSegment.messageIds` 只保存完整消息；不得保存消息端。
- `hiddenCounts` 必须由成员集合计算，不由 UI 估算。

### 3.3 模块职责

| 模块 | 职责 | 禁止 |
|---|---|---|
| `core/parser` | 保留 `reduc` 方程左右两侧与 `free` 属性 | 不引入视图概念 |
| `core/grouping` | 操作注册表、分类器、分组 IR、段凸性校验 | 不依赖 DOM、不调用宿主 API |
| `web/narrative/structured-layout` | 提供分组高度、展开状态与段框的确定性布局 | 不读取组件内部状态 |
| `web/narrative` | 渲染折叠态与展开态、交互、样式 | 不重新解析 `.pv` |
| `web` 解释层 | 概念注解、查询翻译、覆盖摘要 | 不新增安全结论 |

### 3.4 与既有概念的关系

| 既有概念 | 关系 |
|---|---|
| 方法盒 | 仍是密码操作的原子呈现；密码操作组是其上的超级单元，不取代方法盒。 |
| 密度折叠 | 密度折叠解决空间不足；语义折叠解决阅读层次。两者可叠加，但须有不同记法与图例条目。 |
| 幽灵值块 | 语义折叠复用该机制，保留被后续引用的值身份。 |
| 细节层级 | 改为分组状态的预设：概念层折叠全部操作组与交换段；结构层展开操作组；语法层全部展开。 |
| 概念注解 | 成为分组标签的解释载荷；点击“签名”查看定义、协议问题与底层 `fun/reduc`。 |
| 人工配对 | 后续多方交换段的前置；V1 不开放多方段。其会话内存与声明式模式可复用。 |
| 源码联动 | 组头或段头选择成员区间的并集 span；展开后成员选择精确 span。 |

## 4 实施步骤

每阶段独立验收。阶段 0 未通过前不得写生产代码。

### 阶段 0 决策与原型

**目标**：锁定两类分组的语义、边界与画法，避免实现后返工。

**工作项**

1. 新增 ADR `docs/adr/0018-semantic-grouping.md`，内容包含：语义分组是派生视图；不写回 `.pv`；不改变验证结论；两类分组的定义；I1–I10；视觉记法与密度折叠的区分。
2. 新增决策票 01 `.scratch/pv-lens-grouping/decisions/01-crypto-operation-group.md`，回答：分组粒度、嵌套规则、展开状态、分类来源与置信度、用户覆盖方式。
3. 新增决策票 02 `.scratch/pv-lens-grouping/decisions/02-exchange-segment.md`，回答：因果凸定义、整条消息规则、边界与跨段边、非法范围、V1 限制。
4. 制作两个原型：`.scratch/pv-lens-grouping/prototype/01-crypto-group.html` 与 `02-exchange-segment.html`，在真实浏览器与四种视口下检查折叠、展开、嵌套、跨段边与值身份延续。
5. ADR 通过后更新 `CONTEXT.md` 的新术语与 `requirements.md` 的 U10 理解支持。
6. 编写 `.scratch/pv-lens-grouping/spec.md`，记录本文的目标、非目标、阶段拆分与验收基线。

**涉及文件**

- `docs/adr/0018-semantic-grouping.md`
- `.scratch/pv-lens-grouping/spec.md`
- `.scratch/pv-lens-grouping/decisions/01-crypto-operation-group.md`
- `.scratch/pv-lens-grouping/decisions/02-exchange-segment.md`
- `.scratch/pv-lens-grouping/prototype/01-crypto-group.html`
- `.scratch/pv-lens-grouping/prototype/02-exchange-segment.html`
- `CONTEXT.md`
- `requirements.md`

**依赖**：无。

**退出条件**

- ADR 状态为已接受，两张决策票为 `resolved`。
- `.scratch/pv-lens-grouping/spec.md` 已建立并与本文口径一致。
- 原型覆盖折叠、展开、嵌套、段边界与值身份延续，四种视口无重叠与裁切。
- 术语、不变量与视觉记法写入文档。
- 未修改生产代码。

### 阶段 1 解析与分类基础设施

**目标**：让密码操作可以被可靠识别，并保留未识别路径。

**工作项**

1. 扩展 `pv-lens/packages/core/src/parser/model.ts`，新增 `ReducEquation`，保存析构子、参数、左侧词项、右侧词项与 span。
2. 扩展 `pv-lens/packages/core/src/parser/parse.ts`，把 `reduc` 声明的方程结构化为 `PvTerm`，保留属性与源码位置。
3. 新增 `pv-lens/packages/core/src/grouping/operation-registry.ts`：操作种类、别名、方程形状匹配器与置信度。
4. 新增 `pv-lens/packages/core/src/grouping/crypto-group.ts`：把方法盒映射为密码操作组，支持嵌套、未知兜底与用户覆盖。
5. 新增测试 fixture `crypto-nested.pv` 与 `crypto-unknown.pv`，仅用于测试与本地导入，不注册为内置样例。

**识别规则**

| 操作种类 | 识别依据 | 置信度 |
|---|---|---|
| 对称加密、对称解密 | 方程形如 `d(c(m,k),k) = m`，构造子与析构子共享密钥参数 | 高 |
| 非对称加密、非对称解密 | 方程形如 `d(c(m,pk(sk)),sk) = m` | 高 |
| 签名 | `checksign(sign(m,sk),pk(sk)) = m` 或 `getmess(sign(m,sk)) = m` | 高 |
| 哈希 | 无析构子的单参数函数，名称或类型命中哈希别名 | 中 |
| 密钥派生 | `pk(sk)` 形式的单向函数，结果用作密钥 | 中 |
| 未识别 | 无方程匹配且无别名命中 | 低，不自动折叠 |

**涉及文件**

- `pv-lens/packages/core/src/parser/model.ts`
- `pv-lens/packages/core/src/parser/parse.ts`
- `pv-lens/packages/core/src/grouping/operation-registry.ts`
- `pv-lens/packages/core/src/grouping/crypto-group.ts`
- `pv-lens/packages/core/src/index.ts`
- `pv-lens/packages/core/fixtures/pv/crypto-nested.pv`
- `pv-lens/packages/core/fixtures/pv/crypto-unknown.pv`
- `pv-lens/packages/core/test/ticket28-crypto-group.test.ts`

**依赖**：阶段 0 通过。

**退出条件**

- 四个内置样例与两个合成 fixture 的加密、签名、密钥派生识别正确；未知函数不产生分组。
- 方程解析保留 span，错误输入仍降级为诊断而不抛异常。
- 用户覆盖接口可在不修改 `.pv` 的前提下改变分组种类。
- 新增测试文件，测试总数只增不减。

### 阶段 2 密码操作组渲染

**目标**：在值层交付可展开的密码操作组，并保持现有布局语义。

**工作项**

1. 在 `crypto-group.ts` 中补充分组成员、嵌套父子关系、隐藏计数与幽灵值块推导。
2. 新增 `pv-lens/packages/web/src/narrative/CryptoOperationGroup.tsx`，实现折叠态、展开态、嵌套、键盘切换、焦点样式与 ARIA 属性。
3. 修改 `pv-lens/packages/web/src/narrative/structured-layout.ts`，把密码操作组作为纵向布局单元；折叠态使用摘要高度，展开态恢复成员高度；不得改变水平序列与消息 y 的相对关系。
4. 修改 `pv-lens/packages/web/src/narrative/NarrativeView.tsx`，接入分组渲染与源码联动。
5. 新增 `GroupAuditPanel.tsx` 与图例条目，显示分组来源、种类、隐藏计数、底层 `fun/reduc` 与源码位置。
6. 修改 `Legend.tsx` 与 `v2.css`，区分语义折叠、密度折叠与未识别操作；颜色之外增加形状或线型冗余。

**涉及文件**

- `pv-lens/packages/core/src/grouping/crypto-group.ts`
- `pv-lens/packages/web/src/narrative/CryptoOperationGroup.tsx`
- `pv-lens/packages/web/src/narrative/GroupAuditPanel.tsx`
- `pv-lens/packages/web/src/narrative/structured-layout.ts`
- `pv-lens/packages/web/src/narrative/NarrativeView.tsx`
- `pv-lens/packages/web/src/narrative/Legend.tsx`
- `pv-lens/packages/web/src/narrative/v2.css`
- `pv-lens/packages/web/test/ticket29-crypto-group-render.test.ts`

**依赖**：阶段 1。

**退出条件**

- 折叠态高度低于展开态，隐藏计数与成员数一致。
- 展开全部时，角色顺序、水平序列、消息 y 关系与基线一致；无新冲突。
- 嵌套组可逐层展开；外层折叠显示内层组数量。
- 被后续引用的输出值在组外保留同色幽灵值块。
- 每个组可回溯到 `fun/reduc` 名称与源码 span。
- 语义折叠与密度折叠在灰度与打印下可区分。

### 阶段 3 交换段

**目标**：在消息层交付因果凸的交换段折叠。

**工作项**

1. 新增 `pv-lens/packages/core/src/grouping/exchange-segment.ts`：从消息配对与本地顺序构造因果 DAG，计算凸区间，校验整条消息、广播扇出、合流与跨段边。
2. 新增消息列表面板 `pv-lens/packages/web/src/narrative/MessageList.tsx`，按因果 DAG 的确定性拓扑序排列消息，tie-break 使用消息编号与源码序，支持起止选择与“封装为交换段”。
3. 新增 `ExchangeSegmentBand.tsx`，实现段头、段带、边界标记、计数与展开态。
4. 修改 `structured-layout.ts`，把段框作为刚性区间单元；段内消息折叠时使用摘要高度；段外消息保持原有因果位置。
5. 新增非法范围提示：切断消息、跨信道、广播或合流未整体包含、多方协议、嵌套段。
6. 段状态存入会话内存，切换协议即清除；提供重命名与移除。
7. 新增测试 fixture `exchange-edge-cases.pv`，覆盖两方、双信道、未配对步骤与跨信道拒绝。

**交换段 V1 限制**

- 仅两方协议可创建；多方协议入口禁用并说明原因，多方段留待后续版本。
- 仅单层，不支持段中段。
- 一条消息的全部端点必须同属一段；广播扇出与合流须整体包含或整体排除。
- 仅允许单信道段；跨信道段留待后续版本，含跨信道消息的范围按非法处理。
- 自动建议不进入 V1；只提供手动范围选择。

**涉及文件**

- `pv-lens/packages/core/src/grouping/exchange-segment.ts`
- `pv-lens/packages/core/fixtures/pv/exchange-edge-cases.pv`
- `pv-lens/packages/web/src/narrative/MessageList.tsx`
- `pv-lens/packages/web/src/narrative/ExchangeSegmentBand.tsx`
- `pv-lens/packages/web/src/narrative/structured-layout.ts`
- `pv-lens/packages/web/src/narrative/NarrativeView.tsx`
- `pv-lens/packages/web/src/narrative/v2.css`
- `pv-lens/packages/web/test/ticket30-exchange-segment.test.ts`

**依赖**：阶段 2。

**退出条件**

- 两方样例与 `exchange-edge-cases.pv` 可创建、折叠、展开与移除交换段；展开态与基线一致。
- 非法范围被拒绝并给出可读原因，不产生半条段带；跨信道范围与多方入口分别给出对应原因。
- 段内未配对步骤、分支、冲突计数准确；展开后逐项可见。
- 跨段边可见，且不被段头遮挡。
- 水平序列、角色顺序与消息因果序不变。
- 切换协议后段状态清空。

### 阶段 4 解释与任务层

**目标**：让分组标签与验证结论可以被非专业读者理解。

**工作项**

1. 新增 `pv-lens/packages/core/src/explain/concepts.ts`，为操作种类、分组来源、折叠状态、查询性质与判定状态提供定义、协议问题、ProVerif 读法与文档锚点。
2. 修改 `Legend.tsx` 与 `CryptoOperationGroup.tsx`，点击标签显示概念注解。
3. 扩展 `pv-lens/packages/web/src/query-presentation.ts`，为每条查询生成“协议问题、ProVerif 读法、判定含义”三行；查询卡增加源码 span 与画布事件锚定。
4. 新增验证覆盖摘要，列出本次声明的查询类型与未覆盖维度，明确“查询全部成立”不等于“协议安全”。
5. 新增样例导读数据与面板，把四个内置样例组织为 3–5 步任务；每步定位源码 span、事件或查询。
6. 覆盖测试：图例中的每一种记法、每一种操作种类、每一种判定状态都必须有概念注解与至少一个锚点。

**涉及文件**

- `pv-lens/packages/core/src/explain/concepts.ts`
- `pv-lens/packages/web/src/query-presentation.ts`
- `pv-lens/packages/web/src/VerifyPanel.tsx`
- `pv-lens/packages/web/src/Home.tsx`
- `pv-lens/packages/web/src/narrative/Legend.tsx`
- `pv-lens/packages/web/src/narrative/CryptoOperationGroup.tsx`
- `pv-lens/packages/web/test/ticket31-explain.test.ts`

**依赖**：阶段 2 完成；阶段 3 可选并行。

**退出条件**

- 每个分组标签可打开概念注解，注解含定义、协议问题、ProVerif 读法与锚点。
- 每条查询卡可定位源码行；事件查询可联动画布旗标与对应性矩阵。
- 覆盖摘要与实际查询集合一致。
- 导读任务的每个目标可解析到真实 span、事件或查询。
- 不新增“协议安全”或“自动修复”一类结论。

### 阶段 5 目标构建器与判定归因

**目标**：降低“不知道该问什么查询”与“看不懂反例”两道门槛。

**工作项**

1. 新增会话目标模型，支持保密性、认证、可达性三类；生成 query 文本，复用或泛化 `injectCorrespondenceQueries` 插入派生文本的 `process` 之前，不写回 `.pv`。
2. 认证目标复用 `pv-lens/packages/core/src/correspondence.ts` 的查询生成逻辑，参数化单射与非单射形式；当前 `correspondenceQueryText` 为私有函数且固定 `injective = true`（`correspondence.ts:86-116`），需先导出并参数化。
3. 扩展 `free` 名称解析，保留 `[private]` 属性与 span，供保密性目标选择顶层名称。
4. 保密性目标只对顶层 `free ... [private]` 名称生成 `query attacker(name)`；角色内 `new` 绑定不得直接生成该形式，须提示自由秘密名技巧或 `new n` 形式。
5. 生成目标命名为“会话目标”，与“声明目标”“探索性有序对”并列；界面与数据均须区分三者。
6. 新增判定归因：把反例 trace 的 derivation 行按消息步骤分组，输出“攻击者从哪条消息获得什么”的列表；无法归因的行逐字保留。
7. 归因只做列表级，不绘制几何攻击路径。

**涉及文件**

- `pv-lens/packages/core/src/goals/session-goal.ts`
- `pv-lens/packages/core/src/parser/model.ts`
- `pv-lens/packages/core/src/parser/parse.ts`
- `pv-lens/packages/core/src/attribution/trace-attribution.ts`
- `pv-lens/packages/web/src/VerifyPanel.tsx`
- `pv-lens/packages/web/src/CorrespondencePanel.tsx`
- `pv-lens/packages/web/src/narrative/NarrativeView.tsx`
- `pv-lens/packages/web/test/ticket32-session-goal.test.ts`
- `pv-lens/packages/web/test/ticket33-attribution.test.ts`

**依赖**：阶段 4。

**退出条件**

- 三类会话目标在四个内置样例上生成可运行的 query，并返回判定。
- 声明目标不被覆盖；会话目标在界面与数据上与声明目标、探索性有序对可区分。
- 被证伪的查询产出可读归因列表；无法归因的行保留原文。
- 不出现几何攻击路径或“协议整体不安全”的结论。

## 5 边界与禁止项

### 5.1 语义边界

- 分组只改变呈现，不改变 ProVerif 看到的文本、查询集合与判定。
- “签名”“加密”只是操作种类标签，不表示认证、保密或可达性成立。
- 不跨角色合并绑定，不推断同名标识符为同一值。
- 不把“查询全部成立”表述为“协议安全”。
- 不隐藏未识别或降级内容；降级语句继续按原文保留。

### 5.2 范围边界

- V1 不支持交换段自动识别、嵌套段、多方段、跨信道段。
- V1 不支持把广播扇出或合流拆分到两个段。
- V1 不支持在段内再建段；入口须禁用并说明原因。
- V1 不支持密码操作组跨操作合并；元组与变量引用不单独成组。
- 低置信操作不自动折叠，保留原始函数名。
- 画布编辑与回写 `.pv` 不在本次范围。

### 5.3 技术边界

- `core` 保持纯 TypeScript，不使用 `node:`、`require(`、`process.*`、`window`、`document`、`Buffer` 与动态 `import(`。
- 不引入自动布局引擎，不以像素快照作为唯一回归手段。
- 不引入第二套模型格式；分组 IR 必须可回溯到 `ParseResult` 与源码 span。
- Web 组件不重新解析 `.pv`，只消费 core 派生结果。
- 展开状态、段状态与用户覆盖仅存会话内存，不持久化。

### 5.4 工程边界

- 先 ADR 与决策票，后实现；决策票未 `resolved` 不得进入对应阶段。
- 一票一文件，票据置于 `.scratch/pv-lens-grouping/issues/`，不得合并为单文件。
- 测试数量只增不减；基线为 51 个测试文件、444 项测试。
- 测试文件编号续用仓库现有 `ticketNN` 序列，与 `.scratch/pv-lens-grouping` 的票据编号无关。
- `pnpm -r typecheck`、`pnpm test`、`pnpm build` 必须通过。
- 不强制推送，不改写已发布提交。
- 每个阶段完成后更新 `docs/summary.md`、`requirements.md` 与票据 `## Comments`。

## 6 验收标准

### 6.1 功能验收

| 阶段 | 验收点 | 通过条件 |
|---|---|---|
| 0 | 决策与原型 | ADR 已接受；两张决策票 `resolved`；原型在四种视口无重叠、裁切与语义歧义 |
| 1 | 解析与分类 | 四内置样例与两个合成 fixture 分类正确；未知不误分组；方程 span 可回溯 |
| 2 | 密码操作组 | 折叠、展开、嵌套、幽灵值块、审计面板、源码联动全部可用；展开态结构回归一致 |
| 3 | 交换段 | 两方样例可创建、折叠、展开、移除；非法范围被拒绝；计数准确；跨段边可见 |
| 4 | 解释与任务 | 标签有注解；查询可定位源码与画布；覆盖摘要准确；导读目标可解析 |
| 5 | 目标与归因 | 会话目标可运行；三类目标可区分；false 查询有可读归因；无几何攻击路径 |

### 6.2 自动化验收

```bash
cd pv-lens
pnpm -r typecheck
pnpm test
pnpm build
```

- 测试文件数与用例数不低于基线；每个阶段新增测试，不得以改写旧断言替代新增覆盖。
- 分组 IR 的确定性：同一输入、同一展开状态重复求解，结果一致；候选枚举顺序打乱后水平序列一致。
- 验证一致性：四个内置样例在改动前后的 `RESULT` 序列与判定一致；stdout 录制件不发生漂移。
- 源码回溯：每个组头、段头与成员都能解析到非空 span。
- 键盘可达：折叠、展开、段选择、审计面板覆盖与移除均可用键盘完成。

### 6.3 文档验收

- `docs/adr/0018-semantic-grouping.md` 状态与内容完整。
- `CONTEXT.md` 新增术语与禁用替代。
- `requirements.md` 新增 U10，并更新受影响的 U2、U3、U8 条目。
- `docs/summary.md` 记录阶段进展与测试基线。
- `docs/gui-test/README.md` 登记新截图目录、张数与批次。
- 每张票据的 `## Comments` 包含实施记录、视觉验收结论与缺陷分级。

## 7 视觉验收

### 7.1 原则

视觉验收指在真实浏览器中由人眼逐项检查，不以单元测试、`renderToString` 冒烟或 DOM 断言替代。功能正确但视觉不可读，仍判定为未通过。

验收顺序为先结构、后观感：先确认折叠与展开没有改变协议结构与判定，再检查标签、间距、颜色与线型。所有结论须附截图路径与 `file:line`。

### 7.2 环境

```bash
cd pv-lens
pnpm install
pnpm build
pnpm --filter @pv-lens/server start
pnpm --filter @pv-lens/web dev
```

- 浏览器：Chromium，真实渲染，不使用无头截图替代交互检查。
- 验证：本机 ProVerif 2.05，真实运行，不使用桩输出。
- 视口：1920×1080、1440×813、1280×720、1024×768。
- 缩放：60%、100%、180%，以及“适合宽度”与“适合页面”。
- 灰度：浏览器灰度滤镜或等效渲染。
- 打印：打印预览，检查折叠标签、段头与展开内容。

### 7.3 样本

| 样本 | 用途 |
|---|---|
| `hello` | 无密码操作与无事件的最小对照 |
| `handshake-fixed` | 对称加密、非对称加密、签名三类操作组 |
| `ns-mutual-auth` | 多角色、多操作与对应性查询；交换段入口按 V1 限制禁用 |
| `ns-original` | Lowe 攻击与被证伪查询 |
| `multi-channel` | 多信道、多方与未配对步骤；用于多方入口禁用 |
| 降级模型 | `phase`、`choice`、`not` 等降级语句不被分组隐藏 |
| 语法错误模型 | 错误诊断与分组共存 |
| `crypto-nested.pv` | 嵌套操作组，例如 `senc(sign(m,sk),k)` |
| `crypto-unknown.pv` | 未识别函数不产生分组 |
| `exchange-edge-cases.pv` | 两方、双信道、含未配对步骤；用于段内计数与跨信道拒绝 |

`crypto-nested.pv`、`crypto-unknown.pv` 与 `exchange-edge-cases.pv` 通过本地导入装载，不注册为内置样例；若后续决定注册，须运行 `pnpm --filter @pv-lens/core sync:sample-texts` 并更新漂移守卫。

### 7.4 视觉状态矩阵

执行时复制下表，每个单元格填写截图编号与结论。空格表示该状态不适用于该视口。

| 编号 | 状态 | 样本 | 1920 | 1440 | 1280 | 1024 |
|---|---|---|---|---|---|---|
| OP-01 | 操作组全折叠 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| OP-02 | 操作组全展开 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| OP-03 | 折叠与展开混合 | `ns-mutual-auth` | 必截 | 必截 | 必截 | 必截 |
| OP-04 | 嵌套组外层展开、内层折叠 | `crypto-nested` | 必截 | 必截 | 必截 | 必截 |
| OP-05 | 嵌套组全部展开 | `crypto-nested` | 必截 | 必截 | 必截 | 必截 |
| OP-06 | 未识别操作 | `crypto-unknown` | 必截 | 必截 | 必截 | 必截 |
| OP-07 | 用户覆盖分类 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| OP-08 | 悬停、焦点、选中 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| SG-01 | 交换段折叠 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| SG-02 | 交换段展开 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| SG-03 | 段内未配对步骤 | `exchange-edge-cases` | 必截 | 必截 | 必截 | 必截 |
| SG-04 | 跨段边 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| SG-05 | 跨信道范围拒绝 | `exchange-edge-cases` | 必截 | 必截 | 必截 | 必截 |
| SG-06 | 段列表重命名与移除 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| SG-07 | 多方入口禁用 | `multi-channel` | 必截 | 必截 | 必截 | 必截 |
| MS-01 | 分组与降级语句共存 | 降级模型 | 必截 | 必截 | 必截 | 必截 |
| MS-02 | 分组与语法错误共存 | 语法错误模型 | 必截 | 必截 | 必截 | 必截 |
| MS-03 | 缩放 60% | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| MS-04 | 缩放 180% | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| MS-05 | 灰度，含操作组与交换段 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| MS-06 | 打印预览 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| MS-07 | 无分组与无段的空状态 | `hello` | 必截 | 必截 | 必截 | 必截 |
| EX-01 | 概念注解浮层 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| EX-02 | 查询卡与源码、画布联动 | `ns-original` | 必截 | 必截 | 必截 | 必截 |
| EX-03 | 验证覆盖摘要 | `handshake-fixed` | 必截 | 必截 | 必截 | 必截 |
| EX-04 | 样例导读任务 | `ns-original` | 必截 | 必截 | 必截 | 必截 |
| EX-05 | 会话目标与声明目标并存 | `ns-original` | 必截 | 必截 | 必截 | 必截 |
| EX-06 | 判定归因列表 | `ns-original` | 必截 | 必截 | 必截 | 必截 |

### 7.5 密码操作组视觉检查项

| 编号 | 检查项 | 通过条件 |
|---|---|---|
| V-OP-01 | 折叠标签完整性 | 显示操作种类、方向、关键参数、密钥身份与隐藏计数；1024 视口不出现省略号截断 |
| V-OP-02 | 展开态结构一致 | 角色顺序、水平序列、消息 y 关系与改动前基线一致；无新冲突标记 |
| V-OP-03 | 嵌套可读性 | 外层折叠显示内层组数量；展开外层后内层折叠标签不与相邻单元重叠 |
| V-OP-04 | 方向记法 | 构造组横置、解构组竖置；形状与方向一致，不依赖颜色 |
| V-OP-05 | 值身份延续 | 被引用输出在组外保留同色幽灵值块；颜色与序号与折叠前一致 |
| V-OP-06 | 源码联动 | 点击组头高亮成员区间并集；展开后点击成员高亮精确 span |
| V-OP-07 | 悬停与焦点 | 提示框不遮挡相邻标签；焦点环完整可见；Enter 与 Space 可切换展开 |
| V-OP-08 | 两种折叠可区分 | 语义折叠与密度折叠在边框、图标或线型上不同；灰度下仍可区分 |
| V-OP-09 | 未识别操作 | 不产生分组；原始函数名完整可见；提示为中性说明而非错误 |
| V-OP-10 | 用户覆盖 | 审计面板显示来源为“用户声明”；修改种类后标签更新；重置后恢复自动结果 |
| V-OP-11 | 缩放 | 60% 与 180% 下标签可读，无裁切、无重叠、无横向溢出 |
| V-OP-12 | 打印 | 折叠标签完整打印；展开内容不被裁切；无底色依赖 |

### 7.6 交换段视觉检查项

| 编号 | 检查项 | 通过条件 |
|---|---|---|
| V-SG-01 | 段头可读性 | 段头显示参与角色、消息编号区间、条数与隐藏计数；1024 视口不重叠角色名与信道字形 |
| V-SG-02 | 段带范围 | 段带只覆盖段内消息涉及的角色与信道；不遮挡无关生命线 |
| V-SG-03 | 段外消息位置 | 段前与段后消息保持原有 y 关系；不与段头或边界标记碰撞 |
| V-SG-04 | 计数准确 | 消息、未配对步骤、分支、冲突的计数与展开后实际数量一致 |
| V-SG-05 | 展开一致 | 展开态与改动前基线一致；消息行、消息柱与端点位置不变 |
| V-SG-06 | 跨段边保留 | 跨段边完整可见；不穿过段头、段带或计数标签 |
| V-SG-07 | 未配对步骤 | 段内未配对步骤计入计数；展开后端点落在信道轨，橙色标记可见 |
| V-SG-08 | 非法范围 | 拒绝提示就地显示，说明切断消息、跨信道、广播或合流或嵌套段原因；不产生半条段带 |
| V-SG-09 | 段列表 | 重命名与移除可用；切换协议后列表清空；无残留段带 |
| V-SG-10 | 灰度与打印 | 段带边界、段头与计数在灰度与打印下可辨；不依赖颜色 |

### 7.7 解释与任务层视觉检查项

| 编号 | 检查项 | 通过条件 |
|---|---|---|
| V-EX-01 | 概念注解完整性 | 注解浮层同时显示定义、协议问题、ProVerif 读法与文档锚点；不遮挡被解释的标签 |
| V-EX-02 | 注解与分组一致 | 操作种类标签、注解标题与底层 `fun/reduc` 名称一致；用户覆盖后注解同步更新 |
| V-EX-03 | 查询卡锚定 | 点击查询卡可定位源码行；事件查询可联动画布旗标与对应性矩阵；高亮不误伤同名不同绑定 |
| V-EX-04 | 覆盖摘要准确 | 摘要中的查询类型数量与实际声明一致；未覆盖维度以中性措辞呈现，不制造安全结论 |
| V-EX-05 | 导读任务可完成 | 每步目标可见、可定位、可返回；完成状态在会话内保留；不依赖外部文档 |
| V-EX-06 | 窄屏可读性 | 1024 视口下注解浮层、查询卡与导读面板不溢出、不遮挡画布主结构 |
| V-EX-07 | 会话目标可区分 | 会话目标与源码声明目标、探索性有序对在标签、颜色或分组上有稳定区别；生成文本可见 |
| V-EX-08 | 归因可核对 | 归因列表与 trace 原文可双向对照；无法归因的行逐字保留；不出现几何攻击路径 |

### 7.8 截图证据

- 目录：`docs/gui-test/23-screenshots/`。
- 命名：`sg<阶段>-<状态>-<视口>.png`，例如 `sg2-collapsed-1440.png`、`sg3-segment-1280.png`。
- 每张截图保留完整浏览器视口；细节截图须同时保留上下文，不得只截单个元素。
- 改动前基线截图使用 `sg0-baseline-*`，与阶段 2、阶段 3 的展开态截图成对保存。
- 截图清单写入 `docs/gui-test/README.md`，包含目录、张数、批次与引用文档。
- 每张截图在验收表中登记编号、样本、视口、状态与结论。

### 7.9 控制台与运行时断言

- 无 `Encountered two children with the same key` 警告。
- 无未捕获异常、无 React 警告、无 `favicon.ico` 404。
- 无布局溢出警告、无 `ResizeObserver` 循环警告。
- 真实 ProVerif 运行成功；四个内置样例的判定与改动前一致。
- 控制台记录与截图一并存入验收票据。

### 7.10 缺陷分级与通过标准

| 等级 | 定义 | 示例 | 处置 |
|---|---|---|---|
| P0 | 导致语义误读、判定错误或结构破坏 | 折叠隐藏了签名对象或密钥；分类错误；隐藏计数不符；跨段边丢失；展开态结构改变；标签重叠导致不可读；判定变化 | 阻断合并，必须修复并重新验收 |
| P1 | 影响效率或可读性，但有可用替代 | 单一视口标签截断；提示框遮挡相邻标签；焦点环不完整；图例与画布不一致 | 本阶段修复，或登记票据并说明延后理由 |
| P2 | 观感与细节问题 | 间距不均、字号偏差、图标对齐、动画节奏 | 记录，不阻断合并 |

视觉验收通过须同时满足：

1. 7.4 矩阵全部执行，每个单元格有截图与结论。
2. P0 数量为 0。
3. P1 全部修复，或存在明确处置票据与延后理由。
4. P2 全部记录。
5. 7.9 控制台断言全部通过。
6. 展开态与基线截图成对保存，差异可解释。

### 7.11 视觉验收执行顺序

1. 阶段 0 前拍摄基线：四个内置样例、多信道、降级、语法错误在四种视口下的展开态截图，存 `sg0-baseline-*`。
2. 阶段 2 完成后执行 OP-01 至 OP-08 与 MS-01、MS-02。
3. 阶段 3 完成后执行 SG-01 至 SG-07 与 MS-05。
4. 阶段 4 完成后执行 EX-01 至 EX-04，检查概念注解、查询卡与导读任务的视觉锚定。
5. 阶段 5 完成后执行 MS-03、MS-04、MS-06、EX-05、EX-06 与全量回归。
6. 每阶段按 P0、P1、P2 输出结论，附截图路径与 `file:line`。
7. 结论写入对应票据 `## Comments`，并更新 `docs/gui-test/README.md`。
8. 阶段结项前复核基线截图与当前截图，确认展开态无未解释差异。

## 8 交付物与分支工作流

### 8.1 分支

- 工作分支为 `dev`，基线提交 `98dfeec`。
- 每阶段一个或多个提交，提交信息使用英文，沿用 `feat(core):`、`feat(web):`、`docs:`、`test:` 前缀。
- 阶段验收通过前不得合并到 `master`。
- 不强制推送，不改写已发布提交。

### 8.2 每阶段交付物

| 交付物 | 内容 |
|---|---|
| 代码 | `core` 分组模块、`web` 渲染与交互、必要的解析扩展 |
| 测试 | 新增测试文件与 fixture；测试数量只增不减 |
| 文档 | ADR、`CONTEXT.md`、`requirements.md`、`docs/summary.md`、票据 Comments |
| 视觉证据 | `docs/gui-test/23-screenshots/` 下对应阶段截图与控制台记录 |
| 验收记录 | 功能、自动化、视觉三部分结论，P0/P1/P2 分级 |

### 8.3 票据流程

1. 在 `.scratch/pv-lens-grouping/issues/` 建立票据，一票一文件，编号从 `01` 起。
2. 票据顶部写入 `Status:` 行；开始工作前改为 `claimed`。
3. 完成实现后追加 `## Comments`，记录差异检查、测试结果、两轴评审与视觉验收。
4. 通过后改为 `resolved`，并在 `docs/summary.md` 登记。
5. 阶段 0 的决策票放在 `.scratch/pv-lens-grouping/decisions/`，编号另起，不与实现票混用。

## 9 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 交换段的序语义不成立 | 段成员与边界无法确定，折叠后误导读者的因果理解 | 以因果凸定义成员；先做决策票与原型；V1 仅两方协议 |
| 段框与弹性间距、跨角色耦合冲突 | 布局重叠、消息位置漂移、冲突标记增加 | 段框作为刚性区间单元；先原型后实现；展开态结构回归 |
| 密码操作误分类 | 用户把错误标签当作协议事实 | 方程匹配优先；置信度可见；低置信不折叠；用户可覆盖；未识别保留原名 |
| 折叠隐藏协议相关参数 | 看不到签名对象或密钥错误，掩盖协议缺陷 | 折叠态强制显示关键参数与密钥身份；视觉检查 V-OP-01 列为 P0 |
| 值身份在折叠后断裂 | “同色同值”约定失效，产生错误推断 | 复用幽灵值块；检查颜色与序号一致；V-OP-05 列为 P0 |
| 范围增长过快 | 分组、解释、目标、归因同时推进，验证不足 | 阶段 0–3 为主线；阶段 4、5 后置；每阶段独立结项 |
| 视觉回归被自动化测试掩盖 | 测试通过但界面不可读 | 真实浏览器逐项验收；截图留证；P0 阻断合并 |
| 文档与实现漂移 | 术语、判定措辞与界面不一致 | ADR 先行；术语写入 `CONTEXT.md`；每阶段更新 `requirements.md` 与 `docs/summary.md` |

## 10 附录

### 10.1 阶段验收记录模板

| 项 | 内容 |
|---|---|
| 阶段 |  |
| 票据 |  |
| 样本 |  |
| 视口 |  |
| 状态 |  |
| 截图 |  |
| 控制台 |  |
| 自动化结果 |  |
| 视觉结论 | PASS 或 FAIL |
| P0 |  |
| P1 |  |
| P2 |  |
| 备注 |  |

### 10.2 视觉矩阵记录模板

| 编号 | 状态 | 样本 | 视口 | 截图 | 结论 | 缺陷等级 |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

### 10.3 阶段结项检查表

- [ ] ADR 与决策票已 `resolved`。
- [ ] 功能验收全部通过。
- [ ] `pnpm -r typecheck`、`pnpm test`、`pnpm build` 通过。
- [ ] 测试数量不低于基线。
- [ ] 真实浏览器与真实 ProVerif 验收完成。
- [ ] 7.4 矩阵全部执行，截图存入 `docs/gui-test/23-screenshots/`。
- [ ] P0 数量为 0；P1 已修复或有处置票据；P2 已记录。
- [ ] 控制台断言全部通过。
- [ ] `CONTEXT.md`、`requirements.md`、`docs/summary.md`、`docs/gui-test/README.md` 已更新。
- [ ] 票据 `## Comments` 已追加实施与验收记录。
