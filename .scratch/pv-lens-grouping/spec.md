# pv-lens 语义分组：规格

Status: active（阶段 0 已验收；阶段 1–4 已实现待验收，2026-11-05）
Baseline: `dev` @ `98dfeec`（51 个测试文件、444 项测试）
依据：`PLAN.md`、`CONTEXT.md`、`docs/adr/0001`–`0018`、`requirements.md`
决策票：[01 密码操作组](decisions/01-crypto-operation-group.md)、[02 交换段](decisions/02-exchange-segment.md)

## 1. 问题

规范叙事视图把密码操作展开为逐个方法盒、把消息展开为逐条消息行。读者必须先掌握算子语法，才能看出「这里做了一次签名」或「这一段是一次握手往返」。值层与消息层的细节密度构成第一道知识门槛。

第二道门槛在判定侧：验证结论按查询逐条给出，但查询与画布、源码之间没有稳定锚定。分组只降低第一道门槛，不替代判定解释与归因。

## 2. 目标

| 编号 | 目标 | 主要交付 |
|---|---|---|
| G1 | 值层可按密码操作折叠与展开 | 密码操作组、操作注册表、分类器、审计面板 |
| G2 | 消息层可按交换段折叠与展开 | 因果凸交换段、段框、消息列表选择、边界校验 |
| G3 | 分组标签可解释 | 概念注解、图例、源码锚点 |
| G4 | 判定可回到协议问题 | 查询三行翻译、覆盖摘要、判定归因 |

G1、G2 为主线；G3 承接解释层；G4 在 G1、G2 稳定后推进。

## 3. 非目标

- 画布编辑、拖拽生命线或端点、分组结果回写 `.pv`。
- 新的协议模型格式、DSL 或独立图存储。
- 交换段自动识别、嵌套段、多方段、跨信道段。
- 把广播扇出或合流拆到两个交换段。
- 反例的几何攻击路径、`-graph` / `-html` 攻击图导出。
- 完整 ProVerif 语法、观察等价、`choice` 等进阶语义。
- 多用户、账号、云端保存、公网部署、ProVerif 分发。

## 4. 术语与不变量

术语与不变量以 `docs/adr/0018-semantic-grouping.md` 第 3、4 节为准。`CONTEXT.md` 在 ADR 接受后登记新词条；本规格与 ADR 冲突时以 ADR 为准。

新增术语：密码操作组、操作种类、语义折叠、分组来源、交换段、因果凸、段框、跨段边、审计面板。

不变量 I1–I10 为硬约束：`.pv` 唯一真源；不改变验证输入与结论；不改变水平序列、角色顺序与因果序；隐藏项须计数并可展开；跨组引用与跨段边可见；值身份颜色一致并保留幽灵值块；标签不构成安全结论；用户声明仅存会话内存；段只含完整消息；展开全部时结构与基线一致。

## 5. 架构

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

- 分组 IR 由 `core` 的纯函数派生，不进入 `ParseResult`。
- `core` 保持纯 TypeScript：不使用 `node:`、`require(`、`process.*`、`window`、`document`、`Buffer` 与动态 `import(`。
- Web 组件不重新解析 `.pv`，只消费 core 派生结果。
- 不引入自动布局引擎；不以像素快照作为唯一回归手段。

### 对象模型

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

