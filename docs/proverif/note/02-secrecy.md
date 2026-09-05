# 02 第二课：保密性与可达性

对应总纲第 2 章。这一课回答一个问题：**一个秘密会不会落到攻击者手里。** 第一课只见过"直接输出"这一种泄露，这次要看攻击者怎么靠组合和还原把秘密抠出来，还要看一个容易被忽视的现象：ProVerif 说 "cannot be proved" 的时候，未必是真有攻击。

先跑两个新模型，一个假攻击，一个靠辅助假设证明：

```
$ proverif ex_approx_repet.pv
RESULT not attacker(s[]) cannot be proved.

$ proverif ex_axiom.pv
RESULT not attacker(s[]) is true.
```

## query attacker(M) 到底在问什么

`query attacker(M)` 内部转成 `not attacker(M)`。它问的不是"M 是不是私有的"，而是：按 Dolev-Yao 规则，攻击者能不能**推导**出 M。

推导的来源有三类：

- 直接收到：协议把 M 发到公开信道，攻击者拿走。
- 构造：攻击者手上已有若干项，用公开构造器（拼对、加密、哈希）组合出新项。
- 还原：攻击者把收到的密文喂回协议的某个输入，协议帮他解密，把结果吐出来。

第一课的例子只用了第一类。这一课的两个模型用第二、三类。

## ex_approx_repet.pv：一个"假攻击"

```proverif
free s: bitstring [private].
query attacker(s).
process
    new k: key;
    out(c, senc(senc(s,k),k));
    in(c, x: bitstring);
    out(c, sdec(x,k))
```

进程做的事：新密钥 k，输出双层加密的 `s`，然后接收一个输入，解密一层再输出。

ProVerif 给出的推导是这样：

1. 攻击者拿到 `senc(senc(s,k),k)`。
2. 把它发回输入，进程解密一层，攻击者得到 `senc(s,k)`。
3. 再把 `senc(s,k)` 发回输入，进程再解密一层，攻击者得到 `s`。

推导天衣无缝，但注意输出最后一行：`Could not find a trace corresponding to this derivation.` 然后才是 `cannot be proved`。

问题出在哪？进程里的 `in` 只执行**一次**。现实中攻击者只有一次机会把消息喂进去，第 2 步用完这次机会，第 3 步就没得用了。但 ProVerif 把进程翻译成 Horn 子句时，子句可以无限次应用，等于悄悄把进程当成可以反复 `in` 的版本在分析。这是手册 6.7.5 讲的"重复动作近似"，是 ProVerif 主要的近似来源。

所以 "cannot be proved" 是第三种答案：不知道。它既不是"保密"也不是"攻击成立"，而是"因为近似，我没法证明，也给不出真 trace"。真攻击一定给得出 trace；给不出 trace 的推导就是假攻击。

`ex_approx_repet_private1.pv` 和 `_private2.pv` 是同一主题的变体，把信道或密钥改成私有的，看泄露路径怎么被堵住。

## ex_axiom.pv：用辅助假设帮 ProVerif 证明

```proverif
free s: bitstring [private].
event UAction(stamp, bitstring).
axiom st:stamp, x:bitstring, y:bitstring;
    event(UAction(st,x)) && event(UAction(st,y)) ==> x = y.
query attacker(s).
process
    new k: key; out(c, senc(senc(s,k),k));
    in(c, x: bitstring);
    new st[]: stamp;
    event UAction(st,x);
    out(c, sdec(x,k))
```

进程和上一个很像，区别是每次输入时生成一个新的时间戳 `st`，并记录事件 `UAction(st,x)`。`axiom` 声明一条附加规则：同一个 `st` 上发生的两次 `UAction`，参数必须相同。意思是每个时间戳只绑一个消息。

有了这个假设，ProVerif 就能证明 `not attacker(s)` 为真。它的作用相当于给分析器补一条"现实世界约定"：时间戳不会复用。攻击者想把收到的密文喂回去骗第二次解密，就会撞上同一个 `st` 带不同 `x` 的矛盾。

`axiom` 是第 6 章的内容，这里先见个面，知道"证明不出来时可以靠辅助假设"就够了。注意它要慎用：假设错了，证明就没有意义。

## 这一课该带走的东西

- `query attacker(M)` 问推导，推导有三条路：直接收到、构造、还原。
- 结果有三种：`true`（保密）、`false`（泄露，带 trace）、`cannot be proved`（不知道）。
- 真攻击一定给 trace；没有对应 trace 的推导是假攻击，来自 ProVerif 的近似，最常见的是重复动作近似。
- 看到 "cannot be proved" 别急着下结论，先看有没有 trace、是不是进程里动作次数被当成无限。
- 证明不动的时候，`axiom` 可以补辅助假设，但要清楚假设的分量。

## 下一步

保密性这一章还差一块：弱保密（weak secrecy）。它问的不是"会不会泄露"，而是"能不能区分"，概念上已经伸进第 4 章的等价性了。按总纲，第 2 章先把它的存在记下，完整讲法在第 4 章。或者你也可以直接进第 3 章认证，把弱保密留到等价性那章一起学。旧笔记 `old/03-attacker-query.md` 里有 `ex_query_attacker.pv` 的推导闭包视角，跟这一课对照着看正好。
