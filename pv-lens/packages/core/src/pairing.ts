/**
 * 保守配对引擎（ticket 06，spec.md「core 公开能力」第 4 条）。
 *
 * 纯函数 `pairSteps`：`ParseResult` 进 → 跨泳道配对判定出。它只回答「哪条 out 与哪条 in
 * 在结构上可确定地对应」，连线形态由渲染端决定（见 web 的 `buildNarrativeLayout`）。
 *
 * 纪律：**只在可确定时连线，任何歧义一律不连**（画对优先于画全）。具体地：
 * 1. 只考虑不同角色之间、同一信道（词项结构相等）的 `out` → `in`。
 * 2. 接收模式必须是「可确定模式」——裸变量 `in(c, x)` 收到任何消息都成立，不参与配对；
 *    元组 / 构造子应用 / 等值模式 `=M` 的形状或常量才具有区分力。
 * 3. 发送词项要与接收模式结构匹配（构造子同名同元数、元组等长；模式里的变量是通配符，
 *    名字必须同名，等值模式 `=M` 按值比对）。
 * 4. 匹配还必须**双向唯一**：该 out 只匹配一条 in，且那条 in 只匹配该 out。
 *    两个候选就一律不连——Dolev-Yao 公共信道下攻击者可注入/重放，非唯一即不可信。
 *
 * 在四个真实样例上，接收模式普遍是裸变量或彼此同形，因此本引擎大概率产出零条边；
 * 这是预期结果，机制与「不误配」保证才是本票的交付。
 *
 * 术语遵循 CONTEXT.md：角色、信道、消息步骤、未配对步骤。
 */

import type { MessageStep, ParseResult, PvRole, PvTerm } from './parser/model.js';

/** 配对端点：`roleIndex` 为叙事视图泳道下标，`stepIndex` 为该泳道内的步骤下标。 */
export interface StepPairingAnchor {
  roleIndex: number;
  stepIndex: number;
}

/** 一条跨泳道配对：`from` 的 `out` 消息被 `to` 的 `in` 步骤接收。 */
export interface StepPairing {
  from: StepPairingAnchor;
  to: StepPairingAnchor;
}

/**
 * 叙事视图的泳道角色顺序（与 web 布局同一规则，配对下标据此定义）：
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
    case 'equality':
      return b.kind === 'equality' && termEquals(a.term, b.term);
    case 'unknown':
      return b.kind === 'unknown' && a.text === b.text;
  }
}

/**
 * 接收模式是否有区分力：裸变量 / 解析不了的词项一律不可确定（收到任何东西都成立）。
 * 元组与构造子应用靠形状区分，等值模式靠常量值区分，都算可确定。
 */
function isDeterminatePattern(pattern: PvTerm): boolean {
  return pattern.kind !== 'variable' && pattern.kind !== 'unknown';
}

/**
 * 发送词项 `out` 能否按接收模式 `pattern` 匹配。
 * 模式里的变量是通配符；名字必须同名；元组 / 构造子应用要求形状一致后逐项递归。
 */
function matchesPattern(out: PvTerm, pattern: PvTerm): boolean {
  switch (pattern.kind) {
    case 'variable':
      return true;
    case 'name':
      return out.kind === 'name' && out.name === pattern.name;
    case 'application':
      return (
        out.kind === 'application' &&
        out.functor === pattern.functor &&
        out.args.length === pattern.args.length &&
        out.args.every((arg, index) => matchesPattern(arg, pattern.args[index]))
      );
    case 'tuple':
      return (
        out.kind === 'tuple' &&
        out.items.length === pattern.items.length &&
        out.items.every((item, index) => matchesPattern(item, pattern.items[index]))
      );
    case 'equality':
      return matchesValue(out, pattern.term);
    case 'unknown':
      return false;
  }
}

/**
 * 等值模式 `=M` 的值比对：`M` 里的名字 / 变量按同名判定（不是通配符——`=Na` 要求收到的
 * 正是该角色绑定的 `Na`），构造子与元组逐项递归。
 */
function matchesValue(out: PvTerm, value: PvTerm): boolean {
  switch (value.kind) {
    case 'variable':
    case 'name':
      return (out.kind === 'variable' || out.kind === 'name') && out.name === value.name;
    case 'application':
      return (
        out.kind === 'application' &&
        out.functor === value.functor &&
        out.args.length === value.args.length &&
        out.args.every((arg, index) => matchesValue(arg, value.args[index]))
      );
    case 'tuple':
      return (
        out.kind === 'tuple' &&
        out.items.length === value.items.length &&
        out.items.every((item, index) => matchesValue(item, value.items[index]))
      );
    case 'equality':
      return matchesValue(out, value.term);
    case 'unknown':
      return out.kind === 'unknown' && out.text === value.text;
  }
}

interface StepEndpoint {
  roleIndex: number;
  stepIndex: number;
  step: MessageStep;
}

/** 两条步骤能否配成一条候选边：不同角色 + 同一信道 + 可确定模式 + 结构匹配。 */
function isCandidate(out: StepEndpoint, incoming: StepEndpoint): boolean {
  return (
    out.roleIndex !== incoming.roleIndex &&
    isDeterminatePattern(incoming.step.term) &&
    termEquals(out.step.channel, incoming.step.channel) &&
    matchesPattern(out.step.term, incoming.step.term)
  );
}

/**
 * 保守配对：返回**双向唯一**的 out → in 配对，按 `out` 在源码中的顺序。
 *
 * 「双向唯一」= 该 out 恰好匹配一条 in，且那条 in 恰好匹配该 out；任一方向多于一个候选
 * 就整条丢弃（保持未配对标注）。返回的下标对应 `narrativeRoleOrder(result)` 的泳道顺序，
 * 可原样喂给 web 的 `buildNarrativeLayout({ pairings })`。
 */
export function pairSteps(result: ParseResult): readonly StepPairing[] {
  const outs: StepEndpoint[] = [];
  const ins: StepEndpoint[] = [];

  narrativeRoleOrder(result).forEach((role, roleIndex) => {
    role.steps.forEach((step, stepIndex) => {
      const endpoint: StepEndpoint = { roleIndex, stepIndex, step };
      (step.direction === 'out' ? outs : ins).push(endpoint);
    });
  });

  const pairings: StepPairing[] = [];
  for (const out of outs) {
    const compatibleIns = ins.filter((incoming) => isCandidate(out, incoming));
    if (compatibleIns.length !== 1) continue;

    const target = compatibleIns[0];
    const compatibleOuts = outs.filter((candidate) => isCandidate(candidate, target));
    if (compatibleOuts.length !== 1) continue;

    pairings.push({
      from: { roleIndex: out.roleIndex, stepIndex: out.stepIndex },
      to: { roleIndex: target.roleIndex, stepIndex: target.stepIndex },
    });
  }
  return pairings;
}
