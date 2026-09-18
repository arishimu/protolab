/**
 * 词项解析：`.pv` 的词项 / 模式 → 结构化 `PvTerm`。
 *
 * 支持：名字与变量叶子（含 `: 类型` 标注）、构造子应用、元组、括号、等值模式 `=M`。
 * 语法错误返回 null 并写入 error 诊断，由调用方决定是否放弃该语句。
 */

import type { PvTerm } from './model.js';
import type { Token } from './lexer.js';
import type { TokenCursor } from './state.js';

/**
 * 变量作用域：裸标识符在此集合中判为变量，否则判为名字
 * （`free` / `const` 声明的名字、`new` 生成的新鲜名、常量、角色引用）。
 */
export type VariableScope = ReadonlySet<string>;

/** 解析一个词项；语法错误时返回 null（error 诊断已记录，游标停在出错处）。 */
export function parseTerm(cursor: TokenCursor, scope: VariableScope): PvTerm | null {
  const token = cursor.peek();

  if (token.kind === 'punct' && token.text === '(') return parseParenOrTuple(cursor, scope);

  if (token.kind === 'number') {
    cursor.next();
    return { kind: 'name', name: token.text, text: token.text };
  }

  if (token.kind === 'ident') {
    cursor.next();
    const typeName = parseTypeAscription(cursor);
    if (cursor.atPunct('(')) {
      const errorsBefore = cursor.errorCount;
      const args = parseTermList(cursor, scope);
      if (args === null || cursor.errorCount > errorsBefore) return null;
      return { kind: 'application', functor: token.text, args, text: cursor.slice(cursor.span(token.span.start)) };
    }
    if (!typeName && scope.has(token.text)) {
      return { kind: 'variable', name: token.text, text: token.text };
    }
    return typeName
      ? { kind: 'variable', name: token.text, typeName, text: cursor.slice(cursor.span(token.span.start)) }
      : { kind: 'name', name: token.text, text: token.text };
  }

  // 等值模式 `=M`：接收到的词项必须等于 M。结构化保留 M 与原文（ticket 05）。
  if (token.kind === 'punct' && token.text === '=') {
    const start = token.span.start;
    cursor.next();
    const term = parseTerm(cursor, scope);
    if (term === null) return null;
    return { kind: 'equality', term, text: cursor.slice(cursor.span(start)) };
  }

  cursor.error(`期望词项，实际遇到 \`${token.text || '文件末尾'}\``, token.span);
  return null;
}

/** 解析 `: 类型名`；没有则返回 undefined。 */
export function parseTypeAscription(cursor: TokenCursor): string | undefined {
  if (!cursor.atPunct(':')) return undefined;
  const colon = cursor.next();
  const typeToken = cursor.peek();
  if (typeToken.kind !== 'ident') {
    cursor.error(`类型标注缺少类型名：\`:\` 后应为类型名`, cursor.span(colon.span.start));
    return undefined;
  }
  cursor.next();
  return typeToken.text;
}

/** 解析 `( a, b, ... )`；语法错误返回 null。 */
function parseTermList(cursor: TokenCursor, scope: VariableScope): PvTerm[] | null {
  const open = cursor.next();
  const items: PvTerm[] = [];
  if (cursor.match(')')) return items;

  for (;;) {
    const errorsBefore = cursor.errorCount;
    const before = cursor.position;
    const term = parseTerm(cursor, scope);
    if (term === null || cursor.errorCount > errorsBefore) return null;
    items.push(term);

    // 防御：无论如何都要前进，避免死循环。
    if (cursor.position === before) cursor.next();

    if (cursor.match(',')) continue;
    if (cursor.match(')')) return items;
    cursor.error(
      `词项列表里期望 \`,\` 或 \`)\`，实际遇到 \`${cursor.peek().text || '文件末尾'}\``,
      cursor.span(open.span.start),
    );
    return null;
  }
}

function parseParenOrTuple(cursor: TokenCursor, scope: VariableScope): PvTerm | null {
  const open = cursor.next();
  const errorsBefore = cursor.errorCount;
  const items: PvTerm[] = [];
  if (cursor.match(')')) {
    cursor.error('空元组不是合法词项', cursor.span(open.span.start));
    return null;
  }

  for (;;) {
    const before = cursor.position;
    const term = parseTerm(cursor, scope);
    if (term === null || cursor.errorCount > errorsBefore) return null;
    items.push(term);
    if (cursor.position === before) cursor.next();

    if (cursor.match(',')) continue;
    if (cursor.match(')')) break;
    cursor.error(
      `元组里期望 \`,\` 或 \`)\`，实际遇到 \`${cursor.peek().text || '文件末尾'}\``,
      cursor.span(open.span.start),
    );
    return null;
  }

  if (items.length === 1) return items[0];
  return { kind: 'tuple', items, text: cursor.slice(cursor.span(open.span.start)) };
}

/** 收集模式里的绑定变量名（`x: t`、裸 `x`；`=x` 与 `: t` 的类型名不算绑定），用于变量作用域。 */
export function collectPatternBinders(tokens: readonly Token[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== 'ident') continue;
    if (tokens[i - 1]?.text === '=') continue; // `=x` 是对已绑定变量的引用
    if (tokens[i - 1]?.text === ':') continue; // `: t` 是类型名
    if (tokens[i + 1]?.text === '(') continue; // 构造子
    names.push(token.text);
  }
  return names;
}
