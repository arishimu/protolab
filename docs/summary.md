# 项目现状总结：ProVerif 学习工作区与 pv-lens

> 核查时间：2026-09-24。本文依据仓库当前的 `.scratch/`、`docs/`、`CONTEXT.md`、`README.md` 和 `pv-lens/` 源码；“已实现”以源码与本次检查为准，“计划”以规格和票据为准。本文是重构前的现状记录，不把尚未接入界面的函数或原型算作已交付功能。
>
> **2026-11-02 更新**：下文为 2026-09-24 的时点快照，保留原文未改；其中「v2 实现进度」「与目标的距离」两节的票据状态已经过时。截至本更新，v2 的 11 张实现票据全部 `resolved`（04–11 于 2026-10 至 11 月间完成，每票附实施与验收记录及两轴 code-review 落实记录），当前基线为 35 个测试文件、329 项测试全绿。快照所列风险 1（产品承诺与入口不一致）已由 [ADR-0011](adr/0011-product-phasing.md) 裁定为分期：先交付只读阅读与验证（v1 + v2 已达成），画布编辑回写归二期、开工前另立 ADR 与规格；风险 2 所指的按功能票累加问题在 07–10 各票的浏览器验收与截图记录中逐票核对。遗留事项：视觉语法细节层（色板、字形全集、缩放控件形态）按 [v2 map](../.scratch/pv-lens-v2/map.md) 口径留待 `/to-spec` 补充规格；浏览器端到端验收脚本按仓库惯例不入库，验收结论记录于各票 Comments；另有一个范围外已知问题（ns 系复合守卫渲染的 React duplicate key 警告）登记于 07 票，建议后续 triage。
>
> **2026-11-02 P0 整改更新**：GUI 测试报告的 P0 六项已实施，当前基线为 40 个测试文件、347 项测试全绿。新增 [ADR-0012](adr/0012-identity-color-injective.md)、[ADR-0013](adr/0013-causal-message-order.md)、[ADR-0014](adr/0014-unpaired-rail-and-message-lanes.md)、[ADR-0016](adr/0016-declared-vs-exploratory-correspondence.md)。T6 的 duplicate key 问题仍待 P2 实施。
>
> **2026-11-03 P1 整改更新**：GUI 测试报告整改方案（`gui-test/gui-test-remediation.md`）的 P1 九项（B1–B7 遮挡与溢出、G1–G2 线型与灰度身份）已实施并完成浏览器验收，当前基线为 41 个测试文件、357 项测试全绿。遮挡修复落在 `structured-layout.ts`、`NarrativeView.tsx`、`v2.css` 与 `styles.css`，测试集中于 `packages/web/test/ticket17-p1-visual.test.ts`；验收截图存于 `gui-test/17-screenshots/`，实施记录见整改方案第 6 节。T6 的 duplicate key 问题与 P2 交互批次仍待实施。
>
> **2026-11-03 P2 整改更新**：整改方案的 P2 十一项（D1–D8 交互、E1–E2 布局、H1 duplicate key）连同 V4 端点键盘配对已实施并完成浏览器验收，当前基线为 43 个测试文件、367 项测试全绿。[ADR-0015](adr/0015-viewport-layout-and-scroll-ownership.md) 的双栏布局、画布限高与滚动所有权已落实（1280px 断点、源码列 sticky、画布容器 75vh、revealPanel 页面滚动口径）；T6 的 duplicate key 已修复（`structured-layout.ts` 三处 id 加入行下标，复合守卫模型控制台警告归零）。人工配对增加成功提示、清单、撤销与类型不符警告（`message-pairing.ts` 借助 `pairing.ts` 导出的 `inferredTypeOf` 写明类型名）。测试落在 `ticket18-interaction.test.ts` 与 `ticket19-layout.test.ts`；验收截图存于 `gui-test/18-screenshots/`，实施记录见整改方案第 7 节。P3 记法与文案批次于 2026-11-03 实施：C1–C15（图例口径、事件中性标记、insert 胶囊、get 单盒、构造盒宽、臂内归属、冲突用户语言、两行标签、折叠徽标、滑块档位、配对入口、降级行单元、`new` 类型回退）与 F1–F5（泳道术语清理、反引号清理、内部信息与 stdout 脱敏、ProVerif 行列定位并列、goal reachable 释义）完成，当前基线为 45 个测试文件、387 项测试全绿，验收截图存于 `gui-test/19-screenshots/`，实施记录见整改方案第 8 节。至此整改方案 46 项（P0–P3）与第 9 节盲区补测（V1–V4）全部完成。
>
> **2026-11-03 第二轮 P0 整改更新**：`gui-test/gui-test-remediation-2.md` 的 P0 三项（R01–R03）已实施。对应性矩阵的声明目标改为按源码原查询语义运行，非单射 `event` 不再被替换为 `inj-event` 探针，矩阵声明格与验证面板结论一致；证明成立的卡片把 `goal reachable` 收入“证明中给出的对应事实”，仅被证伪时使用“攻击路径摘要”；人工配对成功提示增加信道名与“撤销上一条”，撤销后同步清理提示与清单。ADR-0016 已修订，`CONTEXT.md` 增加“单射强化探针”，`requirements.md` 更新 U5.4 并新增 U6.9。测试基线为 48 个测试文件、396 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。R04–R20 尚未实施；R04 随后实施，见下条。
>
> **2026-11-03 第二轮 R04 整改更新**：画布视口增加“适合页面”“展开画布”“全屏画布”与滚动阈值触发的“回到顶部”。适合页面按容器宽高缩放，允许 12%–60% 的全图概览并显示提示；展开画布取消内部限高、由页面连续滚动；全屏覆盖视口并锁定页面滚动，支持 Esc 退出；滚动条改为可见样式。ADR-0015 已修订，`requirements.md` 更新 U8.3 并新增 U8.8。测试基线为 49 个测试文件、400 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。R05–R20 尚未实施；R05 随后实施，见下条。
>
> **2026-11-03 第二轮 R05 整改更新**：事件标签改用左右列边界与语义断行，最左角色预留左侧标签槽位，不再把事件名从中间切开；本地步骤、`insert` 与降级原文改为单行逐字渲染，`not attacker(Na)` 不再显示为 `not attacke r(Na)`。新增 ADR-0017，`requirements.md` 更新 U7.1 并新增 U8.9。测试基线为 49 个测试文件、403 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。R06–R20 尚未实施；R06 随后实施，见下条。
>
> **2026-11-03 第二轮 R06 整改更新**：人工配对的线上词项芯片与端点共享同一选择状态机——芯片补 `role="button"`、`tabIndex`、Enter/Space 激活与 24 px 命中区，配对模式下候选端点与候选芯片高亮；进入配对前预检同信道候选，无候选时禁用入口并在常驻提示中说明原因。测试基线为 49 个测试文件、405 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。R07–R20 尚未实施；R07、R08 随后实施，见下条。
>
> **2026-11-04 第二轮 R07/R08 整改更新**：图例的值身份清单移出三列记法网格，成为独立的“本图值序号（N）”折叠面板（超过 12 个默认折叠），图例默认限高 320 px 内部滚动，打印时放开；NS 修正版图例不再把单行撑到 966 px，对应性矩阵无需滚过整块图例。窄屏（<1280 px）画布列排在源码列之前，装载页新增“隐藏源码”按钮（sessionStorage 会话记忆，宽屏收为单列）；自动适配设最小可读缩放（低于 90% 保持 100% 并允许横向滚动），缩放读出旁新增等效正文字号提示。`requirements.md` 更新 U8.3、U8.5，ADR-0015 补窄屏顺序条款。测试基线为 49 个测试文件、411 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。至此 P1 长模型可读性批次（R04–R08）完成；下一批为 R09–R12（语义与文案收尾），R13–R20 待实施。
>
> **2026-11-04 第二轮 R09/R17 整改更新**：信道序号字形、tooltip 与总线边框线型统一按水平序列中从左到右的位置生成（布局新增 `channelOrder`，新增 `channelLineStyleOf` 纯函数），不再混用声明收集顺序——多信道样例从左到右为 `c2 ①`（实线）、`c1 ②`（长虚线）、`c3 ③`（点线），与图例描述一致；超过五个信道以 `(n)` 形式显示并在图例说明。信道边框线宽提至 2 px，三线型墨迹密度分层（100%、约 58%、约 25%），灰度与打印下按密度可指认。ADR-0010 增补第 5 条修订。测试基线为 49 个测试文件、415 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。下一批为 R10、R12、R14（验证面板与文案）。
>
> **2026-11-04 第二轮 R10/R12/R14 整改更新**：验证失败的 `kind` 枚举、服务端消息与退出码收进可折叠的“技术细节”，状态行与标题不再外露机器枚举；502/504 且响应体非 JSON 归为“验证服务不可达”；启动指引统一为“在 pv-lens 目录执行 pnpm start”，删除 ADR-0002/MVP 内部术语；验证面板标题旁新增服务健康状态（`useVerifyServiceHealth` 探测 `/api/health`），ProVerif 定位附源码行片段。stdout 按 `Starting query` 分节折叠（`splitStdoutSections`），stdout、stderr 与反例 trace 均提供复制、下载与适合宽度切换（消除双重滚动）。查询卡片的归一化形态仅在实质差异时另列，前缀声明与对应事实收进“证明细节”，被证伪卡片高度由 289 px 压至 224 px。测试基线为 49 个测试文件、423 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。下一批为 R11、R15（画布降级与分支视觉）。
>
> **2026-11-04 第二轮 R11/R15 整改更新**：降级语句改用独立的虚线琥珀边框样式（`structured-node--degraded`），不再与 insert 的浅黄实线胶囊共用，图例同步区分说明；协议标题区新增“解析降级 N 处”横幅并提供“定位首个降级节点”入口，`ParseNotices` 补数量，画布降级节点、源码行标记与诊断的数量按 C14 归属口径一致。臂道标签字号提至 10px；源码选中态描边改中性深灰加粗 + 暖色光晕，不再与 then 臂道共色相。`requirements.md` 更新 U7.1 补充降级视觉区分口径。测试基线为 49 个测试文件、428 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。下一批为 R13、R16、R18、R19（矩阵、源码面板、行宽与首页）。
>
> **2026-11-04 第二轮 R13/R16/R18/R19 整改更新**：对应性矩阵 `width: 100%` 限宽 760px，宽屏单元格增至 40×32px，图例补“蓝框 = 源码声明目标”，声明过滤改渲染声明目标列表（不再保留清空网格），并修复该面板失败状态行外露 kind 枚举的遗漏。源码面板新增“自动换行”开关（sessionStorage 记忆）；宽屏源码/画布列间新增可拖拽分隔条（280–560px，会话记忆）。说明文字行宽限 70ch。新增 favicon（消除控制台 404）、首页“如何阅读这张图”4 条阅读路径与验证服务健康状态（复用 R10 的 hook）。`requirements.md` 更新 U8.5 补矩阵口径。测试基线为 49 个测试文件、435 项测试全部成功，`pnpm -r typecheck` 与 `pnpm build` 通过；验收截图存于 `gui-test/21-screenshots/`。仅剩 R20（键盘可达性）与全量回归。
>
> **2026-11-04 第二轮整改结项（R20 + 全量回归）**：事件旗标、分支、本地/降级/insert 节点统一补 `role="button"` 与 Enter/Space 激活（与端点、芯片同一状态机）；源码行实现 roving tabindex（↑/↓/Home/End 移动、Enter 反向联动画布），画布三类节点与源码行补可见焦点样式。第 10 节全量回归通过：7 个样本（四内置 + 多信道 + 降级 + 语法错误）× 四视口（1920/1440/1280/1024）全部装载成功，控制台无 duplicate key、无未捕获异常、无 favicon 404，灰度下信道线型、消息线型与整体结构可辨。`requirements.md` 更新 U8.6 补键盘口径。最终基线为 49 个测试文件、438 项测试全部成功（整改前 45 文件 387 项，全程只增不减），`pnpm -r typecheck` 与 `pnpm build` 通过。第二轮整改 20 项（R01–R20）至此全部完成。

