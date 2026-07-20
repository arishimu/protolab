# ProVerif 学习仓库

这个仓库用于系统学习安全协议形式化验证工具 **ProVerif**，同时补齐密码学与安全协议分析的基础知识。当前仓库已经收集了一批官方手册、教程论文和示例模型，后续可以在此基础上持续添加笔记、实验记录和自建案例。

## 学习目标

本仓库当前阶段的学习目标如下：

1. 入门密码学和安全协议基础知识。
2. 理解形式化验证在安全协议分析中的作用、边界与常见问题。
3. 学会 ProVerif 的基本使用方法，包括：
   - 编写和阅读 `.pv` 模型；
   - 运行 ProVerif 验证查询；
   - 分析 secrecy、authentication、equivalence 等常见性质；
   - 阅读工具输出并定位攻击轨迹或建模问题。

## 仓库结构

```text
protolab/
├─ README.md
└─ proverif-docs/
   ├─ manual.pdf
   ├─ BlanchetFOSAD14-ProVerif-tutorial.pdf
   ├─ BlanchetFnTPS16-ProVerif-survey.pdf
   ├─ hello.pv
   ├─ ex_handshake.pv
   ├─ NeedhamSchroederPK-*.pv
   └─ ...
```

## 资料说明

`proverif-docs/` 中已经包含了当前学习的核心资料：

- `proverif-docs/manual.pdf`：ProVerif 官方手册，偏完整参考。
- `proverif-docs/BlanchetFOSAD14-ProVerif-tutorial.pdf`：入门教程，适合先建立整体概念。
- `proverif-docs/BlanchetFnTPS16-ProVerif-survey.pdf`：综述性质材料，适合理解工具能力边界与研究背景。
- `proverif-docs/hello.pv`、`proverif-docs/hello_ext.pv`、`proverif-docs/hello_var.pv`：最小示例，适合安装后做第一轮验证。
- `proverif-docs/ex_*.pv`：覆盖 query、equivalence、induction、handshake 等主题。
- `proverif-docs/NeedhamSchroederPK-*.pv`：经典协议案例，适合进入认证与攻击分析阶段。

## 推荐学习顺序

建议按下面的顺序推进，这样会比较平滑：

1. **先补密码学与协议分析基础**
   - 先掌握：对称加密、公开密钥加密、签名、散列、随机数、nonce、session key、前向保密、认证与重放攻击。
   - 同时理解安全协议分析里常见的 Dolev-Yao 攻击者模型。
2. **再建立 ProVerif 心智模型**
   - 阅读 `proverif-docs/BlanchetFOSAD14-ProVerif-tutorial.pdf`
   - 明确 ProVerif 把协议建模为进程演算，并在符号模型下验证性质。
3. **先跑最小例子**
   - 从 `proverif-docs/hello.pv` 开始；
   - 再看 `hello_ext.pv` 和 `hello_var.pv`。
4. **进入常见查询与性质**
   - 学 secrecy：`ex_query_attacker.pv`、`ex_weaksecret.pv`
   - 学认证：`ex_handshake.pv`、`ex_sync.pv`
   - 学等价性：`ex_equivalence.pv`
5. **最后做经典协议案例**
   - 学习 `NeedhamSchroederPK-*.pv` 系列；
   - 对照论文和输出结果，理解认证缺陷、修复方案和查询写法。

## 环境配置说明

下面的配置说明结合了仓库内资料和截至 **2026 年 7 月 17 日** 可公开访问的官方网络资料整理而成。  
如果只想尽快开始学习，**推荐优先使用 WSL2 + Ubuntu + opam 安装 ProVerif**。这是我基于官方发布方式和日常工具兼容性做出的推荐，稳定性通常比纯原生 Windows 路线更好。

### 方案一：Windows 上推荐使用 WSL2 + Ubuntu

这是最适合当前仓库场景的方案：命令与官方 Unix 文档更接近，后续运行示例、写脚本和安装 OCaml 生态工具也更省心。

#### 1. 安装 WSL2

在管理员 PowerShell 中执行：

```powershell
wsl --install
```

安装完成后重启系统，首次启动 Ubuntu，设置 Linux 用户名和密码。

如果系统已经安装过 WSL，可以检查状态：

```powershell
wsl --status
```

#### 2. 在 Ubuntu 中安装基础依赖

打开 Ubuntu 终端，执行：

```bash
sudo apt update
sudo apt install -y opam m4 build-essential pkg-config bubblewrap unzip graphviz
```

说明：

- `opam`：OCaml 包管理器，也是安装 ProVerif 的主流方式。
- `build-essential`、`m4`、`pkg-config`：编译依赖。
- `bubblewrap`：部分 opam 沙箱功能会用到。
- `graphviz`：后续如果需要查看某些图形化输出或配套工具会比较方便，建议一并安装。

#### 3. 初始化 opam

继续在 Ubuntu 中执行：

```bash
opam init -a
eval "$(opam env)"
```

如果是第一次初始化，按提示确认即可。

建议顺手确认 OCaml 编译器环境：

```bash
ocaml -version
opam --version
```

#### 4. 安装 ProVerif

