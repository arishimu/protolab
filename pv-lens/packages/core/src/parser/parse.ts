/**
 * `parsePv`：`.pv` 文本 → 语义模型（Seam A 的公共入口，ticket 03）。
 *
 * 契约：
 * - 纯转换，只「字符串进 → 结构化数据出」，不读文件、不抛异常。解析失败一律以
 *   `diagnostics` 返回：`degraded` = 看不懂但可跳过（带 span 与原文片段），
 *   `error` = 语法错误（带 span）。
 * - `roles` 只放命名进程（协议角色，`.pv` 里的 `let name(params) = body`）。
 *   无命名进程的内联主进程（`process` 关键字后的进程体）单独放在 `mainProcess`：
 *   它是协议启动处而非协议参与方，hello 这类样例只有它。渲染方在 `roles` 为空而
 *   `mainProcess` 非空时，应把主进程当作一条 `main` 泳道展示，而不是当作「无角色结构」。
 * - 声明区（`type` / `fun` / `reduc` / `free` / `const` / `event` / `table` / `not` /
 *   顶层 `let` 绑定）宽容解析：整体跳过，不建模、不报错。ticket 05 需要按声明种类
 *   细分解析时，扩展 `skipDeclaration` 即可。
 */

import type { ParseResult, PvDiagnostic, PvQuery, PvRole, RoleParameter, SourceSpan } from './model.js';
import { tokenize } from './lexer.js';
import {
  TokenCursor,
  findTopLevelToken,
  snippetOf,
  OPEN_PUNCT,
  CLOSE_PUNCT,
} from './state.js';
import { newBodyScan, scanProcessBody, type BodyScan, type InvocationFact } from './process.js';
import { parseTypeAscription } from './terms.js';

/** 内联主进程在模型里的固定角色名。 */
export const MAIN_PROCESS_NAME = 'main';

/**
 * 进程体的终止记号：角色定义 `let name(params) = body.` 以 `.` 收尾；主进程体通常不带
 * 结尾的 `.`（它在 `.pv` 里总是最后一段），两种写法都容忍。
 */
const PROCESS_BODY_TERMINATORS: ReadonlySet<string> = new Set(['.']);

/** 扫描中的角色（步骤先留在 `body`，最后统一落到公开模型）。 */
interface MutableRole {
  name: string;
  parameters: RoleParameter[];
  body: BodyScan;
  span: SourceSpan;
}

export function parsePv(source: string): ParseResult {
  const lexed = tokenize(source);
  const diagnostics: PvDiagnostic[] = [...lexed.diagnostics];
  const cursor = new TokenCursor(source, lexed.tokens, diagnostics);
  const definitions: MutableRole[] = [];
  const queries: PvQuery[] = [];
  let main: MutableRole | null = null;

  try {
    while (!cursor.atEnd) {
      if (cursor.atIdent('process')) {
        main = parseMainProcess(cursor);
        break;
      }
      if (cursor.atIdent('query')) {
        queries.push(...parseQueryStatement(cursor));
        continue;
      }
      if (cursor.atIdent('let')) {
        const role = parseRoleDefinition(cursor);
        if (role !== null) definitions.push(role);
        continue;
      }
      skipDeclaration(cursor);
    }
  } catch (cause) {
    // 兜底：解析器不应抛异常；万一日后引入缺陷，也按「带 span 的 error 诊断」返回。
    diagnostics.push(fallbackDiagnostic(cursor, cause));
  }

  // 角色级 `!` / `|` 来自启动处（主进程）的调用形态：`!roleA(...)` 或 `(... | ...)`。
  const invocations = collectInvocationFacts([...definitions, ...(main === null ? [] : [main])]);
  const sorted = [...diagnostics].sort((a, b) => a.span.start.offset - b.span.start.offset);

  return {
    hasErrors: sorted.some((d) => d.severity === 'error'),
    hasDegraded: sorted.some((d) => d.severity === 'degraded'),
    roles: definitions.map((definition) => toPublicRole(definition, invocations)),
    mainProcess: main === null ? null : toPublicRole(main, invocations),
    queries,
    diagnostics: sorted,
  };
}

function parseMainProcess(cursor: TokenCursor): MutableRole {
  const keyword = cursor.next();
  const body = newBodyScan();
  scanProcessBody(cursor, body, PROCESS_BODY_TERMINATORS);
  return { name: MAIN_PROCESS_NAME, parameters: [], body, span: cursor.span(keyword.span.start) };
}

