# ProVerif 批量对应性查询：生成、成本与输出形态

Type: research
Status: resolved

## Question

为事件对应性查表，需要在一次验证里跑**模型的全部事件有序对**（`inj-event(eᵢ) ==> inj-event(eⱼ)`，同参数共享）。

已核对的事实（`docs/proverif/manual/manual-06` §6.6.1、`manual-03`）：ProVerif 无 REPL、无临时查询选项；query 只能写进输入文件。因此实现路径只能是「把生成的 query 追加到 `.pv` 临时副本 → 重新 spawn 一次 proverif」。

要 research 的：在四个内置样例（`pv-lens/packages/core/fixtures/pv/*.pv`）上，把全部有序对注入后一次跑完的**成本与稳健性**（耗时、是否触发额外近似、`cannot be proved` / `is false` 的分布），以及 stdout 里是否仍能按现有 `parseVerifyStdout`（`Starting query` / `RESULT` 切段）稳定解析。产出一份带引用的 Markdown 笔记。

## Answer

后台 research 子代理实测完成（async run `349e0816-1647-4113-ab64-40b09cc2e349`），结论笔记落在 [`research/06-proverif-batch-queries.md`](../research/06-proverif-batch-queries.md)。要点：

- **可行**：除 `hello`（无事件）外，三个含事件样例各注入全部 4×4 有序对，单次 `proverif` 跑完，退出码 0，无报错、无额外近似。
- **成本可忽略**：单次约 37–143 ms（基线 14–23 ms），stdout 30–92 KB；`cannot be proved` 分布为 0。
- **解析稳健**：现有 `parseVerifyStdout` 对批量 stdout 零歧义；括号衍生行 `RESULT (...)` 已被排除，`解析数 = 原始 RESULT 行数 − 括号行数`。
- **硬约束（重要）**：`query` 是 declaration，**必须插在 `process` 关键字之前**；「追加到文件末尾」直接 `Error: Syntax error.`（`manual-08` §A、`manual-03` §3.2.1）。
- **语义注意**：同参数共享是产品约定；arity / 类型不一致的有序对退化为存在量化变量，良型但语义较弱。
- **残余风险**：更大模型可能触发 `cannot be proved` 与假推导（现有解析器已按 `counterexampleTrace = null` 处理）；未来的 `[induction]` 查询会产出 `PARTIAL RESULT`，现有正则不匹配。
