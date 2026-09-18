# 仓库说明

这个仓库是我的安全协议学习与工具开发工作区。前半段自学 ProVerif（密码协议自动验证工具），后半段在此之上做一个安全协议可视化建模的 Web 项目。学习资料归档在 `docs/proverif/`，新项目的代码会逐步落在独立目录里。

## 目录结构

- `docs/`：学习与研究资料，ProVerif 相关全部归档在此
  - `docs/proverif/manual/`：官方手册按章节转写的 `manual-*.md`，正文英文，查语法和语义用
  - `docs/proverif/note/`：分章学习笔记，`00-framework.md` 起头，每篇讲一个能力问题
  - `docs/proverif/pv/`：示例模型，全部 `.pv`
  - `docs/proverif/pdf/`：官方 PDF（手册、教程、综述）
- `README.md`：索引页，定位 + 导航 + 常用命令

## 学习笔记导航

主框架是 [00 学习总纲](docs/proverif/note/00-framework.md)：按"ProVerif 能回答哪几类安全问题"切分章节（保密性、认证、等价三条主线 + 建模地基 + 输出解读 + 进阶）。学习以它为序。

分章笔记共 8 篇，均已按框架思路写完并在会话中重跑验证：

| 笔记 | 内容 |
|---|---|
| [00 学习总纲](docs/proverif/note/00-framework.md) | 能力主线与章节划分，学习顺序的依据 |
| [01 建模语言与攻击者模型](docs/proverif/note/01-foundation.md) | `.pv` 文件结构、信道、攻击者、事件雏形 |
| [02 保密性与可达性](docs/proverif/note/02-secrecy.md) | `attacker` 查询、假攻击、axiom |
| [03 认证与对应断言](docs/proverif/note/03-authentication.md) | `event`/`==>`/`inj-event`、身份绑定 |
| [04 观察等价与不可区分性](docs/proverif/note/04-equivalence.md) | `choice`、`noninterf`、`weaksecret`、DH 建模、同步 |
| [05 读懂输出和反例](docs/proverif/note/05-output.md) | RESULT、derivation 与 trace、不完备来源 |
| [06 进阶](docs/proverif/note/06-advanced.md) | 语言特性补全、归纳/引理/谓词、选项 |
| [06b Needham-Schroeder 详解](docs/proverif/note/06b-needham-schroeder.md) | 协议逐行建模、Lowe 攻击、AKE/UKS/RoR 变体 |

验证情况：各笔记开头的 RESULT 表格都是带 `opam` 的会话里实跑的结果，含 NS 系列完整跑通。跑法见下方命令。

### 官方手册

`docs/proverif/pdf/manual.pdf`（ProVerif 2.05 手册）按章节转写成 `docs/proverif/manual/manual-01-*.md` 到 `manual-10-*.md`，覆盖第 1–7 章 + 附录 A/B + 参考文献，正文保持英文。

## 常用命令

从仓库根目录执行：

```bash
proverif docs/proverif/pv/hello.pv
proverif docs/proverif/pv/ex_handshake_annotated.pv
proverif docs/proverif/pv/ex_handshake_annotated_fixed.pv
proverif docs/proverif/pv/NeedhamSchroederPK-corr-mutual-auth.pv
```

看 RESULT 时加过滤：

```bash
proverif docs/proverif/pv/hello.pv | grep "RESULT"
```

通过 `opam` 安装的 ProVerif，在 `bash`/`zsh` 里先执行 `eval "$(opam env)"`，`fish` 用户用 `eval (opam env)`。

## 下一步

ProVerif 学习已完成。接下来是安全协议可视化建模 Web 项目（代号 **pv-lens**）的设计与实现，代码和笔记会逐步补充，并在本文档登记。

**已定方向**（2025 起，详见 `docs/adr/` 与 `CONTEXT.md` 词表）：

- 用户：学习密码学的学生、教师、研究者；个人使用、本地/自托管运行，不上公网。
- MVP：导入 `.pv` → 渲染「规范叙事视图」泳道图 → 一键调用本机 ProVerif → 展示每条 query 的结构化结论与反例 trace 原文；不含画布编辑、不含 trace 可视化归因、不含打包 ProVerif。
- 二期：画布编辑（增删/拖拽组件）并把改动回写 `.pv`；反例 trace 映射回泳道图。
- 技术栈：TypeScript 全栈（React + Vite 前端自绘 SVG；Node 后端 spawn ProVerif）。
