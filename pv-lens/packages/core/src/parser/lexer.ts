/**
 * 词法分析：`.pv` 源码 → 记号序列。
 *
 * 只做「字符串进 → 记号出」，不读文件、不依赖平台 API（core 纯净性约束）。
 * 注释 `(* ... *)`（ProVerif 允许嵌套）在词法阶段丢弃；未闭合的注释记为 error 诊断。
 */

import type { PvDiagnostic, SourcePosition, SourceSpan } from './model.js';

export type TokenKind = 'ident' | 'number' | 'punct' | 'eof';

export interface Token {
  kind: TokenKind;
  /** 记号原文。 */
  text: string;
  span: SourceSpan;
}

/** 多字符记号，按长度降序匹配（避免 `==>` 被切成 `=` `=` `>`）。 */
const MULTI_CHAR_PUNCT: readonly string[] = ['<==>', '==>', '<=>', '&&&', '&&', '||', '<>', '<=', '>=', '->'];

const isIdentStart = (ch: string): boolean => /[A-Za-z_]/.test(ch);
const isIdentPart = (ch: string): boolean => /[A-Za-z0-9_']/.test(ch);
const isDigit = (ch: string): boolean => /[0-9]/.test(ch);

export interface TokenizeResult {
  tokens: readonly Token[];
  diagnostics: readonly PvDiagnostic[];
}

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: PvDiagnostic[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  const here = (): SourcePosition => ({ offset, line, column });

  const advance = (count = 1): void => {
    for (let i = 0; i < count && offset < source.length; i++) {
      if (source[offset] === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      offset += 1;
    }
  };

  const push = (kind: TokenKind, start: SourcePosition): void => {
    tokens.push({ kind, text: source.slice(start.offset, offset), span: { start, end: here() } });
  };

  while (offset < source.length) {
    const ch = source[offset];

    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // 注释 `(* ... *)`，ProVerif 允许嵌套。
    if (ch === '(' && source[offset + 1] === '*') {
      const start = here();
      advance(2);
      let depth = 1;
      while (offset < source.length && depth > 0) {
        if (source.startsWith('(*', offset)) {
          depth += 1;
          advance(2);
        } else if (source.startsWith('*)', offset)) {
          depth -= 1;
          advance(2);
        } else {
          advance();
        }
      }
      if (depth > 0) {
        diagnostics.push({
          severity: 'error',
          message: '注释 `(*` 未闭合',
          span: { start, end: here() },
          sourceText: collapseWhitespace(source.slice(start.offset, offset)),
        });
      }
      continue;
    }

    if (isIdentStart(ch)) {
      const start = here();
      while (offset < source.length && isIdentPart(source[offset])) advance();
      push('ident', start);
      continue;
    }

    if (isDigit(ch)) {
      const start = here();
      while (offset < source.length && isDigit(source[offset])) advance();
      push('number', start);
      continue;
    }

    const multi = MULTI_CHAR_PUNCT.find((p) => source.startsWith(p, offset));
    if (multi !== undefined) {
      const start = here();
      advance(multi.length);
      push('punct', start);
      continue;
    }

    // 其余非空白字符一律作单字符标点：是不是合法语法交给语法分析判定。
    const start = here();
    advance();
    push('punct', start);
  }

  const end = here();
  tokens.push({ kind: 'eof', text: '', span: { start: end, end } });
  return { tokens, diagnostics };
}

/** 把任意多行原文压成单行（仅折叠空白，不改字符）。 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