interface CryptoOperationGroup {
  id: string;
  roleName: string;
  kind: OperationKind;
  direction: 'construct' | 'destruct';
  origin: GroupingOrigin;
  confidence: Confidence | 'user';
  members: readonly string[];
  operands: { payload?: TermReference; key?: TermReference };
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

字段约束见决策票 01 与 02。`members` 只保存方法盒与值方块 id，不保存坐标；`messageIds` 只保存完整消息；`hiddenCount(s)` 由成员集合计算。

## 6. 阶段拆分

每阶段独立验收。阶段 0 未通过前不得写生产代码。

### 阶段 0 决策与原型

交付：ADR-0018、两张决策票、本规格、两个原型、`CONTEXT.md` 与 `requirements.md` 术语更新。

退出条件：

- ADR 状态为已接受，两张决策票为 `resolved`。
- 本规格与 `PLAN.md` 口径一致。
- 原型覆盖折叠、展开、嵌套、段边界与值身份延续，四种视口无重叠与裁切。
- 未修改生产代码。

**原型的可操作语义**（以两张决策票的「原型交互语义」为准，实施阶段不得只复刻视觉）：

- 细节层级只重置展开状态，不改变种类、来源或用户声明；概念层折叠全部操作组，结构层展开全部操作组但保持密度折叠，语法层全部展开。
- 隐藏项 = 组内操作盒与值块总数（含嵌套组），不是消息条数；幽灵值块不计入。
- 审计下拉即用户声明，选回自动种类即撤销；定位只高亮，不改变折叠状态；重置在无声明时禁用。
- 交换段选择只针对整条消息；切半模拟按非法拒绝并显示「仅发送端」；创建成功后清空选择；已有段时需先移除（原型单段限制，V1 正式实现允许多个互不重叠段）。
- 折叠 / 展开的工具栏按钮、段头单击与段卡片按钮三处同步；冲突模拟与协议切换均为演示态，不改变消息、因果序或 `.pv`。
- 灰度与打印只改变渲染预览，不改变数据与状态。

### 阶段 1 解析与分类基础设施

1. `parser/model.ts` 新增 `ReducEquation`：析构子、参数、左侧词项、右侧词项与 span。
2. `parser/parse.ts` 把 `reduc` 声明结构化为 `PvTerm`，保留属性与源码位置；错误降级为诊断。
3. 新增 `core/src/grouping/operation-registry.ts`：操作种类、别名、方程形状匹配器与置信度。
4. 新增 `core/src/grouping/crypto-group.ts`：方法盒映射为分组，支持嵌套、未知兜底与用户覆盖。
5. 新增 fixture `crypto-nested.pv`、`crypto-unknown.pv`；新增测试 `ticket28-crypto-group.test.ts`。

退出条件：四个内置样例与两个 fixture 分类正确；未知函数不产生分组；方程 span 可回溯；用户覆盖不修改 `.pv`；测试只增不减。

### 阶段 2 密码操作组渲染

1. 补充分组成员、嵌套父子关系、隐藏计数与幽灵值块推导。
2. 新增 `CryptoOperationGroup.tsx`：折叠态、展开态、嵌套、键盘切换、焦点样式与 ARIA。
3. `structured-layout.ts` 把操作组作为纵向布局单元：折叠用摘要高度，展开恢复成员高度；不改变水平序列与消息 y 关系。
4. `NarrativeView.tsx` 接入分组与源码联动。
5. 新增 `GroupAuditPanel.tsx` 与图例条目。
6. `Legend.tsx` 与 `v2.css` 区分语义折叠、密度折叠与未识别操作，颜色之外增加形状或线型冗余。

退出条件：折叠高度低于展开；隐藏计数与成员数一致；展开全部时结构与基线一致；嵌套逐层展开；幽灵值块同色；源码可回溯；灰度与打印可区分；新增 `ticket29-crypto-group-render.test.ts`。

### 阶段 3 交换段

1. 新增 `core/src/grouping/exchange-segment.ts`：因果 DAG、凸区间、整条消息、广播/合流、跨段边校验。
2. 新增 `MessageList.tsx`：确定性拓扑序、起止选择、「封装为交换段」。
3. 新增 `ExchangeSegmentBand.tsx`：段头、段带、边界标记、计数与展开态。
4. `structured-layout.ts` 把段框作为刚性区间单元。
5. 非法范围提示：切断消息、非凸、跨信道、广播/合流、多方、嵌套段。
6. 段状态存会话内存；重命名与移除。
7. fixture `exchange-edge-cases.pv`；测试 `ticket30-exchange-segment.test.ts`。

退出条件：两方样例与 fixture 可创建、折叠、展开、移除；非法范围拒绝并说明；计数准确；跨段边可见；结构序不变；切换协议清空。

### 阶段 4 解释与任务层

1. `core/src/explain/concepts.ts`：操作种类、分组来源、折叠状态、查询性质与判定状态的定义、协议问题、ProVerif 读法与文档锚点。
2. 图例与组标签点击显示概念注解。
3. `query-presentation.ts` 生成「协议问题 / ProVerif 读法 / 判定含义」三行；查询卡锚定源码 span 与画布事件。
4. 验证覆盖摘要；不得把「查询全部成立」表述为「协议安全」。
5. 四个样例导读任务（3–5 步）。
6. 测试 `ticket31-explain.test.ts`。

### 阶段 5 目标构建器与判定归因

1. 会话目标模型（保密性、认证、可达性），生成 query 文本插入派生 `process` 之前，不写回 `.pv`。
2. 认证目标参数化单射/非单射；先导出并参数化 `correspondenceQueryText`。
3. `free` 名称保留 `[private]` 与 span。
4. 保密性目标只对顶层 `free ... [private]` 生成 `query attacker(name)`；角色内 `new` 给出提示。
5. 「会话目标」与「声明目标」「探索性有序对」在界面与数据上可区分。
6. 反例 trace 按消息步骤归因；无法归因的行逐字保留。
7. 归因只做列表级，不绘制几何攻击路径。

## 7. 验收

### 7.1 自动化

```bash
cd pv-lens
pnpm -r typecheck
pnpm test
pnpm build
```

- 测试文件数与用例数不低于基线 51 / 444；每阶段新增测试，不以改写旧断言替代新增覆盖。
- 分组 IR 确定性：同一输入、同一展开状态重复求解结果一致；候选枚举顺序打乱后水平序列一致。
- 验证一致性：四个内置样例改动前后 `RESULT` 序列与判定一致。
- 源码回溯：组头、段头与成员均可解析到非空 span。
- 键盘可达：折叠、展开、段选择、审计面板覆盖与移除均可用键盘完成。

### 7.2 视觉

视觉验收在真实浏览器中由人眼逐项检查，不以单元测试或 DOM 断言替代。视口 1920×1080、1440×813、1280×720、1024×768；缩放 60%、100%、180%；灰度与打印。截图存 `docs/gui-test/23-screenshots/`，命名 `sg<阶段>-<状态>-<视口>.png`；基线截图 `sg0-baseline-*`。

状态矩阵、检查项 V-OP / V-SG / V-EX 与 P0/P1/P2 分级见 `PLAN.md` 第 7 节。P0 阻断合并；P1 本阶段修复或登记处置；P2 记录。

阶段 0 的原型检查覆盖：折叠、展开、嵌套、方向、幽灵值块、段边界、跨段边、非法范围、计数、灰度与打印，四种视口无重叠与裁切。

### 7.3 文档

- `docs/adr/0018-semantic-grouping.md` 完整且状态为已接受。
- `CONTEXT.md` 新增术语与禁用替代。
- `requirements.md` 新增 U10，并更新受影响的 U2、U3、U8 条目。
- `docs/summary.md` 记录阶段进展与测试基线。
- `docs/gui-test/README.md` 登记截图目录、张数与批次。
- 每张实现票据的 `## Comments` 包含实施记录、视觉验收结论与缺陷分级。

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 交换段序语义不成立 | 段成员与边界无法确定，折叠误导读者的因果理解 | 因果凸定义；先原型后实现；V1 仅两方 |
| 段框与弹性间距、跨角色耦合冲突 | 布局重叠、消息漂移、冲突标记增加 | 段框作为刚性区间单元；展开态结构回归 |
| 密码操作误分类 | 用户把错误标签当作协议事实 | 方程优先；置信度可见；低置信不折叠；可覆盖；未识别保留原名 |
| 折叠隐藏协议相关参数 | 看不到签名对象或密钥错误 | 折叠态强制显示关键参数与密钥身份；V-OP-01 列为 P0 |
| 值身份在折叠后断裂 | 「同色同值」失效 | 复用幽灵值块；V-OP-05 列为 P0 |
| 范围增长过快 | 验证不足 | 阶段 0–3 为主线；阶段 4、5 后置；每阶段独立结项 |
| 视觉回归被自动化掩盖 | 测试通过但界面不可读 | 真实浏览器逐项验收；截图留证；P0 阻断合并 |
| 文档与实现漂移 | 术语与界面不一致 | ADR 先行；每阶段更新文档 |

## 9. 分支与交付

- 工作分支 `dev`，基线 `98dfeec`；每阶段一个或多个提交，英文提交信息，沿用 `feat(core):`、`feat(web):`、`docs:`、`test:` 前缀。
- 阶段验收通过前不合并到 `master`；不强制推送，不改写已发布提交。
- 一票一文件，实现票置于 `.scratch/pv-lens-grouping/issues/`；决策票置于 `decisions/`，两套编号不混用。
- 每阶段交付：代码、测试、文档（ADR / CONTEXT / requirements / summary / 票据 Comments）、视觉证据、验收记录。
