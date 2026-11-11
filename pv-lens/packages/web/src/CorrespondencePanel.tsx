/**
 * 对应性查询面板（ticket 08）：为全部有序事件对预生成 `inj-event` 查询（一次注入、
 * 原始 `.pv` 不变），交给本机 ProVerif 跑一次，结果映射为常驻可折叠矩阵。
 *
 * 单元三态独立呈现（成立 / 反例 / 未证出），选中行列与生命线上的事件旗标双向联动；
 * 反例 trace 沿用逐条查询的原文折叠块。同一 source 的重复运行命中会话内缓存，
 * 不再重发验证请求。
 */

import { useMemo, useRef, useState } from 'react';
import type { CorrespondencePlan, VerificationResult } from '@pv-lens/core';
import { buildCorrespondenceMatrix } from '@pv-lens/core';
import type { CorrespondenceCell, EventReference } from '@pv-lens/core';
import { requestVerification, describeVerifyFailureKind } from './verify';
import type { VerifyFailure } from './verify';
import { VERDICT_META } from './query-presentation';

const CORRESPONDENCE_TIMEOUT_MS = 60_000;

export interface CorrespondencePanelProps {
  /** App 派生并共享的对应性计划（旗标形状与矩阵同一份，避免两处各算）。 */
  plan: CorrespondencePlan;
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
  plan,
  selectedEventId,
  onSelectEvent,
  selectedQueryId,
  onSelectQuery,
}: CorrespondencePanelProps) {
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const [declaredOnly, setDeclaredOnly] = useState(false);
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const abortRef = useRef<AbortController | null>(null);

  const cells = useMemo(
    () => (state.status === 'done' && state.ok ? buildCorrespondenceMatrix(plan, state.results) : buildCorrespondenceMatrix(plan)),
    [plan, state],
  );
  const declaredQueries = useMemo(
    () => plan.queries.filter((query) => query.declared === true),
    [plan.queries],
  );
  const declaredEventIds = useMemo(
    () => new Set(declaredQueries.flatMap((query) => [query.from.id, query.to.id])),
    [declaredQueries],
  );
  const visibleEvents = declaredOnly ? plan.events.filter((event) => declaredEventIds.has(event.id)) : plan.events;
  const visibleCells = declaredOnly ? cells.filter((cell) => cell.query.declared === true) : cells;
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.query.id === selectedQueryId) ?? null,
    [cells, selectedQueryId],
  );

  async function run(): Promise<void> {
    if (state.status === 'running') return;
    const cached = cacheRef.current.get(plan.source);
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
      cacheRef.current.set(plan.source, { results: outcome.results, stdout: outcome.stdout });
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
        <summary className="correspondence-summary">
          事件对应性矩阵 · {plan.events.length} 个事件 · {plan.queries.length} 条有序对 · {declaredQueries.length} 条源码声明的安全目标
        </summary>
        {plan.events.length === 0 ? (
          <p className="hint">当前模型没有 event 标记，无法生成对应性查询。</p>
        ) : (
          <>
            <p className="hint">
              工具为探索性有序对预生成 <code>inj-event</code> 探针；源码声明的目标按原查询语义运行，
              非单射 <code>event</code> 声明仍按 <code>event</code> 判定。查询插入验证文本的
              <code>process</code> 之前，原始 <code>.pv</code> 不变。声明目标来自源码 query 语句；
              其余为工具生成的探索性有序对，其 ✗ 不构成协议攻击。点击矩阵单元或生命线上的事件旗标可互相定位。
            </p>
            <p className="hint correspondence-legend">
              · 未运行　↺ 自反对　✓ 成立　✗ 被证伪　? 未证出　蓝框表示源码声明目标。自反对即 <code>inj-event(A) ==&gt; inj-event(A)</code>。
            </p>
            <div className="correspondence-controls">
              <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={running}>
                运行对应性查询
              </button>
              {running && (
                <button type="button" className="btn" onClick={cancel}>取消</button>
              )}
              <label className="correspondence-filter">
                <input
                  type="checkbox"
                  checked={declaredOnly}
                  onChange={(event) => setDeclaredOnly(event.target.checked)}
                />
                仅显示源码声明的安全目标
              </label>
              {selectedEventId !== null && (() => {
                const event = plan.events.find((candidate) => candidate.id === selectedEventId);
                if (event === undefined) return null;
                return (
                  <button
                    type="button"
                    className="btn correspondence-reflexive-btn"
                    onClick={() => onSelectQuery(`${event.id}=>${event.id}`)}
                    title="查询 inj-event(A) ==> inj-event(A)，与双击事件旗标效果相同"
                  >
                    查询 {event.name} 的自反对应性
                  </button>
                );
              })()}
            </div>
            {running && <p className="verify-progress" role="status">正在运行 ProVerif，一次性执行 n² 条查询…</p>}
            {state.status === 'done' && !state.ok && (
              <p className="verify-error" role="alert">
                验证未能完成：{describeVerifyFailureKind(state.outcome.kind)}；对应性矩阵保持未验证状态，详情见验证结果面板。
              </p>
            )}
            {declaredOnly ? (
              <DeclaredQueryList
                cells={cells}
                declaredQueries={declaredQueries}
                selectedQueryId={selectedQueryId}
                onSelectQuery={onSelectQuery}
              />
            ) : (
              <CorrespondenceMatrixTable
              events={visibleEvents}
              cells={visibleCells}
              selectedEventId={selectedEventId}
              selectedQueryId={selectedQueryId}
              onSelectEvent={onSelectEvent}
              onSelectQuery={onSelectQuery}
            />
            )}
            {selectedCell !== null && <CorrespondenceCellDetail cell={selectedCell} />}
            {state.status === 'done' && state.ok && (
              <details className="raw-output">
                <summary>ProVerif 完整原始输出 · stdout</summary>
                <pre className="raw-output-body"><code>{state.stdout}</code></pre>
              </details>
            )}
          </>
        )}
      </details>
    </section>
  );
}

