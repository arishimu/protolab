# 03 第三课：认证与对应断言

对应总纲第 3 章。这一课回答一个问题：**当某件事发生时，另一件事是不是必然已经发生过。** 第一课的 `event evCocks ==> event evRSA` 只是个雏形，这课用握手协议把认证讲完整：为什么加密了还不够，为什么要把身份绑进消息里。

三个模型都验证过：

```
$ proverif ex_handshake_annotated.pv
RESULT not attacker(s[])                                is false.
RESULT event(termClient(x,y)) ==> event(acceptsServer(x,y)) is false.
RESULT inj-event(termServer(x)) ==> inj-event(acceptsClient(x)) is true.

$ proverif ex_handshake_annotated_fixed.pv
RESULT not attacker(s[])                                is true.
RESULT event(termClient(x,y)) ==> event(acceptsServer(x,y)) is true.
RESULT inj-event(termServer(x)) ==> inj-event(acceptsClient(x)) is true.

$ proverif ex_query_new.pv
RESULT not event(e(a[!1 = i],B[!1 = i])) is false.
```

## 认证用事件怎么表达

保密性问"秘密到没到攻击者手里"，认证问的是另一回事：**事件之间的先后关系**。

- `event acceptsClient(k)` 这种写法，是在进程里标记"这个角色走到了某一步"。事件本身不影响行为，只是给分析器留记号。
- `query event(termClient(x,y)) ==> event(acceptsServer(x,y))` 读作：只要 `termClient` 发生过，`acceptsServer` 就必然已经先发生过。箭头左边是结论，右边是前提。
- 事件可以带参数，认证的"谁和谁"就靠参数表达。这里 `termClient(k, pkA)` 表示"客户端 A 拿着密钥 k 完成了握手"，`acceptsServer(k, pkX)` 表示"服务器接受了 k 和某个公钥 pkX"。
- `inj-event` 是注入版本：每个 `termServer(x)` 都对应**各不相同**的一次 `acceptsClient(x)`，一对一。普通 `event ==> event` 允许一次前提对应多次结论，挡不住重放。

所以认证查询在问：**当客户端宣布握手完成时，服务器是不是真的接受过这次握手？参数对不对得上？**

## 握手模型在干什么

```proverif
let clientA(pkA,skA,pkB) =
    out(c,pkA);
    in(c,x);
    let y = adec(x,skA) in
    let (=pkB,k:key) = checksign(y,pkB) in
    event acceptsClient(k);
    out(c,senc(s,k));
    event termClient(k,pkA).

let serverB(pkB,skB,pkA) =
    in(c,pkX:pkey);
    new k:key;
    event acceptsServer(k,pkX);
    out(c,aenc(sign((pkB,k),skB),pkX));
    in(c,x);
    let z = sdec(x,k) in
    if pkX = pkA then event termServer(k).
```

过程：客户端发自己的公钥 `pkA`，服务器收到任意公钥 `pkX`，生成会话密钥 `k`，把签名过的 `(pkB, k)` 用 `pkX` 加密发回去。客户端解密、验签，取出 `k`，然后用 `k` 加密秘密 `s` 发出去。

看起来每一步都用了加密和签名，为什么认证会失败？跑一下就知道。

## 攻击路径：你以为是 B，其实是谁都行

`termClient ==> acceptsServer` 这条查询是 false，trace 讲了一个很实际的攻击：

1. 攻击者看着客户端 A 发出 `pkA`，也看着服务器收下自己的公钥 `pk(sk)` 并生成密钥 `k`，服务器发出的响应是 `aenc(sign((pkB,k),skB), pk(sk))`。
2. 攻击者用自己的私钥解开这层加密，拿到 `sign((pkB,k),skB)`。签名是真的，是服务器签的。
3. 攻击者把它重新包一层，改成用 `pkA` 加密，发给客户端 A。
4. 客户端 A 解密、验签，一切通过：签名确实是服务器 B 的，内容确实是 `(pkB, k)`。于是 A 以为自己在和 B 握手，用 `k` 把 `s` 发出去。攻击者知道 `k`，直接读走。

问题在签名里只绑了 `(pkB, k)`，没绑"这份响应是发给谁的"。服务器以为自己在跟攻击者说话，签名里没有 `pkX`；客户端收到的消息里也没有任何东西能证明"服务器知道是在跟我说话"。攻击者只是把服务器的响应改了个收件人，就骗过了客户端。

对应地，`acceptsServer(k, pk(sk))` 确实发生过，但 `acceptsServer(k, pkA)` 从没发生过，所以 `termClient(k, pkA) ==> acceptsServer(k, pkA)` 不成立。

## 修复：把身份绑进消息

```proverif
let clientA(pkA,skA,pkB) =
    ...
    let (=pkA,=pkB,k:key) = checksign(y,pkB) in
    ...

let serverB(pkB,skB,pkA) =
    ...
    out(c,aenc(sign((pkX,pkB,k),skB),pkX));
    ...
```

改动很小：服务器签名时把收到的 `pkX` 也签进去，客户端验签时要求签名的第一个分量必须等于自己的 `pkA`。这样服务器签的每一份响应都写死了收件人，攻击者不能把发给自己的响应改发给别人。三个查询全部变 true，连 `s` 的保密性也一起修好了。这不是巧合：认证漏洞往往连带泄露秘密。

## ex_query_new.pv：查询里精确指认某次会话

```proverif
event e(bitstring,bitstring).
query i:sid; event(e(new a[!1 = i], new B[!1 = i])).
process
    (in(c,(y:bitstring,x:bitstring));event e(x,y))
    | ! (new a:bitstring; new B:bitstring; out(c,(a,B)))
```

`!` 复制出来的每个会话有自己的标号，`!1` 指第一层复制，`i:sid` 把它绑定到查询变量。`new a[!1 = i]` 的意思就是"第 i 次复制里创建的那个 a"。这个查询问：有没有一次事件 `e(x,y)`，x 是某次会话里的 `a`，y 是**同一次**会话里的 `B`。结果是 false，因为进程里的 `in` 没有在 `!` 里，接收方只有一份，拿到的一对值来自哪次复制是不确定的，凑不出同一次会话的两个名字。

这个语法在后面的 Needham-Schroeder 案例里会反复用，现在知道它干什么就行：**让查询精确指向某次具体执行，而不是"某个值"。**

## 这一课该带走的东西

- 认证用事件和 `==>` 表达，读法是"后者必然先于前者发生"。
- 认证要带参数，不然没法说清"谁认证谁"。
- 注入认证 `inj-event` 比普通对应强，一对一，挡重放。
- 加密和签名保证不了认证。消息里不绑定身份和收件人，攻击者就能转发、改收件人。
- 修复的办法是把身份写进被签名的内容里，验签时核对。
- 查询里可以用 `new a[!1 = i]` 精确指认某次复制会话创建的名字。

## 下一步

三条主线走了两条。第 4 章是最后一条：观察等价和不可区分性，把 `choice`、`equivalence`、`noninterf` 串起来，顺带补上第 2 章欠下的 weak secrecy。旧笔记 `old/02-handshake-auth.md` 跟这一课对应，可以对照着看当年的记法。
