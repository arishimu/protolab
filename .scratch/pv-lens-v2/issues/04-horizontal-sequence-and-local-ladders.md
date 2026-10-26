# 04: 水平序列与局部梯子布局

**What to build:** 把规范叙事视图变成生命线和信道交错的确定性布局。读者沿各角色自己的局部梯子阅读消息步骤，多方角色之间不被强制解释为共享时间线；信道是共享的空间锚点。

**Blocked by:** 01: 叙事 IR 兼容层与基线生命线; 02: 值绑定与词项追踪; 03: 结构化条件与分支作用域.

**Status:** resolved

- [x] 水平序列由每个消息步骤贡献的角色–信道加权多重边图求解，不读取自动或人工配对结果；角色与信道可以交错，信道不必集中在一侧。
- [x] 求解顺序遵守加权 min-max 割边、降序 cut 曲线字典序、源码序三级 tie-break；空边集、孤立角色、单/多信道和外部顺序约束均有确定结果。
- [x] 回归 `ns-mutual-auth` 的 `S · I · c · R · K` 序列及规格中的 min-max/min-sum 见证数字；同一输入重跑或打乱候选枚举顺序结果不变。
- [x] 每个角色的消息端按本地源码顺序递增，未配对的多方步骤仍在本角色局部梯子上；画布高度由内容决定，可完整滚动查看。
- [x] 信道在布局数据中是独立的总线方块，角色参数、值、本地步骤和分支有各自几何位置；当前样例均可由 IR 产生可绘制布局。
- [x] 从源码文本到 IR 再到布局的测试断言水平序列、本地顺序、确定性和内容驱动尺寸，不依赖 SVG 像素。

## Comments

2026-10-26，按「先差距核对再实现」流程处理本票（风险应对计划 R6）：实现侧无缺口——`solveHorizontalSequence`（三级 tie-break、pairing-free 输入、外部顺序约束 seam、n≤10 精确枚举 + 更大规模确定性贪心）与 `buildStructuredNarrativeLayout`（每角色本地序游标、全图共享 `usedY`、内容驱动高度）在 ticket 01–03 期间已按本票口径落地；差距全在测试。本次只补测试与文档更正，未改产品代码：

- 新增 `pv-lens/packages/core/test/ticket04-horizontal-sequence.test.ts`：`ns-mutual-auth` 的 `processS · processInitiator · c · processResponder · processK` 回归与重跑确定性；ADR-0009 见证图的**独立暴力枚举**交叉验证（min-max=2、min-sum=8 且其 max=3、max=2 ⇒ sum≥9）与求解器结果（`r2·c2·r1·c0·r0·c3·c1`）固化；步骤书写顺序打乱后序列不变；空边集/孤立角色退源码序；不可满足约束回退源码序；multi-channel 三信道交错不集中一侧。
- 新增 `pv-lens/packages/web/test/ticket04-local-ladders.test.ts`：ns-mutual-auth（4 角色全未配对）每角色消息端 y 按本地源码序严格递增且全图消息端 y 互异；画布高度随内容增长、两次构建 toEqual、全几何有限；四基准样例 + multi-channel 信道为独立总线列、端点 channelX 对准列中心。
- 文档更正：ADR-0009 见证数字「min-max=2 时 sum ≥ 11」经枚举复核为笔误（正确 ≥ 9），已加更正注记；两目标最优解集不相交的结论不变。

未做新增视觉改动（本票是布局语义，渲染沿用 02/03 已过真浏览器验收的结构化视图），故未另开浏览器视觉验收。验收证据：`pnpm typecheck` 三包通过；全量测试 25 个测试文件、261 项通过（含真实 ProVerif 集成 6 项）；`pnpm build` 通过。
