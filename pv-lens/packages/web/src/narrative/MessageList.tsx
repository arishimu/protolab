/**
 * 消息列表面板（ADR-0018 决策 02 / 阶段 3）。
 *
 * 按因果 DAG 的确定性拓扑序列出完整消息，只允许整条勾选；实时校验连续、因果凸、
 * 两方、单信道与既有段重叠，校验通过后才允许创建。段状态只保留在会话内存。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createExchangeSegment, narrativeRoleOrder, validateExchangeSegment } from '@pv-lens/core';
import type { ExchangeDag, ExchangeSegment, ParseResult } from '@pv-lens/core';

export interface MessageListProps {
  result: ParseResult;
  dag: ExchangeDag;
  segments: readonly ExchangeSegment[];
  collapsedSegments: ReadonlySet<string>;
  onCreate: (segment: ExchangeSegment) => void;
  onToggleSegment: (segmentId: string) => void;
  onRenameSegment: (segmentId: string, label: string | null) => void;
  onRemoveSegment: (segmentId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

export function MessageList({
  result,
  dag,
  segments,
  collapsedSegments,
  onCreate,
  onToggleSegment,
  onRenameSegment,
  onRemoveSegment,
  onCollapseAll,
  onExpandAll,
}: MessageListProps): ReactElement {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [cutHalf, setCutHalf] = useState(false);
  const lastResultRef = useRef(result);
  useEffect(() => {
    if (lastResultRef.current === result) return;
    lastResultRef.current = result;
    setSelected([]);
    setCutHalf(false);
  }, [result]);

  const multiParty = narrativeRoleOrder(result).length > 2;
  const validation = useMemo(
    () => validateExchangeSegment(dag, selected, {
      existing: segments,
      ...(cutHalf && selected[0] !== undefined ? { cutMessageIds: [selected[0]] } : {}),
    }),
    [dag, selected, segments, cutHalf],
  );
  const selectedSet = new Set(selected);
  const toggleMessage = (messageId: string): void => {
    setSelected((current) => current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId]);
  };
  const extendToClosure = (): void => {
    setSelected(validation.closureIds);
  };
  const create = (): void => {
    if (multiParty || !validation.ok) return;
    const { segment } = createExchangeSegment(result, dag, selected, {
      existing: segments,
      ...(cutHalf && selected[0] !== undefined ? { cutMessageIds: [selected[0]] } : {}),
    });
    if (segment === null) return;
    onCreate(segment);
    setSelected([]);
    setCutHalf(false);
  };
  const firstSelected = selected[0];

  return (
    <section className="message-list-panel" aria-label="交换段消息列表">
      <div className="message-list-heading">
        <h4>交换段 · 消息列表</h4>
        <span className="message-list-hint">按因果 DAG 的确定性拓扑序排列；只勾选整条消息，选择不会写回 .pv。</span>
      </div>
      {multiParty && (
        <p className="message-list-notice" role="status">
          V1 仅支持两方协议：当前有 {String(narrativeRoleOrder(result).length)} 个角色，交换段创建入口已禁用。
        </p>
      )}
      <div className="message-list-tools">
        <button type="button" className="btn" onClick={() => { setSelected([]); setCutHalf(false); }}>清空选择</button>
        <button type="button" className="btn" onClick={extendToClosure} disabled={validation.missingIds.length === 0}>
          扩展到凸闭包（+{String(validation.missingIds.length)}）
        </button>
        <button type="button" className="btn btn--primary" onClick={create} disabled={multiParty || !validation.ok}>
          封装为交换段
        </button>
        <label className="message-list-cut" title="演示用：把首条所选消息标记为只有发送端在段内，按切断消息拒绝">
          <input
            type="checkbox"
            checked={cutHalf}
            disabled={multiParty || firstSelected === undefined}
            onChange={(event) => setCutHalf(event.target.checked)}
          />
          模拟仅发送端
        </label>
      </div>
      <ol className="message-list" aria-label="完整消息">
        {dag.messages.map((message) => {
          const checked = selectedSet.has(message.id);
          const cut = cutHalf && message.id === firstSelected;
          return (
            <li
              key={message.id}
              className={`message-list-item${checked ? ' message-list-item--selected' : ''}${cut ? ' message-list-item--cut' : ''}`}
              data-message-id={message.id}
            >
              <label className="message-list-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={multiParty}
                  aria-label={`选择 M${String(message.sequence)}${cut ? '（当前仅发送端）' : ''}`}
                  onChange={() => toggleMessage(message.id)}
                />
                <code>M{message.sequence}</code>
              </label>
              <span className="message-list-route">{routeOf(message.roles)}</span>
              <span className="message-list-channel">{message.channels.join(' / ')}</span>
              <span className={`message-list-status${message.paired ? '' : ' message-list-status--unpaired'}`}>
                {cut ? '仅发送端' : message.paired ? '已配对' : '未配对'}
              </span>
              <code className="message-list-term" title={message.termText}>{message.termText}</code>
            </li>
          );
        })}
      </ol>
      <div className={`segment-validation${validation.idle ? ' segment-validation--idle' : validation.ok ? ' segment-validation--ok' : ' segment-validation--bad'}`} role="status">
        {validation.idle ? (
          <span>未选择消息；勾选一段连续消息后查看校验清单。</span>
        ) : (
          <>
            <strong>{validation.ok ? '可创建' : `拒绝创建：${String(validation.checks.filter((check) => !check.ok).length)} 项未通过`}</strong>
            <ul className="segment-checks">
              {validation.checks.map((check) => (
                <li key={check.id} className={check.ok ? 'segment-check--ok' : 'segment-check--bad'}>
                  <span aria-hidden="true">{check.ok ? '✓' : '✕'}</span>
                  <span>{check.label}{check.reason === undefined ? '' : ` — ${check.reason}`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {segments.length > 0 && (
        <div className="segment-cards">
          <div className="segment-cards-heading">
            <span>已创建交换段（{String(segments.length)}）</span>
            <span className="segment-cards-actions">
              <button type="button" className="btn" onClick={onCollapseAll}>全部折叠</button>
              <button type="button" className="btn" onClick={onExpandAll}>全部展开</button>
            </span>
          </div>
          <ul>
            {segments.map((segment) => {
              const collapsed = collapsedSegments.has(segment.id);
              return (
                <li key={segment.id} className="segment-card" data-segment-id={segment.id}>
                  <div className="segment-card-head">
                    <strong>M{String(segment.firstSequence)}–M{String(segment.lastSequence)}</strong>
                    <span>{segment.roles.join(' ↔ ')} · {segment.channels.join(' / ')}</span>
                    <span className="segment-card-counts">
                      未配对 {segment.hiddenCounts.unpaired} · 分支 {segment.hiddenCounts.branches} · 冲突 {segment.hiddenCounts.conflicts}
                    </span>
                  </div>
                  <div className="segment-card-controls">
                    <label className="segment-name">
                      名称
                      <input
                        type="text"
                        value={segment.label ?? ''}
                        placeholder="未命名段"
                        title="仅本会话标签；留空显示未命名段；不是安全结论"
                        onChange={(event) => onRenameSegment(segment.id, event.target.value.trim() === '' ? null : event.target.value)}
                      />
                    </label>
                    <button type="button" className="btn" onClick={() => onToggleSegment(segment.id)} aria-expanded={!collapsed}>
                      {collapsed ? '展开' : '折叠'}
                    </button>
                    <button type="button" className="btn" onClick={() => onRemoveSegment(segment.id)}>移除段</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function routeOf(roles: readonly string[]): string {
  if (roles.length === 0) return '—';
  if (roles.length === 1) return `${roles[0]} → 信道轨`;
  return `${roles[0]} ↔ ${roles.slice(1).join(' / ')}`;
}
