/**
 * 记号游标：语法分析共用的位置推进与诊断收集。
 *
 * 诊断一律经 `degraded` / `error` 落到结果里，绝不抛异常（解析错误必须是可判别结果）。
 */

import type { DiagnosticSeverity, PvDiagnostic, SourcePosition, SourceSpan } from './model.js';
import type { Token } from './lexer.js';

/** 诊断原文片段的最大长度（超出截断加省略号）。 */
const MAX_SNIPPET = 120;

/** 把源码片段压成单行并限制长度，供诊断展示。 */
export function snippetOf(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_SNIPPET ? `${oneLine.slice(0, MAX_SNIPPET)}…` : oneLine;
}

export class TokenCursor {
  private index = 0;

  constructor(
    readonly source: string,
    readonly tokens: readonly Token[],
    readonly diagnostics: PvDiagnostic[],
  ) {}

  get position(): number {
    return this.index;
  }

  set position(index: number) {
    this.index = index;
  }

  /** 当前建起的 error 诊断条数，供「本条语句是否已出错」判断。 */
  get errorCount(): number {
    return this.diagnostics.filter((d) => d.severity === 'error').length;
  }

  peek(ahead = 0): Token {
    return this.tokens[Math.min(this.index + ahead, this.tokens.length - 1)];
  }

  get atEnd(): boolean {
    return this.peek().kind === 'eof';
  }

  /** 消费并返回当前记号；已在末尾时返回 eof 记号且不前进。 */
  next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.index += 1;
    return token;
  }

  atPunct(text: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.text === text;
  }

  atIdent(text: string): boolean {
    const token = this.peek();
    return token.kind === 'ident' && token.text === text;
  }

  /** 当前记号是给定标点则消费并返回 true。 */
  match(text: string): boolean {
    if (!this.atPunct(text)) return false;
    this.next();
    return true;
  }

  /** 刚消费掉的记号的结束位置（未消费任何记号时取当前记号起点）。 */
  previousEnd(): SourcePosition {
    const previous = this.tokens[Math.max(0, this.index - 1)];
    return previous.span.end;
  }

  /** 从 `start` 到「刚消费掉的记号末尾」的区间。 */
  span(start: SourcePosition): SourceSpan {
    return { start, end: this.previousEnd() };
  }

  slice(span: SourceSpan): string {
    return this.source.slice(span.start.offset, span.end.offset);
  }

  report(severity: DiagnosticSeverity, message: string, span: SourceSpan): void {
    this.diagnostics.push({ severity, message, span, sourceText: snippetOf(this.slice(span)) });
  }

  /** 语法错误：调用方无法继续按原语法走下去。 */
  error(message: string, span: SourceSpan): void {
    this.report('error', message, span);
  }

  /** 降级：看不懂但可跳过，其余部分仍继续解析。 */
  degraded(message: string, span: SourceSpan): void {
    this.report('degraded', message, span);
  }
}

/** 括号类记号的配对关系。 */
export const OPEN_PUNCT = '([{';
export const CLOSE_PUNCT = ')]}';

/**
 * 从 `from` 起在括号深度 0 处查找文本等于 `texts` 之一（含标识符）的下标，找不到返回 -1。
 */
export function findTopLevelToken(cursor: TokenCursor, from: number, texts: readonly string[]): number {
  let depth = 0;
  for (let i = from; i < cursor.tokens.length; i++) {
    const token = cursor.tokens[i];
    if (token.kind === 'eof') return -1;
    if (token.kind !== 'punct') {
      if (depth === 0 && texts.includes(token.text)) return i;
      continue;
    }
    if (OPEN_PUNCT.includes(token.text)) {
      depth += 1;
      continue;
    }
    if (CLOSE_PUNCT.includes(token.text)) {
      if (depth === 0) continue;
      depth -= 1;
      continue;
    }
    if (depth === 0 && texts.includes(token.text)) return i;
  }
  return -1;
}

/** 找到与下标 `openIndex` 处开括号配对的闭括号下标，找不到返回 -1。 */
export function matchCloseIndex(cursor: TokenCursor, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < cursor.tokens.length; i++) {
    const token = cursor.tokens[i];
    if (token.kind !== 'punct') continue;
    if (OPEN_PUNCT.includes(token.text)) depth += 1;
    else if (CLOSE_PUNCT.includes(token.text)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 跳过一对配对的括号（若当前不是开括号则不动）。 */
export function skipBalanced(cursor: TokenCursor): void {
  if (!OPEN_PUNCT.includes(cursor.peek().text)) return;
  const closeIndex = matchCloseIndex(cursor, cursor.position);
  const target = closeIndex < 0 ? cursor.tokens.length - 1 : closeIndex;
  while (cursor.position <= target && !cursor.atEnd) cursor.next();
}

/**
 * 跳到当前语句的结尾（`;` / `.` / `)` 或文件末尾），用于出错后恢复解析；
 * 不消费结尾记号本身，交由外层顺序循环处理。
 */
export function skipToStatementEnd(cursor: TokenCursor): void {
  let depth = 0;
  while (!cursor.atEnd) {
    const token = cursor.peek();
    if (token.kind === 'punct') {
      if (OPEN_PUNCT.includes(token.text)) depth += 1;
      else if (CLOSE_PUNCT.includes(token.text)) {
        if (depth === 0) return;
        depth -= 1;
      } else if (depth === 0 && (token.text === ';' || token.text === '.')) {
        return;
      }
    }
    cursor.next();
  }
}
