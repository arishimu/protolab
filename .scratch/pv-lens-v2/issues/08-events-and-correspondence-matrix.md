# 08: 事件标记与批量对应性查询

**What to build:** 让研究者从生命线上的事件标记直接查看 ProVerif 对有序事件对的对应性判定，并在常驻可折叠矩阵中浏览全部事件对；反例仍由现有验证结果入口呈现。

**Blocked by:** 02: 值绑定与词项追踪; 03: 结构化条件与分支作用域; 04: 水平序列与局部梯子布局.

**Status:** resolved

- [x] 每个 `event` 成为带源码 span 的可点击事件标记；前提端用填充菱形，结论端用实心圆点和斜旗，同一标记可连续点两次查询自反对应性。
- [x] 对同一参数集合预生成全部有序 `inj-event` 对应性查询，插入待验证文本的 `process` 之前；原始 `.pv` 文本保持不变，重复查询命中缓存。
- [x] 矩阵常驻但可折叠，任意单元可点击；旗标选择与矩阵选择双向联动，详情展示生成的 query 原文。
- [x] 每个矩阵单元独立呈现“证明成立”“找到反例”“未证出”，选中行列不会覆盖单元自身判定；反例单元可进入现有 trace 入口。
- [x] 查询仍按 ProVerif 的单条结果判定，保留现有验证取消、超时、完整 stdout 及原始查询结果呈现。
- [x] 录制输出和交互测试覆盖有序对数量、插入位置、缓存、三种判定、自反查询、双向联动和 trace 入口。

## Comments

2026-10-30，差距核对（Explore 子代理）结论：core 的对应性全套（collectEventReferences / generateCorrespondenceQueries / injectCorrespondenceQueries / createCorrespondencePlan / buildCorrespondenceMatrix）已导出但无消费方；VerifyPanel 已有三态 / trace / 取消 / 超时；缺口为 web 矩阵组件、事件旗标交互与前提/结论形状、查询缓存。浏览器首验暴露两处 core 缺陷并修复：

- **查询变量缺类型声明**：`query inj-event(A(k)) ==> …` 直接引用事件实参名会被 ProVerif 判未绑定（退出码 2）。parser 新增事件声明收集（`EventDeclaration {name, argTypes, span}`，`ParseResult.events`，`parseEventDeclaration` 仿 `fun` 声明）；`generateCorrespondenceQueries` 按声明形参类型生成查询变量——同位置两侧类型一致共用 `x{i}`（对应性语义：同一值），不一致各自 `xa{i}/xb{i}`，缺声明回退 `bitstring`。实证（真 ProVerif）：handshake-fixed 的 acceptsClient(key)/termClient(key,pkey) 跨 arity 查询合法执行。
- **RESULT 行匹配**：ProVerif 会重命名查询变量（k→k_2）且输出非单射基础行（`event(...)` 无 inj 前缀）。`buildCorrespondenceMatrix` 改为按事件名有序对映射（正则提取 inj-event 两侧事件名，方向敏感；同事件对的重复行共享结论；非单射行不参与）。原 normalizeQuery 文本匹配会因变量重命名全部失配。

实施：web 新增 `CorrespondencePanel`（常驻 `<details open>` 可折叠、n² 单元三态独立、单元点击出详情与反例 trace 原文、同一 source 的重复运行命中会话内缓存 Map 不重发请求）；NV 事件旗标按事件在查询中的角色区分形状（前提 = 填充菱形琥珀、结论 = 实心旗 teal、两者皆是并排），单击选中行列、双击选中自反单元，旗标与矩阵经 App 层 `eventCorrespondence` 绑定双向联动（源码 offset 对齐 EventReference）。

测试：`packages/web/test/ticket08-correspondence.test.ts` 4 项（n² 规模与自反标记、三态映射与 trace 保留、旗标形状与可点击、无事件提示）；v2-ir 断言更新为类型化查询文本；ticket02 事件 title 断言放宽（后缀角色说明）。真浏览器验收（真 ProVerif）：16 单元全映射（7 成立 / 9 反例 / 0 未证出——与协议语义一致：acceptsClient→termServer 类无对应查询被证伪）；重跑请求数不变（缓存命中）；反例单元 trace 入口；旗标单击 4 表头高亮、双击自反单元详情显示生成查询原文。截图见 `08-screenshots/`。

口径注记：矩阵「未证出」态在四样例上未出现（handshake 全部可判定）；该分支由单测的合成结果覆盖。缓存为会话内存（组件 ref），协议切换后同 source 重进仍命中；「未证出 ≠ 不成立」措辞沿用 VERDICT_META 纪律（R5 条款）。
