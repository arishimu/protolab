# 06b Needham-Schroeder 公钥协议：综合案例详解

这篇是第 6 章的案例专篇，从 [06 进阶](06-advanced.md) 里拆出来单独展开。选这个协议做案例，是因为它能在一套模型里同时碰到三类问题：保密（nonce 会不会泄露）、认证（谁跟谁在说话）、等价（密钥能不能和随机数区分）。前五章学的语法和查询，在这里全部用上。

读法建议：先看协议本身和 Lowe 攻击，带着"这协议有毛病"的印象去读建模，最后对照修正版。全程跟着 `proverif` 跑，改一处看结果变一处，比通读文字有效。

## 协议本身

Needham-Schroeder 公钥协议（NS78）的目标是双向认证：A 和 B 各自证明对方活着、并且就是对方。除双方外还有一个可信密钥服务器 S，负责分发公钥证书。

七个消息的完整叙述：

```
(1)  A → S : (A, B)
(2)  S → A : sign((B, pk(skB)), skS)
(3)  A → B : aenc((Na, A), pk(skB))
(4)  B → S : (B, A)
(5)  S → B : sign((A, pk(skA)), skS)
(6)  B → A : aenc((Na, Nb), pk(skA))
(7)  A → B : aenc(Nb, pk(skB))
```

直觉是这样的：只有 B 能解开消息 3 拿到 Na，所以只有 B 能发出包含 Na 的消息 6，收到消息 6 的 A 就相信对面是 B；同理只有 A 能解开消息 6 拿到 Nb，所以只有 A 能发出包含 Nb 的消息 7，收到消息 7 的 B 就相信对面是 A。而且 Na 和 Nb 双方都知道了，可以当会话密钥用。

这个直觉错在哪，看 Lowe 攻击。

## Lowe 攻击：协议为什么不行

发布近二十年后，Lowe（1996）发现中间人攻击。攻击者 I 同时扮演两个角色：作为 B 的对手方和 A 跑一个合法会话，又冒充 A 和 B 跑一个会话。标准叙述（省略密钥分发）：

```
A → I : aenc((Na, A), pk(skI))
I → B : aenc((Na, A), pk(skB))
B → A : aenc((Na, Nb), pk(skA))
A → I : aenc(Nb, pk(skI))
I → B : aenc(Nb, pk(skB))
```

第一步，A 想和 I（她以为的合法商家）通信，把 `(Na, A)` 用 I 的公钥加密发过去。I 解密拿到 Na 和 A 的身份，然后冒充 A，把这条消息改用 B 的公钥加密发给 B。B 收到后以为是 A 在找他，回 `(Na, Nb)` 给 A（用 A 的公钥）。这条消息 I 解不开，但能原样转给 A。A 看到密文里有自己的 Na，以为 B 在对她说话，就回 `aenc(Nb, pk(skI))`。I 拿到 Nb，再用 B 的公钥把 Nb 发给 B。B 验证 Nb 正确，认为自己和 A 完成了一次会话。

结果：B 确信自己在和 A 通信，但 A 根本不知道 B 的存在。B 把 Nb 当密钥和"想象中的 A"共享，而 I 手里有 Nb。这就是 B 侧认证失败、B 的 nonce 泄露的来源。

Lowe 的修正是消息 6 里带上 B 的身份：

```
(6′) B → A : aenc((Na, Nb, B), pk(skA))
```

这样 A 能验证密文里确实是 B，而不是别的谁。攻击者的第二条消息（冒充 A 发给 B 的 `aenc((Na,A),pk(skB))`）没问题，但 B 的回应 `aenc((Na,Nb,B),pk(skA))` 会让 A 检查出对端是 B。可 A 的对端是 I，检查失败，攻击断掉。

## 第一版模型：NeedhamSchroederPK-var1.pv

仓库里先跑 `NeedhamSchroederPK-var1.pv`。它是简化版：省略密钥服务器，假设双方预知对方公钥，A、B 是固定身份，nonce 用 `bitstring` 类型。先跑：

