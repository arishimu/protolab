# 06 第六课：进阶，语言特性、手工证明辅助和综合案例

对应总纲第 6 章。前三章把 ProVerif 能回答的三类问题走完，这一课补工具本身：真实协议建模需要的语言特性、自动证明搞不定时怎么手工搭把手，最后拿 Needham-Schroeder 公钥协议把保密、认证、等价串起来。

这一课的内容比前几课杂，拆成四块：

1. 语言特性补全：表、阶段、同步、方程、函数宏、进程宏带 `fail`。
2. 手工辅助证明：`lemma`、`axiom`、`restriction`、`pred` + `clauses`、`elimtrue`、归纳。
3. 选项概览：`set` 那一堆参数，知道存在即可。
4. 综合案例：Needham-Schroeder 完整协议，从有漏洞的版本跑到 Lowe 修正版。

## 本次会话验证的结果

| 模型 | 用途 | RESULT |
|---|---|---|
| `ex_handshake_forward_secrecy_skB.pv` | 阶段建模前向保密，泄露 B 私钥 | `not attacker_p1(s[]) is true` |
| `ex_handshake_forward_secrecy_skA.pv` | 同上，泄露 A 私钥 | `not attacker_p1(s[]) is false` |
| `ex_sync.pv` | 同步 + 等价 | `Observational equivalence is true` |
| `ex_sync2.pv` | 同步标签换序 | `Observational equivalence is true` |
| `dh-fs.pv` | 方程建模 DH | `Observational equivalence is true` |
| `ex_induction.pv` | 归纳查询，无 `[induction]` | `cannot be proved` |
| `ex_induction_proof.pv` | 加 `[induction]` | `event(CheckNat(i)) ==> is_nat(i) is true` |
| `ex_induction_group.pv` | 查询组归纳 | 1 个 true，2 个 cannot be proved |
| `ex_induction_group_proof.pv` | 查询组归纳 + `nounif [ignoreAFewTimes]` | 3 个全部 true |
| `ex_lemmas_equiv.pv` | 等价查询，无数助 | 大量 termination warning，证不出 |
| `ex_lemmas_equiv_proof.pv` | 加 lemma 辅助 | `Observational equivalence is true` |
| `ex_predicates.pv` | 谓词 + 子句 | 两个事件都可达（false） |
| `ex_elimtrue.pv` | `elimtrue` 优化 | `not event(e) is false` |
| `ex_axiom.pv` | 公理辅助证明 | `not attacker(s[]) is true` |
| `ex_axiom_precise.pv` | `[precise]` 替代公理 | `not attacker(s[]) is true` |
| `NeedhamSchroederPK-var1.pv` | NS 原版 | B 认证失败、B 的秘密泄露；A 侧保密且认证 |
| `NeedhamSchroederPK-var2.pv` | NS 带密钥服务器 | 同 var1：B 侧失败 |
| `NeedhamSchroederPK-var3.pv` | NS 泛化版 | 同 var1：B 侧失败 |
| `NeedhamSchroederPK-var4.pv` | NS 泛化版（类型检查） | 同 var1：B 侧失败 |
| `NeedhamSchroederPK-var5.pv` | 直接测 nonce 保密 | A 侧 secret true，B 侧 false |
| `NeedhamSchroederPK-corr-mutual-auth.pv` | Lowe 修正版 | 双向认证全部 true |
| `NeedhamSchroederPK-corr-all-messages.pv` | 修正版全消息排序 | true |
| `NeedhamSchroederPK-corr-ake.pv` | 认证密钥交换 | 密钥保密、双向认证、密钥一致 true；UKS 检测 false |
| `NeedhamSchroederPK-corr-ake-RoR.pv` | 密钥 real-or-random 保密 | 等价 cannot be proved（假攻击） |
| `NeedhamSchroederPK-corr-ake-RoR-hNa.pv` | 密钥换成 h(Na) | 等价 true |
| `NeedhamSchroederPK-corr-ake-hNaNb.pv` | 密钥换成 h(Na,Nb) | 同 corr-ake：UKS 检测 false |

## 第一块：语言特性补全

### 表：`table` / `insert` / `get`

表是 ProVerif 提供的持久存储，用来模拟密钥服务器这类"查得到、改不了"的数据库。攻击者访问不到表，只能通过进程的输入输出间接影响它。

