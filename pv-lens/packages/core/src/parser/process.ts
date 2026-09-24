/**
 * 进程体扫描：`.pv` 的进程（角色体 / 主进程体）→ 有序消息步骤 + 角色级事实。
 *
 * 覆盖顺序协议子集：`out` / `in` / `new` / `let` / `if`[`else`] / `event` / `insert` /
 * `get`[`else`] / `0` / 顺序 `;` / 并行 `|` / 复制 `!` / 括号 / 命名进程调用。
 * 不支持的语句（`table` / `phase` / `choice` / `not`）产生 degraded 诊断并跳过，
 * 语法错误产生 error 诊断并跳到语句结尾继续，绝不抛异常。
 *
 * 标注挂载规则：`new` / `event` / 守卫与表操作注释先记为「待挂标注」，挂到其后最近的消息步骤
 * （placement `before`，因为扫描按源码顺序推进）；进程体结束时仍未消费的标注挂到最后
 * 一条消息步骤（placement `after`）。若进程体没有任何消息步骤，则记一条 degraded。
 *
 * 进程体是**线性展开**的：`let` 的 continuation、`get ... in P else Q` 与 `if ... then P else Q`
 * 的两个分支内的消息步都按源码顺序并入同一序列（分支树结构不保留，其条件 / 模式以
 * `GuardNote` 注释挂在步骤上）。
 */

import type {
  EventAnnotation,
  FreshName,
  GuardNote,
  MessageStep,
  PvDiagnostic,
  PvTerm,
  SourceSpan,
} from './model.js';
import type { Token } from './lexer.js';
import { collapseWhitespace } from './lexer.js';
import {
  TokenCursor,
  findTopLevelToken,
  matchCloseIndex,
  skipBalanced,
  skipToStatementEnd,
} from './state.js';
import { collectPatternBinders, parseTerm, parseTypeAscription } from './terms.js';

/** 进程体里出现的命名进程调用（主进程用它判定各角色是否被 `!` / `|`）。 */
export interface InvocationFact {
  name: string;
  replicated: boolean;
  parallel: boolean;
}

/** 尚未落到消息步骤上的标注（挂载时才决定 placement）。 */
type PendingFresh = FreshName;
type PendingEvent = Omit<EventAnnotation, 'placement'>;
type PendingGuard = Omit<GuardNote, 'placement'>;

export type ProcessFact =
  | { kind: 'message'; stepIndex: number }
  | { kind: 'new'; fresh: FreshName }
  | { kind: 'let'; span: SourceSpan; text: string; pattern: PvTerm; term: PvTerm; boundNames: readonly string[] }
  | { kind: 'get'; span: SourceSpan; text: string; pattern: PvTerm; boundNames: readonly string[] }
  | { kind: 'insert'; span: SourceSpan; text: string }
  | { kind: 'event'; event: PendingEvent; args: readonly PvTerm[] };

/** 一次扫描的事实流：保留本地语句的源码顺序，供值层 IR 使用。 */
export interface BodyScan {
  /** 变量作用域：角色参数 + `in` 模式变量 + `let` 绑定名，随扫描顺序增长。 */
  variables: Set<string>;
  steps: MessageStep[];
  facts: ProcessFact[];
  invocations: InvocationFact[];
  pending: { freshNames: PendingFresh[]; events: PendingEvent[]; guards: PendingGuard[] };
  /** 当前是否处于复制 `!` 作用域内。 */
  replicated: boolean;
  /** 当前是否处于并行 `|` 分支内。 */
  parallel: boolean;
}

/** 建立一次扫描的初始状态（角色参数先进变量作用域）。 */
export function newBodyScan(parameters: readonly { name: string }[] = []): BodyScan {
  return {
    variables: new Set(parameters.map((p) => p.name)),
    steps: [],
    facts: [],
    invocations: [],
    pending: { freshNames: [], events: [], guards: [] },
    replicated: false,
    parallel: false,
  };
}