```bash
proverif docs/proverif/pv/NeedhamSchroederPK-var1.pv | grep "RESULT"
```

结果（本会话实跑）：

```
RESULT inj-event(endBparam(x)) ==> inj-event(beginBparam(x)) is false.
RESULT (even event(endBparam(x)) ==> event(beginBparam(x)) is false.)
RESULT inj-event(endAparam(x)) ==> inj-event(beginAparam(x)) is true.
RESULT not attacker(secretANa[]) is true.
RESULT not attacker(secretANb[]) is true.
RESULT not attacker(secretBNa[]) is false.
RESULT not attacker(secretBNb[]) is false.
```

A 侧正常，B 侧全灭，和 Lowe 攻击的预言一致。下面逐块看这个模型怎么写的。

### 密码原语

```proverif
fun pk(skey): pkey.
fun aenc(bitstring, pkey): bitstring.
reduc forall x: bitstring, y: skey; adec(aenc(x, pk(y)),y) = x.
```

非对称加密用构造函数 `aenc` 和析构函数 `adec`，公钥 `pk(sk)` 由私钥算出。签名需要另外两对类型（`spkey`/`sskey`）：

```proverif
fun spk(sskey): spkey.
fun sign(bitstring, sskey): bitstring.
reduc forall x: bitstring, y: sskey; getmess(sign(x,y)) = x.
reduc forall x: bitstring, y: sskey; checksign(sign(x,y), spk(y)) = x.
```

`checksign` 验证签名并取回消息，`getmess` 直接取消息内容（验证之前就能看）。对称加密用 `senc`/`sdec`，这里留作测 nonce 保密的手段，见下。

### 事件和查询：认证部分

```proverif
event beginBparam(pkey).
event endBparam(pkey).
event beginAparam(pkey).
event endAparam(pkey).

query x: pkey; inj-event(endBparam(x)) ==> inj-event(beginBparam(x)).
query x: pkey; inj-event(endAparam(x)) ==> inj-event(beginAparam(x)).
```

四个事件对应两个方向的开始和结束。命名里的 param 表示"只对参数（这里是公钥）一致"的认证，第 3 章说过这比全参数一致弱。`inj-` 前缀要求注入性，防重放：B 每结束一次会话，都得有一个对应的开始。

注意事件参数用的是公钥而不是身份名。在这个简化版里公钥就是身份的代理：`pk(skA)` 代表 A。所以查询里 `endBparam(pk(skB))` 出现时，要求 `beginBparam(pk(skB))` 发生过，即 B 认为自己跟"公钥为 pk(skB) 的发起者"开始了会话。

### 事件和查询：保密部分

nonce 是 `new` 出来的名字，不能直接写 `query attacker(Na)`。手册 5.1.2 给了标准技巧：用 nonce 当密钥加密一个自由秘密名，测那个秘密名。`secretANa` 表示"A 手里的 Na"：

```proverif
free secretANa, secretANb, secretBNa, secretBNb: bitstring [private].
query attacker(secretANa);
      attacker(secretANb);
      attacker(secretBNa);
      attacker(secretBNb).
```

四个名字分开测，才能定位漏洞到底在 A 侧还是 B 侧、在 Na 还是 Nb。

### Alice 的角色

```proverif
let processA(pkB: pkey, skA: skey) =
	in(c, pkX: pkey);
	event beginBparam(pkX);
	new Na: bitstring;
	out(c, aenc((Na, pk(skA)), pkX));
	in(c, m: bitstring);
	let (=Na, NX: bitstring) = adec(m, skA) in
	out(c, aenc(NX, pkX));
	if pkX = pkB then
	event endAparam(pk(skA));
	out(c, senc(secretANa, Na));
	out(c, senc(secretANb, NX)).
```