```proverif
table keys(host, pkey).
insert keys(A, pkA); P          (* 插入记录后继续 P *)
get keys(=b, sb) in P else Q    (* 按模式取记录，取不到走 else *)
```

`get` 的 else 分支可以省略，省略时取不到就阻塞。手册 4.1.5 说表可以用私有信道编码，但 ProVerif 对表分析更精确，所以单列了语法。

它的用处看 NS 案例最清楚：`NeedhamSchroederPK-var2.pv` 里诚实主机把公钥 `insert` 进表，密钥服务器 `get keys(=b, sb)` 查出对方公钥签发证书。注意 `processK` 允许攻击者注册任意主机的密钥，但 `if h <> A && h <> B` 挡住了改写诚实主机密钥的企图。手册 4.1.5 里明确说过：多个记录能匹配时 ProVerif 会考虑所有可能，没有这个条件攻击者就能把 A、B 的公钥换成自己的。

### 阶段：`phase`

阶段模拟协议的分期，最典型的用途是前向保密：先正常跑会话，然后某个参与者"被腐化"，私钥落到攻击者手里，问之前的会话还保不保密。

`ex_handshake_forward_secrecy_skB.pv` 最后一行：

```proverif
( (!clientA(pkA,skA,pkB)) | (!serverB(pkB,skB,pkA)) |
phase 1; out(c, skB) )
```

phase 0 跑正常握手，phase 1 把服务器 B 的私钥 `skB` 输出给攻击者。查询是 `attacker(s)`，结果是 true：s 仍然保密。攻击者拿到了 skB 也只能模拟 phase 1 之后的 B，解不开 phase 0 里已经跑完的会话。

同一个实验把泄露对象换成 A 的私钥（`ex_handshake_forward_secrecy_skA.pv`），结果翻转为 false：A 的私钥能解开自己收过的密文，而客户端 A 参与过的会话消息都在 phase 0 发出去了，所以 s 泄露。

对比这两个文件是理解阶段语义最快的办法。手册 4.1.6 还提醒了一句：这个模型没有考虑"密钥泄露那一刻正在跑的会话"，要模拟那种情况得自己在 phase 1 里加 A 的进程。

### 同步：`sync`

`sync t [tag]` 引入全局同步，和阶段有点像，但不丢弃进程。所有标签相同的 `sync t` 都到达后，同步才执行，之后各分支继续。

`ex_sync2.pv` 把同步的作用讲得最清楚：

```proverif
set swapping = "tag1 -> tag2".

process
    (
        out(c,m);
        sync 1 [tag1];
        out(c,choice[m,n])
    )|(
        sync 1 [tag2];
        out(c,choice[n,m])
    )
```

左边先输出 m 再同步，右边同步完输出 `choice[n,m]`。没有同步的话，攻击者能先收到 m 再收到 choice，两个世界可区分。有了 `sync 1`，两条消息必然在同一同步点之后才出去，结果等价成立。

同步对等价的帮助在于允许在同步点交换 choice 两侧的数据（手册 4.3.2）：默认情况下 ProVerif 会尝试所有可能的交换策略，`set swapping = "tag1 -> tag2"` 只是手动指定一种。所以删掉这行结果不变，仍是 true；文件里写它，是为了让标签稳定、策略明确。

同步还有几个注意点：不能出现在复制 `!` 下面；标签相同的同步只能出现在 `if`/`let`/`get` 的不同分支里（运行时只会走一个分支）；进程宏展开时可以用 `[sync: tag prefix p]` 控制标签前缀；`sync` 不能和 `phase` 混用。标签里含 `noswap` 的同步不参与数据交换。

### 方程：`equation`

析构器只能表达"某个函数在某类输入上等于某个值"，Diffie-Hellman 这种需要代数关系的原语写不了，得用方程：

```proverif
equation forall x: exponent, y: exponent; exp(exp(g,x),y) = exp(exp(g,y),x).
```

意思是 `(g^x)^y = (g^y)^x`，两边正好是 DH 双方各自算出的共享密钥。`dh-fs.pv` 就靠这一条方程建模，等价查询返回 true：攻击者拿到 `g^a`、`g^b` 也分不清 `g^ab` 和随机值。

方程有几个限制要知道（手册 4.2.2）：

- 方程要能拆成收敛的和线性的两组，不共享构造符。结合律（比如 XOR）写不了，因为预处理器会生成无穷多条重写规则。
- 方程从左到右定向，所以"复杂项在左、简单项在右"的写法更可能成功。
- 析构器比方程快，能用的地方优先析构器。

