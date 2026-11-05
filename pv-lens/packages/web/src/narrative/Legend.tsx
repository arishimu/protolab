/**
 * 规范叙事视图的图例（ticket 04 建立、ticket 11 改为按画布内容过滤）。
 *
 * 只显示当前画布实际出现的记法（F1）：条目集合由 `legendContentFor` 纯函数从布局与
 * 解析结果推导，可独立测试；符号化记法部分与 core 的 `NOTATION_LEGEND` 同源。
 * 配对口径与 ADR-0003 一致：连线是设计意图，不是可达性。
 * C1/C3/P3-F2：方向条目不出现画布中不存在的字形；① 有专门条目；等值复制有虚线样例；
 * 记号一律用 code 元素，不在文案中写反引号。
 */

import { NOTATION_LEGEND, narrativeRoleOrder } from '@pv-lens/core';
import type { Condition, ParseResult, PvTerm } from '@pv-lens/core';
import type { StructuredNarrativeLayout, ValuePattern } from './structured-layout';

/** 图例条目键：每种记法一条；符号化记法单列（与 NOTATION_LEGEND 同源）。 */
export type LegendKey =
  | 'functor-fallback'
  | 'tuple'
  | 'equality'
  | 'value-block'
  | 'method-box'
  | 'wire-chip'
  | 'derived-chip'
  | 'unpaired'
  | 'message-pillar'
  | 'direction'
  | 'channel-order'
  | 'scope-flags'
  | 'event'
  | 'branch-lane'
  | 'local-ops'
  | 'crypto-group'
  | 'density-fold'
  | 'exchange-segment'
  | 'diagnostics';

/** 本图实际出现的消息序号 token（09：图例与画布共用消息柱的 M 序号与色）。 */
export interface LegendMessageToken {
  sequence: number;
  color: string;
  termText: string;
}

/** 本图实际出现的值身份 token（09：值序号 + 绑定名 + 值身份色，与方块角标同源）。 */
export interface LegendValueToken {
  ordinal: number;
  label: string;
  color: string;
  pattern: ValuePattern;
}

export const VALUE_PATTERN_LABELS: Record<ValuePattern, string> = {
  none: '空白',
  slash: '斜线',
  backslash: '反斜线',
  dots: '点阵',
};

/** R07：值身份清单超过该数量时默认折叠为独立面板，标题显示数量；少于时不折叠。 */
export const LEGEND_VALUE_FOLD_THRESHOLD = 12;

export interface LegendContent {
  keys: readonly LegendKey[];
  notation: readonly { notation: string; functors: readonly string[] }[];
  messages: readonly LegendMessageToken[];
  values: readonly LegendValueToken[];
  /** 本图是否出现等值复制方块（C3：出现时图例加虚线样例）。 */
  hasEqualityCopy: boolean;
  /** 是否单角色模型（C1：未配对说明按角色数分流）。 */
  singleRole: boolean;
}