第一行 `in(c, pkX)` 是关键设计：A 的对端由环境决定，不写死是 B。`event beginBparam(pkX)` 记录"A 想和 pkX 会话"。然后 A 生成 Na，把 `(Na, pk(skA))` 加密给 pkX（消息 3）。收到回复后 `let (=Na, NX) = adec(m, skA)` 检查密文里第一个分量是不是自己的 Na，第二个分量是新 nonce NX。然后 `aenc(NX, pkX)` 把 NX 回给 pkX（消息 7）。

`if pkX = pkB` 意味着 A 只有在确信对端是 B 时才执行 `endAparam(pk(skA))` 和保密输出。如果对端是别人（比如 I），这些都不执行，因为和诚实方 B 相关的性质只在 A 和 B 通信时才有意义。

### Bob 的角色

```proverif
let processB(pkA: pkey, skB: skey) =
	in(c, m: bitstring);
	let (NY: bitstring, pkY: pkey) = adec(m, skB) in
	event beginAparam(pkY);
	new Nb: bitstring;
	out(c, aenc((NY, Nb), pkY));
	in(c, m3: bitstring);
	if Nb = adec(m3, skB) then
	if pkY = pkA then
	event endBparam(pk(skB));
	out(c, senc(secretBNa, NY));
	out(c, senc(secretBNb, Nb)).
```

对称的：B 解密消息 3 拿到发起者的 nonce NY 和身份 pkY，`beginAparam(pkY)`，生成 Nb，回 `aenc((NY,Nb), pkY)`（消息 6）。收到消息 7 后验证 Nb 确实回来了，且 `pkY = pkA`（发起者是 A），才 `endBparam(pk(skB))` 并输出保密测试密文。

### 主进程

```proverif
process
	new skA: skey; let pkA = pk(skA) in out(c, pkA);
	new skB: skey; let pkB = pk(skB) in out(c, pkB);
	( (!processA(pkB, skA)) | (!processB(pkA, skB)) )
```

生成两个密钥对，公钥输出到公开信道（攻击者知道），然后无限复制两个角色。`!` 让会话数量无界，这是模拟"协议可以跑任意多次"的标准写法。

## 读 Lowe 攻击的 trace

`endBparam` 查询失败的输出里有完整攻击 trace。精简后是这样的（动作编号对应 `Process` 部分）：

```
new skA, skB                        ({1},{4}) 生成密钥对，公钥输出
in(c, pk(a)) at {9} in copy a_1      A 会话：A 接受对端 pk(a)（攻击者 I 的公钥）
event beginBparam(pk(a)) at {10}     A 记录"我想和 I 会话"
new Na at {11}
out(c, aenc((Na, pk(skA)), pk(a))) at {12}   消息 3，发给 I
in(c, aenc((Na, pk(skA)), pk(skB))) at {22}  B 会话：I 把 A 的消息重打包给 B
event beginAparam(pk(skA)) at {24}   B 记录"发起者是 A"
new Nb at {25}
out(c, aenc((Na, Nb), pk(skA))) at {26}      消息 6，B 回给 A
in(c, aenc((Na, Nb), pk(skA))) at {13}       A 会话：I 原样转发消息 6 给 A
out(c, aenc(Nb, pk(a))) at {15}              消息 7，A 把 Nb 回给 I
in(c, aenc(Nb, pk(skB))) at {27}             I 把 Nb 重打包给 B
event endBparam(pk(skB)) at {30}             B 完成会话（目标事件）
```

读这条 trace 的要点：攻击者 I 全程没有解密任何东西，只是重打包和转发。`aenc((Na,pk(skA)),pk(a))` 变成 `aenc((Na,pk(skA)),pk(skB))`，用的是公开信息（pk(skB) 是公开的）；`aenc(Nb,pk(a))` 变成 `aenc(Nb,pk(skB))` 同理。A 从头到尾只和 I 通信，却帮 I 完成了对 B 的认证。因为消息 6 里没有 B 的身份，A 无从分辨"这个 Na 回复"来自 B 还是 I。

`secretBNa` 泄露的 derivation 把攻击者的推演写得更直白：

