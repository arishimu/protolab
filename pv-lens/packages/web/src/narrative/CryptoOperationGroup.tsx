/**
 * 密码操作组的 SVG 呈现（ADR-0018 / 阶段 2）。
 *
 * 展开态不额外占几何：组头是方法盒 / 派生芯片上的一个小折叠开关。
 * 折叠态由布局把该 item 的值层链替换为组摘要；摘要本身是按钮，回车 / 空格等价单击。
 */

import type { KeyboardEvent, ReactElement } from 'react';
import { operationConceptId } from '@pv-lens/core';
import type { StructuredCryptoGroupFold } from './structured-layout';
import { GROUP_CONFIDENCE_LABELS, GROUP_ORIGIN_LABELS } from './crypto-group-labels';

export interface CryptoOperationGroupSvgProps {
  fold: StructuredCryptoGroupFold;
  sourceSelected?: boolean;
  onToggle: (groupId: string) => void;
  onSourceSelect?: () => void;
  onShowConcept?: (conceptId: string) => void;
}

/** 折叠态组摘要：两行文字 + 构造/解构形状与来源标记。 */
export function CryptoOperationGroupSvg({
  fold,
  sourceSelected = false,
  onToggle,
  onSourceSelect,
  onShowConcept,
}: CryptoOperationGroupSvgProps): ReactElement {
  const activate = (): void => {
    onToggle(fold.groupId);
    onSourceSelect?.();
  };
  const fullText = [
    fold.label,
    fold.detail,
    `隐藏 ${String(fold.hiddenCount)} 项`,
    `来源 ${GROUP_ORIGIN_LABELS[fold.origin]} · ${GROUP_CONFIDENCE_LABELS[fold.confidence]}`,
    `底层 ${fold.functor}`,
    `源码 L${String(fold.sourceSpan.start.line)}`,
    `内层组 ${String(fold.childCount)}`,
  ].join('；');
  const labelBudget = Math.max(4, Math.floor((fold.width - 61) / 8.8));
  const detailBudget = Math.max(4, Math.floor((fold.width - 25) / 6.2));
  const conceptId = operationConceptId(fold.kind);
  const concept = (): void => onShowConcept?.(conceptId);
  return (
    <>
    <g
      className={[
        'structured-crypto-group',
        `structured-crypto-group--${fold.kind}`,
        `structured-crypto-group--${fold.direction}`,
        fold.origin === 'user' ? 'structured-crypto-group--user' : '',
        fold.nested ? 'structured-crypto-group--nested' : '',
        fold.confidence === 'low' ? 'structured-crypto-group--low' : '',
        sourceSelected ? 'structured-source-selected' : '',
      ].filter(Boolean).join(' ')}
      data-group-id={fold.groupId}
      data-origin={fold.origin}
      data-confidence={fold.confidence}
      data-source-offset={fold.sourceSpan.start.offset}
      role="button"
      tabIndex={0}
      aria-expanded={false}
      aria-label={`${fold.label}，${fold.detail}，隐藏 ${String(fold.hiddenCount)} 项；回车展开`}
      onClick={activate}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => activateOnKey(event, activate)}
    >
      <title>{fullText}</title>
      <rect
        x={fold.x - fold.width / 2}
        y={fold.y - fold.height / 2}
        width={fold.width}
        height={fold.height}
        rx="6"
      />
      <text className="structured-crypto-group-caret" x={fold.x - fold.width / 2 + 8} y={fold.y - 3}>▸</text>
      <text className="structured-crypto-group-label" x={fold.x - fold.width / 2 + 18} y={fold.y - 3}>{truncate(fold.label, labelBudget)}</text>
      <text className="structured-crypto-group-count" x={fold.x + fold.width / 2 - 7} y={fold.y - 3} textAnchor="end">隐藏 {fold.hiddenCount}</text>
      <text className="structured-crypto-group-detail" x={fold.x - fold.width / 2 + 18} y={fold.y + 8}>{truncate(fold.detail, detailBudget)}</text>
    </g>
    {onShowConcept !== undefined && (
      <g
        className="structured-concept-badge"
        data-concept-id={conceptId}
        role="button"
        tabIndex={0}
        aria-label={`查看概念注解：${fold.label}`}
        onClick={(event) => {
          event.stopPropagation();
          concept();
        }}
        onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          concept();
        }}
      >
        <title>{`概念注解：${fold.label}`}</title>
        <circle cx={fold.x - fold.width / 2 + 9} cy={fold.y + 8} r="6" />
        <text x={fold.x - fold.width / 2 + 9} y={fold.y + 11} textAnchor="middle">?</text>
      </g>
    )}
    </>
  );
}

export interface CryptoGroupToggleProps {
  x: number;
  y: number;
  groupId: string;
  expanded: boolean;
  nested?: boolean;
  onToggle: (groupId: string) => void;
}

/**
 * 展开态组开关：叠在方法盒 / 派生芯片角上的小按钮，不改变布局几何。
 * 单击方块主体仍是源码联动；只有这个小开关切换组。
 */
export function CryptoGroupToggle({
  x,
  y,
  groupId,
  expanded,
  nested = false,
  onToggle,
}: CryptoGroupToggleProps): ReactElement {
  const toggle = (): void => onToggle(groupId);
  return (
    <g
      className={`structured-group-toggle${nested ? ' structured-group-toggle--nested' : ''}`}
      data-group-id={groupId}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? '折叠' : '展开'}密码操作组${nested ? '（内层）' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
    >
      <circle cx={x} cy={y} r="7" />
      <text x={x} y={y + 3} textAnchor="middle">{expanded ? '▾' : '▸'}</text>
    </g>
  );
}

function activateOnKey(event: KeyboardEvent<SVGGElement>, activate: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
