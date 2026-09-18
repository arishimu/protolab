# 04: 规范叙事视图渲染 v1（泳道图）

**What to build:** 用户装载一个协议后，浏览器把语义模型画成**规范叙事视图**：每个命名进程一条泳道，泳道内按代码顺序排列消息步骤卡片（方向箭头、所在信道、**词项符号化渲染**如 `{Na,A}pkB` 风格、事件标注、`new` 新鲜名标注、守卫注释）；不能可靠确定收发配对的步骤明确标注为**未配对步骤**（不臆造连线）；解析器的降级诊断以「原文标注卡片」形态入图；模型无角色结构时给明确提示而非白屏。画对优先于画全。

**Blocked by:** 02, 03

**Status:** resolved

- [x] 握手修正版端到端：装载 → 渲染出 client/server 两条泳道、各自步骤、事件标注与符号化词项的正确图
- [x] 词项符号化渲染通过黄金断言（加密/签名/元组/函数应用的惯用记法；未知构造子回退为函数调用写法）
- [x] 未配对步骤在图上有明确视觉标注；无任何臆造连线
- [x] 降级诊断段以原文标注卡片显示在泳道内；无角色结构的模型显示中文提示而非白屏
- [x] 泳道图由 web 自绘（无自动布局引擎依赖），中文 UI、术语保留英文

## Comments

### 交付物（2026-09-18，/implement #04）

只改 `packages/web/**`（+ .scratch 本文件），core/server 未动；无新依赖（React + SVG 自绘）。新增：

- `src/narrative/symbolic-term.ts`：`renderTerm(term: PvTerm): string` 纯函数 + `NOTATION_LEGEND` 图例数据。
- `src/narrative/layout.ts`：`buildNarrativeLayout(result, { pairings? }): NarrativeLayout` 纯函数（固定 `NARRATIVE_METRICS` 常量）。
- `src/narrative/NarrativeView.tsx` / `Legend.tsx`：SVG 渲染与图例。
- `App.tsx` 的 `NarrativeSection` 用 `useMemo(() => parsePv(source), [source])` 接入；`styles.css` 增补泳道/卡片/诊断/图例样式。
- 测试：`test/symbolic-term.test.ts`（12）、`test/narrative-layout.test.ts`（10）、`test/narrative-view.test.ts`（6，`react-dom/server` 冒烟）。

### 词项符号化映射（黄金断言真源）

`encrypt`/`aenc` → `{m}k`；`senc`/`sencrypt`/`enc` → `{|m|}k`；`sign` → `[m]k`；`hash`/`h` → `H(m)`；
其余构造子（`pk`/`spk`/`messtermI`…）与参数个数不符时回退 `functor(a, b)`；元组 `(a, b, c)`；`equality` → `=M`；
`unknown` → 原文。**密码括号自带分组**：构造子的消息参数是元组时按 spec 铺开（`encrypt((Na,A),pkB)` → `{Na,A}pkB`，不写 `{(Na, A)}pkB`）。

### 未配对标注与 ticket 06 接缝

默认 `pairings` 缺省为空 ⇒ **所有步骤卡片标「未配对」且不画任何连线**（绝不臆造）。
`buildNarrativeLayout` 已接受 `pairings: readonly StepPairing[]`（`{ from:{roleIndex,stepIndex}, to:{...} }`）：
配对端点转 `unpaired:false` 并去掉角标，同时产出一条 `CrossLaneEdge`（端点锚点 = 卡片边缘中点，连线折线形态由渲染端决定）。
越界 / 同卡 pairing 一律忽略。ticket 06 只需把保守配对结果喂给 `NarrativeView` 的 `pairings` prop。

### 泳道选择与诊断归属

- 有命名进程 → 每个命名进程一条泳道；无命名进程而有主进程（hello）→ 主进程画成一条 `main` 泳道；两者皆无 → `hasLanes:false`，显示「没有可识别的角色结构」中文提示并列出诊断（不白屏）。
- 诊断按 `span.start.offset` 是否落在 `role.span` 内归入泳道；落不进任何角色的进入泳道之后的「未归属诊断」区；以「原文标注卡片」显示中文级别 + 行号 + message + sourceText。

### 验证

- `pnpm vitest run packages/web/test/{symbolic-term,narrative-layout,narrative-view}.test.ts` → 27 passed
- `pnpm test` → 12 files / 139 passed（含 core 112、web 27）
- `pnpm typecheck` → core/web/server 三包通过；`pnpm build` → core/server/web 全部构建成功（vite 32 modules）

### 遗留风险

- 步骤与源码的点击联动（spec US14）未做（不在本票验收清单内）。
- 折行按字符数估算（`maxLineChars`），超长符号化词项可能与卡片宽度略有偏差（视觉层面，不影响布局确定性）。
- 本票不实现配对引擎（ticket 06）；默认全未配对。

### code-review 后处理（2026-09-18，提交 04/05/08 后）

两轴 review（Standards + Spec）对 04/05/08 的合并 diff 给出 OK with notes。已修：

- **Spec 落实（架构）**：spec.md「core 公开能力」第 2 条明确把「词项符号化渲染」列为 **core** 能力，原实现只在 web。已把 `renderTerm` / `NOTATION_LEGEND` 移到 `packages/core/src/symbolic-term.ts` 并由 core barrel 导出（web 的 `layout.ts` / `Legend.tsx` 改为从 `@pv-lens/core` 引入），黄金断言测试移到 `core/test/symbolic-term.test.ts`。
- **Standards：Primitive Obsession**：`StepCard.badges` 由 `string[]` 改为 `StepBadge[]`（`kind` 选样式、`label` 显示文字），渲染端不再用显示文字 `=== '未配对'` 反查样式。
- **Standards：Duplicated Code**：方向 → 箭头/中文标签（`stepDirectionMeta`）、诊断级别 → 中文标签（`diagnosticSeverityLabel`）各抽一处，`stepCardLines`/卡片构造与 `NarrativeView` 共用。
- **Spec US17（定位到列）**：诊断卡片头由 `L{行}` 改为 `L{行}:{列}`。

**保留但记录**：

- **Spec US14（点击步骤 ⇄ 源码行高亮）未实现**：ticket 04 的验收清单未含此项，01–10 也没有工单承接；本票明示留作后续（ticket 09 验收若要求再开票）。当前 `StepCard.lineNumber` 已带源码行号，接缝在。
- 折行按字符数估算；`Middle Man`（`verify.ts` 的 `defaultFetch`）、`Data Clumps`（`{x,y,width,height}`）为 judgement call，量小不单独重构。
