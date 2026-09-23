# 11: 解析器建模 `fun` / `free` / `const` 类型签名

**What to build:** 解析器不再整体跳过声明区：把 `fun name(argtypes): rettype` 的函数签名、`free` / `const name: type` 的具名类型收进 `ParseResult`，供意图配对做轻量类型推断。`reduc` / `type` / `event` / `table` / `not` 仍宽容跳过、不报错。

**Blocked by:** 无

**Status:** resolved

- [ ] `ParseResult.functions`：`{ name, argTypes, returnType }`，按声明顺序
- [ ] `ParseResult.names`：`{ name, typeName }`，覆盖 `free a, b: t` 与 `const`
- [ ] 带属性后缀（`[private]` / `[data,typeConverter]`）的声明正确收尾
- [ ] 声明区解析不产生任何诊断（现状回归保持）
- [ ] 语法不完整的声明降级/报错但不崩溃

## Comments

背景见 ADR-0003。这是意图配对的输入前提：没有 `fun` 返回类型就无法把 `aenc(...)` 判成 `bitstring`，也就挡不住 `aenc` 被 `pkX: pkey` 误收。

## Comments

### 交付（2026-09-19）

`ParseResult` 新增 `functions`（`{name, argTypes, returnType}`）与 `names`（`{name, typeName}`）；
`parse.ts` 新增 `parseFunDeclaration` / `parseNameDeclaration` / `finishDeclaration`，消费 `[private]` 等属性后缀。
`reduc` / `type` / `event` / `table` / `not` 仍宽容跳过。四个内置样例解析后 `diagnostics` 均为 0，
函数签名实测：handshake 5 个、ns-mutual-auth 8 个、ns-original 5 个。
core 公开接口导出 `FunctionSignature` / `TypedName`。`pnpm test` 全绿。
