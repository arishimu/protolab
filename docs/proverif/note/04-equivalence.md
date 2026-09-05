# 04 第四课：观察等价与不可区分性

对应总纲第 4 章，三条主线的最后一条。前两章问"秘密到没到攻击者手里"和"事件先后关系对不对"，这一章换个脑回路：**不关心秘密原文，关心攻击者能不能区分两套情况。** 强保密、前向保密、弱保密（第 2 章欠的账）都收进这一章。

所有模型都验证过：

```
$ proverif ex_equivalence.pv
RESULT Observational equivalence is true.

$ proverif ex_noninterf1.pv
RESULT Non-interference secret_msg is true.

$ proverif ex_noninterf2.pv
RESULT Non-interference x among (n[], h(n[])) is true.

$ proverif ex_weaksecret.pv
RESULT Weak secret v is false.

$ proverif ex_weaksecret_obs.pv
RESULT Observational equivalence cannot be proved.

$ proverif dh-fs.pv
RESULT Observational equivalence is true.

$ proverif ex_sync.pv
RESULT Observational equivalence is true.

$ proverif ex_handshake_RoR.pv
RESULT Observational equivalence cannot be proved.
```

## choice：一个进程同时写两套执行

等价性的载体是 `choice[M,N]`。它不表示"运行时二选一"，而是表示"这里有两个世界"：一个世界用 `M`，另一个世界用 `N`。整个带 `choice` 的进程叫 biprocess，ProVerif 同时推演两个世界，看攻击者能不能看出差别。注意同一份文件里出现 `choice` 之后就不能再写 `query`、`noninterf`、`weaksecret`，这几类查询互斥。

## 等价性到底在比什么

`ex_equivalence.pv` 是最小例子：

```proverif
equivalence
   ! new k:key; ! new a:bitstring; out(c, mac(a, k))
   ! new k:key; new a:bitstring; out(c, mac(a, k))
```

左边每个会话都新生成 `a`，右边所有会话共享同一个 `a`。攻击者只能看到 `mac(a,k)` 的输出，看不出生成方式，所以两个进程等价，结果为真。

对比一下第 2 章。保密性问"攻击者能不能算出秘密"，等价性问"攻击者能不能看出两个世界的差别"。差别本身可能不涉及任何秘密的泄露，也可能秘密没有直接输出，只是内部处理不同。这是两套完全不同的问题。

## noninterf：把秘密换来换去

`ex_noninterf1.pv` 问的是强保密：把秘密 `secret_msg` 换成任意别的值，攻击者都区分不出来。

```proverif
free k:key [private].
free secret_msg: bitstring [private].
noninterf secret_msg.
process (!out(c, senc(secret_msg, k))) |
    (!in(c, x:bitstring); let s = sdec(x, k) in 0)
```

密钥 `k` 是私有的，密文发上公开信道，攻击者解不开，所以无论秘密是什么，他看到的都是不可解密的密文，等价成立。

`ex_noninterf2.pv` 加上候选集：

```proverif
free x,n: bitstring [private].
noninterf x among (n, h(n)).
process out(c, x)
```

候选集只有 `n` 和 `h(n)`，进程直接输出 `x`。这里的关键是：候选集**小**。攻击者知道候选值只有两个，但 ProVerif 判定他依然区分不了哪个是 `x`。为什么？`n` 和 `h(n)` 都是攻击者初始知识里没有的名字，输出 `x` 只是让攻击者拿到一个值，他没有办法测试这个值到底等于 `n` 还是 `h(n)`（没有比较或求值的渠道）。受限候选集让"不可区分"这个问题变得可判定。

## weaksecret：离线猜测攻击

`ex_weaksecret.pv` 是投票协议：选民把自己的投票 `v` 用管理员公钥加密后发出去。

```proverif
free v: bitstring [private].
weaksecret v.
let V(pkA:pkey) = out(c, aenc(v, pkA)).
```