/** 扫描一段进程体，直到遇到 `terminators` 里的记号或文件末尾。 */
export function scanProcessBody(
  cursor: TokenCursor,
  body: BodyScan,
  terminators: ReadonlySet<string>,
): void {
  scanSequence(cursor, body, terminators);
  attachTrailingNotes(cursor, body);
}

function isTerminator(cursor: TokenCursor, terminators: ReadonlySet<string>): boolean {
  if (cursor.atEnd) return true;
  const token = cursor.peek();
  if (token.kind !== 'punct' && token.kind !== 'ident') return false;
  return terminators.has(token.text);
}

function scanSequence(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  for (;;) {
    if (isTerminator(cursor, terminators)) return;
    const before = cursor.position;
    const errorsBefore = cursor.errorCount;
    scanParallel(cursor, body, terminators);
    if (cursor.position === before) cursor.next();
    if (cursor.match(';')) continue;
    // 刚出错的那条语句后面紧跟 `.`：当作该语句的残留分隔符吃掉，好让后面的语句继续解析。
    // 只有在刚报过错时才会这样——正常输入里这里的 `.` 是进程体 / 角色定义的结尾。
    if (cursor.errorCount > errorsBefore && cursor.match('.')) continue;
    if (isTerminator(cursor, terminators)) return;
    cursor.error('语句之间缺少 `;`', cursor.peek().span);
  }
}

function scanParallel(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  const stepStart = body.steps.length;
  const invocationStart = body.invocations.length;
  scanReplicated(cursor, body, terminators);

  let sawPipe = false;
  while (cursor.atPunct('|')) {
    cursor.next();
    sawPipe = true;
    scanReplicated(cursor, body, terminators);
  }

  if (!sawPipe) return;
  for (let i = stepStart; i < body.steps.length; i++) {
    const step = body.steps[i];
    body.steps[i] = { ...step, annotations: { ...step.annotations, parallel: true } };
  }
  for (let i = invocationStart; i < body.invocations.length; i++) {
    body.invocations[i] = { ...body.invocations[i], parallel: true };
  }
}

function scanReplicated(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  if (cursor.atPunct('!')) {
    cursor.next();
    const saved = body.replicated;
    body.replicated = true;
    scanReplicated(cursor, body, terminators);
    body.replicated = saved;
    return;
  }
  scanAtom(cursor, body, terminators);
}

function scanAtom(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  if (cursor.atPunct('(')) {
    const open = cursor.next();
    scanSequence(cursor, body, new Set([...terminators, ')']));
    if (!cursor.match(')')) cursor.error('缺少与 `(` 配对的 `)`', open.span);
    return;
  }
  scanStatement(cursor, body, terminators);
}

function scanStatement(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  const token = cursor.peek();

  if (token.kind === 'number' && token.text === '0') {
    cursor.next(); // `0`：进程终止，无步骤
    return;
  }

  if (token.kind === 'ident') {
    switch (token.text) {
      case 'out':
        scanOut(cursor, body);
        return;
      case 'in':
        scanIn(cursor, body);
        return;
      case 'new':
        scanNew(cursor, body);
        return;
      case 'let':
        scanLet(cursor, body, terminators);
        return;
      case 'if':
        scanIf(cursor, body, terminators);
        return;
      case 'event':
        scanEvent(cursor, body);
        return;
      case 'insert':
        scanInsert(cursor, body);
        return;
      case 'get':
        scanGet(cursor, body, terminators);
        return;
      case 'table':
      case 'phase':
      case 'choice':
      case 'not':
        scanUnsupported(cursor, `暂不支持 \`${token.text}\` 语句，已按原文降级`);
        return;
      default:
        scanInvocation(cursor, body);
        return;
    }
  }

  cursor.error(`无法解析的语句：以 \`${token.text}\` 开头`, token.span);
  skipToStatementEnd(cursor);
}

