# 06 ProVerif 批量对应性查询：生成、成本与输出形态

- 状态：research / 已实地测量
- 环境：`Proverif 2.05`（二进制 `/home/arishimu/.opam/default/bin/proverif`）
- 样例：`pv-lens/packages/core/fixtures/pv/{handshake-fixed,hello,ns-mutual-auth,ns-original}.pv`
- 临时文件：`/tmp/pvbatch/`（生成脚本 `gen.mjs`、解析核对 `check-parse.mjs`；未改动任何仓库源码 / fixture）

---

## 0. 结论速览

- **可行性**：四个样例都可行。含事件的三个样例各注入 16 条有序对查询（4×4），加原有查询，`proverif` 单次调用即跑完，退出码 0，无报错、无额外近似、无 `cannot be proved`。
- **成本**：单次全量跑耗时约 37–143 ms（基线 14–23 ms），stdout 约 30–92 KB；全部 `< 0.2 s`、`< 100 KB`，可忽略。
- **解析**：现有 `parseVerifyStdout`（`Starting query` / `RESULT` 切段）稳定解析，`raw RESULT − 括号衍生行 === 解析结果数`，且每条解析 query 都能在 `Starting query` 行中找到对应——无一例外。
- **一个硬约束（重要）**：query 是**声明**，必须放在 `process` 关键字**之前**；"追加到文件末尾"会直接 `Error: Syntax error.`（见 §2）。实现时是"插入 process 之前"而非"文件末尾追加"。
- **hello.pv 无事件**：有序对为空集，批量查询是 no-op，stdout 与原文件一致。

---

## 1. 每个样例的事件与查询集

用正则 `\bevent\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\.` 从源码声明区抽取事件（只匹配声明，不匹配 `event(...)` 查询或进程内 `event ...;`）。

| 样例 | 事件（声明） | 事件数 | 有序对查询数 |
|---|---|---|---|
| `handshake-fixed.pv` | `acceptsClient(key)`、`acceptsServer(key,pkey)`、`termClient(key,pkey)`、`termServer(key)` | 4 | 16 |
| `hello.pv` | （无） | 0 | 0 |
| `ns-mutual-auth.pv` | `termI(host,host,bitstring)`、`acceptsI(...)`、`acceptsR(...)`、`termR(...)` | 4 | 16 |
| `ns-original.pv` | `beginBparam(pkey)`、`endBparam(pkey)`、`beginAparam(pkey)`、`endAparam(pkey)` | 4 | 16 |

**查询模板**（`gen.mjs`）：

- 对每个有序对 `(eᵢ, eⱼ)` 生成 `query <decls>; inj-event(eᵢ(...)) ==> inj-event(eⱼ(...)).`
- **同参数共享**：逐位置比较两个事件的参数类型；类型相同的位置共用一个变量（如 `v0`），故 `termI(x,y,z) ==> acceptsI(x,y,z)` 共享 `x,y,z`。
- **arity/类型不一致**（只出现在 `handshake-fixed.pv`，arity 1 vs 2）：该位置退化为两个独立变量（如 `a1`/`b1`）。这是合法的：手册 manual-03 §3.2 明确"箭头前的变量全称量化，箭头后但箭头前未出现的变量存在量化"，因此 `inj-event(acceptsClient(v0)) ==> inj-event(acceptsServer(v0,b1))` 中的 `b1` 是存在量化，良型。
- **无参事件**：用无参形式 `inj-event(e)`（本批样例无无参事件，代码已覆盖）。
- 两侧都用 `inj-event`，满足 manual-04 §4.3.1 的良型约束："若 `H` 含 injective event，则 `F` 必须是 injective event"。

生成后**插入 `process` 之前**（见 §2），每次 `proverif` 调用只跑一次脚本。

---

## 2. 硬约束：query 必须位于 `process` 之前

初始按 ticket 字面"追加到 `.pv` 文件末尾"实现，三个含事件样例全部失败（`hello.pv` 因无新查询而侥幸通过）：

```
$ proverif /tmp/pvbatch/handshake-fixed.batch.pv
File "/tmp/pvbatch/handshake-fixed.batch.pv", line 71, characters 1-5:
Error: Syntax error.
exit=2
```

最小复现 `/tmp/pvbatch/append-demo.pv`（query 在 `process` 之后）：

```
6  process out(c,s); 0
7  query x:key; inj-event(A(x)) ==> inj-event(B(x)).
$ proverif append-demo.pv
File "append-demo.pv", line 7, characters 1-5:
Error: Syntax error.
```

定位：报错 token 正是第 7 行的 `query` 关键字（characters 1-5）。

