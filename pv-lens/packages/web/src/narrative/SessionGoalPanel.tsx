/**
 * 会话目标面板（ADR-0018 / 阶段 5）：保密性、认证 / 对应性与可达性目标。
 *
 * 只生成派生文本中的查询；不覆盖源码声明目标，也不修改 `.pv`。
 * 会话目标、声明目标与探索性有序对在数据和界面上分别标注。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  collectEventReferences,
  createAuthenticationGoal,
  createReachabilityGoal,
  narrativeRoleOrder,
  roleLocalFreshHint,
  roleLocalFreshNames,
  secrecyCandidates,
  sessionGoalQueryBody,
} from '@pv-lens/core';
import type { ParseResult, SessionGoal } from '@pv-lens/core';

export interface SessionGoalPanelProps {
  result: ParseResult;
  goals: readonly SessionGoal[];
  /** 派生后的完整验证文本（只读预览）。 */
  verificationSource: string;
  onAdd: (goal: SessionGoal) => void;
  onRemove: (goalId: string) => void;
  onClear: () => void;
}

export function SessionGoalPanel({
  result,
  goals,
  verificationSource,
  onAdd,
  onRemove,
  onClear,
}: SessionGoalPanelProps): ReactElement {
  const [fromEventId, setFromEventId] = useState('');
  const [toEventId, setToEventId] = useState('');
  const [injective, setInjective] = useState(true);
  const [reachEventId, setReachEventId] = useState('');
  const lastResultRef = useRef(result);
  const events = useMemo(() => collectEventReferences(result), [result]);
  const roles = useMemo(() => narrativeRoleOrder(result), [result]);
  const secrecy = useMemo(() => secrecyCandidates(result), [result]);
  const freshNames = useMemo(() => roleLocalFreshNames(result), [result]);
  const goalIds = new Set(goals.map((goal) => goal.id));
  const declaredBodies = new Set(result.queries.map((query) => query.text.replace(/\s+/g, '')));
  const isDeclared = (queryText: string): boolean => declaredBodies.has(sessionGoalQueryBody(queryText).replace(/\s+/g, ''));
  const authCandidate = fromEventId === '' || toEventId === '' ? null : createAuthenticationGoal(result, fromEventId, toEventId, injective);
  const reachCandidate = reachEventId === '' ? null : createReachabilityGoal(result, reachEventId);

  useEffect(() => {
    if (lastResultRef.current === result) return;
    lastResultRef.current = result;
    setFromEventId('');
    setToEventId('');
    setReachEventId('');
  }, [result]);

  const addAuthentication = (): void => {
    const goal = createAuthenticationGoal(result, fromEventId, toEventId, injective);
    if (goal !== null) onAdd(goal);
  };
  const addReachability = (): void => {
    const goal = createReachabilityGoal(result, reachEventId);
    if (goal !== null) onAdd(goal);
  };
  const eventLabel = (id: string): string => {
    const event = events.find((candidate) => candidate.id === id);
    if (event === undefined) return id;
    const role = roles[event.roleIndex]?.name ?? `角色 ${String(event.roleIndex)}`;
    return `${event.name} · ${role}`;
  };

  return (
    <details className="session-goals">
      <summary>会话目标（保密性 / 认证 / 可达性）{goals.length > 0 ? ` · ${String(goals.length)} 个` : ''}</summary>
      <p className="hint">
        会话目标只在本会话内追加到派生验证文本，排在首个 process 之前；不覆盖源码查询，也不回写 .pv。
        声明目标与探索性有序对的展示保持不变。
      </p>
      <div className="session-goal-builders">
        <section className="session-goal-builder" aria-label="保密性目标">
          <h5>保密性</h5>
          {secrecy.length === 0 ? <p className="hint">没有顶层 free [private] 名字可作为保密性目标。</p> : (
            <ul className="session-goal-options">
              {secrecy.map((goal) => {
                const declared = isDeclared(goal.queryText);
                return (
                  <li key={goal.id}>
                    <code>{goal.queryText}</code>
                    <button type="button" className="btn btn--small" disabled={goalIds.has(goal.id) || declared} onClick={() => onAdd(goal)}>
                      {declared ? '源码已声明' : goalIds.has(goal.id) ? '已添加' : '添加'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {freshNames.length > 0 && (
            <details className="session-goal-hints">
              <summary>角色内 new 的提示（{freshNames.length}）</summary>
              <ul>
                {freshNames.map((name) => (
                  <li key={`${name.roleName}:${name.name}:${String(name.span.start.offset)}`}>{roleLocalFreshHint(name)}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="session-goal-builder" aria-label="认证目标">
          <h5>认证 / 对应性</h5>
          <div className="session-goal-row">
            <label>前提事件
              <select value={fromEventId} onChange={(event) => setFromEventId(event.target.value)}>
                <option value="">选择事件</option>
                {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event.id)}</option>)}
              </select>
            </label>
            <label>结论事件
              <select value={toEventId} onChange={(event) => setToEventId(event.target.value)}>
                <option value="">选择事件</option>
                {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event.id)}</option>)}
              </select>
            </label>
            <label className="session-goal-injective">
              <input type="checkbox" checked={injective} onChange={(event) => setInjective(event.target.checked)} />
              单射 inj-event
            </label>
            <button
              type="button"
              className="btn btn--small"
              disabled={authCandidate === null || isDeclared(authCandidate.queryText)}
              onClick={addAuthentication}
            >
              添加认证目标
            </button>
            {authCandidate !== null && isDeclared(authCandidate.queryText) && <span className="session-goal-declared">源码已声明，无需重复添加</span>}
          </div>
        </section>

        <section className="session-goal-builder" aria-label="可达性目标">
          <h5>可达性</h5>
          <div className="session-goal-row">
            <label>事件
              <select value={reachEventId} onChange={(event) => setReachEventId(event.target.value)}>
                <option value="">选择事件</option>
                {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event.id)}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--small"
              disabled={reachCandidate === null || isDeclared(reachCandidate.queryText)}
              onClick={addReachability}
            >
              添加可达性目标
            </button>
            {reachCandidate !== null && isDeclared(reachCandidate.queryText) && <span className="session-goal-declared">源码已声明，无需重复添加</span>}
          </div>
        </section>
      </div>

      {goals.length > 0 && (
        <div className="session-goal-list">
          <div className="session-goal-list-head">
            <span>已添加的会话目标（{goals.length}）</span>
            <button type="button" className="btn btn--small" onClick={onClear}>全部清除</button>
          </div>
          <ul>
            {goals.map((goal) => (
              <li key={goal.id} className="session-goal-item" data-origin="session">
                <span className="session-goal-tag">会话目标</span>
                <span>{goal.label}</span>
                <code>{goal.queryText}</code>
                <button type="button" className="btn btn--small" onClick={() => onRemove(goal.id)}>移除</button>
              </li>
            ))}
          </ul>
          <details className="session-goal-source">
            <summary>查看派生验证文本</summary>
            <pre>{verificationSource}</pre>
          </details>
        </div>
      )}
    </details>
  );
}
