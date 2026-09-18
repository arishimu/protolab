# fixture 来源说明

本目录是 pv-lens 四个基准样例的 fixture 资产，供 Seam A（解析器）与 Seam B（stdout 解析器）测试使用，由 /implement #01 从本机实跑录制。

## 布局

- `pv/<id>.pv`：样例 `.pv` 原文（复制自 `docs/proverif/pv/`，字节一致，不读取该相对路径）
- `proverif/<id>.stdout.txt`：对对应 `.pv` 调用本机 ProVerif 的全量 stdout 录制（未裁剪）
- `proverif/cannot-be-proved.stdout.txt`：**人工构造**的 stdout（见下「人工构造 fixture」）

## 源文件映射（与 `docs/proverif/pv/` 逐字一致）

| 样例 id | fixture .pv | 源文件（docs/proverif/pv/） | 形态 |
|---|---|---|---|
| `hello` | `pv/hello.pv` | `hello.pv` | 保密性最小冒烟 |
| `handshake-fixed` | `pv/handshake-fixed.pv` | `ex_handshake_annotated_fixed.pv` | 握手修正版全绿 |
| `ns-mutual-auth` | `pv/ns-mutual-auth.pv` | `NeedhamSchroederPK-corr-mutual-auth.pv` | NS 修正版互认证 |
| `ns-original` | `pv/ns-original.pv` | `NeedhamSchroederPK-var1.pv` | NS 原版（Lowe 攻击） |

## stdout 录制方式

```
proverif <fixture .pv> > <id>.stdout.txt 2>&1
```

- ProVerif 版本：2.05（`opam` 安装，`~/.opam/default/bin/proverif`）
- 录制环境：本机（Linux），各样例运行 <20ms
- 每条判定 `RESULT ... is true|false.`（四个基准样例均不出现 `cannot be proved`；其真实输出不带 `is`，见文末「人工构造 fixture」）与 `packages/core/src/index.ts` 的 `expectedVerdicts` 一致；后者作为验收口径由 fixtures 测试交叉核对。

## 备注

- ProVerif 默认不打印自身版本号，故 stdout 录制中无版本行；版本信息以此文件为准。
- `ns-original.stdout.txt` 末尾对 `inj-event(endBparam(x)) ==> inj-event(beginBparam(x))` 判 false 后，ProVerif 会额外打印一行括号内衍生说明
  `RESULT (even event(endBparam(x)) ==> event(beginBparam(x)) is false.)` —— 这是对非注入版查询的诊断回声，不是独立的查询分节；解析时按「query 不以 `(` 开头」的 RESULT 行识别正片（见 `core/test/fixtures.test.ts`）。
- NS 原版除 Lowe 攻击查询（false）与 A 侧认证（true）外，B 侧 nonce 保密查询 `not attacker(secretBNa[]/secretBNb[])` 亦为 false——与学习笔记 06b「A 侧正常、B 侧全灭」一致，也与 spec.md 的实测结果表逐条一致。

## 人工构造 fixture

`proverif/cannot-be-proved.stdout.txt` **不是**真实录制，是 ticket 07 人工构造的 stdout：
四个基准样例都不会出现 `cannot be proved`，而解析器必须支持该判定（spec 的 stdout 解析事实）。

- 它由手写的 `Process 0` 头 + 两节查询（`not attacker(s[])` 为 `cannot be proved`、`not attacker(k[])` 为 `true`）+ `Verification summary` 拼成，
  结构照抄真实录制的行文（`-- Query ... in process 0.` / `Translating the process into Horn clauses...` / `Completing...` / `Starting query ...` / `goal reachable: ...` / `RESULT ...`），
  但没有对应的 `.pv` 源文件，也不代表任何真实协议。
- `cannot be proved` 那节**带一段 Derivation**，并以其前的 `Could not find a trace corresponding to this derivation.` 收尾——
  这是真实形态：`cannot be proved` 来自手册 6.7.5 的「重复动作近似」，ProVerif 会给出推导但找不到对应 trace
  （见 `docs/proverif/note/05-output.md` 的「假攻击案例」与 `docs/proverif/note/02-secrecy.md`）。
  保留这段正是为了让测试能守住「不得把假推导当成反例 trace」这条纪律（见 `core/test/verify-result.test.ts`）。
- 它只用于验证解析器对 `cannot be proved` 的判定与查询切段（见 `core/test/verify-result.test.ts`）。
- 实测补充（本机 ProVerif 2.05）：`cannot be proved` 在真实输出里**没有** `is`，即 `RESULT <查询> cannot be proved.`
  （例如 `noninterf` 查询会打印 `RESULT Non-interference s cannot be proved.`）；解析器同时兼容 ticket 字面形态 `RESULT <查询> is cannot be proved.`。
