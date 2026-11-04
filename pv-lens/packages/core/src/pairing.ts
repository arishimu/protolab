/**
 * 意图配对引擎（ticket 12，ADR-0003）。
 *
 * 纯函数 `pairSteps`：`ParseResult` 进 → 跨角色列**设计意图**配对出。连线回答的是「设计上这条
 * `out` 发给这条 `in`」的 A→B 消息流，**不是** Dolev-Yao 可达性——连上不代表消息在攻击者
 * 模型下达得到，那由 ProVerif 的 RESULT 回答。
 *
 * 判定规则（ADR-0003）：
 * 1. 只考虑不同角色、同一信道（词项结构相等）的 `out` → `in`。
 * 2. **类型兼容**：用 `fun` 返回类型、角色参数、`in` 模式类型标注、`free` / `const` 类型做
 *    轻量类型推断。两侧都取到类型时须相等；一侧缺类型则保守不匹配（宁缺毋滥）。
 * 3. **形状匹配**：构造子同名同元数、元组等长逐项递归；`in` 里的裸变量是受类型约束的通配符；
 *    等值模式 `=M` 按值比对。
 * 4. **顺序配对**：仅当协议**恰好两条角色列**时启用。按接收步骤在源码中的顺序，逐个选最早
 *    尚未使用的兼容 `out`，一对一消费。两方教科书协议的消息顺序即源码顺序。
 * 5. 角色列多于两条（或不足两条）时返回空集：多方协议的消息路由无法从 `.pv` 静态推断
 *    （服务器中转、攻击者选择身份等），任何启发式都会画出错误的箭。宁可不画。
 *
 * 术语遵循 CONTEXT.md：角色、信道、消息步骤、未配对步骤。
 */

import type { MessageStep, ParseResult, PvRole, PvTerm } from './parser/model.js';

/** 配对端点：`roleIndex` 为叙事视图角色列下标，`stepIndex` 为该角色列内的步骤下标。 */
export interface StepPairingAnchor {
  roleIndex: number;
  stepIndex: number;
}

/** 一条跨角色列配对：`from` 的 `out` 消息被 `to` 的 `in` 步骤接收。 */
export interface StepPairing {
  from: StepPairingAnchor;
  to: StepPairingAnchor;
}

/**
 * 叙事视图的角色列角色顺序（与 web 布局同一规则，配对下标据此定义）：
 * 有命名进程时用命名进程（主进程是启动处、不是参与方）；否则退回内联主进程伪角色。
 */
export function narrativeRoleOrder(result: ParseResult): readonly PvRole[] {
  if (result.roles.length > 0) return result.roles;
  return result.mainProcess === null ? [] : [result.mainProcess];
}

/** 词项结构相等（信道判定用；名字与变量按同类同名，不跨类混同）。 */
function termEquals(a: PvTerm, b: PvTerm): boolean {
  switch (a.kind) {
    case 'variable':
      return b.kind === 'variable' && a.name === b.name;
    case 'name':
      return b.kind === 'name' && a.name === b.name;
    case 'application':
      return (
        b.kind === 'application' &&
        a.functor === b.functor &&
        a.args.length === b.args.length &&
        a.args.every((arg, index) => termEquals(arg, b.args[index]))
      );
    case 'tuple':
      return (
        b.kind === 'tuple' &&
        a.items.length === b.items.length &&
        a.items.every((item, index) => termEquals(item, b.items[index]))
      );
    case 'conditional':
      return (
        b.kind === 'conditional' &&
        termEquals(a.thenTerm, b.thenTerm) &&
        termEquals(a.elseTerm, b.elseTerm)
      );
    case 'equality':
      return b.kind === 'equality' && termEquals(a.term, b.term);
    case 'unknown':
      return b.kind === 'unknown' && a.text === b.text;
  }
}

/** 等值模式 `=M` 的值比对：名字 / 变量要求同名，构造子与元组逐项递归。 */
function termValueEquals(out: PvTerm, value: PvTerm): boolean {
  switch (value.kind) {
    case 'variable':
      return (out.kind === 'variable' || out.kind === 'name') && out.name === value.name;
    case 'name':
      return (out.kind === 'name' || out.kind === 'variable') && out.name === value.name;
    case 'application':
      return (
        out.kind === 'application' &&
        out.functor === value.functor &&
        out.args.length === value.args.length &&
        out.args.every((arg, index) => termValueEquals(arg, value.args[index]))
      );
    case 'tuple':
      return (
        out.kind === 'tuple' &&
        out.items.length === value.items.length &&
        out.items.every((item, index) => termValueEquals(item, value.items[index]))
      );
    case 'conditional':
      return termValueEquals(out, value.thenTerm) && termValueEquals(out, value.elseTerm);
    case 'equality':
      return termValueEquals(out, value.term);
    case 'unknown':
      return false;
  }
}