## 一句话判断

这个仓库的 **ProVerif 学习资料和 pv-lens v1 验证链已经形成可运行的成果**；“安全协议可视化建模”这一产品目标仍未实现，因为应用目前只读，不能从画布创建或修改 `.pv`。v2 已做出大量视觉与语义设计，部分 IR、值层和分支画法进入代码，但消息路由、人工配对、事件查询矩阵、完整布局约束和源码联动等核心体验尚未闭环。因而“项目已经失败”不能理解为代码不能运行；更准确的风险是**产品目标、设计范围与当前交付能力持续分离**。

这是一份基于仓库证据的判断，不包含用户访谈、实际使用数据或产品效果验证；仓库中没有足够证据据此判定用户是否需要整套 v2 视觉语言。

## 项目要解决什么

- 仓库原本是安全协议与 ProVerif 学习工作区，随后发展出本地 Web 工具 **pv-lens**。目标用户被定义为学习密码学的学生、教师和研究者；部署边界是个人或自托管，不考虑账号、云端或公网服务。见 [README](../README.md) 与 [v1 规格](../.scratch/pv-lens/spec.md)。
- 用户输入是 `.pv` 文本。工具希望把协议的**设计意图**画成“规范叙事视图”，并调用 ProVerif 对每条**查询**给出验证结论。两种信息不能混同：视图里的连线不证明消息实际可达；安全性由 ProVerif 结论回答。见 [领域词表](../CONTEXT.md)、[ADR-0001](adr/0001-pv-text-is-source-of-truth.md) 和 [ADR-0003](adr/0003-intent-pairing-over-reachability.md)。
- `.pv` 文本是唯一真源，图是派生视图；ProVerif 通过本机 CLI 调用。即使将来做画布编辑，按现有架构决策也要把编辑结果写回文本，再重新解析与验证。见 [ADR-0001](adr/0001-pv-text-is-source-of-truth.md) 与 [ADR-0002](adr/0002-proverif-cli-adapter.md)。

