/**
 * 密码操作审计面板（ADR-0018 决策 01 第 5 节 / 阶段 2）。
 *
 * 按组列出角色、种类、方向、来源、置信度、隐藏计数、底层构造子与源码行；
 * 用户覆盖只存会话内存，选回自动种类即撤销；重置只影响该组。
 */

import type { ReactElement } from 'react';
import type { CryptoOperationGroup, OperationKind } from '@pv-lens/core';
import { GROUP_CONFIDENCE_LABELS, GROUP_ORIGIN_LABELS, OPERATION_KIND_LABELS } from './crypto-group-labels';

export interface GroupAuditPanelProps {
  groups: readonly CryptoOperationGroup[];
  autoGroups: readonly CryptoOperationGroup[];
  collapsed: ReadonlySet<string>;
  overrides: ReadonlyMap<string, OperationKind>;
  onToggle: (groupId: string) => void;
  onOverride: (groupId: string, kind: OperationKind) => void;
  onReset: (groupId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onLocate: (groupId: string) => void;
}

const KIND_ORDER: readonly OperationKind[] = [
  'signature',
  'symmetric-encryption',
  'symmetric-decryption',
  'asymmetric-encryption',
  'asymmetric-decryption',
  'hash',
  'key-derivation',
  'unknown',
];

export function GroupAuditPanel({
  groups,
  autoGroups,
  collapsed,
  overrides,
  onToggle,
  onOverride,
  onReset,
  onCollapseAll,
  onExpandAll,
  onLocate,
}: GroupAuditPanelProps): ReactElement | null {
  if (groups.length === 0) return null;
  const autoById = new Map(autoGroups.map((group) => [group.id, group]));
  const depthOf = new Map<string, number>();
  const byId = new Map(groups.map((group) => [group.id, group]));
  const depthFor = (group: CryptoOperationGroup): number => {
    const cached = depthOf.get(group.id);
    if (cached !== undefined) return cached;
    const parent = group.parentId === null ? undefined : byId.get(group.parentId);
    const depth = parent === undefined ? 0 : depthFor(parent) + 1;
    depthOf.set(group.id, depth);
    return depth;
  };

  return (
    <details className="group-audit" aria-label="密码操作审计">
      <summary>密码操作审计（{String(groups.length)}）</summary>
      <div className="group-audit-toolbar">
        <button type="button" className="icon-btn icon-btn--wide" onClick={onCollapseAll}>全部折叠</button>
        <button type="button" className="icon-btn icon-btn--wide" onClick={onExpandAll}>全部展开</button>
      </div>
      <p className="hint group-audit-hint">
        分组是派生视图：修改种类只记在本次会话，不回写 .pv，也不改变查询与验证结论。
      </p>
      <ul className="group-audit-list">
        {groups.map((group) => {
          const depth = depthFor(group);
          const auto = autoById.get(group.id);
          const isCollapsed = collapsed.has(group.id);
          const overridden = overrides.has(group.id);
          const equationLine = group.equationSpan === undefined ? undefined : group.equationSpan.start.line;
          return (
            <li
              key={group.id}
              className={`group-audit-row${depth > 0 ? ' group-audit-row--nested' : ''}`}
              data-group-id={group.id}
              data-origin={group.origin}
              data-confidence={group.confidence}
            >
              <div className="group-audit-head">
                <span className="group-audit-role">{depth > 0 ? `内层 · ${group.roleName}` : group.roleName}</span>
                <label className="group-audit-kind">
                  <span className="visually-hidden">操作种类</span>
                  <select
                    value={group.kind}
                    aria-label={`修改 ${group.roleName} 的 ${group.functor} 操作种类`}
                    title="修改即记为用户声明；选回自动种类即撤销"
                    onChange={(event) => onOverride(group.id, event.target.value as OperationKind)}
                  >
                    {KIND_ORDER.map((kind) => (
                      <option key={kind} value={kind}>{OPERATION_KIND_LABELS[kind]}</option>
                    ))}
                  </select>
                </label>
                <span
                  className={`group-audit-origin group-audit-origin--${group.origin}`}
                  title={`自动分类：${auto === undefined ? '—' : OPERATION_KIND_LABELS[auto.kind]}`}
                >
                  {GROUP_ORIGIN_LABELS[group.origin]}
                  {group.origin === 'user' ? '' : ` · ${GROUP_CONFIDENCE_LABELS[group.confidence]}`}
                </span>
                <span className="group-audit-count" title="折叠时隐藏的成员总数（含嵌套组）">隐藏 {group.hiddenCount}</span>
              </div>
              <div className="group-audit-meta">
                <code>{group.functor}</code>
                <span>{group.direction === 'construct' ? '构造' : '解构'}</span>
                <span>源码 L{group.sourceSpan.start.line}</span>
                {equationLine !== undefined && equationLine !== group.sourceSpan.start.line && (
                  <span>方程 L{equationLine}</span>
                )}
              </div>
              <div className="group-audit-actions">
                <button type="button" className="btn" onClick={() => onToggle(group.id)} aria-expanded={!isCollapsed}>
                  {isCollapsed ? '展开' : '折叠'}
                </button>
                <button type="button" className="btn" onClick={() => onLocate(group.id)} title="只高亮组与源码行，不改变折叠状态">
                  定位
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onReset(group.id)}
                  disabled={!overridden}
                  title={overridden ? '恢复自动分类' : '当前没有用户声明'}
                >
                  重置
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