```
1. 攻击者持有某个 y，算出 pk(y)                    （I 的公钥）
2. 把 pk(y) 喂给 A 的输入 {9}，得到 aenc((Na,pk(skA)),pk(y))  （消息 3）
3. 用 y 解密，拿到 (Na, pk(skA))，投影出 Na
4. 用公开的 pk(skB) 重打包 aenc((Na,pk(skA)),pk(skB)) 发给 B 的输入 {22}
5. 得到 aenc((Na,Nb),pk(skA))（消息 6），转给 A 的输入 {13}
6. 得到 aenc(Nb,pk(y))（消息 7），用 y 解密拿到 Nb
7. 用 pk(skB) 重打包 aenc(Nb,pk(skB)) 发给 B 的输入 {27}
8. B 输出 senc(secretBNa,Na)，攻击者已有 Na，解出 secretBNa
```

derivation 和 trace 讲的是同一件事，一个从攻击者的能力出发，一个从进程执行出发。对照着读，正好复习第 5 章：false 的结果两者都有，trace 定真伪，derivation 给思路。

## 测 nonce 保密的另一种写法：var5

`NeedhamSchroederPK-var5.pv` 不绕弯，直接把 nonce 存进变量再测：

```proverif
query secret NaA;
      secret NbA;
      secret NaB;
      secret NbB.
...
let NaA = Na in
let NbA = NX.
```

结果（本会话实跑）：

```
RESULT secret NaA is true.
RESULT secret NbA is true.
RESULT secret NaB is false.
RESULT secret NbB is false.
```

和 var1 的间接测法结论一致：A 的 nonce 保密，B 的不保密。两种写法的差别在于：`senc(secret, nonce)` 间接测多引入一次加密，对等价类证明有时有影响；直接 `secret` 查询更接近"nonce 本身保密"的表述。var1 里四个 secretANa 名字其实也等价于四个变量，只是包了一层。

## 修正版：corr-mutual-auth

`NeedhamSchroederPK-corr-mutual-auth.pv` 实现了 Lowe 修正，消息 6 变成 `encrypt((NY, Nb, xB), pkY)`。这里模型也升级了：

- 角色泛化：initiator 和 responder 都由攻击者指定身份（`in(c, (xA, hostX))`），A 和 B 都能扮演两个角色；
- 密钥服务器：`table keys(host, pkey)` + `processS` + `processK`，公钥走证书；
- 事件参数从"公钥"换成"会话消息元组"：`termI(xA, hostX, (m3, m))` 这种，认证绑定的是整个会话的消息，更接近计算模型里的会话标识。

双向认证查询用固定的一方（`termI(x,B,m)` 里的 B 和 `termR(A,x,m)` 里的 A），手册 5.4.1 解释了原因：如果两边都用变量，发起者和不诚实方会话时"对方接受了"本来就该不成立，查询会假失败。

结果（本会话实跑）：

```
RESULT inj-event(termI(x,B[],m_2)) ==> inj-event(acceptsR(x,B[],m_2)) is true.
RESULT inj-event(termR(A[],x,m_2)) ==> inj-event(acceptsI(A[],x,m_2)) is true.
```

双向认证都成立。事件放置位置（手册 5.4.1）：`acceptsR` 在 B 发出消息 6 前执行，`termI` 在 A 收到消息 6 后执行；`acceptsI` 在 A 发出消息 7 前，`termR` 在 B 收到消息 7 后。因为消息 7 是最后一条，B 接受时还不知道它，所以 `acceptsR`/`termI` 的参数里没有消息 7。

## 完整版：var2 和密钥服务器

`NeedhamSchroederPK-var2.pv` 把密钥服务器完整建模，并引入类型：

```proverif
type nonce.
type host.
free A, B: host.
fun nonce_to_bitstring(nonce): bitstring [data,typeConverter].
table keys(host, pkey).
```

`table keys` 存主机名到公钥的映射，`processS` 查表发证书，`processK` 允许攻击者注册任意主机的公钥但挡住诚实主机：