## 已有资产与演进

| 阶段 | 形成的资产 | 当前判断 |
| --- | --- | --- |
| ProVerif 学习 | `docs/proverif/` 含 2.05 版手册转写 10 篇、学习笔记 8 篇、`.pv` 示例 48 个及 PDF；笔记按保密性、认证、等价、输出解读等能力组织。见 [学习总纲](proverif/note/00-framework.md) 和 [README](../README.md)。 | 可作为语义和样例依据；其覆盖面明显大于 pv-lens 解析器承诺支持的教学子集。 |
| v1 MVP | [v1 规格](../.scratch/pv-lens/spec.md) 与 13 张实现票据；四个内置样例、只读源码、叙事图、ProVerif 验证和结果面板已落地。规格末尾记有 2026-09-18 的真实浏览器验收。 | v1 是“读取、解释、验证”工具，不能直接完成可视化建模。原先的保守配对在四样例上产生零连线，后来按 [ADR-0003](adr/0003-intent-pairing-over-reachability.md) 改为两方协议的意图配对。 |
| v2 设计 | [v2 map](../.scratch/pv-lens-v2/map.md) 下 15 张设计决策票、10 个 HTML 原型和一份 [批量查询研究](../.scratch/pv-lens-v2/research/06-proverif-batch-queries.md)；[v2 规格](../.scratch/pv-lens-v2/spec.md) 列出 74 条用户故事。 | map 的终点明确是“规格 + 原型”，**不含实现落地**。它的 `Status: complete` 不能作为产品完成的证据。 |
| v2 实现 | v2 票据 [01](../.scratch/pv-lens-v2/issues/01-narrative-ir-and-lifelines.md)、[02](../.scratch/pv-lens-v2/issues/02-value-bindings-and-terms.md)、[03](../.scratch/pv-lens-v2/issues/03-conditions-and-branch-scope.md) 标记为 `resolved`；04–10 标记为 `ready-for-agent`，验收项尚未勾选。 | 代码已比票据边界走得更远一些，例如已有水平序列、统一配对和对应性查询的核心函数；但这些不能代表其端到端功能已完成。 |

