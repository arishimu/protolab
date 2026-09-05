# 05 第五课：读懂输出和反例

对应总纲第 5 章。前三章都在跑模型、记结果，这一课把 ProVerif 的输出彻底拆开看一遍。会跑模型只是第一步，会读输出才算会用这个工具。核心就一句话：**derivation 不一定是真的，trace 才是。**

## 输出的整体结构

ProVerif 输出很啰嗦，但骨架固定，按顺序是：

```
[方程的内部表示，如果有]
Process:          <- 展开宏之后的进程，动作带 {n} 编号
-- Query ...
Completing...
Starting query ...
goal reachable: ...   <- 内部在问的目标
Abbreviations: ...    <- 命名缩写
[attack derivation]   <- 攻击推导（英文描述）
[attack trace]        <- 攻击轨迹（进程执行序列）
RESULT ... is ...     <- 结论
Verification summary: <- 全部查询的汇总
```

`Process` 部分值得看一眼。它把进程宏展开、给每个名字唯一标识、给每个动作编号。学习的时候可以用它核对：变量作用域对不对、`if/let` 有没有把进程意外绑进去。后面的 trace 里出现的 `{7}`、`{12}` 这些编号都指这里的动作。

两个实用命令：

```bash
proverif file.pv | grep "RES"        # 只看结论
proverif file.pv | egrep "RES|Err|War"  # 结论加报错加警告
```

## 三种结果

1. **`RESULT [Query] is true`**：查询被证明，没有攻击。此时没有任何 derivation 和 trace。
2. **`RESULT [Query] is false`**：查询为假，ProVerif 发现了攻击。trace 就显示在结果前面，这是要重点看的。
3. **`RESULT [Query] cannot be proved`**：不知道。既证不了真，也找不到假。无限会话的协议验证不可判定，这种情况躲不掉。ProVerif 会给出 derivation，人工分析有时能还原出攻击，有时确实是假攻击。

## derivation 和 trace 的区别

这是第 5 章最重要的一对概念。

**attack derivation** 是 ProVerif 内部表示（Horn 子句）里的推导，用英文句子描述攻击者做了哪些操作。它是从抽象表示里推出来的，**不一定能真正执行**。比如它可能要求某个动作重复很多次，而进程里那个动作根本不在复制下面，现实中只能执行一次。

**attack trace** 是 applied pi 演算语义下的执行轨迹，**一定对应进程的真实执行**。一条真实攻击长什么样、攻击者拿到了什么、漏洞在哪一步，都靠它还原。

所以读输出时的原则：derivation 给思路，trace 定真伪。false 的结果两者都有，盯着 trace 看；cannot be proved 只有 derivation，看完再判断。

## 读一条真实 trace：hello.pv

`hello.pv` 完整输出里，RSA 那条查询的 derivation 和 trace 都很短：

```
Derivation:
1. The message RSA[] may be sent to the attacker at output {1}.
attacker(RSA[]).
2. By 1, attacker(RSA[]).
The goal is reached...

out(c, ~M) with ~M = RSA at {1}
The attacker has the message ~M = RSA.
A trace has been found.
RESULT not attacker(RSA[]) is false.
```

trace 就两行：`out(c, ~M) with ~M = RSA at {1}` 说第 `{1}` 个动作把 RSA 发上了信道 c，攻击者收到。结论：RSA 泄露。对照 Process 部分，`{1}` 正是 `out(c, RSA)` 那个动作。这就是 trace 的读法：从动作编号找回进程里的位置，一步步看到攻击者怎么得手。

## 假攻击案例：ex_approx_repet.pv

第 2 章见过这个模型，当时结果是不知真假的 cannot be proved。现在看它输出的细节，正好演示 derivation 和 trace 的分家：

```
1. The message senc(senc(s[],k[]),k[]) may be sent to the attacker at output {2}.
2. The message senc(senc(s[],k[]),k[]) that the attacker may have by 1 may be received at input {3}.
   So the message senc(s[],k[]) may be sent to the attacker at output {4}.
3. The message senc(s[],k[]) that the attacker may have by 2 may be received at input {3}.
   So the message s[] may be sent to the attacker at output {4}.

Could not find a trace corresponding to this derivation.
RESULT not attacker(s[]) cannot be proved.
```

derivation 看着天衣无缝：拿到双层密文，喂回输入得到 `senc(s,k)`，再喂一次得到 `s`。但最后一行是关键：**找不到对应的 trace**。因为进程里的 `in` 只能执行一次，derivation 却把输入用了两次。Horn 子句可以无限次应用，进程不行。这就是第 2 章说的重复动作近似，现在你知道它在输出上长什么样了。

## 不完备从哪来

`cannot be proved` 不是 bug，是 ProVerif 的设计代价。手册 6.7.5 总结了几个主要来源：

- **重复动作**：最常见。Horn 子句忽略动作执行次数，私有信道上尤其明显。进程 `out(c,M) | in(c,x); in(c,y); P` 里 P 根本执行不了（一条消息喂不满两个输入），但 ProVerif 会把它当成带复制的版本，认为 P 能执行。
- **new 的位置**：`new` 越往下挪，它依赖的输入越多，分析越精确也越贵。挪动 `new` 会改变内部表示，也改变近似程度。
- **私有信道**：ProVerif 只记私有信道上发了哪些消息，不管顺序，也不管收发能否配上。发一条收两条这种结构它就看不出来。
- **观察等价的额外近似**：证明等价时要求两个进程每一步都走同样的分支。有时候两个进程走了不同分支但外部行为仍然不可区分，ProVerif 就证不出来。比如 `out(c,choice[m,n]) | out(c,choice[n,m])` 这个 biprocess 等价其实成立，但 ProVerif 无法直接证明，因为第一个输出它觉得攻击者能区分。

另外两类结果要留个心眼。对注入对应的攻击重建基于启发式，偶尔失败。对观察等价，ProVerif 能重建出"两个进程开始走不同分支的第一个点"的 trace，但这个 trace 不证明等价是错的，所以 ProVerif **永远不会说一个观察等价是 false**，只会说 cannot be proved。

## 这一课该带走的东西

- 输出骨架固定：Process 带编号、goal、derivation、trace、RESULT、汇总。
- 三种结果：true 无攻击，false 有 trace，cannot be proved 是不知道。
- derivation 来自内部抽象，可能不可执行；trace 一定对应真实执行。读 false 看 trace，读 cannot be proved 先看 derivation 再判断。
- 假攻击的标志性句子：`Could not find a trace corresponding to this derivation.`
- 不完备主要来自重复动作近似，其次是 new 的位置、私有信道、等价的逐步比较。
- 观察等价永远不会被判 false，只会 cannot be proved。
- 日常用 `grep "RES"` 过滤输出。

## 下一步

四条主线走完，剩下的都是进阶。第 6 章先补语言特性（表、阶段、同步、方程、函数宏、谓词），再用归纳和引理辅助证明，最后上 Needham-Schroeder 综合案例。手册 `manual-03` 的 3.3、3.4 对应这一课。