/** 从布局与解析结果推导应显示的图例条目（纯函数，供组件与测试共用）。 */
export function legendContentFor(layout: StructuredNarrativeLayout, result: ParseResult): LegendContent {
  const usage = collectTermUsage(result);
  const knownFunctors = new Set(NOTATION_LEGEND.flatMap((entry) => entry.functors));
  const keys: LegendKey[] = [];
  if ([...usage.functors].some((functor) => !knownFunctors.has(functor))) keys.push('functor-fallback');
  if (usage.tuples > 0) keys.push('tuple');
  if (usage.equalities > 0) keys.push('equality');
  if (layout.valueBlocks.length > 0) keys.push('value-block');
  if (layout.methods.length > 0) keys.push('method-box');
  if (layout.chips.some((chip) => chip.kind === 'wire')) keys.push('wire-chip');
  if (layout.chips.some((chip) => chip.kind !== 'wire')) keys.push('derived-chip');
  if (layout.endpoints.some((endpoint) => endpoint.unpaired)) keys.push('unpaired');
  if (layout.pillars.length > 0) keys.push('message-pillar');
  if (layout.endpoints.length > 0) keys.push('direction');
  if (layout.columns.some((column) => column.kind === 'channel')) keys.push('channel-order');
  if (layout.columns.some((column) => column.replicated || column.parallel)) keys.push('scope-flags');
  if (layout.nodes.some((node) => node.kind === 'event')) keys.push('event');
  if (layout.nodes.some((node) => node.kind === 'branch')) keys.push('branch-lane');
  if (layout.nodes.some((node) => node.kind === 'local')) keys.push('local-ops');
  if (layout.cryptoGroups.length > 0) keys.push('crypto-group');
  if (layout.operatorFolds.length > 0) keys.push('density-fold');
  if (layout.exchangeSegmentBands.length > 0) keys.push('exchange-segment');
  if (result.diagnostics.length > 0) keys.push('diagnostics');
  // 实际身份对照（09）：消息按柱序 M1..Mn；值按绑定全局序去重（首现即全部信息）。
  const messages = layout.pillars.map((pillar) => ({ sequence: pillar.sequence, color: pillar.color, termText: pillar.termText }));
  const valueByBinding = new Map<string, LegendValueToken>();
  layout.valueBlocks.forEach((block) => {
    if (!valueByBinding.has(block.bindingId)) {
      valueByBinding.set(block.bindingId, { ordinal: block.ordinal, label: block.label, color: block.color, pattern: block.pattern });
    }
  });
  const values = [...valueByBinding.values()].sort((a, b) => a.ordinal - b.ordinal);
  return {
    keys,
    notation: NOTATION_LEGEND.filter((entry) => entry.functors.some((functor) => usage.functors.has(functor))),
    messages,
    values,
    hasEqualityCopy: layout.valueBlocks.some((block) => block.occurrence === 'equality'),
    singleRole: narrativeRoleOrder(result).length === 1,
  };
}

interface TermUsage {
  functors: Set<string>;
  tuples: number;
  equalities: number;
}

function collectTermUsage(result: ParseResult): TermUsage {
  const usage: TermUsage = { functors: new Set(), tuples: 0, equalities: 0 };
  const walkTerm = (term: PvTerm | undefined): void => {
    if (term === undefined) return;
    switch (term.kind) {
      case 'application':
        usage.functors.add(term.functor);
        term.args.forEach(walkTerm);
        return;
      case 'tuple':
        usage.tuples += 1;
        term.items.forEach(walkTerm);
        return;
      case 'equality':
        usage.equalities += 1;
        walkTerm(term.term);
        return;
      case 'conditional':
        walkCondition(term.condition);
        walkTerm(term.thenTerm);
        walkTerm(term.elseTerm);
        return;
      default:
        return;
    }
  };
  const walkCondition = (condition: Condition | undefined): void => {
    if (condition === undefined) return;
    if (condition.kind === 'comparison') {
      walkTerm(condition.left);
      walkTerm(condition.right);
      return;
    }
    if (condition.kind === 'compound') condition.clauses.forEach(walkCondition);
  };
  for (const role of narrativeRoleOrder(result)) {
    for (const item of role.items) {
      if (item.kind === 'message') {
        walkTerm(item.endpoint.term);
        walkTerm(item.endpoint.channel);
      } else if (item.kind === 'event') {
        item.args.forEach(walkTerm);
      } else if (item.kind === 'branch') {
        walkCondition(item.guard);
      } else if (item.kind === 'local') {
        walkTerm(item.term);
        walkTerm(item.pattern);
      }
    }
  }
  return usage;
}

/** 图例内的实际身份 token 列表（09）：消息与值共用同一渲染（色样 + token 文本）。 */
function LegendTokenList({
  tokens,
  ariaLabel,
}: {
  tokens: readonly { key: string; text: string; color: string }[];
  ariaLabel: string;
}) {
  if (tokens.length === 0) return null;
  return (
    <span className="legend-token-list" aria-label={ariaLabel}>
      {tokens.map((token) => (
        <span key={token.key} className="legend-token">
          <span className="legend-token-swatch" style={{ background: token.color }} aria-hidden="true" />
          {token.text}
        </span>
      ))}
    </span>
  );
}

