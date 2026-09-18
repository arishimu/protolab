# Context: protolab（安全协议学习与验证工具工作区）

这个仓库同时承载两件事：ProVerif 自学笔记与样例（`docs/proverif/`），以及在此之上构建的「安全协议可视化建模与形式化验证」Web 工具（代号 pv-lens）。工具面向学习密码学的学生、教师与研究者，个人使用、本地/自托管运行，不上公网。本词表服务整个仓库，术语优先与 `docs/proverif/note/` 的既有用法保持一致。

## 协议与验证

**安全协议 (security protocol)**:
密码协议：若干角色按顺序交换带密码学构造的消息，其安全性用查询表达并由 ProVerif 判定。
_Avoid_: 密码算法、加密方案（协议是多个消息交换的整体，不是单个原语）

**角色 (role)**:
协议中承担一方的可执行单元；在 `.pv` 里体现为命名进程（如 `processInitiator`、`processResponder`）。同一个角色可被诚实主体实例化任意多次。
_Avoid_: 参与者、主体（参与者的含义不明确，且与攻击者模型里的 agent 混淆）

**信道 (channel)**:
消息传输的通道，`.pv` 中形如 `free c: channel.`。教科书式的「A→B」只是设计意图；模型里所有角色实际共享同一条（公开）信道，攻击者在其上窃听与注入。

**事件 (event)**:
角色执行到某点打下的标注（如 `acceptsClient`、`termServer`），供对应性查询（`event(...) ==> event(...)`、`inj-event`）引用。

**查询 (query)**:
需要验证的一条安全性质，如保密性（`attacker(...)`）或认证（`inj-event(X) ==> inj-event(Y)`）。验证结论以查询为单位给出。

**验证结论 (verification result)**:
ProVerif 对每条查询给出的判定：`RESULT ... is true`（证明成立）/ `is false`（找到反例）/ `cannot be proved`（未证出，不等于不成立）。
_Avoid_: 通过/失败（会与「证明成立」混淆，`cannot be proved` 不是失败）

注：输出中的查询是**归一化形式**——`attacker(x)` 会显示为 `not attacker(x)`；判定值针对归一化查询，工具展示时应映射回用户写的原文。

**反例 / 攻击 trace (counterexample / attack trace)**:
查询被证伪时 ProVerif 打印的 derivation 序列，展示攻击者如何一步步达成攻击。它是「实际可达的消息流」，与规范叙事视图的「设计意图」是两回事。

**攻击者 (attacker)**:
Dolev-Yao 模型：控制全部公开信道、可窃听/拦截/重放/用已知知识构造消息，但不能破解密码学原语。

## 可视化视图

**规范叙事视图 (intended-narrative view)**:
工具对协议模型的泳道呈现：每条**角色**泳道内按代码顺序列出其收发步骤，表达协议「打算」怎么走。它不承诺展示攻击者实际可见的消息流——那是反例视图（二期）。
_Avoid_: 时序图、流程图、执行轨迹（易暗示「实际执行」语义）

**消息步骤 (message step)**:
规范叙事视图泳道内的最小单元：角色的一次 `out(c, term)`（发出）或 `in(c, pattern)`（接收），含方向、信道与词项。

**词项符号化渲染 (symbolic term rendering)**:
把构造子词项按密码学惯例符号化显示（`encrypt((Na,A),pkB)` → `{Na,A}pkB`），让人眼聚焦协议结构而非语法。

**未配对步骤 (unpaired step)**:
跨泳道无法可靠确定「谁发出的这条消息被谁接收」的步骤；在图上显式标注为未配对，画对优先于画全。

**画布编辑 (canvas editing)**:
二期能力：在泳道图上增删、拖拽组件并把改动**回写**为 `.pv`。MVP 明确不含；MVP 只有只读的规范叙事视图。
_Avoid_: 可视化建模（这是整个产品愿景的宽泛说法，特指编辑能力时用「画布编辑」）