方程还提供了另一个建模选择：对称加密用两条方程写成互逆双射 `sdec(senc(m,k),k) = m` 和 `senc(sdec(m,k),k) = m`，比用析构器更贴近分组密码"解密总是成功"的性质。

### 函数宏：`letfun`

函数宏就是"一段项展开成一个函数调用"。概率加密是典型场景：加密需要新鲜随机数，每次都写 `new r: coins; internal_aenc(x,y,r)` 太啰嗦，定义成宏：

```proverif
letfun aenc(x: bitstring, y: pkey) = new r: coins; internal_aenc(x,y,r).
```

参数类型后面可以跟 `or fail`：不带时参数失败整个宏失败；带时失败值传进宏体，宏体内可以用 `let ... else` 接住。手册 4.2.3 用两个对照例子讲透了这点。进程宏同理（手册 4.2.4）：参数失败时进程阻塞，`or fail` 则继续执行 else 分支。

### 扩展析构器

手册 4.2.1 的 `reduc ... otherwise ...` 让析构器按顺序试规则，第一条匹配就用第一条，全部不匹配才失败。这比原来"规则集合无序匹配"的表达力强，能定义出原来定义不了的析构器。

## 第二块：手工辅助证明

前五章的查询都是让 ProVerif 全自动跑。这一块是它搞不定的时候，人怎么从外面帮一把：归纳、引理、公理、限制、谓词。

### 归纳：`[induction]`

`ex_induction.pv` 是简化版 Yubikey：Q 维护一个计数器，每次把前值加密发出去；P 收到后跟自己存的值比较，更新内存。查询是"CheckNat 事件里的值一定是自然数"。

不带归纳跑出来是：

```
RESULT event(CheckNat(i_2)) ==> is_nat(i_2) cannot be proved.
```

原因在手册 6.1.1 里讲得很细：ProVerif 为了终止，不对表示内存单元的 `mess(d_P[], ...)` 这类事实做归结，于是卡在一条跟查询矛盾的子句上。但它其实能看出 `CheckNat(i_2)` 严格发生在 `CheckNat(i_2 + 1)` 之前，这正是归纳的抓手。

给查询加 `[induction]`（`ex_induction_proof.pv`）：

```
RESULT event(CheckNat(i_2)) ==> is_nat(i_2) is true.
```

归纳假设是"更早执行的事件满足结论"，ProVerif 在归结时把它加进子句假设，卡住的子句不再矛盾，查询就证出来了。

`ex_induction_group.pv` 演示组查询的归纳，三个查询写在一起，`[induction]` 放在组尾。组查询的归纳是分步走的（手册 6.1.2）：ProVerif 先假设三个查询的归纳假设全都成立，这一步证明了两个；再把归纳假设收窄成只保留证出来的那两个，第二个反而证不出来了；最后只保留第一个，证出第一个。输出里那几组 `PARTIAL RESULT` 就是这几步，最终 1 个 true、2 个 cannot be proved。这跟单查询不一样：单查询的归纳假设一定成立，组查询里某个假设可能本身就不成立，所以 ProVerif 不敢拿全部假设去饱和。

`ex_induction_group_proof.pv` 在文件里多了一行：

```proverif
nounif i:nat; mess(d_Q,i) [ignoreAFewTimes].
```

`nounif` 是手动调归结选择函数的声明：给匹配的事实负权重，让 ProVerif 不要对这类事实做归结，防止饱和过程死循环。副作用是第三个查询 `mess(d_Q,i) ==> is_nat(i)` 的假设永远解不掉。`[ignoreAFewTimes]` 允许验证阶段忽略这个限制有限几次（默认一次，`set nounifIgnoreNtimes` 可调），于是 ProVerif 能对 `mess(d_Q,i)` 归结一次、用上归纳假设，第三个查询就证出来了。这是归纳和选择函数配合的典型例子，手册 6.7.2 有完整推导。

### lemma / axiom / restriction

这三个都是声明"一条应当成立的性质"，区别在信任程度（手册 6.2）：

- `lemma`：ProVerif 会先当普通查询证明它，证不出来就报错，之后才用它辅助主查询的归结。证明顺序就是声明顺序，先证的 lemma 可以帮后证的。
- `axiom`：假设它为真，不证明。适合"人工已经证明、ProVerif 证不了"的性质。声明了 axiom，安全结论就依赖它成立。
- `restriction`：只考虑满足它的执行轨迹，把验证范围收窄。