/** 类型推断的静态环境：`fun` 返回类型 + `free` / `const` 具名类型 + 每角色的参数与新鲜名。 */
interface TypeContext {
  /** 构造子名 → 返回类型。 */
  returnTypes: ReadonlyMap<string, string>;
  /** `free` / `const` 名 → 类型。 */
  namedTypes: ReadonlyMap<string, string>;
  /** 角色下标 → （参数名 → 类型）。 */
  roleParams: readonly ReadonlyMap<string, string>[];
  /** 角色下标 → （`new` 新鲜名 → 类型）。 */
  roleFresh: readonly ReadonlyMap<string, string>[];
}

function buildTypeContext(result: ParseResult, roles: readonly PvRole[]): TypeContext {
  const returnTypes = new Map<string, string>();
  for (const fn of result.functions) returnTypes.set(fn.name, fn.returnType);

  const namedTypes = new Map<string, string>();
  for (const name of result.names) {
    if (name.typeName !== undefined) namedTypes.set(name.name, name.typeName);
  }

  const roleParams = roles.map((role) => {
    const params = new Map<string, string>();
    for (const parameter of role.parameters) {
      if (parameter.typeName !== undefined) params.set(parameter.name, parameter.typeName);
    }
    return params;
  });

  const roleFresh = roles.map((role) => {
    const fresh = new Map<string, string>();
    for (const step of role.steps) {
      for (const name of step.annotations.freshNames) {
        if (name.typeName !== undefined) fresh.set(name.name, name.typeName);
      }
    }
    return fresh;
  });

  return { returnTypes, namedTypes, roleParams, roleFresh };
}

/**
 * D7：词项在指定角色下的推断类型。供人工配对合成的类型不符警告使用（低频调用，
 * 每次重建类型上下文可接受）；取不到类型时返回 undefined，由调用方保守处理。
 */
export function inferredTypeOf(result: ParseResult, term: PvTerm, roleIndex: number): string | undefined {
  return inferType(term, roleIndex, buildTypeContext(result, narrativeRoleOrder(result)));
}

/** 词项的轻量类型：构造子取返回类型，具名叶子取声明类型，变量取标注或角色参数类型。 */
function inferType(term: PvTerm, roleIndex: number, ctx: TypeContext): string | undefined {
  switch (term.kind) {
    case 'variable':
      // C15：`new n: bitstring` 之后对 n 的引用继承该类型（次级回退：先角色参数，再本角色新鲜名）。
      return term.typeName ?? ctx.roleParams[roleIndex]?.get(term.name) ?? ctx.roleFresh[roleIndex]?.get(term.name);
    case 'name':
      return ctx.namedTypes.get(term.name) ?? ctx.roleFresh[roleIndex]?.get(term.name);
    case 'application':
      return ctx.returnTypes.get(term.functor);
    case 'tuple':
      return undefined;
    case 'conditional':
      return inferType(term.thenTerm, roleIndex, ctx) ?? inferType(term.elseTerm, roleIndex, ctx);
    case 'equality':
      return inferType(term.term, roleIndex, ctx);
    case 'unknown':
      return undefined;
  }
}

/**
 * 类型门槛：两侧都取到类型时须相等；一侧缺类型则保守不匹配。
 *
 * 对元组 / 未标注词项 inferType 返回 undefined，此时由形状匹配逐项递归把关；只有在
 * 「一侧确实带类型、另一侧取不到」时才用这里的不匹配兜底，宁可少连也不误配。
 */
function typeCompatible(
  outType: string | undefined,
  inType: string | undefined,
): boolean {
  if (outType !== undefined && inType !== undefined) return outType === inType;
  return outType === undefined && inType === undefined;
}

