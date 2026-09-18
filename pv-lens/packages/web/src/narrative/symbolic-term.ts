/**
 * 词项符号化渲染（ticket 04）：把 core 语义模型的 `PvTerm` 串成密码学惯用记法。
 *
 * 纯函数，无 DOM 依赖，渲染黄金断言直接对它写（不测像素）。映射表见 `CRYPTO_NOTATION`：
 * 表内命中的构造子按惯用记法渲染，其余（含参数个数不符的）回退为函数调用写法
 * `functor(a, b)`。参数一律递归渲染；元组按 `(a, b, c)`（逗号后一个空格）渲染，
 * 但作为密码学构造子的消息参数时按 spec 铺开为 `{Na,A}pkB`（密码括号自带分组，不再多套括号）。
 *
 * 术语遵循 CONTEXT.md 的「词项符号化渲染」：只做构造子 → 记法的映射，
 * 不改变词项的语义结构。
 */

import type { ApplicationTerm, PvTerm } from '@pv-lens/core';

/** 惯用记法模板：`arity` 为期望参数个数，`render` 收到已递归渲染的参数串。 */
interface NotationTemplate {
  arity: number;
  render: (args: readonly string[]) => string;
}

/**
 * 构造子 → 密码学惯用记法的映射表（大小写敏感）。
 * 二元密码学构造子的 `m` 与 `k` 之间不加空格（`{m}k`，不是 `{m} k`）。
 */
const CRYPTO_NOTATION: Readonly<Record<string, NotationTemplate>> = {
  encrypt: { arity: 2, render: ([m, k]) => `{${m}}${k}` },
  aenc: { arity: 2, render: ([m, k]) => `{${m}}${k}` },
  senc: { arity: 2, render: ([m, k]) => `{|${m}|}${k}` },
  sencrypt: { arity: 2, render: ([m, k]) => `{|${m}|}${k}` },
  enc: { arity: 2, render: ([m, k]) => `{|${m}|}${k}` },
  sign: { arity: 2, render: ([m, k]) => `[${m}]${k}` },
  hash: { arity: 1, render: ([m]) => `H(${m})` },
  h: { arity: 1, render: ([m]) => `H(${m})` },
};

/**
 * 密码学括号自带分组：消息参数是元组时直接铺开成 `a,b`，不再多套一层 `(a, b)`。
 * 于是 spec 的 `encrypt((Na,A),pkB)` 渲染为 `{Na,A}pkB`（而非 `{(Na, A)}pkB`）。
 * 只对模板命中的构造子的「消息」参数（第一个参数）这么做；其它参数与未知构造子照常。
 */
function renderMessageArg(term: PvTerm): string {
  if (term.kind === 'tuple') return term.items.map(renderTerm).join(',');
  return renderTerm(term);
}

function renderApplication(term: ApplicationTerm): string {
  const template = Object.prototype.hasOwnProperty.call(CRYPTO_NOTATION, term.functor)
    ? CRYPTO_NOTATION[term.functor]
    : undefined;
  if (template !== undefined && term.args.length === template.arity) {
    const args = term.args.map((arg, index) => (index === 0 ? renderMessageArg(arg) : renderTerm(arg)));
    return template.render(args);
  }
  // 未知构造子（pk / spk / nonce_to_bitstring / messtermI …）与参数个数不符时回退函数调用写法。
  return `${term.functor}(${term.args.map(renderTerm).join(', ')})`;
}

/**
 * 把一个词项渲染为符号化字符串。
 *
 * - `variable` / `name` → 名字（类型标注不进字符串，由视图另作 `title` 提示）。
 * - `tuple` → `(a, b, c)`。
 * - `application` → 按 `CRYPTO_NOTATION` 映射，未命中回退 `functor(a, b)`。
 * - `equality` → `=M`（如 `=Na`）。
 * - `unknown` → 原文。
 */
export function renderTerm(term: PvTerm): string {
  switch (term.kind) {
    case 'variable':
    case 'name':
      return term.name;
    case 'tuple':
      return `(${term.items.map(renderTerm).join(', ')})`;
    case 'application':
      return renderApplication(term);
    case 'equality':
      return `=${renderTerm(term.term)}`;
    case 'unknown':
      return term.text;
  }
}

/** 图例条目：一条惯用记法 + 触发它的构造子名（与 `CRYPTO_NOTATION` 同源，不会两处漂移）。 */
export interface NotationLegendEntry {
  notation: string;
  functors: readonly string[];
}

function buildNotationLegend(): readonly NotationLegendEntry[] {
  const byNotation = new Map<string, { notation: string; functors: string[] }>();
  for (const [functor, template] of Object.entries(CRYPTO_NOTATION)) {
    const args = template.arity === 1 ? ['m'] : ['m', 'k'];
    const notation = template.render(args);
    const entry = byNotation.get(notation) ?? { notation, functors: [] };
    entry.functors.push(functor);
    byNotation.set(notation, entry);
  }
  return [...byNotation.values()];
}

/** 图例用的惯用记法清单（按映射表的声明顺序，同一记法的构造子合并为一条）。 */
export const NOTATION_LEGEND: readonly NotationLegendEntry[] = buildNotationLegend();
