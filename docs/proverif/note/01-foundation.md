# 01 第一课：建模语言与攻击者模型（地基）

这一课对应总纲的第 0、1 章，是后面三条主线（保密性、认证、等价）都要用的地基。目标不是记住所有语法，而是搞清楚一件事：一个 `.pv` 文件里到底写了什么，ProVerif 又是按什么规则在判断。

先跑起来再说。三个模型已经验证过，结果都对：

```
$ proverif hello.pv
RESULT not attacker(RSA[])   is false.
RESULT not attacker(Cocks[]) is true.

$ proverif hello_ext.pv
RESULT event(evCocks) ==> event(evRSA) is true.

$ proverif hello_var.pv
RESULT not attacker(Cocks[]) is true.
```

## ProVerif 到底在算什么

一句话：它把一个协议写成一个进程，问某个查询成不成立。成立记 `true`，不成立记 `false`，判不了就给一条反例轨迹。

判断的规则是 Dolev-Yao 攻击者那一套：攻击者完全控制公开信道，所有发到公开信道上的消息他都能拿到，拿到之后还能按规则组合、还原出新的消息。`[private]` 标记的名字不在他的初始知识里。

所以读 `.pv` 文件时心里要装着两个问题：这个名字攻击者一开始知不知道；这条消息发到公开信道后，攻击者能不能据此推出秘密。

## 三个模型逐个拆

### hello.pv：最朴素的保密性问题

```proverif
free c: channel.
free Cocks: bitstring [private].
free RSA: bitstring [private].
query attacker(RSA).
query attacker(Cocks).
process
    out(c, RSA);
    0
```

- `free c: channel.` 声明一个公开信道。
- `free RSA: bitstring [private].` 声明一个私有名。默认公开名攻击者都知道，标了 `[private]` 才从攻击者知识里排除。
- `query attacker(RSA).` 内部其实是 `not attacker(RSA)`，问"攻击者能不能推出 RSA"。
- 进程只做一件事：把 `RSA` 发到公开信道 `c`。

于是 RSA 被发上公开信道，攻击者拿到手，所以 `not attacker(RSA)` 是 `false`（泄露）。Cocks 从没被发出去，攻击者无从得知，所以是 `true`（保密）。

这一行 `out(c,RSA);0` 是核心。换个角度看，保密性不看名字有没有被公开，看的是有没有一条路径让攻击者从公开消息推出它。这里路径就是直接输出。

### hello_var.pv：进程封装和参数化

```proverif
let R(x: bitstring) = out(c,x); 0.
let R'(y: bitstring) = 0.
process R(RSA) | R'(Cocks)
```

用 `let ... = ...` 把进程包成带参数的宏，`|` 表示两个进程并发。这里 `R(RSA)` 把 RSA 发出去，`R'(Cocks)` 什么都不做。所以 Cocks 依然保密，查询为 `true`。

`let R'(y:bitstring) = 0.` 有个细节：`R'` 的参数 `y` 从没用过，所以调用 `R'(Cocks)` 时 Cocks 并没有真正进入任何计算，这也是它没泄露的原因之一。学完可以自己试试：把 `R'(Cocks)` 改成 `out(c,y);0`，Cocks 就漏了。

### hello_ext.pv：第一个"认证"雏形（事件）

```proverif
event evCocks.
event evRSA.
query event(evCocks) ==> event(evRSA).
process
    out(c,RSA);
    in(c,x:bitstring);
    if x = Cocks then
        event evCocks;
        event evRSA
    else
        event evRSA
```

这里第一次出现 `event` 和 `==>`。`event(A) ==> event(B)` 的意思是：如果事件 A 发生了，那么事件 B 一定已经先发生过。

进程逻辑：把 RSA 发出去，再从信道读回一个 `x`。如果 `x` 等于 Cocks（攻击者得猜中 Cocks 才能走到这个分支），就先后触发 `evCocks` 和 `evRSA`；否则只触发 `evRSA`。`evCocks` 只有在 `x = Cocks` 时才触发，而那时 `evRSA` 已经先触发过，所以查询成立。

这一课先对 `event` 混个脸熟，认证的完整讲法在第 3 章。现在只要记住：`event` 在进程里标记"某件事发生了"，`==>` 用来表达事件之间的先后依赖。

## 这一课该带走的东西

- 一份 `.pv` 文件 = 声明 + 进程 + 查询，ProVerif 按 Dolev-Yao 攻击者规则判断查询。
- `[private]` 把名字从攻击者初始知识排除；发到公开信道的东西攻击者都能拿到。
- 保密性问的是"攻击者有没有推导路径"，不是"名字有没有写公开"。
- `let` 做进程封装，`|` 做并发，`event` + `==>` 是认证的雏形。
- 读输出：看 `RESULT` 行，`not attacker(X)` 为 `true` 表示保密、`false` 表示泄露，失败会有反例轨迹。

## 下一步

地基够了，进第 2 章保密性。这一课只用到了"直接输出"这一种泄露方式，下一课看攻击者怎么靠构造和还原组合出新消息。旧笔记 `old/01-hello-basics.md` 可以对照，但那是按模型讲的，这课开始是按问题讲的。