`ex_lemmas_equiv.pv` 是 lemma 用得最实在的例子。它和归纳用的 Yubikey 类似，但问的是观察等价。跑原版：

```
Termination warning: ... mess2(d_Q[],j'_10,d_Q[],j'_11) ... -> bad
```

归结不终止，一堆越来越大、几乎都带 `mess2(d_Q[],...)` 的子句。`ex_lemmas_equiv_proof.pv` 加了一条 lemma：

```proverif
lemma i:nat, i':nat; mess(d_Q,choice[i,i']) ==> i = i' [induction].
```

意思是：Q 内存单元在等价两侧的值必须相同。这类"两侧不可能不同"的推导在等价证明里是死路，lemma 把它们从归结里清掉，等价就证出来了。这就是手册 6.2 说的：lemma 帮的是终止，不只是完备。

`ex_axiom.pv` 演示另一类问题：Horn 子句忽略执行次数，导致"双层加密能被同一个输入解两次"的假攻击（第 5 章讲过重复动作近似）。对策是给输入加事件 `UAction(st,x)`，再声明公理"同一次输入只能收一条消息"，假攻击消失，`not attacker(s[])` 变成 true。ProVerif 后来把这件事内置成了 `[precise]` 选项，`ex_axiom_precise.pv` 用 `in(c, x)[precise]` 拿到同样结果，不用手写事件和公理。

### 谓词：`pred` + `clauses`、`elimtrue`

谓词用 Horn 子句定义，可以当测试用。`ex_predicates.pv` 用两条子句定义集合成员：

```proverif
pred mem(bitstring, bset).
clauses
  forall x:bitstring, y:bset; mem(x,consset(x,y));
  forall x:bitstring, y:bset, z:bitstring; mem(x,y) -> mem(x,consset(z,y)).
```

头在表头，尾递归查表尾。进程里 `if mem(a,z) then ...` 判断成员，`let w suchthat mem(w,x) in event e'` 从集合里取一个满足条件的元素。两个查询都返回 false，即事件可达，符合预期。

`elimtrue` 声明谓词恒真，还附带一个优化：归结时能安全删掉满足条件的假设。`ex_elimtrue.pv` 就两行：

```proverif
pred p(bitstring,bitstring).
elimtrue x:bitstring, y:bitstring; p(x,y).
```

`if p(m,n) then event e` 里的测试恒真，事件可达。

手册 6.3 提醒一句：谓词和 `let ... suchthat` 跟 `noninterf`、`choice` 不兼容。还有实现性检查（`set predicatesImplementable = nocheck` 可关），保证 `suchthat` 的变量真能算出来。

## 第三块：选项概览

手册 6.6 列了一堆 `set` 参数，这一课不背，知道几个常用的就行：

- `set ignoreTypes = false`：默认忽略类型（能查出类型混淆攻击），设成 false 后状态空间小、跑得快，但查不出这类攻击。NS 的 var3 就靠它避免类型忽略导致的死循环。
- `set preciseActions = true`：给所有输入/`get`/`suchthat` 加 `[precise]`，就是 ex_axiom_precise 用的那招。
- `set attacker = passive`：被动攻击者，只读不写。
- `set simplifyProcess = true`：等价证明失败时先化简 biprocess 再试。
- 命令行的 `-html`、`-graph`：把攻击轨迹生成网页或图，交互查 trace 用。

用法都是 `set 参数 = 值.` 放在文件开头，或命令行 `-set 参数 值`。具体语义需要时再查手册 6.6.2。

## 第四块：Needham-Schroeder 综合案例

这一块已拆成独立笔记：[06b Needham-Schroeder 公钥协议：综合案例详解](06b-needham-schroeder.md)。里面从头展开：协议叙述、Lowe 攻击、var1 模型逐块讲解、攻击 trace 逐行读法、Lowe 修正、密钥服务器与泛化版、AKE 与 UKS、real-or-random 假攻击、全消息排序，附四个已验证的练习。

简要结论：var1–var4 全部复现 Lowe 攻击（B 侧认证失败、B 的 nonce 泄露，A 侧正常）；corr-mutual-auth 双向认证 true；corr-ake 密钥保密、双向认证、密钥一致 true，但双侧 UKS 检测 false；corr-ake-RoR 等价 cannot be proved（假攻击），换成 h(Na) 后 true。完整结果表见 [06b](06b-needham-schroeder.md) 开头和本笔记开头的验证表。