/**
 * 解析命名进程定义 `let name(params) = body.`（协议角色）。
 *
 * 顶层 `let NAME = ... .`（无参数列表）既可能是无参进程定义、也可能是词项绑定，
 * 语法上无法区分：v1 一并降级跳过（ticket 05 覆盖）。
 */
function parseRoleDefinition(cursor: TokenCursor): MutableRole | null {
  const keyword = cursor.next();
  const nameToken = cursor.peek();

  if (nameToken.kind !== 'ident') {
    cursor.error('`let` 后缺少角色名', cursor.span(keyword.span.start));
    recoverToDeclarationEnd(cursor);
    return null;
  }

  if (cursor.peek(1).text !== '(') {
    cursor.next();
    const start = keyword.span.start;
    recoverToDeclarationEnd(cursor);
    cursor.degraded(
      'v1 只建模带参数列表的命名进程（`let name(params) = body`）；已跳过顶层 `let` 绑定',
      cursor.span(start),
    );
    return null;
  }

  cursor.next();
  const parameters = parseRoleParameters(cursor);
  if (parameters === null) return null;

  if (!cursor.match('=')) {
    cursor.error('角色定义缺少 `=`', cursor.span(keyword.span.start));
    recoverToDeclarationEnd(cursor);
    return null;
  }

  const body = newBodyScan(parameters);
  scanProcessBody(cursor, body, PROCESS_BODY_TERMINATORS);
  if (!cursor.match('.')) cursor.error('角色定义缺少结尾的 `.`', cursor.span(keyword.span.start));
  return { name: nameToken.text, parameters, body, span: cursor.span(keyword.span.start) };
}

/** 解析 `(name: type, ...)`；出错时返回 null 并已恢复到定义结尾。 */
function parseRoleParameters(cursor: TokenCursor): RoleParameter[] | null {
  const open = cursor.next();
  const parameters: RoleParameter[] = [];

  if (!cursor.atPunct(')')) {
    for (;;) {
      const parameterToken = cursor.peek();
      if (parameterToken.kind !== 'ident') {
        cursor.error(`角色参数应为名字，实际遇到 \`${parameterToken.text}\``, cursor.span(open.span.start));
        recoverToDeclarationEnd(cursor);
        return null;
      }
      cursor.next();
      const typeName = parseTypeAscription(cursor);
      parameters.push(typeName === undefined ? { name: parameterToken.text } : { name: parameterToken.text, typeName });
      if (cursor.match(',')) continue;
      break;
    }
  }

  if (!cursor.match(')')) {
    cursor.error('角色参数缺少结尾的 `)`', cursor.span(open.span.start));
    recoverToDeclarationEnd(cursor);
    return null;
  }
  return parameters;
}

/** 启动处（主进程）对各命名进程的调用形态，用于判定角色的 `!` / `|`。 */
function collectInvocationFacts(roles: readonly MutableRole[]): Map<string, InvocationFact> {
  const merged = new Map<string, InvocationFact>();
  for (const role of roles) {
    for (const invocation of role.body.invocations) {
      const existing = merged.get(invocation.name);
      merged.set(invocation.name, {
        name: invocation.name,
        replicated: invocation.replicated || (existing?.replicated ?? false),
        parallel: invocation.parallel || (existing?.parallel ?? false),
      });
    }
  }
  return merged;
}

/** 把扫描结果落到公开角色模型：角色级 `!` / `|` 传给该角色的每条步骤。 */
function toPublicRole(role: MutableRole, invocations: ReadonlyMap<string, InvocationFact>): PvRole {
  const invocation = invocations.get(role.name);
  const replicated = (invocation?.replicated ?? false) || role.body.steps.some((s) => s.annotations.replicated);
  const parallel = (invocation?.parallel ?? false) || role.body.steps.some((s) => s.annotations.parallel);

  return {
    name: role.name,
    parameters: role.parameters,
    steps: role.body.steps.map((step) => ({
      ...step,
      annotations: {
        ...step.annotations,
        replicated: step.annotations.replicated || replicated,
        parallel: step.annotations.parallel || parallel,
      },
    })),
    replicated,
    parallel,
    span: role.span,
  };
}

