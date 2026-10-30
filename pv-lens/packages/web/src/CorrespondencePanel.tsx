/**
 * 对应性查询面板（ticket 08）：为全部有序事件对预生成 `inj-event` 查询（一次注入、
 * 原始 `.pv` 不变），交给本机 ProVerif 跑一次，结果映射为常驻可折叠矩阵。
 *
 * 单元三态独立呈现（成立 / 反例 / 未证出），选中行列与生命线上的事件旗标双向联动；
 * 反例 trace 沿用逐条查询的原文折叠块。同一 source 的重复运行命中会话内缓存，
 * 不再重发验证请求。
 */

import { useMemo, useRef, useState } from 'react';
import type { ParseResult, VerificationResult } from '@pv-lens/core';
import { buildCorrespondenceMatrix, createCorrespondencePlan } from '@pv-lens/core';
import type { CorrespondenceCell, EventReference } from '@pv-lens/core';
import { requestVerification } from './verify';
import type { VerifyFailure } from './verify';
import { VERDICT_META } from './query-presentation';

export const CORRESPONDENCE_TIMEOUT_MS = 60_000;

export interface CorrespondencePanelProps {
  /** 当前 `.pv` 全文（注入只发生在发给验证器的副本上，原文不变）。 */
  source: string;
  parseResult: ParseResult;
  /** 双向联动的选中事件 id（行/列高亮）；null = 未选。 */
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  /** 双向联动的选中单元 query id；null = 未选。 */
  selectedQueryId: string | null;
  onSelectQuery: (queryId: string | null) => void;
}

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; ok: true; results: readonly VerificationResult[]; stdout: string }
  | { status: 'done'; ok: false; outcome: VerifyFailure };

interface CacheEntry {
  results: readonly VerificationResult[];
  stdout: string;
}

export function CorrespondencePanel({
  source,
  parseResult,
  selectedEventId,
  onSelectEvent,
  selectedQueryId,
  onSelectQuery,
}: CorrespondencePanelProps) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const abortRef = useRef<AbortController | null>(null);

  const plan = useMemo(() => createCorrespondencePlan(source, parseResult), [source, parseResult]);
  const cells = useMemo(
    () => (state.status === 'done' && state.ok ? buildCorrespondenceMatrix(plan, state.results) : buildCorrespondenceMatrix(plan)),
    [plan, state],
  );
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.query.id === selectedQueryId) ?? null,
    [cells, selectedQueryId],
  );

  async function run(): Promise<void> {
    if (state.status === 'running') return;
    const cached = cacheRef.current.get(source);
    if (cached !== undefined) {
      setState({ status: 'done', ok: true, results: cached.results, stdout: cached.stdout });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'running' });
    const outcome = await requestVerification(plan.verificationSource, {
      timeoutMs: CORRESPONDENCE_TIMEOUT_MS,
      signal: controller.signal,
    });
    if (abortRef.current === controller) abortRef.current = null;
    if (outcome.ok) {
      cacheRef.current.set(source, { results: outcome.results, stdout: outcome.stdout });
      setState({ status: 'done', ok: true, results: outcome.results, stdout: outcome.stdout });
    } else {
      setState({ status: 'done', ok: false, outcome });
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  const running = state.status === 'running';

  return (
    <section className="correspondence" aria-label="事件对应性矩阵">
      <details open>
        <summary className="correspondence-summary">事件对应性矩阵（inj-event，{plan.events.length} 个事件 × {plan.queries.length} 条有序对）</summary>
        {plan.events.length === 0 ? (
          <p className="hint">当前模型没有 event 标记，无法生成对应性查询。</p>
        ) : (
          <>
            <p className="hint">
              为全部有序事件对预生成 `inj-event` 查询并插入验证文本的 `process` 之前（原始 `.pv` 不变）；
              单元三态独立呈现，反例可展开 trace。点击矩阵单元或生命线上的事件旗标互相定位。
            </p>
            <div className="correspondence-controls">
              <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={running}>
                运行对应性查询
              </button>
              {running && (
                <button type="button" className="btn" onClick={cancel}>取消</button>
              )}
            </div>
            {running && <p className="verify-progress" role="status">正在运行 ProVerif（n² 条查询一次跑）…</p>}
            {state.status === 'done' && !state.ok && (
              <p className="verify-error" role="alert">验证未能完成（{state.outcome.kind}）；对应性矩阵保持未验证状态。</p>
            )}
            <CorrespondenceMatrixTable
              events={plan.events}
              cells={cells}
              selectedEventId={selectedEventId}
              selectedQueryId={selectedQueryId}
              onSelectEvent={onSelectEvent}
              onSelectQuery={onSelectQuery}
            />
            {selectedCell !== null && <CorrespondenceCellDetail cell={selectedCell} />}
            {state.status === 'done' && state.ok && (
              <details className="raw-output">
                <summary>ProVerif 完整原始输出（stdout）</summary>
                <pre className="raw-output-body"><code>{state.stdout}</code></pre>
              </details>
            )}
          </>
        )}
      </details>
    </section>
  );
}