/**
 * 发送词项 `out` 能否按接收模式 `pattern` 匹配（设计意图语义）。
 *
 * 先过类型门槛，再按形状递归：构造子同名同元数、元组等长；模式里的裸变量是受类型约束的
 * 通配符；等值模式 `=M` 按值比对；解析不了的词项不匹配。
 */
function matchesIntent(
  out: PvTerm,
  pattern: PvTerm,
  outRoleIndex: number,
  inRoleIndex: number,
  ctx: TypeContext,
): boolean {
  if (!typeCompatible(inferType(out, outRoleIndex, ctx), inferType(pattern, inRoleIndex, ctx))) {
    return false;
  }

  switch (pattern.kind) {
    case 'variable':
      return true;
    case 'name':
      return out.kind === 'name' && out.name === pattern.name;
    case 'equality':
      return termValueEquals(out, pattern.term);
    case 'conditional':
      return false;
    case 'application':
      return (
        out.kind === 'application' &&
        out.functor === pattern.functor &&
        out.args.length === pattern.args.length &&
        out.args.every((arg, index) =>
          matchesIntent(arg, pattern.args[index], outRoleIndex, inRoleIndex, ctx),
        )
      );
    case 'tuple':
      return (
        out.kind === 'tuple' &&
        out.items.length === pattern.items.length &&
        out.items.every((item, index) =>
          matchesIntent(item, pattern.items[index], outRoleIndex, inRoleIndex, ctx),
        )
      );
    case 'unknown':
      return false;
  }
}

interface StepEndpoint extends StepPairingAnchor {
  step: MessageStep;
}

function endpointKey(endpoint: StepPairingAnchor): string {
  return `${endpoint.roleIndex}:${endpoint.stepIndex}`;
}

/** 两条步骤能否配成一条候选边：不同角色 + 同一信道 + 类型与形状兼容。 */
function isCandidate(
  out: StepEndpoint,
  incoming: StepEndpoint,
  ctx: TypeContext,
): boolean {
  return (
    out.roleIndex !== incoming.roleIndex &&
    termEquals(out.step.channel, incoming.step.channel) &&
    matchesIntent(out.step.term, incoming.step.term, out.roleIndex, incoming.roleIndex, ctx)
  );
}

/** 端点「先后」的确定性排序：先角色列，再步骤（两方协议里角色列内步骤顺序即消息顺序）。 */
function compareEndpoints(a: StepEndpoint, b: StepEndpoint): number {
  return a.roleIndex - b.roleIndex || a.stepIndex - b.stepIndex;
}

/**
 * 设计意图配对：返回两方协议里按源码顺序一对一消费的 `out` → `in` 配对，按 `out` 顺序排列。
 * 角色列数不等于 2 时返回空集（ADR-0003：多方消息路由不可静态推断，不画）。
 */
export function pairSteps(result: ParseResult): readonly StepPairing[] {
  const roles = narrativeRoleOrder(result);
  if (roles.length !== 2) return [];

  const outs: StepEndpoint[] = [];
  const ins: StepEndpoint[] = [];
  roles.forEach((role, roleIndex) => {
    role.steps.forEach((step, stepIndex) => {
      const endpoint: StepEndpoint = { roleIndex, stepIndex, step };
      (step.direction === 'out' ? outs : ins).push(endpoint);
    });
  });

  const ctx = buildTypeContext(result, roles);
  const usedOuts = new Set<string>();
  const usedIns = new Set<string>();
  const pairings: StepPairing[] = [];

  for (const incoming of ins) {
    const inKey = endpointKey(incoming);
    if (usedIns.has(inKey)) continue;

    const candidates = outs
      .filter((out) => !usedOuts.has(endpointKey(out)) && isCandidate(out, incoming, ctx))
      .sort(compareEndpoints);
    if (candidates.length === 0) continue;

    // 两方协议：按消息顺序，接收端认领**最早**尚未使用的兼容 out。选择是确定性的。
    const chosen = candidates[0];
    usedOuts.add(endpointKey(chosen));
    usedIns.add(inKey);
    pairings.push({
      from: { roleIndex: chosen.roleIndex, stepIndex: chosen.stepIndex },
      to: { roleIndex: incoming.roleIndex, stepIndex: incoming.stepIndex },
    });
  }

  pairings.sort(
    (a, b) => a.from.roleIndex - b.from.roleIndex || a.from.stepIndex - b.from.stepIndex,
  );
  return pairings;
}