```proverif
let processS(skS: sskey) =
	in(c, (a: host, b: host));
	get keys(=b, sb) in
	out(c, sign((sb, b), skS)).

let processK =
	in(c, (h: host, k: pkey));
	if h <> A && h <> B then insert keys(h,k).
```

`processK` 里的条件不能省：`get` 匹配多条记录时 ProVerif 会考虑所有可能，没有这个条件，攻击者可以把 A、B 的公钥换成自己的。`nonce_to_bitstring` 是类型转换器，因为 `senc` 需要 `bitstring` 而 nonce 是独立类型。

结果和 var1 一致：B 侧认证失败、B 的 nonce 泄露，A 侧正常。密钥服务器没有改变攻击本质，只是让模型更完整。

## 泛化版：var3、var4

var3 把模型彻底泛化：任意主机扮演两个角色，认证升级为 full agreement（对主机名、公钥、nonce 全部参数一致），事件分 param 和 full 两级：

```proverif
event beginBparam(host, host).
event beginBfull(host, host, pkey, pkey, nonce, nonce).
query ... inj-event(endBparam(x,y)) ==> inj-event(beginBparam(x,y)).
query ... inj-event(endBfull(x1,...,x6)) ==> inj-event(beginBfull(x1,...,x6)).
```

var3 还用了几处第 6 章语法：`not attacker(new skA)` 声明密钥不可得（ProVerif 会验证，加速归结），`set ignoreTypes = false` 因为默认忽略类型时这个模型不终止（类型混淆会导致无限多的嵌套签名证书）。结果仍是 B 侧失败。注意 full agreement 版的查询失败消息和 param 版一样是 B 侧。Lowe 攻击连参数都不一致，自然过不了全参数一致。

var4 是 var3 的变体，把选密钥的 `if xA = A then skA else skB` 换成扩展析构器：

```proverif
fun choosekey(host, host, host, skey, skey): skey
reduc forall x1: host, x2: host, sk1: skey, sk2: skey;
         choosekey(x1, x1, x2, sk1, sk2) = sk1
otherwise forall x1: host, x2: host, sk1: skey, sk2: skey;
         choosekey(x2, x1, x2, sk1, sk2) = sk2.
```

这正是第 6 章讲的 `reduc ... otherwise ...` 顺序规则。结果和 var3 相同。手册 5.3 说这是另一种编码，避免 ProVerif 展开项内测试时的内部代码重复，读起来不如 if 写法直接。

## 认证密钥交换：corr-ake

`NeedhamSchroederPK-corr-ake.pv` 进入 5.4.2 的 AKE 定义：不满足于"双方认证"，还要求协商出的密钥（这里取 Na）对攻击者不可区分于随机数。五条查询，前四条结果 true，最后一条 false：

```
RESULT not attacker(secretA[]) is true.
RESULT inj-event(termI(x,B,m)) ==> inj-event(acceptsR(x,B,m)) is true.
RESULT inj-event(termR(A,x,k,m)) ==> inj-event(acceptsI(A,x,k,m)) is true.
RESULT event(termR(A,x,k,m)) && event(acceptsI(A,x,k',m)) ==> k = k' is true.
RESULT event(termR(x,y,k,m)) && event(acceptsI(x',y',k,m')) ==> x = x' && y = y' is false.
```

第一条是密钥保密：发起者和诚实响应者会话时输出 `sencrypt(secretA, Na)`，测 `attacker(secretA)`。和对方不诚实时不输出而是直接 `out(c, Na)`，把和不诚实方的密钥交给攻击者，才能检测密钥泄露类攻击。

第二、三条是双向认证。第四条是密钥一致：同一会话里双方手里的密钥相同。第五条是双侧 UKS 检测，false 意味着存在攻击。

### 双侧 UKS 攻击 trace

UKS（Unknown Key Share）：A 以为自己和 C 共享密钥，B 以为自己和 D 共享同一密钥。trace 精简版：

