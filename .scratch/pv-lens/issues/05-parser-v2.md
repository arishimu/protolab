# 05: core 解析器 v2（NS 级子集）

**What to build:** 把解析器从握手级扩到 Needham-Schroeder 级：元组/类型化模式变量/`=值` 等式模式、`if`/`let` 嵌套守卫内的消息步线性展开、主进程内 `new/let/.../table/insert/get` 序列、顶层并行与复制、命名进程参数的展示、查询列表保留用户原文（含事件对应查询与 attacker 查询）。仍守降级纪律：解析不了的不崩溃，产出带 span 的原文标注。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] NS 修正版互认证 fixture 通过黄金断言：四角色（initiator/responder/server/密钥登记）泳道、各自步骤序列、守卫与查询原文
- [ ] NS 原版 fixture 同样通过（含 Lowe 攻击样例的查询集，为 08 的验证演示备好语义侧）
- [ ] 主进程序列（new/let/out/insert/get）与 `if/let` 守卫内消息步的展开正确
- [ ] 新语法形态均有降级用例护航：不支持 → 带 span 原文标注而非崩溃
- [ ] 语义模型仍不含验证副作用（与 07 的 stdout 解析互不依赖）

## Comments