function scanOut(cursor: TokenCursor, body: BodyScan): void {
  const keyword = cursor.next();
  if (!cursor.atPunct('(')) {
    cursor.error('`out` 后缺少 `(`', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }
  const errorsBefore = cursor.errorCount;
  const open = cursor.next();
  const openIndex = cursor.position - 1;
  const channel = parseTerm(cursor, body.variables);
  let term: PvTerm | null = null;
  if (cursor.match(',')) term = parseTerm(cursor, body.variables);
  const closed = cursor.match(')');

  if (channel === null || term === null || cursor.errorCount > errorsBefore) {
    recoverFromCall(cursor, openIndex);
    return;
  }
  if (!closed) {
    cursor.error('`out(...)` 缺少结尾的 `)`', open.span);
    recoverFromCall(cursor, openIndex);
    return;
  }

  pushStep(body, 'out', channel, term, cursor.span(keyword.span.start));
}

function scanIn(cursor: TokenCursor, body: BodyScan): void {
  const keyword = cursor.next();
  if (!cursor.atPunct('(')) {
    cursor.error('`in` 后缺少 `(`', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }
  const errorsBefore = cursor.errorCount;
  const open = cursor.next();
  const openIndex = cursor.position - 1;
  const channel = parseTerm(cursor, body.variables);
  let pattern: PvTerm | null = null;

  if (cursor.match(',')) {
    // 先按模式文本收集绑定变量，再解析模式：`x: t` / `(a, b)` 里的名字才会判为变量。
    const patternStart = cursor.position;
    const closeIndex = matchCloseIndex(cursor, openIndex);
    const patternEnd = closeIndex < 0 ? cursor.tokens.length - 1 : closeIndex;
    for (const name of collectPatternBinders(cursor.tokens.slice(patternStart, patternEnd))) {
      body.variables.add(name);
    }
    pattern = parseTerm(cursor, body.variables);
  }

  const closed = cursor.match(')');
  if (channel === null || pattern === null || cursor.errorCount > errorsBefore) {
    recoverFromCall(cursor, openIndex);
    return;
  }
  if (!closed) {
    cursor.error('`in(...)` 缺少结尾的 `)`', open.span);
    recoverFromCall(cursor, openIndex);
    return;
  }

  pushStep(body, 'in', channel, pattern, cursor.span(keyword.span.start));
}

/**
 * `out(` / `in(` 出错后的恢复：吃掉这次调用的剩余实参直到配对的 `)`；
 * 若语句提前结束（`;` / `.`）或压根找不到配对括号，就停在语句边界上。
 */
function recoverFromCall(cursor: TokenCursor, openIndex: number): void {
  const closeIndex = matchCloseIndex(cursor, openIndex);
  const limit = closeIndex < 0 ? cursor.tokens.length - 1 : closeIndex;
  while (cursor.position <= limit && !cursor.atEnd) {
    const token = cursor.peek();
    if (token.kind === 'punct' && cursor.position !== closeIndex && (token.text === ';' || token.text === '.')) {
      return;
    }
    cursor.next();
  }
}

function scanNew(cursor: TokenCursor, body: BodyScan): void {
  const keyword = cursor.next();
  const nameToken = cursor.peek();
  if (nameToken.kind !== 'ident') {
    cursor.error('`new` 后缺少新鲜名', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }
  cursor.next();
  const typeName = parseTypeAscription(cursor);
  const span = cursor.span(keyword.span.start);
  const fresh: FreshName = {
    name: nameToken.text,
    ...(typeName === undefined ? {} : { typeName }),
    text: cursor.slice(span),
    span,
  };
  body.pending.freshNames.push(fresh);
  body.facts.push({ kind: 'new', fresh });
  // `new` 的名字从这一语句开始进入后续词项作用域。
  body.variables.add(fresh.name);
}

function scanEvent(cursor: TokenCursor, body: BodyScan): void {
  const keyword = cursor.next();
  const nameToken = cursor.peek();
  if (nameToken.kind !== 'ident') {
    cursor.error('`event` 后缺少事件名', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }
  cursor.next();

  let args: readonly PvTerm[] = [];
  if (cursor.atPunct('(')) {
    const openIndex = cursor.position;
    const closeIndex = matchCloseIndex(cursor, openIndex);
    if (closeIndex < 0) {
      cursor.error('事件参数缺少结尾的 `)`', cursor.span(keyword.span.start));
      skipToStatementEnd(cursor);
      return;
    }
    args = parseTermRanges(cursor, openIndex + 1, closeIndex, body.variables, 'event 参数');
    cursor.position = closeIndex + 1;
  }

  const span = cursor.span(nameToken.span.start);
  const event = { name: nameToken.text, text: cursor.slice(span), span };
  body.pending.events.push(event);
  body.facts.push({ kind: 'event', event, args });
}

function scanLet(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  const keyword = cursor.next();
  const patternStart = cursor.position;
  const equalsIndex = findTopLevelToken(cursor, patternStart, ['=']);
  const inIndex = findTopLevelToken(cursor, patternStart, ['in']);
  if (inIndex < 0 || equalsIndex < 0 || equalsIndex >= inIndex || equalsIndex === patternStart) {
    cursor.error('`let` 语句应为 `let 模式 = 词项 in 进程`', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }

  // 绑定模式 = `=` 与 `in` 之间的部分；等值约束（`=x`）只看模式，不看被绑定的词项。
  const patternTokens = cursor.tokens.slice(patternStart, equalsIndex);
  const names = collectPatternBinders(patternTokens);
  const pattern = parseTermRange(
    cursor,
    patternStart,
    equalsIndex,
    new Set([...body.variables, ...names]),
    'let 模式',
  );
  const term = parseTermRange(cursor, equalsIndex + 1, inIndex, body.variables, 'let 右侧词项');
  const textSpan: SourceSpan = {
    start: keyword.span.start,
    end: cursor.tokens[inIndex - 1].span.end,
  };
  body.facts.push({
    kind: 'let',
    span: textSpan,
    text: collapseWhitespace(cursor.slice(textSpan)),
    pattern,
    term,
    boundNames: names,
  });
  for (const name of names) body.variables.add(name);

  if (patternTokens.some((t) => t.kind === 'punct' && t.text === '=')) {
    const span: SourceSpan = {
      start: patternTokens[0].span.start,
      end: cursor.tokens[equalsIndex - 1].span.end,
    };
    body.pending.guards.push({
      kind: 'let-pattern',
      text: collapseWhitespace(cursor.slice(span)),
      span,
    });
  }

  cursor.position = inIndex + 1;
  scanSequence(cursor, body, terminators);
}

/**
 * `get 模式 in P else Q`：模式作为语句注释挂到两个分支展开出的首个消息步
 * （placement `before`）。`in` 分支与 `let` 一样内联展开（`in` 之后直到当前序列的 `else`
 * 或结尾），`else` 分支与 `if ... else ...` 同一套处理。
 * 与 if 一样不伪造反向条件：两个分支都带源码里的模式原文，不区分 in / else。
 */
function scanGet(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  const keyword = cursor.next();
  const patternStart = cursor.position;
  const inIndex = findTopLevelToken(cursor, patternStart, ['in']);
  if (inIndex < 0 || inIndex === patternStart) {
    cursor.error('`get` 语句应为 `get 模式 in 进程`', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }

  const patternTokens = cursor.tokens.slice(patternStart, inIndex);
  const names = collectPatternBinders(patternTokens);
  const patternSpan: SourceSpan = {
    start: patternTokens[0].span.start,
    end: cursor.tokens[inIndex - 1].span.end,
  };
  const pattern = parseTermRange(
    cursor,
    patternStart,
    inIndex,
    new Set([...body.variables, ...names]),
    'get 表模式',
  );
  for (const name of names) body.variables.add(name);

  const guard: PendingGuard = { kind: 'get', text: collapseWhitespace(cursor.slice(patternSpan)), span: patternSpan };
  body.pending.guards.push(guard);
  body.facts.push({
    kind: 'get',
    span: patternSpan,
    text: collapseWhitespace(cursor.slice(patternSpan)),
    pattern,
    boundNames: names,
  });

  cursor.position = inIndex + 1;
  scanBranches(cursor, body, terminators, guard);
}

/** `insert 表(键, 值)`：整条语句作注释，挂到其后最近的消息步。 */
function scanInsert(cursor: TokenCursor, body: BodyScan): void {
  const keyword = cursor.next();
  const contentStart = cursor.position;
  skipToStatementEnd(cursor);
  if (cursor.position === contentStart) {
    cursor.error('`insert` 后缺少表操作内容', cursor.span(keyword.span.start));
    return;
  }

  const span = cursor.span(cursor.tokens[contentStart].span.start);
  const text = collapseWhitespace(cursor.slice(span));
  body.pending.guards.push({ kind: 'insert', text, span });
  body.facts.push({ kind: 'insert', span, text });
}

function scanIf(cursor: TokenCursor, body: BodyScan, terminators: ReadonlySet<string>): void {
  const keyword = cursor.next();
  const conditionStart = cursor.position;
  const thenIndex = findTopLevelToken(cursor, conditionStart, ['then']);
  if (thenIndex < 0 || thenIndex === conditionStart) {
    cursor.error('`if` 语句缺少 `then` 或条件', cursor.span(keyword.span.start));
    skipToStatementEnd(cursor);
    return;
  }

  const span: SourceSpan = {
    start: cursor.tokens[conditionStart].span.start,
    end: cursor.tokens[thenIndex - 1].span.end,
  };
  const guard: PendingGuard = { kind: 'if', text: collapseWhitespace(cursor.slice(span)), span };
  body.pending.guards.push(guard);

  cursor.position = thenIndex + 1;
  scanBranches(cursor, body, terminators, guard);
}

/**
 * `X ... P else Q` 的公共线性展开（`if ... then` 与 `get ... in` 共用）：先扫 P（把 `else`
 * 当分支边界），遇到 `else` 再扫 Q。两个分支的首个消息步都带同一条守卫注释——
 * 不伪造 `!cond`（避免臆造源码里没有的条件），见 model.ts 的 GuardNote 注释。
 */
function scanBranches(
  cursor: TokenCursor,
  body: BodyScan,
  terminators: ReadonlySet<string>,
  guard: PendingGuard,
): void {
  scanSequence(cursor, body, new Set([...terminators, 'else']));
  if (!cursor.atIdent('else')) return;

  cursor.next();
  // 守卫已挂到 then / in 分支的消息步上时（pending 已被清空），这里重新放回，让 else 分支的
  // 首个消息步也带上；若前一分支没有消息步，守卫还在 pending 里，就自然落到 else 分支。
  if (!body.pending.guards.includes(guard)) body.pending.guards.push({ ...guard });
  scanSequence(cursor, body, terminators);
}

function scanInvocation(cursor: TokenCursor, body: BodyScan): void {
  const nameToken = cursor.next();
  // 不建模调用实参，只需知道被调用的角色名。
  skipBalanced(cursor);
  body.invocations.push({
    name: nameToken.text,
    replicated: body.replicated,
    parallel: body.parallel,
  });
}

function scanUnsupported(cursor: TokenCursor, message: string): void {
  const start = cursor.peek().span.start;
  skipToStatementEnd(cursor);
  cursor.degraded(message, cursor.span(start));
}

function pushStep(
  body: BodyScan,
  direction: 'out' | 'in',
  channel: PvTerm,
  term: PvTerm,
  span: SourceSpan,
): void {
  const step: MessageStep = {
    direction,
    channel,
    term,
    span,
    annotations: {
      freshNames: [...body.pending.freshNames],
      events: body.pending.events.map((event) => toEvent(event, 'before')),
      guards: body.pending.guards.map((guard) => toGuard(guard, 'before')),
      replicated: body.replicated,
      parallel: body.parallel,
    },
  };
  body.pending = { freshNames: [], events: [], guards: [] };
  body.steps.push(step);
  body.facts.push({ kind: 'message', stepIndex: body.steps.length - 1 });
}

function toEvent(event: PendingEvent, placement: 'before' | 'after'): EventAnnotation {
  return { name: event.name, text: event.text, placement, span: event.span };
}

function toGuard(guard: PendingGuard, placement: 'before' | 'after'): GuardNote {
  return { kind: guard.kind, text: guard.text, placement, span: guard.span };
}

function parseTermRanges(
  cursor: TokenCursor,
  start: number,
  end: number,
  scope: ReadonlySet<string>,
  label: string,
): PvTerm[] {
  if (start >= end) return [];
  const terms: PvTerm[] = [];
  let segmentStart = start;
  let depth = 0;
  for (let index = start; index < end; index++) {
    const text = cursor.tokens[index].text;
    if ('([{'.includes(text)) depth += 1;
    else if (')]}'.includes(text)) depth -= 1;
    else if (text === ',' && depth === 0) {
      terms.push(parseTermRange(cursor, segmentStart, index, scope, label));
      segmentStart = index + 1;
    }
  }
  terms.push(parseTermRange(cursor, segmentStart, end, scope, label));
  return terms;
}

function parseTermRange(
  cursor: TokenCursor,
  start: number,
  end: number,
  scope: ReadonlySet<string>,
  label: string,
): PvTerm {
  const tokens = cursor.tokens.slice(start, end);
  const span = tokens.length === 0
    ? cursor.span(cursor.peek().span.start)
    : { start: tokens[0].span.start, end: tokens[tokens.length - 1].span.end };
  if (tokens.length === 0) {
    cursor.degraded(`${label}为空，已保留原文`, span);
    return { kind: 'unknown', text: '' };
  }

  const localDiagnostics: PvDiagnostic[] = [];
  const eof: Token = { kind: 'eof', text: '', span: { start: span.end, end: span.end } };
  const local = new TokenCursor(cursor.source, [...tokens, eof], localDiagnostics);
  const term = parseTerm(local, scope);
  if (term !== null && local.position === tokens.length && localDiagnostics.length === 0) return term;

  cursor.degraded(`${label}无法可靠结构化，已保留原文`, span);
  return { kind: 'unknown', text: collapseWhitespace(cursor.slice(span)) };
}

function attachTrailingNotes(cursor: TokenCursor, body: BodyScan): void {
  const { freshNames, events, guards } = body.pending;
  if (freshNames.length === 0 && events.length === 0 && guards.length === 0) return;

  const last = body.steps[body.steps.length - 1];
  if (last === undefined) {
    const anchor = freshNames[0] ?? events[0] ?? guards[0];
    // 标注仍以本地 item 保留（见 facts），这里只说明兼容的消息步骤投影挂不上它们。
    cursor.degraded('该进程体没有消息步骤：`new` / `event` / 守卫不会挂到兼容的消息步骤投影上，仅以本地 item 保留', anchor.span);
    body.pending = { freshNames: [], events: [], guards: [] };
    return;
  }

  body.steps[body.steps.length - 1] = {
    ...last,
    annotations: {
      ...last.annotations,
      freshNames: [...last.annotations.freshNames, ...freshNames],
      events: [...last.annotations.events, ...events.map((event) => toEvent(event, 'after'))],
      guards: [...last.annotations.guards, ...guards.map((guard) => toGuard(guard, 'after'))],
    },
  };
  body.pending = { freshNames: [], events: [], guards: [] };
}
