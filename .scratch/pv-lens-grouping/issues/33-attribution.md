# 33: 反例 trace 归因

**What to build:** 把 ProVerif 反例 trace 的 derivation 按消息步分组，输出“攻击者从哪条消息获得什么”的列表；无法归因的行逐字保留，不绘制几何攻击路径。

**Blocked by:** 32: 会话目标构建器。

**Status:** resolved（实现完成，阶段 5 验收待用户复核）

- [x] 新增 `attribution/trace-attribution.ts`：解析编号 derivation 块，识别 `output {n}` / `input {n}`。
- [x] 每步提取 `attacker(...)` 知识项并去重保序；同块输入→输出按最后输出步归因。
- [x] 无消息步的块归为推导/假设/未归类，不丢行。
- [x] 编号块之外的导语与缩写行进入 `unattributed` 逐字保留。
- [x] 输出摘要统计输出消息数、不同知识项数与未归因行数。
- [x] `QueryResultCard` 在 false 查询上渲染列表级归因与未归因原文；true 查询不渲染。
- [x] 新增 core/web `ticket33-attribution.test.ts`；测试只增不减。

## Comments

2026-11-05，阶段 5 归因实现完成，未提交。

**core**：`attributeCounterexample(trace)` 扫描 `Derivation:` 后的编号块；按最后 `output {n}` 优先、其次 `input {n}` 分组；`attacker(...)` 行收集知识项；结构中没有 x/y/path 等几何字段。ns-original 实测 trace 识别出 output {6}、{3} 等步骤与 `pk(skB[])` 等知识项，摘要按输出步与项数生成。

**web**：`QueryResultCard` 在反例卡上渲染“攻击者从哪条消息获得什么”，列出步骤标题与知识项；未归因原文折叠保留。原始反例 trace 仍完整可展开。归因只做列表，不绘制攻击路径。

**验收证据**：core 测试覆盖 ns-original 真实 trace 的 output/input 分组、知识项、原文保留与空 trace；web 测试覆盖 false 查询卡归因列表与 true 查询不渲染。真实 Chromium 使用会为 `termClient` 查询返回合成反例的本地 stub，验证卡出现归因摘要与“消息步 {6} · 攻击者收到”、知识项 `pk(skB[])` 和未归因原文入口；控制台无异常。截图 `sg5-attribution-1440.png` 存于 `docs/gui-test/23-screenshots/`。

**验证**：`pnpm -r typecheck`、`pnpm test`（60 个测试文件、528 项测试，522 通过 + 6 跳过）、`pnpm -r run build` 全部通过。

**已知边界**：ProVerif 的 process action 编号未映射到画布消息 id，归因以 `{n}` 步骤为锚；没有反例 trace 的 `cannot be proved` 不显示归因；合成 stub 仅用于浏览器验收，真实 trace 解析由录制 fixture 测试覆盖。