function CorrespondenceMatrixTable({
  events,
  cells,
  selectedEventId,
  selectedQueryId,
  onSelectEvent,
  onSelectQuery,
}: {
  events: readonly EventReference[];
  cells: readonly CorrespondenceCell[];
  selectedEventId: string | null;
  selectedQueryId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  onSelectQuery: (queryId: string | null) => void;
}) {
  const cellOf = (fromId: string, toId: string): CorrespondenceCell | undefined =>
    cells.find((cell) => cell.query.from.id === fromId && cell.query.to.id === toId);
  // 选中单元的行/列两端事件都高亮（旗标 ↔ 矩阵双向联动的列侧）。
  const selectedQuery = selectedQueryId === null ? null : cells.find((cell) => cell.query.id === selectedQueryId)?.query ?? null;
  const highlightEvent = (eventId: string): boolean =>
    eventId === selectedEventId || selectedQuery?.from.id === eventId || selectedQuery?.to.id === eventId;
  return (
    <div className="correspondence-matrix-wrap">
      <table className="correspondence-matrix" aria-label="事件对应性矩阵">
        <thead>
          <tr>
            <th scope="row" className="correspondence-corner">前提 ↓ / 结论 →</th>
            {events.map((to) => (
              <th
                key={to.id}
                scope="col"
                className={highlightEvent(to.id) ? 'correspondence-head correspondence-head--selected' : 'correspondence-head'}
              >
                <button type="button" className="correspondence-head-btn" onClick={() => onSelectEvent(to.id)} title={to.text}>
                  {to.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((from) => (
            <tr key={from.id} className={highlightEvent(from.id) ? 'correspondence-row--selected' : undefined}>
              <th scope="row" className={highlightEvent(from.id) ? 'correspondence-head correspondence-head--selected' : 'correspondence-head'}>
                <button type="button" className="correspondence-head-btn" onClick={() => onSelectEvent(from.id)} title={from.text}>
                  {from.name}
                </button>
              </th>
              {events.map((to) => {
                const cell = cellOf(from.id, to.id);
                if (cell === undefined) return <td key={to.id} />;
                const meta = cell.verdict === 'pending' ? null : VERDICT_META[cell.verdict];
                const reflexive = from.id === to.id;
                return (
                  <td key={to.id}>
                    <button
                      type="button"
                      className={`correspondence-cell correspondence-cell--${cell.verdict}${cell.query.id === selectedQueryId ? ' correspondence-cell--selected' : ''}`}
                      aria-label={`${from.text} ==> ${to.text}${reflexive ? '（自反）' : ''}：${meta === null ? '未验证' : meta.label}`}
                      onClick={() => {
                        onSelectQuery(cell.query.id);
                        onSelectEvent(from.id);
                      }}
                    >
                      {cell.verdict === 'pending' ? '·' : cell.verdict === 'true' ? '✓' : cell.verdict === 'false' ? '✗' : '?'}
                      {reflexive && <span className="correspondence-reflexive-mark" aria-hidden="true">↺</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrespondenceCellDetail({ cell }: { cell: CorrespondenceCell }) {
  const meta = cell.verdict === 'pending' ? null : VERDICT_META[cell.verdict];
  return (
    <div className="correspondence-detail" aria-label="对应性单元详情">
      <p className="correspondence-detail-query"><code>query {cell.query.text}.</code></p>
      <p>
        <span className={`verdict-badge verdict-badge--${meta === null ? 'unknown' : meta.tone}`}>
          {meta === null ? '未验证' : meta.label}
        </span>
      </p>
      <p className="correspondence-detail-explanation">
        {meta === null ? '尚未运行对应性查询。' : meta.explanation}
      </p>
      {cell.result?.counterexampleTrace != null && (
        <details className="counterexample">
          <summary>展开反例 / 攻击 trace 原文</summary>
          <pre className="counterexample-body"><code>{cell.result.counterexampleTrace}</code></pre>
        </details>
      )}
    </div>
  );
}