```
in(c, (B, a_3)) at {15}                发起者：B 想和 a_3（攻击者控制的身份）会话
in(c, B) at {38}                       响应者：B 收到消息 3
get keys(a_3, pk(a_13)) at {62}        攻击者注册了 a_3 的公钥
out(c, encrypt((Na_2,B),pk(a_13))) at {24}      消息 3：B 把 Na 发给 a_3
out(c, Na_2) at {33}                   和"不诚实方"会话，密钥直接输出（攻击者拿到 Na）
in(c, encrypt((Na_2,a_7),pk(skB))) at {42}      D（a_7 身份的发起者）用同一个 Na 找 B
event acceptsR(a_7,B,(...)) at {49}    B 接受：以为发起者是 a_7
event termR(a_7,B,Na_2,(...)) at {53}  B 完成：手里的密钥是 Na_2
```

两个会话共享 Na_2：一个是 B 和 a_3（a_3 冒充响应者），一个是 a_7 和 B（a_7 冒充发起者）。B 在第二个会话里以为和 a_7 共享 Na_2，但 a_7 只是把从第一个会话拿到的 Na_2 转手用了一下。手册 5.4.2 说，密钥只由协议一方决定时这种攻击就会出现。Na 是发起者生成的，响应者无法控制密钥的独特性。Lowe 修正修复了认证，但修不掉这个，需要额外的对应断言来检测。

## real-or-random：corr-ake-RoR 系列

`corr-ake-RoR.pv` 把密钥保密换成 real-or-random：发起者和诚实方会话时，输出 `choice[Na, random]`，问攻击者能否区分真密钥和独立随机数：

```
RESULT Observational equivalence cannot be proved.
```

这是假攻击。手册 5.4.2 解释了机制：随机数（choice 的另一侧）参与了消息 3 的构造，ProVerif 把 `encrypt((Na,xA),pkX)` 和 `encrypt((random,xA),pkX)` 都喂给响应者，响应者回的消息 6 只有真密钥版本能被发起者接受，两侧行为不同，于是 ProVerif 认为可区分。这不是真实攻击，是建模把密钥用进了消息导致内部差异外露。

修复是换密钥：`corr-ake-RoR-hNa.pv` 用 `choice[h(Na), random]`，假攻击消失：

```
RESULT Observational equivalence is true.
```

手册还提醒一个坑：随机数必须在 Na 生成后立刻声明，否则 ProVerif 把它内部表示为先前收到消息的函数，又会出现假攻击。`corr-ake-hNaNb.pv` 用 `h(Na,Nb)` 当密钥，双向认证和密钥一致照旧成立，UKS 检测照旧 false（密钥里虽然有两个 nonce，但攻击者通过中间人还是能让两个会话共享同一密钥。UKS 与密钥形式无关，与消息绑定有关）。

## 全消息排序：corr-all-messages

`NeedhamSchroederPK-corr-all-messages.pv` 问得最细：响应者完成协议时，消息 3、6、7 是否按正确顺序交换过。用嵌套对应断言表达：

```proverif
event e1(host, host, pkey, pkey, nonce).      (* 发起者发出消息 3 *)
event e2(host, host, pkey, pkey, nonce, nonce). (* 响应者收到 3、发出 6 *)
event e3(host, host, pkey, pkey, nonce, nonce). (* 发起者收到 6、发出 7 *)
event endB(host, host, pkey, pkey, nonce, nonce). (* 响应者完成 *)

query ... inj-event(endB(A,y,pkx,pky,nx,ny)) ==>
        ( inj-event(e3(A,y,pkx,pky,nx,ny)) ==>
        ( inj-event(e2(A,y,pkx,pky,nx,ny)) ==>
          inj-event(e1(A,y,pkx,pky,nx)))).
```

事件参数是全套协议参数（主机、公钥、nonce），e1 没法带 Nb（那时 Nb 还没生成）。嵌套写法的意思：endB 发生时，e3 发生过；e3 发生时，e2 发生过；e2 发生时，e1 发生过。结果 true（本会话实跑）。这比"认证成立"更强：认证只要求 begin 在 end 之前，这里要求具体消息按序出现。