`weaksecret v` 问的不是 v 会不会泄露，而是：攻击者观察到协议执行后，能不能区分"猜对了 v"和"猜错了"。正式定义是观察等价：`P | phase 1; out(c,n) ≈ P | phase 1; new n'; out(c,n')`。阶段 1 攻击者拿到 `n`（真秘密）或 `n'`（随机新值），看不出差别才算安全。

结果是 false。因为加密是确定性的：攻击者知道投票只有几种可能（候选集合小），把每个候选值用 `pkA` 加密，和密文一比对就能确认 v 是哪个。这就是离线猜测攻击。加密后明文不泄露，但密文可比较，猜一遍就知道了。

`ex_weaksecret_obs.pv` 把同一个场景换成观察等价来问（进程里 `out(c,choice[u,v])` 之类的写法），结果是 cannot be proved。两个文件一个 false 一个证明不了，但暴露的是同一件事：这个协议经不起"猜一猜再验证"。

## dh-fs.pv：Diffie-Hellman 建模与 DDH 假设

文件名里的 fs 指 forward secrecy，但这个文件本身建的不是前向保密协议，而是前向保密分析里最常用的一块地基：Diffie-Hellman 密钥协商的模型，以及它背后的 DDH 假设。先讲建模，再讲它怎么在协议分析里用。

### DH 密钥协商要建模什么

真实世界的 DH 是这样的：群 `G` 里有个生成元 `g`，A 挑一个随机指数 `a`，B 挑一个随机指数 `b`。A 把 `g^a` 发给 B，B 把 `g^b` 发给 A。然后 A 算 `(g^b)^a`，B 算 `(g^a)^b`，两个值相等，因为 `(g^b)^a = (g^a)^b = g^(ab)`。这个 `g^(ab)` 就是双方共享的密钥。被动攻击者手里只有 `g^a` 和 `g^b`，没有 `a`、`b`，算不出 `g^(ab)`。

要在 ProVerif 里表达这件事，需要两样东西：`exp` 这个函数，和"交换律"这条性质。

### 建模拆解

```proverif
type G.                 (* 群的元素 *)
type exponent.          (* 指数 *)
const g: G [data].      (* 生成元 g，[data] 表示它是公开常量 *)
fun exp(G, exponent): G.  (* 模幂：exp(x,y) = x^y *)
equation forall x:exponent, y:exponent; exp(exp(g,x),y) = exp(exp(g,y),x).
```

前四行是类型和函数的声明，最后一行是重点。`equation` 声明一条等式，意思是 `(g^x)^y = (g^y)^x`，也就是 DH 双方能算出同一个密钥这件事本身。没有这条等式，`exp(exp(g,a),b)` 和 `exp(exp(g,b),a)` 在 ProVerif 眼里就是两个不相干的项，双方"算出同一个密钥"这个协议成立的根基就没有了。

注意一个细节：等式只写了 `g` 是底的情况。`exp(exp(x,y),z) = exp(exp(x,z),y)` 这种一般形式的交换律没有写。这是有意的取舍。手册 4.2.2 明确说这个模型只编码了协议正常工作需要的那条方程，完整的乘法群性质（结合律等）需要结合律函数符号，ProVerif 当前的方程处理不支持。所以这是一个"够用但更保守"的模型：它比真实的群结构弱，能证明的性质反而比完全精确的模型更多。

### 整个文件在问什么

```proverif
process
    new a:exponent; new b:exponent; new c:exponent;
    out(d, (exp(g,a), exp(g,b), choice[exp(exp(g,a),b), exp(g,c)]))
```

进程生成三个随机指数 `a`、`b`、`c`，输出一个三元组。前两个分量两个世界都一样：`g^a`、`g^b`。第三个分量第一个世界给 `g^(ab)`（用 `exp(exp(g,a),b)` 算出来的真实共享密钥），第二个世界给 `g^c`（一个独立随机数）。

这个 biprocess 表达的就是 DDH 假设：给定 `g^a`、`g^b`，攻击者区分不了 `g^(ab)` 和随机的 `g^c`。结果为 true，ProVerif 证明了这个等价。这就是"前向保密分析里反复用"的意思：分析会话密钥能不能防泄露时，先把 DH 的这条性质作为公理一样的东西放进模型，再看整个协议。

