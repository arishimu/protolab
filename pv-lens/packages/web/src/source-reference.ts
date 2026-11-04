/**
 * D3 参数引用定位：由绑定身份求其在源码中的首个引用区间。
 *
 * 值方块携带的 span 恒为绑定声明区间（`valueBlockOf` 只写 `binding.span`）；点击参数
 * 方块时除声明行主高亮外，还需给出该参数首次出现的消息步骤作为浅高亮参考，两者分色。
 * 纯函数、不触 DOM，供 App 联动与测试共用。
 */

import { narrativeRoleOrder } from '@pv-lens/core';
import type { ParseResult, PvTerm, SourceSpan } from '@pv-lens/core';

/** 词项是否引用给定绑定名（递归遍历变量叶子；名字与常量不算引用）。 */
export function termReferences(term: PvTerm | undefined, name: string): boolean {
  if (term === undefined) return false;
  switch (term.kind) {
    case 'variable':
      return term.name === name;
    case 'application':
      return term.args.some((argument) => termReferences(argument, name));
    case 'tuple':
      return term.items.some((item) => termReferences(item, name));
    case 'equality':
      return termReferences(term.term, name);
    case 'conditional':
      return termReferences(term.thenTerm, name) || termReferences(term.elseTerm, name);
    default:
      return false;
  }
}

/**
 * 绑定身份的首个引用区间：该绑定所在角色的 items 中，首个词项引用了绑定名且不是
 * 声明所在步骤的消息步骤（`in` 模式里的绑定名既是声明又是词项，不算引用）。
 * bindingId 形如 `${roleName}:${kind}:${index}:${name}`（见 core/src/parser/ir.ts
 * 的 addBinding），角色名为 ident、不含冒号。找不到引用时返回 null
 * （此时只显示声明行主高亮）。
 */
export function firstReferenceSpanOf(
  result: ParseResult,
  bindingId: string,
  declarationSpan: SourceSpan | null = null,
): SourceSpan | null {
  const parts = bindingId.split(':');
  if (parts.length < 4) return null;
  const roleName = parts[0];
  const name = parts[parts.length - 1] ?? '';
  for (const role of narrativeRoleOrder(result)) {
    if (role.name !== roleName) continue;
    for (const item of role.items) {
      if (item.kind !== 'message') continue;
      if (item.span.start.offset === item.span.end.offset) continue;
      if (declarationSpan !== null && item.span.start.offset === declarationSpan.start.offset) continue;
      if (termReferences(item.endpoint.term, name)) return item.span;
    }
  }
  return null;
}