/** R13：声明过滤视图——源码声明目标的列表（判定符号 + 查询原文 + 点击联动选中），不再保留清空的 n×n 网格。 */
function DeclaredQueryList({
  cells,
  declaredQueries,
  selectedQueryId,
  onSelectQuery,
}: {
  cells: readonly CorrespondenceCell[];
  declaredQueries: readonly CorrespondencePlan['queries'][number][];
  selectedQueryId: string | null;
  onSelectQuery: (queryId: string | null) => void;
}) {
  if (declaredQueries.length === 0) {
    return <p className="hint">当前模型没有 query 语句声明的安全目标。</p>;
  }
  return (
    <ol className="declared-query-list" aria-label="源码声明的安全目标">
      {declaredQueries.map((query, index) => {
        const cell = cells.find((candidate) => candidate.query.id === query.id);
        const verdict = cell?.verdict ?? 'pending';
        const meta = metaFor(verdict);
        return (
          <li key={query.id}>
            <button
              type="button"
              className={`declared-query-item${query.id === selectedQueryId ? ' declared-query-item--selected' : ''}`}
              onClick={() => onSelectQuery(query.id)}
              aria-label={`声明目标 ${String(index + 1)}：${query.declaredText ?? query.text}，${meta === null ? '未验证' : meta.label}`}
            >
              <span className={`verdict-badge verdict-badge--${meta === null ? 'unknown' : meta.tone}`}>
                {verdict === 'pending' ? '未运行' : meta?.label ?? '?'}
              </span>
              <code className="declared-query-text">{query.declaredText ?? query.text}</code>
            </button>
          </li>
        );
      })}
    </ol>
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
  // D5 强弱两级：选中单元所在行/列为强（前提行 + 结论列），另一端的正交方向为弱（related）。
  type HeadLevel = 'strong' | 'related' | null;
  const headLevelOf = (eventId: string, axis: 'row' | 'col'): HeadLevel => {
    if (eventId === selectedEventId) return 'strong';
    if (selectedQuery === null) return null;
    if (axis === 'row') {
      if (selectedQuery.from.id === eventId) return 'strong';
      if (selectedQuery.to.id === eventId) return 'related';
      return null;
    }
    if (selectedQuery.to.id === eventId) return 'strong';
    if (selectedQuery.from.id === eventId) return 'related';
    return null;
  };
  const headClassOf = (level: HeadLevel): string =>
    level === 'strong'
      ? 'correspondence-head correspondence-head--selected'
      : level === 'related'
        ? 'correspondence-head correspondence-head--related'
        : 'correspondence-head';
  const rowClassOf = (eventId: string): string | undefined => {
    const level = headLevelOf(eventId, 'row');
    return level === null ? undefined : `correspondence-row--${level === 'strong' ? 'selected' : 'related'}`;
  };
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
                className={headClassOf(headLevelOf(to.id, 'col'))}
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
            <tr key={from.id} className={rowClassOf(from.id)}>
              <th scope="row" className={headClassOf(headLevelOf(from.id, 'row'))}>
                <button type="button" className="correspondence-head-btn" onClick={() => onSelectEvent(from.id)} title={from.text}>
                  {from.name}
                </button>
              </th>
              {events.map((to) => {
                const cell = cellOf(from.id, to.id);
                if (cell === undefined) return <td key={to.id} />;
                const meta = metaFor(cell.verdict);
                const reflexive = from.id === to.id;
                const declared = cell.query.declared === true;
                return (
                  <td key={to.id}>
                    <button
                      type="button"
                      className={`correspondence-cell correspondence-cell--${cell.verdict}${declared ? ' correspondence-cell--declared' : ' correspondence-cell--exploratory'}${cell.query.id === selectedQueryId ? ' correspondence-cell--selected' : ''}`}
                      data-declared={declared ? 'true' : 'false'}
                      aria-label={`${from.text} ==> ${to.text}${reflexive ? '，自反' : ''}：${meta === null ? '未验证' : meta.label}；${declared ? '源码声明的安全目标' : '探索性有序对'}`}
                      onClick={() => {
                        // D5：单元点击只设置选中查询，不再设置事件——避免 4 个表头同强高亮。
                        onSelectQuery(cell.query.id);
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

/** pending 无徽标（未验证 ≠ 未能证明），其余三态沿用归一化判定的呈现元数据。 */
const metaFor = (verdict: CorrespondenceCell['verdict']) =>
  verdict === 'pending' ? null : VERDICT_META[verdict];

export function CorrespondenceCellDetail({ cell }: { cell: CorrespondenceCell }) {
  const meta = metaFor(cell.verdict);
  const declared = cell.query.declared === true;
  return (
    <div className="correspondence-detail" aria-label="对应性单元详情">
      <p className="correspondence-detail-kind">
        {declared ? '源码声明的安全目标' : '探索性有序对'}
        {declared && cell.query.declaredText !== undefined && (
          <span className="correspondence-detail-source"> · {cell.query.declaredText}</span>
        )}
      </p>
      <p className="correspondence-detail-query"><code>query {cell.query.text}.</code></p>
      {declared && cell.query.declaredInjective === false && (
        <p className="hint correspondence-detail-semantics">
          本格按源码声明的非单射 <code>event</code> 查询判定；单射 <code>inj-event</code> 探针不属于本格结论。
        </p>
      )}
      <p>
        <span className={`verdict-badge verdict-badge--${meta === null ? 'unknown' : meta.tone}`}>
          {meta === null ? '未验证' : meta.label}
        </span>
      </p>
      <p className="correspondence-detail-explanation">
        {cell.verdict === 'pending'
          ? '尚未运行对应性查询。'
          : declared
            ? declaredExplanation(cell)
            : exploratoryExplanation(cell)}
      </p>
      {cell.result?.counterexampleTrace != null && (
        <details className="counterexample">
          <summary>展开反例 trace 原文</summary>
          <pre className="counterexample-body"><code>{cell.result.counterexampleTrace}</code></pre>
        </details>
      )}
    </div>
  );
}

function declaredExplanation(cell: CorrespondenceCell): string {
  if (cell.verdict === 'true') return '源码声明的安全目标成立：ProVerif 未找到反例。';
  if (cell.verdict === 'false') return '源码声明的安全目标不成立，已被证伪；攻击路径见下方反例 trace。';
  return '源码声明的安全目标未被证明，也未被证伪。未证出不等于性质为假。';
}

function exploratoryExplanation(cell: CorrespondenceCell): string {
  if (cell.verdict === 'true') return '该有序对成立。这是工具生成的探索性结果，不是源码声明的安全目标。';
  if (cell.verdict === 'false') {
    return '该有序对不成立。它由工具枚举，不是源码声明的安全目标；✗ 不构成协议攻击。';
  }
  return '该探索性有序对未被证明，也未被证伪。';
}