本次核查时，v2 的 04–10 七张票据是**未跟踪文件**，已有工作区内容应保留。另有两份规格的 `Status: ready-for-agent` 与 v1 已验收、v2 部分票据已解决的事实不一致；读进度应优先看票据、代码和验收记录。

## 当前 pv-lens 的运行路径

工程是 `pnpm` workspace：`packages/core` 为纯 TypeScript 的解析、词项、配对和结果转换；`packages/web` 是 React + Vite 的装载页、SVG 叙事视图和验证面板；`packages/server` 是 Node HTTP 服务，经 CLI 适配器调用本机 ProVerif。见 [工程配置](../pv-lens/package.json)、[core 入口](../pv-lens/packages/core/src/index.ts)、[应用入口](../pv-lens/packages/web/src/App.tsx)、[验证服务](../pv-lens/packages/server/src/http-service.ts)。

```text
.pv 文本 ──浏览器/core 解析──> ParseResult ──配对与布局──> SVG 规范叙事视图
    │
    └──── POST /api/verify ──server/CLI──> ProVerif stdout
                                  └────core 解析──> 按查询的结论、反例 trace、完整输出
```

- 首页能选择四个内置样例或导入本地 `.pv`；源码面板只读。四样例分别覆盖最小保密性破坏、修正版握手、NS 修正版互认证、NS 原版 Lowe 攻击。样例原文和录制 stdout 存在 [core fixtures](../pv-lens/packages/core/fixtures/PROVENANCE.md) 中。
- 验证面板可运行、取消和设置超时；服务对“缺可执行文件”“ProVerif 报错”“超时”“取消”分类。stdout 解析以 `RESULT` 行为判定依据，按查询展示“成立 / 被证伪 / 未能证明”，反例和完整输出可展开。见 [CLI 适配器](../pv-lens/packages/server/src/proverif-adapter.ts)、[结果解析](../pv-lens/packages/core/src/verify-result.ts)、[验证面板](../pv-lens/packages/web/src/VerifyPanel.tsx)。
- 解析器保留角色、信道、消息端、本地步骤、事件、绑定、分支标记和源码位置；未知语法尽量降级为原文诊断。它明确不是完整的 ProVerif 前端，观察等价、`choice` 等进阶语义不在 v1/v2 承诺内。见 [解析模型](../pv-lens/packages/core/src/parser/model.ts)、[v1 规格的范围边界](../.scratch/pv-lens/spec.md) 与 [v2 规格的范围边界](../.scratch/pv-lens-v2/spec.md)。

