import type { Condition, PvTerm, SourceSpan } from './model.js';
import { tokenize } from './lexer.js';
import { TokenCursor } from './state.js';
import { parseTerm } from './terms.js';

/** 把 if/get 的原文解析成共享的 Condition；无法证明结构时保留 unknown。 */
export function parseConditionText(
  text: string,
  scope: ReadonlySet<string> = new Set(),
): Condition {
  const source = text.trim();
  if (source.length === 0) return { kind: 'unknown', text: source };
  const lexed = tokenize(source);
  const tokens = lexed.tokens.filter((token) => token.kind !== 'eof');

  const compound = splitTopLevel(source, tokens, '||') ?? splitTopLevel(source, tokens, '&&');
  if (compound !== null) {
    const operator = compound.operator as '&&' | '||';
    return {
      kind: 'compound',
      operator,
      clauses: compound.parts.map((part) => parseConditionText(part, scope)),
    };
  }

  const comparison = findComparison(source, tokens);
  if (comparison !== null) {
    const left = parseTermText(comparison.left, scope);
    const right = parseTermText(comparison.right, scope);
    if (left !== null && right !== null) {
      return { kind: 'comparison', operator: comparison.operator, left, right };
    }
  }
  return { kind: 'unknown', text: source };
}

function parseTermText(text: string, scope: ReadonlySet<string>): PvTerm | null {
  const lexed = tokenize(text.trim());
  const cursor = new TokenCursor(text.trim(), lexed.tokens, [...lexed.diagnostics]);
  return parseTerm(cursor, scope);
}

function splitTopLevel(
  source: string,
  tokens: readonly { text: string; kind: string; span: SourceSpan }[],
  operator: '&&' | '||',
): { operator: string; parts: string[] } | null {
  let depth = 0;
  const cuts: number[] = [];
  for (const token of tokens) {
    if (token.kind === 'punct' && '([{'.includes(token.text)) depth += 1;
    else if (token.kind === 'punct' && ')]}'.includes(token.text)) depth -= 1;
    else if (depth === 0 && token.text === operator) cuts.push(token.span.start.offset);
  }
  if (cuts.length === 0) return null;
  const parts: string[] = [];
  let start = 0;
  for (const offset of cuts) {
    parts.push(source.slice(start, offset).trim());
    start = offset + operator.length;
  }
  parts.push(source.slice(start).trim());
  return { operator, parts };
}

function findComparison(
  source: string,
  tokens: readonly { text: string; kind: string; span: SourceSpan }[],
): { operator: '=' | '<>'; left: string; right: string } | null {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'punct' && '([{'.includes(token.text)) depth += 1;
    else if (token.kind === 'punct' && ')]}'.includes(token.text)) depth -= 1;
    else if (depth === 0 && (token.text === '=' || token.text === '<>')) {
      return {
        operator: token.text as '=' | '<>',
        left: source.slice(0, token.span.start.offset).trim(),
        right: source.slice(token.span.end.offset).trim(),
      };
    }
  }
  return null;
}