### 前向保密本身怎么建：phase 泄露长期密钥

DH 是前向保密的原料，前向保密这个性质本身用 `phase` 建模。看 `ex_handshake_forward_secrecy_skA.pv` 和 `_skB.pv`：

```proverif
process
    ...
    ( (!clientA(pkA,skA,pkB)) | (!serverB(pkB,skB,pkA)) |
    phase 1; out(c, skA) )
```

握手正常跑（阶段 0），然后阶段 1 把长期私钥 `skA` 直接发给攻击者。前向保密的直觉是：就算以后长期密钥泄露了，过去会话里的秘密 `s` 也不该被翻出来。查询写的是 `attacker_p1(s)`，专门问阶段 1 之后的攻击者能不能拿到 `s`。

两个文件的差别只在泄露哪个密钥。泄露 `skA`（客户端私钥）时结果是 false：攻击者拿到 `skA` 后可以冒充客户端，把历史会话中发给客户端的那条服务器响应解开，恢复出会话密钥 `k`，再解开 `senc(s,k)` 拿到 `s`。泄露 `skB`（服务器签名私钥）时结果是 true：`skB` 只用来签名，攻击者拿它签不了"解密"，`s` 依然安全。

对比一下能看出前向保密的关键：不是"长期密钥泄露后一切完蛋"，而是具体看泄露的密钥在协议里承担什么角色。签名私钥丢了影响认证，但影响不了历史会话的保密；能解密历史消息的私钥丢了才是真泄露。

## 两个反面例子：为什么等价会失败

这节看两个结果相反的模型。一个成功了（`ex_sync.pv`），一个失败了（`ex_handshake_RoR.pv`），成败的原因都要讲清楚。

### ex_sync.pv：同步如何帮等价成立

```proverif
process
    ( out(c,m); sync 1; out(c,choice[m,n]) )
    | ( sync 1; out(c,choice[n,m]) )
```

这个 biprocess 的两个世界是：

- 世界 1（取每个 choice 的第一分量）：左边输出 `m`，然后 `sync 1`，再输出 `m`；右边 `sync 1`，输出 `n`。
- 世界 2（取第二分量）：左边输出 `m`，`sync 1`，输出 `n`；右边 `sync 1`，输出 `m`。

`sync 1` 是全局同步：所有进程都必须到达各自那个 `sync 1` 之后，才能继续往下走。两边在同步点"对齐"了。

为什么没有 sync 就会失败？我实际跑了一个去掉两个 `sync 1` 的版本：

```
$ proverif /tmp/ex_sync_nosync.pv
RESULT Observational equivalence cannot be proved.
```

区别在观察粒度。没有同步时，攻击者能盯住"左边进程"和"右边进程"各自的输出顺序：左边先发 `m` 再发 `choice` 的分量，右边发另一个分量。两个世界各自的输出序列不一样，攻击者能对上号。有了 `sync 1`，两边被迫在同一时刻交换控制权，攻击者只看到"同步之后两边各发了一个东西"，分不清哪个分量来自哪边，两个世界就变得一样了。

这就是手册 4.3.2 讲的：同步让数据可以在同步点"交换"。`ex_sync2.pv` 是同一个例子加上标签和交换策略：

```proverif
set swapping = "tag1 -> tag2".
process
    ( out(c,m); sync 1 [tag1]; out(c,choice[m,n]) )
    | ( sync 1 [tag2]; out(c,choice[n,m]) )
```

`[tag1]`、`[tag2]` 给两个同步命名，`set swapping` 声明"在 tag1 到 tag2 这个同步点交换数据"。这相当于手动告诉 ProVerif 在哪一步做交换来证明等价。默认情况下 ProVerif 会自己尝试所有交换策略，这个设置是给需要精确控制的情况用的，比如选举协议的 ballot secrecy 证明里经常要手动指定。

`sync` 有两个限制值得记下：不能用在复制 `!` 里面，也不能和 `phase` 混用。