## v2 已落地到什么程度

| 能力 | 代码事实 | 与目标的距离 |
| --- | --- | --- |
| 叙事 IR、值层、分支 | 角色 `items` 与稳定端点、绑定引用、结构化条件、臂道、方法盒和显式分支折叠已进入 core/web。见 [IR 构造](../pv-lens/packages/core/src/parser/ir.ts)、[结构化布局](../pv-lens/packages/web/src/narrative/structured-layout.ts) 和 [视图](../pv-lens/packages/web/src/narrative/NarrativeView.tsx)。 | 01–03 票据已解决，但 [02 的验收记录](../.scratch/pv-lens-v2/issues/02-value-bindings-and-terms.md) 和 [03 的记录](../.scratch/pv-lens-v2/issues/03-conditions-and-branch-scope.md) 显示，多次真实浏览器比对后才修正画法；视觉合同仍需按整体使用场景复核。 |
| 水平序列与局部梯子 | `solveHorizontalSequence` 已输出角色/信道交错顺序，结构化布局会调用它；每角色按自身游标布置消息端。见 [求解器](../pv-lens/packages/core/src/horizontal-sequence.ts) 和 [布局](../pv-lens/packages/web/src/narrative/structured-layout.ts)。 | [04 票](../.scratch/pv-lens-v2/issues/04-horizontal-sequence-and-local-ladders.md) 尚未验收。现有纵向布局主要依赖 `cursor`、`gapUnit`、`uniqueY`，还不是规格要求的成组硬约束与冲突求解器。 |
| 消息层、自动配对 | `pairSteps` 在两方协议中按信道、类型、形状和源码顺序配对；web 将旧结果转为 `MessagePairing`，按配对画信道内消息柱。见 [配对](../pv-lens/packages/core/src/pairing.ts)、[布局](../pv-lens/packages/web/src/narrative/structured-layout.ts)。 | [05 票](../.scratch/pv-lens-v2/issues/05-message-layer-and-auto-pairing.md) 尚未验收。当前一对配对生成一根柱，接收端显示的是解析的接收模式；“实际到达词项”的语义和完整消息身份尚未闭环。 |
| 人工配对、广播与合流 | core 已有 `composeMessagePairings`，可以合成自动与人工声明并给出部分诊断。见 [统一配对函数](../pv-lens/packages/core/src/message-pairing.ts)。 | [06 票](../.scratch/pv-lens-v2/issues/06-manual-pairing-fanout-and-merge.md) 未验收；[App](../pv-lens/packages/web/src/App.tsx) 仍直接调用 `pairSteps`，没有人工选择入口或会话状态。布局对每条配对分别造柱，尚未实现“一发多收是一条消息”和多发一收的统一视觉。 |
| 弹性间距、密度折叠 | 视图已有紧凑度滑块、`gapUnit = 26 − 8×compactness` 和分支折叠。 | [07 票](../.scratch/pv-lens-v2/issues/07-elastic-spacing-and-density.md) 的刚性计算单元、硬约束求解、算子簇默认折叠、幽灵值块及冲突处理尚未完成。当前冲突检查只检测最终消息端 `y` 是否重复。 |
| 事件对应性 | core 有批量查询计划、插入与矩阵数据函数；当前 SVG 也画事件标记。见 [对应性模块](../pv-lens/packages/core/src/correspondence.ts)。 | [08 票](../.scratch/pv-lens-v2/issues/08-events-and-correspondence-matrix.md) 未验收；主界面仍用原文运行验证，没有事件点选、批量运行/缓存、矩阵与 trace 联动。 |
| 多信道、图例、源码联动与视口 | 视图已有中性信道方块、线型、缩放按钮、解析诊断和 `data-source-offset`；[三信道 fixture](../pv-lens/packages/core/fixtures/pv/multi-channel.pv) 已存在。 | [09](../.scratch/pv-lens-v2/issues/09-multichannel-visual-language.md)、[10](../.scratch/pv-lens-v2/issues/10-source-linking-diagnostics-and-viewport.md) 未验收。图例仍含旧分支说明，源码面板只是整段 `<pre>`，尚无点击后双向定位；“适合宽度”按钮当前仅把缩放设为 100%。 |

