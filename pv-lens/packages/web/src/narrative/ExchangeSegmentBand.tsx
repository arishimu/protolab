/**
 * 交换段段带与跨段边（ADR-0018 决策 02 / 阶段 3）。
 *
 * 段头是按钮：单击折叠/展开，回车/空格等价。折叠只隐藏段体，段头计数、事件芯片与
 * 跨段边保留；展开态消息回到原有因果位置。
 */

import type { KeyboardEvent, ReactElement } from 'react';
import type {
  StructuredCrossSegmentEdge,
  StructuredExchangeSegmentBand,
  StructuredExchangeSegmentFold,
} from './structured-layout';

export interface ExchangeSegmentBandSvgProps {
  band: StructuredExchangeSegmentBand;
  sourceSelected?: boolean;
  onToggle: (segmentId: string) => void;
  onSourceSelect?: () => void;
}

export function ExchangeSegmentBandSvg({
  band,
  sourceSelected = false,
  onToggle,
  onSourceSelect,
}: ExchangeSegmentBandSvgProps): ReactElement {
  const activate = (): void => {
    onToggle(band.id);
    onSourceSelect?.();
  };
  const title = [
    `交换段 ${band.label}`,
    `M${String(band.firstSequence)}–M${String(band.lastSequence)}`,
    `${String(band.messageCount)} 条消息`,
    `未配对 ${String(band.counts.unpaired)}`,
    `分支 ${String(band.counts.branches)}`,
    `冲突 ${String(band.counts.conflicts)}`,
    band.events.length > 0 ? `事件 ${band.events.map((event) => event.name).join('、')}（不隐藏）` : '',
    band.collapsed ? '折叠态' : '展开态',
  ].filter(Boolean).join('；');
  const headerWidth = Math.max(160, band.width);
  const titleBudget = Math.max(8, Math.floor((headerWidth - 16) / 8.8));
  const metaBudget = Math.max(10, Math.floor((headerWidth - 16) / 5.6));
  const titleText = `${band.collapsed ? '▸' : '▾'} 交换段 · ${band.label}`;
  const metaText = [
    `M${String(band.firstSequence)}–M${String(band.lastSequence)}`,
    `${String(band.messageCount)} 条`,
    `未配对 ${String(band.counts.unpaired)}`,
    `分支 ${String(band.counts.branches)}`,
    `冲突 ${String(band.counts.conflicts)}`,
    band.events.length > 0 ? `事件 ${band.events.map((event) => event.name).join('、')}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <g
      className={`structured-exchange-segment${band.collapsed ? ' structured-exchange-segment--collapsed' : ''}${sourceSelected ? ' structured-source-selected' : ''}`}
      data-segment-id={band.id}
      data-source-offset={band.sourceSpan.start.offset}
      aria-label={title}
      role="button"
      tabIndex={0}
      aria-expanded={!band.collapsed}
      onClick={activate}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => activateOnKey(event, activate)}
    >
      <title>{title}</title>
      <rect
        className="structured-exchange-band"
        x={band.x}
        y={band.top}
        width={band.width}
        height={Math.max(24, band.bottom - band.top)}
        rx="8"
      />
      <rect
        className="structured-exchange-band-inner"
        x={band.x + 3}
        y={band.top + 3}
        width={Math.max(0, band.width - 6)}
        height={Math.max(18, band.bottom - band.top - 6)}
        rx="6"
      />
      <rect
        className="structured-exchange-band-head"
        x={band.x}
        y={band.top - 28}
        width={headerWidth}
        height="28"
        rx="6"
      />
      <text className="structured-exchange-band-title" x={band.x + 8} y={band.top - 17}>
        {truncate(titleText, titleBudget)}
      </text>
      <text className="structured-exchange-band-meta" x={band.x + 8} y={band.top - 5}>
        {truncate(metaText, metaBudget)}
      </text>
    </g>
  );
}

export interface ExchangeSegmentFoldSvgProps {
  fold: StructuredExchangeSegmentFold;
  onToggle: (segmentId: string) => void;
}

/** 折叠态每角色一条的段体摘要；与全局段头、消息列表按钮保持同一折叠状态。 */
export function ExchangeSegmentFoldSvg({ fold, onToggle }: ExchangeSegmentFoldSvgProps): ReactElement {
  return (
    <g
      className="structured-exchange-fold"
      data-segment-id={fold.segmentId}
      data-source-offset={fold.sourceSpan.start.offset}
      role="button"
      tabIndex={0}
      aria-expanded={false}
      aria-label={`${fold.label}；回车展开`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(fold.segmentId);
      }}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onToggle(fold.segmentId);
      }}
    >
      <rect x={fold.x - fold.width / 2} y={fold.y - fold.height / 2} width={fold.width} height={fold.height} rx="5" />
      <text x={fold.x - fold.width / 2 + 7} y={fold.y + 4}>▸ {fold.label}</text>
    </g>
  );
}

export interface CrossSegmentEdgeSvgProps {
  edge: StructuredCrossSegmentEdge;
}

/** 跨段边：折叠态沿段框外侧 gutter 绕行，展开态按可见端与段边界连接。 */
export function CrossSegmentEdgeSvg({ edge }: CrossSegmentEdgeSvgProps): ReactElement {
  const midX = edge.x;
  return (
    <g className="structured-cross-segment-edge" data-segment-id={edge.segmentId} aria-label={edge.label}>
      <title>{edge.label}</title>
      <path d={`M ${edge.x} ${edge.y} L ${midX} ${edge.y} L ${midX} ${edge.targetY} L ${edge.targetX} ${edge.targetY}`} />
      <text className="structured-cross-segment-label" x={midX + 4} y={(edge.y + edge.targetY) / 2} textAnchor="start">
        跨段边
      </text>
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function activateOnKey(event: KeyboardEvent<SVGGElement>, activate: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate();
}