### ex_handshake_RoR.pv：真实密钥有结构，随机值没有

real-or-random（真实或随机）保密是等价性问法下的密钥保密：客户端把会话密钥 `k` 输出给攻击者，但输出的是 `choice[k, random]`。一个世界给真实密钥，一个世界给随机新值，攻击者分不出来才算密钥保密。

```proverif
let clientA(pkA:pkey,skA:skey,pkB:spkey) =
    out(c,pkA);
    in(c,x:bitstring);
    let y = adec(x,skA) in
    let (=pkA,=pkB,k:key) = checksign(y,pkB) in
    new random:key;
    out(c, choice[k,random]).
```

模型基于第 3 章修好的握手协议，服务器和客户端都允许无限次复制执行。结果：

```
RESULT Observational equivalence cannot be proved.
```

ProVerif 给出的区分推导（derivation）最后一幕是这样：

1. 攻击者拿到客户端 `pkA`，拿它冒充客户端去跟服务器跑会话，服务器生成 `k`，攻击者拿到服务器响应，解出 `k`。
2. 攻击者把服务器响应重放给**另一个**客户端会话。第二个会话验签通过（签名是服务器真签的），也解出同一个 `k`。
3. 现在攻击者手里有两个客户端输出。真实密钥的世界里，两个输出都是同一个 `k`，相等。随机值的世界里，每个会话各自 `new random`，两个输出是两个不同的随机值，不相等。
4. 攻击者只要比较两个输出是否相等，就能区分两个世界。ProVerif 的推导里明确写着：`The attacker tests equality between the two terms he knows, which may allow it to distinguish cases.`

这就是重放攻击破坏等价的机制。注意它跟第 3 章的重放不一样：这里不是要伪造消息骗过验签，签名是有效的，验签是过的。问题出在"真实世界有规律，随机世界没有"。真实密钥 `k` 会在多个会话里重复出现（因为攻击者重放了同一个服务器响应），而每个会话独立生成的 `random` 从不重复。攻击者不需要破解任何密码学，只需要发现"两个值相等"这个结构性差异。

这个例子顺带解释了为什么 real-or-random 保密比普通保密难：协议可以做到"密钥不泄露"（攻击者拿不到 `k` 原文，只能拿到客户端输出的那个 `k`，因为客户端自己把 `k` 输出给攻击者了），但仍然做不到"密钥不可区分"。第 3 章修好的握手协议，普通保密性和认证都过了，real-or-random 这一关就过不去。想修的话，客户端只应该在确认会话唯一之后才输出 `k`，或者干脆别让攻击者拿到两次输出做比较。

## 这一课该带走的东西

- `choice[M,N]` 同时编码两个世界，ProVerif 看攻击者能不能区分。
- 等价性问"可不可区分"，保密性问"会不会泄露"，两套问题不要混。
- `noninterf` 是强保密：秘密换掉，行为不变。候选集小会让问题可判定，但小本身不构成泄露。
- `weaksecret` 是离线猜测：确定性加密下，候选值枚举一遍就能验证。
- `equation` 给函数加等式，DH 交换律靠它建模；这个模型只编必要的等式，比真实群结构保守。
- 前向保密用 `phase` 建模长期密钥泄露，性质是否成立取决于泄露的密钥在协议里的角色。
- `sync` 在同步点对齐进程、允许交换数据，能帮等价成立；去掉同步等价就可能被破坏。
- 等价失败往往来自可观察的结构差异，比如重放造成的"多个会话值相同"这种规律性。
- 内部持有秘密、内部解密秘密，不必然破坏不可区分性，要看差异有没有投射到外部。

## 下一步

三条主线走完了。第 5 章是读懂输出和反例，把前三章欠的"怎么读 RESULT、derivation、trace、假攻击"集中补一次，之后第 6 章再上语言特性和 NS 综合案例。旧笔记 `old/04-weak-secrecy.md`、`old/05-equivalence-noninterf.md`、`old/06-distinguishability.md` 对应这一章。