## 重构前最重要的风险与约束

1. **产品承诺与实际入口不一致。** 仓库定位写“可视化建模”，而当前入口和 [ADR-0001](adr/0001-pv-text-is-source-of-truth.md) 规定的是 `.pv` 导入、只读派生视图、运行验证。画布编辑与文本回写始终被排除在 v1 和 v2 范围之外。若“建模”是核心价值，现有两轮规格都尚未交付它；若“阅读与验证”才是核心价值，需要相应收窄定位。这是范围选择，不是测试能回答的问题。
2. **v2 范围增长快于可验证的体验。** 74 条用户故事同时覆盖解析、消息、值、分支、布局、手工路由、事件矩阵、折叠、颜色和源码联动；[map](../.scratch/pv-lens-v2/map.md) 完成的是设计工作。已解决的 02、03 票据都留下“实现与原型画法不符，需再做真浏览器校正”的记录。由此可推断，继续按功能票累加实现，会增加整体视觉一致性与语义校验成本；这不是对尚未做过的用户价值验证的替代。
3. **文档存在相互覆盖与旧口径。** [ADR-0008](adr/0008-channel-junction-message-colors.md) 废除了广播共享 `y` 与“收到 ×N”梁，[ADR-0009](adr/0009-role-channel-horizontal-sequence.md) 废除了左右二分与同侧 jog，[ADR-0010](adr/0010-multi-channel-geometric-identity.md) 让信道退出颜色并在 2026-09-24 改用直线。可是 [v2 map 的 Notes](../.scratch/pv-lens-v2/map.md) 仍保留旧广播/左右分配说法，[ADR-0004](adr/0004-narrative-view-message-order-model.md) 的原始“同消息共享一行”原则与后来的局部 `y` 规则并存，[v2 规格](../.scratch/pv-lens-v2/spec.md) 和 [05/09 票](../.scratch/pv-lens-v2/issues/05-message-layer-and-auto-pairing.md) 仍提跨线弧，[CONTEXT](../CONTEXT.md) 也混有“消息占一行”和“各端不要求同 y”。重构时必须先确定当前有效语义，不能机械照抄某一份旧描述。
4. **图的“同一性”有已知歧义。** [02 票的验收记录](../.scratch/pv-lens-v2/issues/02-value-bindings-and-terms.md) 明确指出值身份色仅八色循环，四个样例就会复用颜色，故“同色 = 同一值”在整图上不成立。消息色也八色循环；规格另要求靠编号、线型和字形辅助辨别，当前完整视觉验收仍待 09 票。安全协议教学工具应避免用视觉等同性暗示未经证明的值等同性。
5. **验证结论与叙事解释必须保持独立。** ProVerif 的 `is true` / `is false` / `cannot be proved` 是对查询的判定；“未能证明”不等于性质为假。攻击 derivation 也不一定对应可执行轨迹，需读 trace。见 [输出解读笔记](proverif/note/05-output.md)。人工或自动消息配对表达设计意图，绝不能当作攻击者可达性证明。这是重构仍应保留的可信边界。

## 本次核查与结论边界

- 在 `pv-lens/` 执行 `pnpm typecheck` 与 `pnpm build` 均通过。
- `pnpm test` 在允许本地监听的环境中通过：**23 个测试文件、252 项测试**。初次在受限沙箱中运行时，HTTP 用例因 `listen EPERM 127.0.0.1` 等环境限制失败；放开该限制后全量通过。通过的是当前实现的测试，不能据此宣称 v2 的 04–10 票已经完成。
- [v1 验收记录](../.scratch/pv-lens/spec.md) 曾在真实 Chromium、ProVerif 2.05 上核对四个样例、判定和反例原文；本次没有重新执行这套浏览器与真实 ProVerif 端到端验收。

**可保留的基础**：学习笔记与样例、`.pv` 真源原则、按查询的结果语义、CLI 适配器、解析降级、稳定源码位置与 fixture 测试。**需要重新决定的方向**：产品究竟先交付可视化阅读/验证，还是可视化建模；在这个方向明确之前，v2 的全部视觉与交互规格不宜自动视为重构的必做清单。
