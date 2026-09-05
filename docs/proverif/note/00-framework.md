# 00 ProVerif 学习总纲：按它能回答的问题来学

这份文档是整个仓库的学习主框架。先搞清楚 ProVerif 到底能回答哪几类安全问题，再按问题切章节。每学一个问题，语法、建模、跑模型都是围绕它展开的。

读法：先看「三条主线」，再按「学习章节」一节节往下走。每一章我会写清楚它回答什么问题、需要哪些语法、对应手册哪一节、拿哪些示例模型练手、旧笔记里哪一篇能当参考。

## 三条主线：ProVerif 能回答哪三类问题

ProVerif 是个自动分析密码协议安全性的工具。它接受一个协议模型和一组查询，然后判断每个查询成不成立；判不了的时候，还会尝试还原出一条反例轨迹。所有查询都能归到下面三类里，这也是全书的切分依据。

1. **保密性问题（可达性）**：某个秘密会不会落到攻击者手里，某个状态是否可达。这是最直观的一类，对应 `attacker(...)` 和 `not attacker(...)`。
2. **认证问题（对应断言）**：当某个事件发生时，另一个事件是不是必然已经发生过。这类处理协议里的"双方是否真的在跟正确对象说话""消息是不是从正确的地方来"，对应 `event ... ==> event ...`，还能加注入性。
3. **可区分性问题（观察等价）**：两套执行过程对攻击者来说能不能区分开。强保密、前向保密、匿名、隐私、不可区分性都归这里，对应 `equivalence`、`noninterf`、`choice`。

把协议写出来（建模语言）和读懂输出，是这三类问题共用的地基，不是单独一条主线。学习顺序可以理解为：先搭地基，再一条主线一条主线地攻，最后用一个大案例把三类问题串起来。

## 学习章节

### 第 0 章 定位：先把工具放到地图上

目标不是写代码，是把 ProVerif 是什么、吃进什么、吐出什么搞清楚，别一上来就被命令输出吓到。

- 它分析的对象：用进程描述协议，信道默认被攻击者完全控制，攻击者是 Dolev-Yao 那套。
- 输入输出长什么样：一个 `.pv` 文件里有声明、进程和查询，跑完输出一堆 `RESULT ... is true/false`。
- 命令：`proverif file.pv`，在带 `opam` 的会话里要 `eval "$(opam env)"` 后再跑。
- 参考：手册 `manual-01`（能力总述）、`manual-02`（入门）。

### 第 1 章 地基：建模语言和攻击者模型

没有这一章，后面三条主线都立不起来。目标是把"写一个协议"这件事本身学会。

- 声明：`free`、`new`、`const`、`type`、`[private]` 怎么用，公开名默认攻击者知道，私有名要标 `[private]`。
- 进程：`out`、`in`、`let`、`if ... then ... else`、并发 `|`、复制 `!`、`0` 结束。
- 密码原语：怎么声明构造器和析构器（`fun` / `reduc`），对称加密、非对称加密、签名、哈希各怎么写。
- 事件：`event` 的声明和放置位置。
- 这一章不求深，够把第 2、3 章的模型写出来就行；表、阶段、同步、方程这些留到第 6 章。
- 参考：手册 `manual-03` 的 3.1、`manual-04` 的 4.1。旧笔记看 `old/01-hello-basics.md`。

### 第 2 章 主线一：保密性和可达性

要回答的问题就一个：**这个秘密会不会泄露？**

- `query attacker(M)` 和 `query not attacker(M)` 到底在问什么，真和假的含义。
- 为什么保密失败会给出反例 trace，怎么把一条 trace 读成人话。
- 泄露不一定靠直接输出，可能是靠攻击者从多条消息里推出、用规则还原。
- 这一章的变体是弱保密（weak secrecy）：它问的不是"会不会泄露"，而是"能不能区分"。放这里先看一眼，讲透还是留给第 4 章。
- 练手：`hello.pv`、`hello_var.pv`、`ex_approx_repet.pv`、`ex_axiom.pv`。
- 参考：手册 `manual-02`、`manual-03` 的 3.2.1、`manual-04` 的 4.3.1 里的 secrecy 部分。旧笔记看 `old/01-hello-basics.md`、`old/03-attacker-query.md`、`old/04-weak-secrecy.md`。

### 第 3 章 主线二：认证和对应断言

要回答的问题：**当某件事发生的时候，另一件事是不是必然已经发生过？**