## 这一课该带走的东西

- NS 协议靠"只有对方能解开我的 nonce"来认证，但消息 6 不带对端身份时，攻击者可以原样转发，A 帮 I 完成了对 B 的认证。
- 读 trace 的两种视角：derivation 讲攻击者能力（解密、重打包、投影），trace 讲进程执行（哪个会话的哪个动作）。false 的结果两者都有，对照着读最清楚。
- 攻击者在这条 trace 里全程没解密任何东西，只重打包公开信息。真正的漏洞是消息里没有绑定身份，不是加密本身。
- nonce 是 `new` 出来的，不能直接 `query attacker(Na)`，用 `senc(secret, nonce)` 间接测或 `query secret` 直接测。
- Lowe 修正是消息 6 加 B 的身份。修复后双向认证成立，但密钥只由一方决定时，双侧 UKS 攻击仍然存在，需要额外对应断言检测。
- real-or-random 假攻击来自建模细节：密钥参与消息构造，两侧行为不同被当成可区分。换密钥形式可能绕开。
- 扩展析构器 `reduc ... otherwise` 可以替代 if-else 选密钥（var4 的 choosekey）。
- 一套模型同时承载保密、认证、等价三类查询，是综合案例的意义所在。

## 练习

1. 把 `NeedhamSchroederPK-var1.pv` 的消息 6 改成 Lowe 修正版再跑：B 的解密模式加一个身份分量，输出时带上 `pk(skB)`。全部六条查询翻转成 true（已验证）。提示：B 的身份是 `pk(skB)`，A 检查 `=pkB`。
2. 试着删掉 `corr-ake.pv` 里"和不诚实方会话时输出密钥"的两行（发起者的 `out(c, Na)` 和响应者的 `out(c, NY)`），重跑第五条 UKS 查询。结果不变，仍是 false（已验证）。原因：UKS 攻击里攻击者扮演的不诚实响应者本来就能用自己的私钥解密消息 3 拿到 Na，密钥输出行只是让"密钥泄露"类查询能反映攻击，不是攻击的源头。这个实验的教训是：改一个看似相关的行之前，先想清楚攻击者靠什么拿到秘密。
3. 在 `var1.pv` 里把两条认证查询的 `inj-` 去掉重跑。结果不变，B 侧仍 false（已验证）：Lowe 攻击里 B 结束时根本没有同参数的 `beginBparam(pk(skB))` 发生过，注入性在这种"缺 begin"的攻击上不改变结论。想看到注入性的差别，需要重放类攻击，比如修复后的协议里同一个 begin 被两个 end 对应。
4. 读 `corr-ake-RoR-hNa.pv`，把 `new random: key` 从 `new Na` 之后挪到协议末尾（`if hostX = A || hostX = B` 分支里），重跑等价查询。结果变 cannot be proved（已验证），正是手册 5.4.2 说的假攻击：ProVerif 把末尾生成的 random 表示成先前收到消息的函数，两个不同 random 对应同一个 Na。

## 参考

- 协议与攻击：手册 `docs/proverif/manual/manual-05-needham-schroeder.md` 第 5 章引言部分（消息叙述、Lowe 攻击）。
- 简化版建模：5.1 节，文件 `NeedhamSchroederPK-var1.pv`、`var5.pv`。
- 完整版与密钥服务器：5.2 节，文件 `NeedhamSchroederPK-var2.pv`。
- 泛化版与 full agreement：5.3 节，文件 `var3.pv`、`var4.pv`。
- 互认证与事件放置：5.4.1 节，文件 `corr-mutual-auth.pv`。
- AKE 与 UKS：5.4.2 节，文件 `corr-ake.pv`、`corr-ake-RoR*.pv`、`corr-ake-hNaNb.pv`。
- 全消息排序：5.4.3 节，文件 `corr-all-messages.pv`。
- 相关语言特性：`manual-04` 的 4.1.5（表）、4.2.1（扩展析构器）；`manual-06` 的 6.6.2（ignoreTypes）。