export function Legend({ layout, result }: { layout: StructuredNarrativeLayout; result: ParseResult }) {
  const content = legendContentFor(layout, result);
  const present = new Set(content.keys);
  return (
    <div className="narrative-legend" aria-label="图例">
      <h4>图例</h4>
      {content.keys.length === 0 && content.notation.length === 0 && content.messages.length === 0 && content.values.length === 0 ? (
        <p className="hint">当前画布没有需要解释的记法。</p>
      ) : (
        <dl>
          {content.notation.map((entry) => (
            <div className="legend-item" key={entry.notation}>
              <dt>
                <code>{entry.notation}</code>
              </dt>
              <dd>构造子 {entry.functors.join(' / ')} 的密码学惯用记法</dd>
            </div>
          ))}
          {present.has('functor-fallback') && (
            <div className="legend-item">
              <dt>
                <code>functor(a, b)</code>
              </dt>
              <dd>其它构造子（含 pk / spk / nonce_to_bitstring / messtermI 等自定义构造子）回退为函数调用写法</dd>
            </div>
          )}
          {present.has('tuple') && (
            <div className="legend-item">
              <dt>
                <code>(a, b, c)</code>
              </dt>
              <dd>元组</dd>
            </div>
          )}
          {present.has('equality') && (
            <div className="legend-item">
              <dt>
                <code>=M</code>
              </dt>
              <dd>等值模式：接收到的词项必须等于 M</dd>
            </div>
          )}
          {present.has('value-block') && (
            <div className="legend-item">
              <dt>
                <span className="legend-value-block">值</span>
              </dt>
              <dd>
                值方块（含 <code>new</code> 与角色参数引入的绑定）：颜色由绑定身份稳定生成，一个绑定一种颜色，同色再现表示同一绑定的引用或等值复制；方块右缘数字是值身份序号，左缘图案按序号循环（空白、斜线、反斜线、点阵），作为权威标识；完整清单见下方“本图值序号”
                {content.hasEqualityCopy && (
                  <>
                    ；<span className="legend-value-block legend-value-block--dashed">虚线边框</span>表示等值复制 <code>=M</code>，与实线方块共享同一颜色，表示同一绑定的另一次出现
                  </>
                )}
              </dd>
            </div>
          )}
          {present.has('method-box') && (
            <div className="legend-item">
              <dt>
                <span className="legend-method-box">方法</span>
              </dt>
              <dd>方法盒：竖向梯形表示解构、横向表示构造、<code>?:</code> 表示产出单个值的条件选择；输入取自上方同色值方块，输出为下方值块；<code>=</code> / <code>∈</code> 检查盒无输出</dd>
            </div>
          )}
          {present.has('crypto-group') && (
            <div className="legend-item">
              <dt>
                <span className="legend-crypto-group">▸ 组</span>
              </dt>
              <dd>
                密码操作组（语义折叠）：把一次密码操作的方法盒与输入/输出值收成一行摘要，摘要列出种类、方向、关键参数、密钥身份与隐藏计数；实线矩形为构造、虚线矩形为解构，暖色描边表示用户声明。它区别于密度折叠（另一条折叠条），未识别函数不建组也不折叠。
              </dd>
            </div>
          )}
          {present.has('density-fold') && (
            <div className="legend-item">
              <dt>
                <span className="legend-density-fold">▸ 算子簇</span>
              </dt>
              <dd>
                密度折叠：角色内连续多个算子步骤收成一格，按算子数量自动判断；展开状态与密码操作组互相独立，折叠格下方同样保留虚线幽灵值块。
              </dd>
            </div>
          )}
          {present.has('exchange-segment') && (
            <div className="legend-item">
              <dt>
                <span className="legend-exchange-segment">▾ 交换段</span>
              </dt>
              <dd>
                交换段：双线边框与边界标记圈住一段连续、因果凸的完整消息；段头列出消息区间、角色、信道与未配对/分支/冲突计数。折叠只隐藏段体，段头与跨段边保留；跨段边沿段框外侧 gutter 绕行。
              </dd>
            </div>
          )}
          {present.has('wire-chip') && (
            <div className="legend-item">
              <dt>
                <span className="legend-wire-chip">线上词项</span>
              </dt>
              <dd>未配对消息放上信道的完整词项（橙色描边），画在该步骤的自身角色列里并压在消息线上；有值层时置于值层下方</dd>
            </div>
          )}
          {present.has('derived-chip') && (
            <div className="legend-item">
              <dt>
                <span className="legend-wire-chip">派生</span>
              </dt>
              <dd>虚线芯片：解构产出的未绑定中间值、条件、表模式，不产生新的值身份</dd>
            </div>
          )}
          {present.has('unpaired') && (
            <div className="legend-item">
              <dt>
                <span className="legend-unpaired-dot" aria-hidden="true" /> 未配对
              </dt>
              <dd>
                {content.singleRole
                  ? '单角色模型没有跨角色收发关系，消息步骤按未配对呈现；未配对不代表路由不存在。'
                  : '虚线为该步骤的消息线：一端在角色生命线，另一端的橙色空心圆点标记词项抵达的信道总线。多方协议不自动连线（画对优先于画全）；自动配对仅适用于两方协议。'}
              </dd>
            </div>
          )}
          {present.has('message-pillar') && (
            <div className="legend-item">
              <dt>
                <span className="legend-message-pillar">M1</span>
              </dt>
              <dd>
                消息柱：设计意图上的 out → in，两端连线、词项只在信道帧里写一遍（帧内色带标注接收绑定），同色消息柱为同一身份。消息线型按 M 序号循环：实线、短虚线、点线；序号为权威标识。连线不代表消息在攻击者模型下达得到，安全性以 ProVerif 结论为准
                <LegendTokenList
                  ariaLabel="本图消息序号"
                  tokens={content.messages.map((token) => ({
                    key: `m-${String(token.sequence)}`,
                    text: `M${String(token.sequence)} ${token.termText}`,
                    color: token.color,
                  }))}
                />
              </dd>
            </div>
          )}
          {present.has('direction') && (
            <div className="legend-item">
              <dt>箭头方向</dt>
              <dd>箭头指向抵达目标：发送段指向信道，接收段指向接收端；未配对端以空心圆点标记，表示路由未确定</dd>
            </div>
          )}
          {present.has('channel-order') && (
            <div className="legend-item">
              <dt>
                <code>①</code> 信道序号
              </dt>
              <dd>信道列标题中的 ① 等序号字形按水平序列从左到右编号，用于在多信道模型中指认信道；超过五个信道时以 (n) 形式显示；信道边框线型按同一位置循环（实线、长虚线、点线），灰度下可按线型区分</dd>
            </div>
          )}
          {present.has('scope-flags') && (
            <div className="legend-item">
              <dt>
                <span className="legend-chip">!</span> / <span className="legend-chip">|</span>
              </dt>
              <dd><code>!</code> 表示该角色处于复制作用域（可并发多会话），<code>|</code> 表示处于并行组合内</dd>
            </div>
          )}
          {present.has('event') && (
            <div className="legend-item">
              <dt>
                <code>event …</code>
              </dt>
              <dd>事件标注（对应性查询引用的协议位置）：默认中性标记；选中查询后该查询的前提画菱形、结论画旗标</dd>
            </div>
          )}
          {present.has('branch-lane') && (
            <div className="legend-item">
              <dt>
                <span className="legend-branch-tick">if …</span>
              </dt>
              <dd>分支：守卫排成等值检查行；生命线旁的虚线竖轨是臂道（then / else），<code>▾</code> 开关折叠整个分支、折叠条显示守卫与隐藏步数</dd>
            </div>
          )}
          {present.has('local-ops') && (
            <div className="legend-item">
              <dt>
                <code>let / get / insert</code>
              </dt>
              <dd><code>let</code> 显示为方法盒（输入在上、输出在下）；<code>get</code> 以表模式 <code>∈</code> 检查盒呈现；<code>insert</code> 是生命线上的本地步骤</dd>
            </div>
          )}
          {present.has('diagnostics') && (
            <div className="legend-item">
              <dt>
                <span className="legend-chip legend-chip--degraded">降级诊断</span>{' '}
                <span className="legend-chip legend-chip--error">错误诊断</span>
              </dt>
              <dd>解析器的降级/错误诊断以原文标注卡片入图，按源码位置归入角色列；降级语句本身以虚线琥珀边框胶囊按原文保留，与 insert 的浅黄实线胶囊可区分</dd>
            </div>
          )}
        </dl>
      )}
      {/* R07：值身份清单移出记法网格，作为独立折叠面板跨满全宽；超过阈值默认折叠，标题显示数量。 */}
      {content.values.length > 0 && (
        <details className="legend-value-fold" open={content.values.length <= LEGEND_VALUE_FOLD_THRESHOLD}>
          <summary>本图值序号（{String(content.values.length)}）</summary>
          <LegendTokenList
            ariaLabel="本图值序号"
            tokens={content.values.map((token) => ({
              key: `v-${String(token.ordinal)}`,
              text: `${String(token.ordinal)} ${token.label} · ${VALUE_PATTERN_LABELS[token.pattern]}`,
              color: token.color,
            }))}
          />
        </details>
      )}
    </div>
  );
}
