# 07: 验证链（server + CLI 适配器 + stdout 解析）

**What to build:** 后端验证管道：接收 `.pv` 文本 → CLI 适配器写临时文件、spawn 本机 ProVerif（可执行路径可注入、超时、可取消，遵守 ADR-0002）→ core 把 stdout 解析成按查询的结构化结果。解析按实测事实实现：每查询一节（`Starting query` … `RESULT <归一化查询> is true|false|cannot be proved.`），`attacker(x)` 归一化为 `not attacker(x)`，判定只信 RESULT 行（退出码 0 不代表成立），`cannot be proved` 必须支持。适配器区分三类失败：找不到可执行文件 / proverif 自身错误（带输出）/ 超时。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 四个录制 stdout fixtures 解析出黄金判定（真/假各自断言、证伪节反例 trace 原文完整捕获、查询数正确）——无 ProVerif 环境也跑绿（Seam B）
- [ ] 人工构造的 `cannot be proved` fixture 解析正确
- [ ] 适配器本地集成冒烟：对四样例真实 spawn 各成功一次；缺可执行文件路径 / 超时两分支行为正确（不进 CI 必跑）
- [ ] 服务接口：收 `.pv` 文本 → 返回结构化结果 + 完整原始输出；超时与取消由适配器负责
- [ ] 路径可注入（默认读环境/配置），代码不写死二进制路径

## Comments