- `event A ==> event B` 的含义：B 先于 A。
- 认证通常不是"格式对不对"，而是"这个 A 出现时，对应的 B 一定出现过"，用事件对来刻画。
- 注入性：`inj-event` 比普通 `event ==> event` 强在哪，为什么注入性能防重放。
- 身份绑定：为什么握手模型不带身份信息会被攻破，加了绑定就修好。
- 练手：`ex_handshake_annotated.pv`（有问题的）和 `_fixed`（修好的）、`hello_ext.pv`、`ex_query_new.pv`。
- 参考：手册 `manual-03` 的 3.2.2、`manual-04` 的 4.3.1 里的 correspondence 部分。旧笔记看 `old/02-handshake-auth.md`、`old/03-attacker-query.md`。

### 第 4 章 主线三：观察等价和不可区分性

要回答的问题换了个脑回路：**不关心秘密原文，关心攻击者能不能区分两套情况。**

- `choice[m,n]` 表示一个二选一的分支，`equivalence P Q` 问 P 和 Q 外部行为是否一致。
- 强保密、前向保密（看 `dh-fs.pv`）、离线口令猜测，都用这一套表达。
- `noninterf x`：把秘密换掉系统还不可区分。
- 一个关键区分：内部持有秘密、内部做解密，不一定破坏不可区分；要看内部差异有没有投射成外部可观察的差异。
- 弱保密和 observational equivalence 的关联在这里补齐，和第 2 章呼应。
- 练手：`ex_equivalence.pv`、`ex_noninterf1.pv`、`ex_noninterf2.pv`、`ex_weaksecret.pv`、`ex_weaksecret_obs.pv`、`dh-fs.pv`、`ex_sync.pv`。
- 参考：手册 `manual-04` 的 4.3.2、`manual-03` 的 3.2.3 之后。旧笔记看 `old/05-equivalence-noninterf.md`、`old/06-distinguishability.md`。

### 第 5 章 读懂输出和反例

跑通模型只是第一步，会读输出才算会用它。这一章讲 ProVerif 到底吐了什么东西。

- `RESULT ... is true/false` 的准确含义，以及为什么假攻击会出现（内部近似）。
- derivation 和 trace 的区别，trace 一定对应真实攻击。
- 一条攻击 trace 怎么逐步读：谁发给了谁、攻击者推导出了什么、漏洞在哪。
- 交互模式 `proverif interact` 和图形显示，什么时候用。
- 参考：手册 `manual-03` 的 3.3、3.4。旧笔记看 `old/00-overview.md` 的结果表。

### 第 6 章 进阶：语言特性、手工证明辅助和大案例

三条主线都走完一遍后，这些是让 ProVerif 能处理更真实协议的调料。

- 语言特性补全：表（`table`/`insert`/`get`）、阶段（`phase`）、同步（`sync`）、方程（`equation`，Diffie-Hellman 和对称加密的建模）、函数宏、进程宏带 `fail`。
- 手工辅助证明：`lemma`、`axiom`、`restriction`、`pred` + `clauses`、`elimtrue`，以及用归纳（`[induction]`）证明对应断言。
- 性能与选项：`set` 各种选项、攻击重构设置、分组查询、调分辨率策略。了解存在即可，不必背。
- 综合案例：Needham-Schroeder 完整协议，把保密、认证、等价三类问题在一个协议上串起来，看如何从模型出发发现并修复公钥协议里的漏洞。
- 练手：`ex_induction.pv`、`ex_induction_group.pv`、`ex_lemmas_equiv.pv`、`ex_predicates.pv`、`ex_elimtrue.pv`、`ex_sync2.pv`，最后是 `NeedhamSchroederPK-*.pv` 系列。
- 参考：手册 `manual-04` 的 4.2、`manual-05`、`manual-06`、`manual-07`。旧笔记看 `old/07-knowledge-and-plan.md` 里的四阶段计划。

## 学习节奏建议

每章用一个"问题-语法-模型-输出"的循环：先想清楚这章要回答什么，再看手册里对应的语法，拿练手模型跑一遍，读它的 RESULT，最后用自己的话记一句"我在这章搞懂了什么"。一章吃透再进下一章，别赶进度。三条主线（第 2、3、4 章）之间有依赖，顺序别乱；第 5、6 章可以边学主线边回头补。

每学完一个主题，按 `old/07-knowledge-and-plan.md` 末尾的记录模板补一段，仓库就从一个资料堆变成能回看的学习轨迹。