## 这一课该带走的东西

- 表是"只能插不能删"的数据库，模拟密钥服务器；`get` 取不到就走 else，多记录匹配时 ProVerif 全考虑。
- 阶段模拟分期，phase 1 泄露私钥是标准的前向保密建模；泄露谁影响谁，看解密能力在哪一边。
- 同步 `sync` 让多个分支对齐后再继续，和阶段不同，不丢进程；不能进复制，不能和 phase 混用。
- 方程表达析构器表达不了的代数关系（DH），但要收敛、线性、不能有结合律；析构器更快，优先用。
- `letfun` 和进程宏的 `or fail` 控制失败传播，概率加密用宏包住 `new` 随机数。
- 归纳 `[induction]` 解决"ProVerif 为了终止卡在递归子句上"的对应查询。
- lemma 先证明再用，axiom 直接假设，restriction 收窄轨迹；lemma 能救等价证明的终止。
- `[precise]` 内置了"输入只执行一次"的精度修正，是手动事件+公理方案的替代品。
- 谓词用子句定义测试，`elimtrue` 声明恒真并优化归结；和 `choice`/`noninterf` 不兼容。
- NS 的 B 侧认证失败 + B 秘密泄露是 Lowe 攻击的标准签名，Lowe 修正在消息 2 里绑 B 的身份。
- 密钥只由一方决定时，Lowe 修正也挡不住双侧 UKS 攻击，要靠额外对应断言检测。
- real-or-random 测的是"真密钥 vs 随机数"的不可区分，等价查询只能返回 true 或 cannot be proved；假攻击可能来自建模细节（随机数出现在消息构造里），换密钥形式可能绕开。
- 工具类内容（选项、宏）了解存在即可，用的时候查手册。

## 下一步

第 6 章的内容到这里跑完了：语言特性、手工辅助证明、选项概览、NS 系列全部模型都验证过，笔记和 README 已更新。接下来两条路可选。一是读手册 6.7 的 theory 部分，那里讲分辨率策略、性能与终止、不完备的完整来源，第 5 章只碰了其中一小块。二是横向扩展：手册 4.2.5 的密码原语形式化库值得逐个过一遍，或者用 `proverif -html` 把 NS 的攻击 trace 生成网页版，亲眼看看 Lowe 攻击的每一步。

## 练习

改一处，观察结果变化，猜原因。前两个我已验证，第三个建议自己跑：

1. 删掉 `ex_sync2.pv` 的 `set swapping = "tag1 -> tag2".` 再跑。结果不变，仍是 true。原因：默认 ProVerif 就尝试所有交换策略，这行只是显式指定。想看到差异，把 tag 改成含 `noswap` 的名字（如 `tag1_noswap`），数据不在该同步点交换，等价的证明路径就断了。
2. 在 `ex_handshake_forward_secrecy_skB.pv` 的 phase 1 里加一行 `out(c, skA)`，两个私钥一起泄露，重跑 `attacker(s)`。结果翻转为 false（已验证），对照 `_skA.pv` 想清楚：泄露 A 的私钥才是关键，因为它能解开 phase 0 里 A 收到的密文。
3. 把 `ex_induction_proof.pv` 的 `[induction]` 删掉重跑，确认回到 cannot be proved（已验证）。再读 `ex_induction_group_proof.pv`，试着删掉 `nounif ... [ignoreAFewTimes]` 那行，三个查询的结果应该退化成 `ex_induction_group.pv` 的样子：只有第一个 true，另外两个 cannot be proved。

## 参考

- 语言特性：`docs/proverif/manual/manual-04-language-features.md` 的 4.1.5（表）、4.1.6（阶段）、4.1.7（同步）、4.2.1（扩展析构器）、4.2.2（方程）、4.2.3（函数宏）、4.2.4（进程宏）、4.2.5（原语形式化）。
- 手工辅助证明：`docs/proverif/manual/manual-06-advanced-reference.md` 的 6.1（归纳）、6.2（axiom/restriction/lemma）、6.3（谓词）、6.4、6.5；选项见 6.6。
- NS 案例：`docs/proverif/manual/manual-05-needham-schroeder.md` 第 5 章，模型在 `NeedhamSchroederPK-*.pv` 系列。