**引用**：

- manual-08 §A（输入文件文法）："The input file consists of a list of **declarations**, followed by the keyword `process` and a process."（`docs/proverif/manual/manual-08-language-reference.md:29`）
- manual-03 §3.2.1："the following query is included in the input file **before the main process**"（`manual-03-using-proverif.md:321`）

**修正**：把生成的 query 块插入到第一处行首 `process` 之前；三个样例随即退出码 0（见 §3）。这是本任务对实现路径最重要的修正——`query` 是 declaration，追加语义必须改为"插入声明区"。

---

## 3. 成本与判定分布

每个样例的批量文件 `*.batch.pv`（原文件 + 16 条生成 query，插入 `process` 前）跑一次。耗时取 3 次运行的中位数。

| 样例 | query 总数（原+生成） | 基线耗时 | 批量耗时 | stdout | 退出码 |
|---|---|---|---|---|---|
| `handshake-fixed` | 19 (3+16) | 14 ms | **36 ms** | 773 行 / 30 KB | 0 |
| `hello` | 2 (2+0) | 10 ms | **~10 ms**（no-op） | — | 0 |
| `ns-mutual-auth` | 18 (2+16) | 23 ms | **140 ms** | 2078 行 / 91 KB | 0 |
| `ns-original` | 22 (6+16) | 23 ms | **94 ms** | 1337 行 / 50 KB | 0 |

**判定分布**（`parseVerifyStdout` 结果，已剔除括号衍生行）：

| 样例 | is true | is false | cannot be proved | 括号衍生行 | 带反例 trace 的 false |
|---|---|---|---|---|---|
| `handshake-fixed` | 10 | 9 | **0** | 9 | 9 |
| `hello` | 1 | 1 | **0** | 0 | 1 |
| `ns-mutual-auth` | 6 | 12 | **0** | 12 | 12 |
| `ns-original` | 8 | 14 | **0** | 12 | 14 |

要点：

- **`cannot be proved` 分布为 0**：四个样例的批量查询全部落在 `true` / `false`，没有触发"不知道"。
- **无额外近似**：stderr 全空，stdout 无 `Warning` / `approximat*` / `may not terminate` 等字样，静默走完。
- 每个变 `false` 的节都带可解析的反例 trace（`Derivation:` 起），`counterexampleTrace` 非空的 false 数 = false 总数。
- `handshake-fixed.pv` 的对称自反对（如 `termClient ==> termClient`、`acceptsServer ==> acceptsServer`）与原有两条查询为 `true`；跨事件对多为 `false`，符合该模型只保证两条认证对应的语义。
- `hello.pv` 无事件 → 0 条批量查询；其判定分布即原文件的 2 条 secrecy 查询（`attacker(RSA)` false、`attacker(Cocks)` true）。

**退出码 0 不等于性质成立**——判定只信 `RESULT` 行（`verify-result.ts` 头部注释已声明），本测量同样以 `RESULT` 为准。

---

## 4. stdout 解析稳健性（`parseVerifyStdout`）

核对脚本 `/tmp/pvbatch/check-parse.mjs`：直接 `import { parseVerifyStdout } from '.../packages/core/dist/verify-result.js'`（dist 与 src 同步构建，src mtime 2026-09-18，dist 2026-09-19），对四个批量 stdout 逐一解析。

```
### handshake-fixed
  raw RESULT lines      : 28 (of which bracket-derivative: 9)
  Starting query lines  : 19
  parsed results        : 19
  verdict distribution  : {"true":10,"false":9}
  with counterexample   : 9
  parsed-without-start  : 0
  consistent (raw - bracket === parsed): true
### ns-mutual-auth
  raw RESULT lines      : 30 (bracket: 12)  Starting: 18  parsed: 18  dist {"true":6,"false":12}
### ns-original
  raw RESULT lines      : 34 (bracket: 12)  Starting: 22  parsed: 22  dist {"false":14,"true":8}
### hello
  raw RESULT lines      : 2  (bracket: 0)   Starting: 2   parsed: 2   dist {"false":1,"true":1}
```

四样例均满足：

1. `解析结果数 === 原始 RESULT 行数 − 括号衍生行数`；
2. 每条解析出的 query 都能在对应 `Starting query ` 行里找到（`parsed-without-start = 0`）；
3. `Starting query` 行数 = 查询总数（19/18/22/2）。

解析器切段规则与批量输出的对应关系：

