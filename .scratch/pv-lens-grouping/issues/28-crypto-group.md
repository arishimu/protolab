# 28: 解析与密码操作分类基础设施

**What to build:** 让密码操作可以被可靠识别，并保留未识别路径：把 `reduc` 方程结构化为带源码区间的词项，建立方程优先、名称启发兜底的操作注册表，并把角色 item 中的方法盒映射为可嵌套的密码操作组。分组是 `ParseResult` 的纯派生结果，不写回 `.pv`，不改变验证输入与结论。

**Blocked by:** 阶段 0（ADR-0018 已接受）。

**Status:** resolved（实现完成，阶段 1 验收待用户复核）

- [x] `parser/model.ts` 新增 `ReducEquation`、`ReducParameter` 与 `TermReference`；`ParseResult.equations` 保留方程。
- [x] `parser/parse.ts` 把 `reduc [forall ...;] left = right [attrs].` 解析为 `PvTerm`，保留左右词项、参数、属性与 span；坏方程只产生诊断，不抛异常。
- [x] `grouping/operation-registry.ts` 提供操作种类、别名、方程形状匹配与置信度；方程匹配优先于名称启发。
- [x] `grouping/crypto-group.ts` 提供 `deriveCryptoGroups`：方法盒级分组、词项结构嵌套、`members`/`hiddenCount`、未知兜底与用户覆盖。
- [x] 新增仅用于测试的 fixture `crypto-nested.pv` 与 `crypto-unknown.pv`；不注册为内置样例。
- [x] 新增 `ticket28-crypto-group.test.ts`；既有测试只增不减。

## Comments

2026-11-05，阶段 1 实现完成，未提交。

**解析**：`reduc` 从原先的记号扫描改为结构化解析。`parseReducDeclaration` 现在返回 `destructors` 与 `equations`；方程左侧最外层构造子写入 `ReducEquation.destructor`，`forall` 参数进入作用域后解析左右词项，方程 span 从左侧词项覆盖到右侧词项（含后缀属性）。缺 `=`、左侧非应用、`forall` 参数缺类型、括号/声明未闭合等输入均以 error 或 degraded 诊断返回，游标恢复到方程或声明边界。

**分类**：注册表先按方程识别对称 `d(c(m,k),k)=m`、非对称 `d(c(m,pk(sk)),sk)=m`、签名 `checksign(sign(m,sk),pk(sk))=m` 与 `getmess(sign(m,sk))=m`，再按名称识别加解密、签名、单参数哈希与单参数密钥派生。同一构造子两者都命中时保留方程结果；未知函数不进入注册表。

**分组**：`deriveCryptoGroups(result, { overrides })` 遍历发出的消息词项、`let` 词项、`if` 守卫与事件参数；接收模式不当作执行中的操作。嵌套按词项结构建立父组，未知包装函数被跳过但不阻断其子词项。组 id 由角色、item 内方法路径与源码偏移组成；用户覆盖仅改变 `kind`/`origin`/`confidence`，不修改 `ParseResult`。值方块成员 id 目前采用 `value:<bindingId>:reference|output` 的派生形式，阶段 2 接入布局时再与视图的稳定 id 对齐；幽灵值块推导留阶段 2。

**验收证据**：四个内置样例与两个合成 fixture 的加解密、签名、哈希、密钥派生分类正确；未知函数不建组；方程 span 可回溯；坏输入不抛异常；用户覆盖可撤销且不改 `.pv`。全仓 `typecheck` 与构建通过；测试由基线 51 个文件、444 项测试增至 52 个文件、466 项测试（新增 20 项专项测试及 2 个新源文件的纯代码守卫）。阶段 2 尚未开工。