/** 声明区宽容解析：跳到该声明的结尾 `.`，不建模其内容。 */
function skipDeclaration(cursor: TokenCursor): void {
  const start = cursor.peek().span.start;
  const stopIndex = findTopLevelToken(cursor, cursor.position, ['.', 'process']);
  const terminated = stopIndex >= 0 && cursor.tokens[stopIndex].text === '.';

  cursor.position = terminated ? stopIndex + 1 : stopIndex < 0 ? cursor.tokens.length - 1 : stopIndex;
  if (!terminated) {
    // 不消费 `process`（它是主进程的开始），只报声明缺 `.`。
    cursor.error('声明缺少结尾的 `.`', cursor.span(start));
  }
}

/** 出错恢复：跳到声明 / 定义结尾的 `.` 并消费它。 */
function recoverToDeclarationEnd(cursor: TokenCursor): void {
  const stopIndex = findTopLevelToken(cursor, cursor.position, ['.', 'process']);
  if (stopIndex < 0 || cursor.tokens[stopIndex].text !== '.') {
    cursor.position = stopIndex < 0 ? cursor.tokens.length - 1 : stopIndex;
    return;
  }
  cursor.position = stopIndex + 1;
}

/** 解析一条 `query` 语句；一条语句里用 `;` 分隔的多条查询各成一项。 */
function parseQueryStatement(cursor: TokenCursor): PvQuery[] {
  const keyword = cursor.next();
  const stopIndex = findTopLevelToken(cursor, cursor.position, ['.', 'process']);
  const terminated = stopIndex >= 0 && cursor.tokens[stopIndex].text === '.';
  const endIndex = stopIndex < 0 ? cursor.tokens.length - 1 : stopIndex;

  const queries = collectQueries(cursor, cursor.position, endIndex);
  cursor.position = terminated ? stopIndex + 1 : endIndex;
  if (!terminated) cursor.error('`query` 语句缺少结尾的 `.`', cursor.span(keyword.span.start));
  return queries;
}

/**
 * 把一段 `query` 语句的记号区间切成若干条查询。
 * 首段若形如 `x:key,y:pkey`（`名字 : 类型`），视为变量声明前缀：只保留变量名，不作查询。
 */
function collectQueries(cursor: TokenCursor, from: number, to: number): PvQuery[] {
  const segments = splitTopLevel(cursor, from, to, ';');
  const first = segments[0];
  const hasVariablePrefix =
    first !== undefined &&
    cursor.tokens[first.start]?.kind === 'ident' &&
    cursor.tokens[first.start + 1]?.text === ':';

  const variables = hasVariablePrefix ? collectDeclaredVariables(cursor, first) : [];
  const results: PvQuery[] = [];
  for (const segment of segments.slice(hasVariablePrefix ? 1 : 0)) {
    if (segment.start >= segment.end) continue;
    const span = {
      start: cursor.tokens[segment.start].span.start,
      end: cursor.tokens[segment.end - 1].span.end,
    };
    const text = cursor.slice(span).replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    results.push({ text, variables, span });
  }
  return results;
}

/** 取变量声明前缀里的变量名（`x:key,y:pkey` → `['x','y']`）。 */
function collectDeclaredVariables(cursor: TokenCursor, prefix: { start: number; end: number }): string[] {
  const names: string[] = [];
  for (const part of splitTopLevel(cursor, prefix.start, prefix.end, ',')) {
    const token = cursor.tokens[part.start];
    if (token?.kind === 'ident') names.push(token.text);
  }
  return names;
}

/** 按 `;` / `,` 之类的记号在括号深度 0 处切分记号区间。 */
function splitTopLevel(
  cursor: TokenCursor,
  from: number,
  to: number,
  separator: string,
): { start: number; end: number }[] {
  const parts: { start: number; end: number }[] = [];
  let start = from;
  let depth = 0;
  for (let i = from; i < to; i++) {
    const token = cursor.tokens[i];
    if (token.kind !== 'punct') continue;
    if (OPEN_PUNCT.includes(token.text)) depth += 1;
    else if (CLOSE_PUNCT.includes(token.text)) depth -= 1;
    else if (depth === 0 && token.text === separator) {
      parts.push({ start, end: i });
      start = i + 1;
    }
  }
  parts.push({ start, end: to });
  return parts;
}

function fallbackDiagnostic(cursor: TokenCursor, cause: unknown): PvDiagnostic {
  const message = cause instanceof Error ? cause.message : String(cause);
  return {
    severity: 'error',
    message: `解析器内部错误，已返回部分结果：${message}`,
    span: cursor.peek().span,
    sourceText: snippetOf(cursor.peek().text),
  };
}
