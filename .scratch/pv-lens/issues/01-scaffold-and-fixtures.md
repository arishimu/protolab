# 01: 脚手架 + 测试基建 + fixtures

**What to build:** 一个能跑、能测的空壳工程，作为其余所有工单的地基：pnpm workspace 三包（共享核心库 core、前端 web、后端 server）各自可构建、测试运行器接通并有一个冒烟测试；四个基准样例的 `.pv` 原文与本机 ProVerif 的真实输出录制成 fixture 资产供后续测试使用。

**Blocked by:** None（可立即开工）

**Status:** resolved

- [x] workspace 三包可安装、core 包同时能被 web 与 server 依赖，无 Node/浏览器 API 泄漏进 core
- [x] 测试运行器接通，至少一个冒烟测试能在干净环境（无 ProVerif）跑绿
- [x] 四个基准样例的 `.pv` 原文入库为 fixture——源文件与代号映射（均在 `docs/proverif/pv/`，详见 spec.md 映射表）：`hello.pv`(hello)、`ex_handshake_annotated_fixed.pv`(握手修正版)、`NeedhamSchroederPK-corr-mutual-auth.pv`(NS 修正版互认证)、`NeedhamSchroederPK-var1.pv`(NS 原版/Lowe 攻击)
- [x] 用本机 ProVerif 2.05 对上述四个文件各跑一遍，stdout 全量录制为 fixture（供 Seam B 测试，含一条含反例 trace 的输出）
- [x] 工程收尾基建就位（`.gitignore`、根级脚本约定）以便后续工单直接落码

## Comments

（2025-09-05，/implement #01）已落地。结果与验收口径一致（本机 ProVerif 2.05 实测）：hello `attacker(RSA[])` false 含 trace / Cocks true；握手修正版 3 条 true；NS 修正版互认证 2 条 true；NS 原版 `endBparam==>beginBparam` false（Lowe 攻击，45 行 trace），其余如录。详见 `pv-lens/` 与提交说明。