- **节首** `Starting query <归一化查询>` —— 批量下每个 query 恰好一行；即使 ProVerif 还额外打印了 `-- Query ... in process 1.`（handshake 实测 19 行，与分析器无关），解析器只认 `Starting query`，不受影响。
- **节尾** `RESULT <query> is true|false.` / `RESULT <query> cannot be proved.` —— 正则 `^RESULT ([^(].*?) (?:is )?(true|false|cannot be proved)\.\s*$` 在批量下逐一命中。
- **括号衍生行**：批量下大量出现，形如
  - `RESULT (but event(acceptsClient(v0)) ==> event(acceptsServer(v0,b1)) is true.)`
  - `RESULT (even event(acceptsClient(v0)) ==> event(termClient(v0,b1)) is false.)`

  首字符是 `(`，被正则的 `[^(]` 排除，不计入结果（`verify-result.ts` 已有对应注释）。
- **`Verification summary`** 段用 `Query ... is ...` 而非 `RESULT ...`，不会被二次计入（实测 handshake summary 19 条 = parsed 19）。

**引用**：三种结果形态见 manual-03 §3.3.1（`manual-03-using-proverif.md:456` 起的输出骨架，及"RESULT [Query] is true/false/cannot be proved"）；note/05 的"输出的整体结构"把 `Starting query` → `RESULT` 骨架与 derivation/trace 的关系讲清楚（`docs/proverif/note/05-output.md`）。

---

## 5. 额外近似 / 报错 / 解析歧义

- **报错**：修正插入点后无任何报错；stderr 为空；退出码 0。
- **额外近似**：无。手册 manual-06 §6.7.5 列出主要近似来源（重复动作 `Repetition of actions`、`new` 位置、私有通道等）。本批生成的对应性查询没有触发 `cannot be proved`，故不存在由近似导致的假推导，也没有"重复动作近似"的 `Could not find a trace corresponding to this derivation.` 行。
- **解析歧义**：唯一新增形态是 `RESULT (...)` 括号衍生行；已确认被现有解析器排除，无歧义。批量未引入 `PARTIAL RESULT`（仅在 `[induction]` 查询下出现，见 manual-06 §6.1，本批未使用）。
- **反例 trace 处理**：`verify-result.ts` 只对 `false` 保留 trace；批量下 false 数 = 带 trace 数，全部如实保留。
- **无"重复查询去重"问题**：每个有序对都是不同文本（自反对除外），各自独立产出 `Starting query` + `RESULT`，不合并。

**残余风险**（未在本批四样例中出现，但实现时应留意）：

1. `cannot be proved` 在更复杂模型上会出现，并伴随"假推导"；解析器已按 `verify-result.ts` 处理为 `counterexampleTrace = null`，并有 fixture 测试覆盖（`fixtures/proverif/cannot-be-proved.stdout.txt`、`test/verify-result.test.ts`）。批量模式本身不改变这一判定逻辑。
2. 若未来生成 `[induction]` 查询，会出现 `PARTIAL RESULT` 行，现有正则不匹配它们（不产出结果），需另行处理。
3. 同类型但语义不同的事件位置被强制共享变量（本任务的"同参数共享"约定）；这是产品定义，非 ProVerif 限制，但会影响结论语义——实现时应对查询语义有文档说明。
4. arity/类型不一致的有序对退化为存在量化变量，语义弱于"参数完全对应"，属可接受但需知情的近似。

---

## 6. 引用汇总

- manual-08 §A 输入文法（declarations → `process`）：`docs/proverif/manual/manual-08-language-reference.md:29`
- manual-03 §3.2.1（query 在 main process 之前）、§3.2 correspondence 变量量化语义（`:321`、`:341-365`）
- manual-03 §3.3.1 三种结果形态与输出骨架（`:456`）
- manual-04 §4.3.1 对应性/事件文法与 `inj-event` 良型约束（`:718-768`、`:726`）
- manual-06 §6.1 induction 的 `PARTIAL RESULT`（`:127-197`）、§6.7.5 近似与 incompleteness（`:1386`）
- docs/proverif/note/05-output.md 输出结构与 derivation/trace 区别
- 源码：`pv-lens/packages/core/src/verify-result.ts`（切段 / 正则 / 括号行排除 / trace 规则）

---

## 7. 一句话总结

**批量对应性查询在四个内置样例上完全可行**：每个含事件的样例注入全部 4×4 有序对后单次 `proverif` 调用 < 0.2 s、stdout < 100 KB、`cannot be proved` 为 0；唯一实现坑是 query 必须插在 `process` 之前而**不能**追加文件末尾；现有 `parseVerifyStdout` 对生成的 stdout（含大量 `RESULT (...)` 括号衍生行）解析稳定，零歧义。
