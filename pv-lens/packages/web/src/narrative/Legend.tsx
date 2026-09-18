/**
 * 规范叙事视图的图例（ticket 04）：解释图上出现的各记法。
 *
 * 符号化词项部分与 core 的 `renderTerm` / `NOTATION_LEGEND` 映射表同源，
 * 不在两处各写一份记法说明。
 */

import { NOTATION_LEGEND } from '@pv-lens/core';

export function Legend() {
  return (
    <div className="narrative-legend" aria-label="图例">
      <h4>图例</h4>
      <dl>
        {NOTATION_LEGEND.map((entry) => (
          <div className="legend-item" key={entry.notation}>
            <dt>
              <code>{entry.notation}</code>
            </dt>
            <dd>构造子 {entry.functors.join(' / ')} 的密码学惯用记法</dd>
          </div>
        ))}
        <div className="legend-item">
          <dt>
            <code>functor(a, b)</code>
          </dt>
          <dd>其它构造子（含 pk / spk / nonce_to_bitstring / messtermI 等自定义构造子）回退为函数调用写法</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>(a, b, c)</code>
          </dt>
          <dd>元组</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>=M</code>
          </dt>
          <dd>等值模式：接收到的词项必须等于 M</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip legend-chip--unpaired">未配对</span>
          </dt>
          <dd>跨泳道无法可靠确定「谁发出的消息被谁接收」，图上不画连线（画对优先于画全）</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip">!</span>
          </dt>
          <dd>该步骤处于复制 `!` 作用域内：该角色可并发多会话</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip">|</span>
          </dt>
          <dd>该步骤处于并行 `|` 组合内</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>new …</code>
          </dt>
          <dd>该步骤之前新生成的新鲜名</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>event …</code>
          </dt>
          <dd>事件标注（对应性查询引用的协议位置）</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>if …</code> / <code>let … =</code> / <code>get …</code> / <code>insert …</code>
          </dt>
          <dd>守卫条件与表操作注释；线性展开下 then / else 两分支共享同一条条件原文</dd>
        </div>
        <div className="legend-item">
          <dt>
            <code>→ 发出</code> / <code>← 接收</code>
          </dt>
          <dd>消息步骤的方向与所在信道</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip legend-chip--degraded">降级诊断</span>{' '}
            <span className="legend-chip legend-chip--error">错误诊断</span>
          </dt>
          <dd>解析器的降级/错误诊断以原文标注卡片入图，按源码位置归入泳道</dd>
        </div>
      </dl>
    </div>
  );
}
