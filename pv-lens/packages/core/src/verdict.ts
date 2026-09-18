/**
 * 「验证结论」的判定值（见 CONTEXT.md）。
 *
 * 独立成叶子模块，避免 `verify-result.ts` 反向 import 公共入口 `index.ts`
 * 造成类型层循环依赖；`index.ts` 再从本模块导出，公共 API 不变。
 */

/** ProVerif 对一条查询给出的判定值。 */
export type Verdict = 'true' | 'false' | 'cannot-be-proved';
