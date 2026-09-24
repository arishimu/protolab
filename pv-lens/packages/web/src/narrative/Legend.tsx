/**
 * 规范叙事视图的图例（ticket 04）：解释图上出现的各记法。
 *
 * 符号化词项部分与 core 的 `renderTerm` / `NOTATION_LEGEND` 映射表同源，
 * 不在两处各写一份记法说明。配对图例与 ADR-0003 的口径一致：连线是设计意图，不是可达性。
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
            <span className="legend-value-block">值</span>
          </dt>
          <dd>值方块：一种颜色对应一个角色本地绑定；同色再现表示同一绑定的引用或等值复制</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-method-box">方法</span>
          </dt>
          <dd>方法盒：竖向表示解构，横向表示构造；`?:` 表示产出单个值的条件选择</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-wire-chip">wire term</span>
          </dt>
          <dd>虚线 wire 词项：消息上的未绑定内联构造，不产生新的值身份</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip legend-chip--unpaired">未配对</span>
          </dt>
          <dd>无法可靠推断设计上的收发关系（多方协议不自动连线），图上不画连线（画对优先于画全）</dd>
        </div>
        <div className="legend-item">
          <dt>
            <span className="legend-chip">跨泳道连线</span>
          </dt>
          <dd>设计意图上的 out → in：两方协议按源码顺序自动推断。连线不代表消息在攻击者模型下达得到，安全性以 ProVerif 结论为准</dd>
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
