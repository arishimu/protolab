# 32: 会话目标构建器

**What to build:** 让用户在本次会话内提出保密性、认证/对应性与可达性目标；目标生成 ProVerif query 并插入派生验证文本首个 process 之前，不覆盖源码声明目标，也不写回 `.pv`。

**Blocked by:** 31: 解释与任务层。

**Status:** resolved（实现完成，阶段 5 验收待用户复核）

- [x] `free ... [private]` 名称保留 `private` 与 span；保密性候选只取顶层私有名，角色内 `new` 只给建模提示。
- [x] 导出并参数化 `correspondenceQueryText`；认证目标可选单射/非单射。
- [x] 可达性目标生成带类型变量的 `event(...)` 查询。
- [x] 会话目标带 `origin: session`、稳定 id、查询正文、源码 span 与中文标签。
- [x] 派生文本在首个真实 `process` token 前插入 query，忽略注释里的 process 字样，不重复已有查询。
- [x] `SessionGoalPanel` 提供三类构建器、源码已声明提示、目标清单、移除/清空与派生文本预览。
- [x] 验证结果查询卡标注“声明目标/会话目标”，覆盖摘要按来源统计；会话查询卡使用原始源码 span。
- [x] 新增 core/web `ticket32-session-goal.test.ts`；测试只增不减。

## Comments

2026-11-05，阶段 5 会话目标实现完成，未提交。

**core**：新增 `goals/session-goal.ts`。`secrecyCandidates` 只接受顶层 `free [private]` 名称；`roleLocalFreshNames`/`roleLocalFreshHint` 说明角色内 `new` 不能直接写 attacker(name)。`createAuthenticationGoal` 复用导出的 `correspondenceQueryText(from,to,types,injective)`；`createReachabilityGoal` 生成带类型变量的事件查询。`buildSessionGoalSource` 通过 lexer 定位真实 process token，避免把 query 插进注释；与源码已有查询完全相同的行不重复插入。

**web**：`SessionGoalPanel` 提供三类目标构建器与派生文本预览；App 保存会话目标并用 `buildSessionGoalSource` 生成 `verificationSource`，仅传给验证面板，叙事解析仍用原 `.pv`。查询结果按 query 正文标注 `declared/session`，会话目标使用原始事件/秘密名 span 而不是派生文本行号；覆盖摘要显示“声明目标/会话目标”数量。声明目标与会话目标在界面与数据上明确区分。

**验收证据**：core 测试覆盖四内置样例的候选、认证/可达性查询、派生文本插入与不重复；web 测试覆盖面板三类构建器、来源标注、原始 span 与覆盖来源。真实 Chromium 使用按派生 query 返回判定的本地 stub：添加认证+可达性两个会话目标后，派生文本含两条 query 且排在 process 前；验证出现 5 张查询卡（声明 3 / 会话 2），覆盖摘要显示“声明目标 3 / 会话目标 2”；会话目标查询卡定位到原始源码行；控制台无异常。四视口 1920×1080、1440×813、1280×720、1024×768 目标面板无横向溢出。截图存于 `docs/gui-test/23-screenshots/`：`sg5-goals-1920/1440/1280/1024.png`、`sg5-verify-1440.png`。

**验证**：`pnpm -r typecheck`、`pnpm test`（60 个测试文件、528 项测试，522 通过 + 6 跳过）、`pnpm -r run build` 全部通过。

**已知边界**：本机没有 ProVerif 可执行文件，浏览器验收使用本地 stub 返回判定；query 文本与注入由 core/web 测试覆盖。会话目标只在本次装载内有效，切换协议即清空；不提供自定义 query 文本编辑器。