执行：

```bash
opam install proverif
eval "$(opam env)"
```

安装完成后检查版本：

```bash
proverif -help
proverif -version
```

如果 `-version` 不可用，至少保证 `proverif -help` 能正常输出帮助信息。

#### 5. 验证当前仓库示例

在 WSL 中进入仓库目录。  
如果你的仓库位于 Windows 文件系统中，请进入对应挂载路径，例如：

```bash
cd /mnt/c/path/to/protolab
```

运行最小示例：

```bash
proverif proverif-docs/hello.pv
```

然后继续试：

```bash
proverif proverif-docs/hello_ext.pv
proverif proverif-docs/ex_handshake.pv
```

如果能看到 `RESULT` 开头的验证结论，就说明环境已经可用。

### 方案二：Linux 原生安装

如果你本来就在 Linux 环境学习，可以直接沿用上面的 Ubuntu 思路，通常只需要把包管理命令替换成发行版对应命令。

以 Debian/Ubuntu 为例：

```bash
sudo apt update
sudo apt install -y opam m4 build-essential pkg-config bubblewrap unzip graphviz
opam init -a
eval "$(opam env)"
opam install proverif
eval "$(opam env)"
proverif proverif-docs/hello.pv
```

### 方案三：macOS 安装

如果你在 macOS 上学习，建议使用 Homebrew + opam：

```bash
brew update
brew install opam graphviz
opam init -a
eval "$(opam env)"
opam install proverif
eval "$(opam env)"
proverif proverif-docs/hello.pv
```

如果系统提示缺少编译工具，请先安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 方案四：原生 Windows 安装

原生 Windows 也能走通，但对初学者来说，整体稳定性和资料一致性通常不如 WSL2 路线。  
如果你只是想高效学习 ProVerif，本仓库仍然更推荐方案一。

原生 Windows 常见有两条路：

1. **使用官方提供的 Windows 版本/安装包**
   - 适合尽快上手；
   - 但后续与 Unix 风格命令、脚本生态结合时不如 WSL 自然。
2. **使用 Windows 版 opam**
   - 更灵活；
   - 但 OCaml 生态在不同 Windows 终端中的体验可能有差异。

如果选择 Windows 版 opam，可先准备：

```powershell
winget install Git.Git
winget install OCaml.opam
```

安装完成后重开 PowerShell，再执行：

```powershell
opam init -a
opam install proverif
proverif -help
```

如果这里遇到编译链、Shell 集成或环境变量问题，不建议硬耗时间，直接切回 **WSL2 方案** 往往更高效。

## 常用命令

### 运行模型

```bash
proverif proverif-docs/hello.pv
```

### 保存输出到文件

```bash
proverif proverif-docs/ex_handshake.pv > handshake.out
```

### 快速切换练习样例

```bash
proverif proverif-docs/ex_query_attacker.pv
proverif proverif-docs/ex_equivalence.pv
proverif proverif-docs/NeedhamSchroederPK-corr-mutual-auth.pv
```

## 第一次学习时建议关注什么

第一次运行 ProVerif 时，不要一上来就追求看懂全部语法，先抓住这几件事：

- **攻击者能力**：攻击者能监听、转发、构造哪些消息。
- **名字与密钥**：`free`、`const`、`new` 分别在建模上意味着什么。
- **密码原语**：构造函数和归约规则如何表达加密、解密、签名、验证。
- **进程行为**：输入、输出、并发、复制、事件分别如何影响协议行为。
- **查询语句**：`query attacker(...)`、认证查询、等价性查询分别表示什么。

## 建议的阶段性练习

可以按下面的节奏推进：

1. 运行 `hello.pv`，确认环境无误。
2. 修改一个密钥或消息字段，再次运行，观察输出变化。
3. 在 `ex_query_attacker.pv` 中理解 secrecy 查询。
4. 在 `ex_handshake.pv` 中理解事件与认证查询。
5. 对照 `NeedhamSchroederPK-*.pv` 系列，理解协议缺陷和修正版区别。
6. 自己新建一个最小协议模型，比如“带 nonce 的挑战应答”。

## 在线资料与官方入口

下面这些入口适合后续继续查资料：

- ProVerif 官方主页：[https://bblanche.gitlabpages.inria.fr/proverif/](https://bblanche.gitlabpages.inria.fr/proverif/)
- ProVerif 官方手册入口：[https://bblanche.gitlabpages.inria.fr/proverif/manual.pdf](https://bblanche.gitlabpages.inria.fr/proverif/manual.pdf)
- ProVerif 官方教程入口：[https://bblanche.gitlabpages.inria.fr/proverif/](https://bblanche.gitlabpages.inria.fr/proverif/)
- opam 官方网站：[https://opam.ocaml.org/](https://opam.ocaml.org/)

## 后续可以继续补充的内容

后续这个仓库可以继续加上：

- `notes/`：按主题记录密码学和协议分析笔记；
- `labs/`：整理自己改写过的 `.pv` 实验；
- `scripts/`：加入批量运行示例的脚本；
- `examples/`：沉淀自己从论文复现出的协议模型。
