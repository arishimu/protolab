# 仓库说明

这个仓库是我的安全协议学习与工具开发工作区。前半段自学 ProVerif（密码协议自动验证工具），后半段在此之上做了一个安全协议可视化 Web 工具 **pv-lens**：当前交付「规范叙事视图 + ProVerif 验证」的只读 MVP，「可视化建模」（画布编辑回写 `.pv`）是二期愿景（ADR-0011）。学习资料归档在 `docs/proverif/`，工具代码在 `pv-lens/`。

## 目录结构

- `docs/`：学习与研究资料，ProVerif 相关全部归档在此
  - `docs/proverif/manual/`：官方手册按章节转写的 `manual-*.md`，正文英文，查语法和语义用
  - `docs/proverif/note/`：分章学习笔记，`00-framework.md` 起头，每篇讲一个能力问题
  - `docs/proverif/pv/`：示例模型，全部 `.pv`
  - `docs/proverif/pdf/`：官方 PDF（手册、教程、综述）
  - `docs/gui-test/`：GUI 测试报告、两轮整改方案与验收截图，入口见 `docs/gui-test/README.md`
- `pv-lens/`：安全协议可视化（阅读与验证）Web 工具，画布编辑建模为二期（pnpm workspace，三包：`core` 纯 TS 共享核心 / `server` Node 验证后端 / `web` React + Vite 前端）
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

## 常用命令（ProVerif 学习）

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

## pv-lens：规范叙事视图 + ProVerif 验证（MVP 已完成，叙事视图 v2 迭代中）

`pv-lens/` 是把「协议结构」与「ProVerif 验证结论」接到一起的本地 Web 工具：装载 `.pv` 后浏览器把每条角色渲染成一条泳道（消息步骤 + 符号化词项 + 未配对/降级标注），并按**设计意图**给两方协议画跨泳道连线（类型 + 源码顺序，多方协议不自动连线，连上不代安全保证）；点「运行验证」由后端 `spawn` 本机 ProVerif；结果按查询逐条呈现（证明成立 / 被证伪 / 未能证明），被证伪时附反例 trace 原文与完整 stdout。界面中文，代码与术语保留英文。

**定位与边界**：用户是学习密码学的学生、教师、研究者；个人使用、本地/自托管运行，不上公网。MVP 只读不编辑——画布编辑与反例 trace 归因可视化属二期，ProVerif 不随应用打包（假设本机已装）；分期口径见 [ADR-0011](docs/adr/0011-product-phasing.md)。设计与验收口径见 [`.scratch/pv-lens/spec.md`](.scratch/pv-lens/spec.md)（v2 在 [`.scratch/pv-lens-v2/`](.scratch/pv-lens-v2/spec.md)），架构约束见 `docs/adr/0001`、`docs/adr/0002`，词汇表见 `CONTEXT.md`。

### 前置条件

- **Node.js ≥ 20** 与 **pnpm**（仓库用 pnpm workspace）。
- **本机 ProVerif 2.x**（本项目不打包、不分发它，见 ADR-0002）：

  ```bash
  opam update && opam depext proverif && opam install proverif
  ```

  通过 opam 安装的 `proverif` 需要先进入其环境，否则进程的 PATH 里找不到它：`bash`/`zsh` 用 `eval "$(opam env)"`，`fish` 用 `eval (opam env)`。
- 渲染（装载 / 泳道图）不需要 ProVerif；只有点「运行验证」才需要。

### 安装与启动

```bash
cd pv-lens
pnpm install
pnpm build
```

启动需要两个进程（两个终端，都在 `pv-lens/` 下）：

```bash
# 终端 1：验证服务，监听 http://127.0.0.1:8787
pnpm start

# 终端 2：前端，http://127.0.0.1:5173
pnpm --filter @pv-lens/web dev
```

浏览器打开终端 2 打印的地址即可。前端在 dev 与 preview 下都通过 Vite 的 `/api` 代理访问 127.0.0.1:8787，所以两个进程必须同时运行；「运行验证」报「验证服务不可达」时，先确认终端 1 没退出。

**ProVerif 路径注入**：适配器默认用 PATH 上的 `proverif`，也可用环境变量 `PROVERIF_PATH` 显式指定（ADR-0002 的路径可注入约束）：

```bash
# 未执行 eval "$(opam env)" 时，直接指到可执行文件
PROVERIF_PATH=~/.opam/default/bin/proverif pnpm start
```

服务端口可用 `PORT` 覆盖（默认 8787）；前端 dev 端口见 `packages/web/vite.config.ts`（默认 5173）。

### 四个内置样例

首页直接点选即可装载；结果是 ProVerif 2.05 的实测判定（录制见 `pv-lens/packages/core/fixtures/proverif/`）：

| 样例 | 形态 | 结果 |
|---|---|---|
| hello（保密性最小冒烟） | 保密性破坏 | 2 条查询：`not attacker(RSA[])` 被证伪（附 trace），`not attacker(Cocks[])` 成立 |
| 握手修正版（全绿） | 全绿 | 3 条查询（含对称/非对称加密、签名与事件）全部成立 |
| NS 修正版（互认证成立） | 全绿 | 四角色；2 条互认证查询全部成立 |
| NS 原版（含 Lowe 攻击） | 认证破坏 | 6 条查询：B 侧互认证与 B 侧 nonce 保密被证伪（各附 trace），其余成立 |

除内置样例外，也可从本地磁盘导入自己的 `.pv`：解析不了的语法会降级为「原文标注段」而不让整张图失败，语法错误按行/列给中文诊断；验证路径的失败（缺 ProVerif / 模型报错 / 超时 / 服务不可达）在结果面板有分类的中文提示。

### 开发与测试

```bash
cd pv-lens
pnpm typecheck   # 三包类型检查
pnpm test        # vitest：core 解析/配对/结果解析 + web 渲染映射 + server HTTP/适配器
```

真实 ProVerif 集成冒烟在本机装有 `proverif` 时运行，否则自动跳过（CI / 无 ProVerif 环境不受影响）。修改样例原文请改 `packages/core/fixtures/pv/*.pv`，再运行 `pnpm --filter @pv-lens/core sync:sample-texts` 重新生成嵌入副本（drift 守卫见 `core/test/fixtures.test.ts`）。
