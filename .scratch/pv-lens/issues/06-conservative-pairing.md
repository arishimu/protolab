# 06: 保守配对引擎 + 可信连线

**What to build:** core 里一个保守的纯函数：只在结构上**可确定**时把某角色的 `out` 与另一角色的 `in` 配成跨泳道连线，任何歧义一律不连、保持未配对标注。四真实样例在 Dolev-Yao 公共信道模型下很可能配不出任何边——因此本票承诺的是「机制 + 不误配的保证」，不是「图上出现大量箭头」。

**Blocked by:** 05

**Status:** resolved

- [x] 合成夹具（两个角色、信道收发结构可唯一确定配对）上能正确产出连线
- [x] 歧义/无法确定用例产出「不连」而非猜测（零误配）
- [x] 四真实 fixture 上：要么产出经人工核实的正确边，要么产出零边——两种情况都有对应测试断言
- [x] 配对结果可被 04 的渲染消费（连线形态由渲染端决定，本票只产出配对判定）

## Comments

### 交付物（2026-09-18，/implement #06）

新增 `packages/core/src/pairing.ts`（纯函数配对引擎）与 `packages/core/test/pairing.test.ts`；
core barrel（`src/index.ts`）导出 `pairSteps` / `narrativeRoleOrder` 与 `StepPairing` / `StepPairingAnchor` 类型；
web 侧把 `pairSteps(parseResult)` 喂给 04 的 `buildNarrativeLayout({ pairings })`，并让布局复用
core 的 `narrativeRoleOrder`（配对下标与泳道下标不再各写一份、不会漂移）。无新依赖。

### 配对语义（保守纪律的落地）

`pairSteps(result)` 只输出**双向唯一**的 `out → in` 配对：

1. 只考虑**不同角色**、**同一信道**（词项结构相等）的 out / in；
2. 接收模式必须**有区分力**——裸变量 `in(c, x)` / 解析不了的词项一律不参与（收到任何消息都成立）；
   元组 / 构造子应用靠形状、等值模式 `=n` 靠常量值；
3. 发送词项按模式匹配：同名、同构造子同元数、元组等长后逐项递归；模式里的变量是通配符，
   等值模式 `=n` 的 `n` 按同名比对（不是通配符）；
4. 该 out 只匹配一条 in，**且**那条 in 只匹配该 out，才产出连线；两个候选即整条丢弃。

Dolev-Yao 公共信道下攻击者可注入/重放，非唯一即不可信，故这是「不误配」保证的核心。

### 四真实 fixture 的画像

全部**零边**（预期结果）：handshake 的三个 in 全是裸变量；ns-mutual-auth 的三条元组 out
争抢 processS / processK 的同形元组 in（双向都不唯一）；ns-original / hello 无结构可确定的配对。
测试对四个样例逐一断言零边并注明：若将来补上结构不同的 in 模式，应改为经人工核实的正确边。
「正确产出连线」分支由合成夹具覆盖（元组双向、`senc(m,k)` 构造子、`=n1` 等值模式）。

### 验证

- `pnpm vitest run packages/core/test/pairing.test.ts packages/core/test/public-api.test.ts` → 26 passed；
  单文件迭代配对用例 11 项（4 连线 / 4 不连 / 1 主进程泳道 / 4 真实样例零边）。
- `cd pv-lens && pnpm test` → **16 files / 195 passed**。
- `pnpm typecheck` → core / web / server 三包通过；`pnpm build` → 三包构建成功。
- core 纯净性守卫（`test/public-api.test.ts`）已把 `pairing.ts` 纳入扫描，无平台 API 泄漏。

### 遗留与风险

- core 无法区分「`free` 声明的名字」与「in 模式里的绑定变量」（`free` 声明不建模），故真实样例里
  的 in 模式普遍被判为裸变量；这是保守侧偏差，不会产生误配。
- `StepPairing` 的 `roleIndex` 语义绑定叙事视图泳道顺序（`narrativeRoleOrder`），属视图派生的下标；
  已由 core 与 web 共用一个函数消除漂移。

### code-review 后处理（2026-09-18，提交 354bc2f 后）

两轴 review（Standards + Spec）对 `3a55330..354bc2f` 的 diff：Standards 无硬违规；
Spec 无正确性缺陷，留下两条提示。

已修（Standards 判断项）：

- **Repeated Switches / Duplicated Code**：`pairing.ts` 原本对 `PvTerm` 有三份平行 switch
  （`termEquals` / `matchesPattern` / `matchesValue`），把后两者合并为单个
  `matchesTerm(out, pattern, wildcardVariables)`（in 模式里变量是通配符；等值模式 `=n`
  要求同名），消掉两份逐项递归重复。
- **Data Clumps**：`StepEndpoint` 改为 `extends StepPairingAnchor`，不再重复
  `roleIndex` / `stepIndex` 字段。

保留并记录（Spec 提示，非缺陷）：

- 四真实 fixture 仅断言「零边」；「正确产出连线」分支由合成夹具覆盖。ticket 明确允许零边结果，
  真实例断言旁已注明「若将来补上结构不同的 in 模式，应改为经人工核实的正确边」。
- US13「看到少数跨泳道连线」在四个内置样例上不可观察（全部零边），是 Dolev-Yao 公共信道下
  保守配对的预期；机制正确，体验载体有待结构可确定的样例。
- 「可确定模式」把全通配元组也算有区分力，唯一性实际由「双向唯一」闸门保证；类型标注不参与
  区分（保守方向，不误配）。二者与 ticket 注释一致，保留。
- core 新增公开 `narrativeRoleOrder` + web `selectLaneSources` 改写，属清单外的一处重构，
  用于消除配对下标与泳道下标的漂移。

验证：`pnpm test` → 16 files / 195 passed；`pnpm typecheck` 三包通过。
