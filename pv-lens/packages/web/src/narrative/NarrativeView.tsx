/**
 * 规范叙事视图（ticket 04）：把 `buildNarrativeLayout` 的确定性布局自绘为 SVG。
 *
 * React + SVG 自绘，不引入自动布局引擎（布局坐标全在 `layout.ts` 里算好）。
 * 未配对标注、跨泳道连线、降级诊断卡片、图例都在这里落地；
 * 配对数据来自意图配对引擎（ADR-0003），缺省为空即「全部未配对」。
 */

import { useMemo } from 'react';
import type { ParseResult, StepPairing } from '@pv-lens/core';
import { NARRATIVE_METRICS, buildNarrativeLayout, diagnosticSeverityLabel } from './layout';
import type {
  CrossLaneEdge,
  DiagnosticCard,
  LayoutTextLine,
  NarrativeLane,
  NarrativeLayout,
  StepCard,
} from './layout';
import { Legend } from './Legend';

const { cardPaddingX, cardPaddingY, lineBaseline, lineHeight } = NARRATIVE_METRICS;

/** 角标文字宽度估计（装饰用，不影响布局坐标）。 */
const BADGE_CHAR_WIDTH = 12;
const BADGE_HEIGHT = 16;
const BADGE_GAP = 4;

export interface NarrativeViewProps {
  result: ParseResult;
  /** ADR-0003 的意图配对结果；缺省为空数组 ⇒ 所有步骤标未配对、不画连线。 */
  pairings?: readonly StepPairing[];
}

export function NarrativeView({ result, pairings }: NarrativeViewProps) {
  const layout = useMemo(
    () => buildNarrativeLayout(result, { pairings }),
    [result, pairings],
  );

  return (
    <section className="narrative" aria-label="规范叙事视图">
      <h3 className="narrative-title">规范叙事视图（泳道图）</h3>
      {layout.hasLanes ? (
        <>
          <p className="hint">
            每条泳道是一个角色，泳道内按源码顺序排列消息步骤（方向 / 信道 / 符号化词项 /
            new / event / 守卫注释）。无法可靠推断「设计上这条消息发给谁」的步骤标为「未配对」。
            跨泳道连线表示**设计意图**的收发关系（两方协议按源码顺序自动推断，多方协议不自动连线）；
            它**不是**安全保证——消息在攻击者模型下是否可达以 ProVerif 的验证结论为准。
          </p>
          <NarrativeCanvas layout={layout} />
          <Legend />
        </>
      ) : (
        <NoRoleStructure result={result} />
      )}
    </section>
  );
}

/** 无角色结构时的中文提示（而非白屏），并列出解析器诊断。 */
function NoRoleStructure({ result }: { result: ParseResult }) {
  return (
    <div className="narrative-empty" role="status">
      <p className="narrative-empty-lead">
        当前 `.pv` 里没有可识别的角色结构：既没有命名进程（`let 角色名(参数) = 进程体.`），
        也没有内联主进程（`process` 关键字后的进程体），因此无法绘制泳道图。
      </p>
      <p className="hint">下面是解析器给出的诊断，可用于定位模型里的问题：</p>
      {result.diagnostics.length === 0 ? (
        <p className="hint">解析器没有给出任何诊断。</p>
      ) : (
        <ul className="diagnostic-list">
          {result.diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.span.start.offset}-${index}`}
              className={`diagnostic-item diagnostic-item--${diagnostic.severity}`}
            >
              <span className="diagnostic-severity">
                {diagnosticSeverityLabel(diagnostic.severity)}
              </span>
              <span className="diagnostic-line">
                {`L${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)}`}
              </span>
              <span className="diagnostic-message">{diagnostic.message}</span>
              <code className="diagnostic-source">{diagnostic.sourceText}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NarrativeCanvas({ layout }: { layout: NarrativeLayout }) {
  return (
    <div className="narrative-canvas">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`规范叙事视图泳道图：${layout.lanes.length} 条泳道，${layout.crossLaneEdges.length} 条跨泳道连线`}
      >
        <defs>
          <marker
            id="narrative-edge-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path className="narrative-edge-arrow" d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {layout.lanes.map((lane) => (
          <LaneGroup key={lane.roleIndex} lane={lane} />
        ))}
        <g className="narrative-edges">
          {layout.crossLaneEdges.map((edge, index) => (
            <path
              key={`${edge.from.roleIndex}:${edge.from.stepIndex}->${edge.to.roleIndex}:${edge.to.stepIndex}:${index}`}
              className="narrative-edge"
              d={edgePath(edge)}
              markerEnd="url(#narrative-edge-arrow)"
            />
          ))}
        </g>
        {layout.unassignedSection !== null && (
          <UnassignedGroup layout={layout} section={layout.unassignedSection} />
        )}
      </svg>
    </div>
  );
}

/** 跨泳道连线的形态由渲染端决定：右出左入的折线（同向/反向都走得通）。 */
function edgePath(edge: CrossLaneEdge): string {
  const midX = (edge.from.x + edge.to.x) / 2;
  return `M ${edge.from.x} ${edge.from.y} H ${midX} V ${edge.to.y} H ${edge.to.x}`;
}

function LaneGroup({ lane }: { lane: NarrativeLane }) {
  const headerY = lane.y + 22;
  const signatureY = lane.y + 38;
  return (
    <g
      className={`narrative-lane narrative-lane--${lane.kind}${
        lane.replicated ? ' narrative-lane--replicated' : ''
      }`}
    >
      <rect
        className="narrative-lane-bg"
        x={lane.x}
        y={lane.y}
        width={lane.width}
        height={lane.height}
        rx={10}
      />
      <text className="narrative-lane-name" x={lane.x + 14} y={headerY}>
        {lane.name}
      </text>
      {lane.signatureText.length > 0 && (
        <text className="narrative-lane-signature" x={lane.x + 14} y={signatureY}>
          {lane.signatureText}
        </text>
      )}
      {lane.kind === 'main' && (
        <text className="narrative-lane-note" x={lane.x + lane.width - 14} y={headerY} textAnchor="end">
          内联主进程（非协议角色）
        </text>
      )}
      {lane.cards.length === 0 && lane.diagnosticCards.length === 0 && (
        <text
          className="narrative-lane-empty"
          x={lane.x + 14}
          y={lane.y + NARRATIVE_METRICS.laneHeaderHeight + 24}
        >
          （该角色没有可展示的消息步骤）
        </text>
      )}
      {lane.cards.map((card) => (
        <StepCardGroup key={card.stepIndex} card={card} />
      ))}
      {lane.diagnosticCards.map((card, index) => (
        <DiagnosticCardGroup key={`${card.lineNumber}-${index}`} card={card} />
      ))}
    </g>
  );
}

function StepCardGroup({ card }: { card: StepCard }) {
  return (
    <g className={`narrative-card${card.unpaired ? ' narrative-card--unpaired' : ''}`}>
      <title>
        {`${card.arrow} ${card.directionLabel} · 信道 ${card.channelText} · ${card.termText}（源码 L${card.lineNumber}）`}
      </title>
      <rect
        className="narrative-card-bg"
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rx={6}
      />
      <TextLines lines={card.lines} x={card.x + cardPaddingX} y={card.y + cardPaddingY} />
      {card.badges.length > 0 && <CardBadges card={card} />}
    </g>
  );
}

/** 卡片角标：未配对 / `!` / `|`，右对齐在标题行上。`kind` 选样式、`label` 是文字。 */
function CardBadges({ card }: { card: StepCard }) {
  const widths = card.badges.map((badge) => badge.label.length * BADGE_CHAR_WIDTH + 10);
  const total =
    widths.reduce((sum, width) => sum + width, 0) + (card.badges.length - 1) * BADGE_GAP;
  let cursor = card.x + card.width - cardPaddingX - total;
  return (
    <g className="narrative-badges">
      {card.badges.map((badge, index) => {
        const width = widths[index];
        const x = cursor;
        cursor += width + BADGE_GAP;
        const modifier =
          badge.kind === 'unpaired' ? ' narrative-badge--unpaired' : ' narrative-badge--flag';
        return (
          <g key={badge.kind} className={`narrative-badge${modifier}`}>
            <rect x={x} y={card.y + 4} width={width} height={BADGE_HEIGHT} rx={8} />
            <text x={x + width / 2} y={card.y + 4 + BADGE_HEIGHT / 2 + 4} textAnchor="middle">
              {badge.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function DiagnosticCardGroup({ card }: { card: DiagnosticCard }) {
  return (
    <g className={`narrative-diag narrative-diag--${card.severity}`}>
      <title>
        {`${card.severityLabel} · L${card.lineNumber} · ${card.message}（原文：${card.sourceText}）`}
      </title>
      <rect
        className="narrative-diag-bg"
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rx={6}
      />
      <TextLines lines={card.lines} x={card.x + cardPaddingX} y={card.y + cardPaddingY} />
    </g>
  );
}

function UnassignedGroup({
  layout,
  section,
}: {
  layout: NarrativeLayout;
  section: { title: string; x: number; y: number };
}) {
  return (
    <g className="narrative-unassigned">
      <text
        className="narrative-section-title"
        x={section.x}
        y={section.y + lineBaseline + 6}
      >
        {section.title}
      </text>
      {layout.unassignedDiagnostics.map((card, index) => (
        <DiagnosticCardGroup key={`${card.lineNumber}-${index}`} card={card} />
      ))}
    </g>
  );
}

function TextLines({
  lines,
  x,
  y,
}: {
  lines: readonly LayoutTextLine[];
  x: number;
  y: number;
}) {
  return (
    <>
      {lines.map((line, index) => (
        <text
          key={`${line.kind}-${index}`}
          className={`narrative-line narrative-line--${line.kind}`}
          x={x}
          y={y + lineBaseline + index * lineHeight}
        >
          {line.text}
        </text>
      ))}
    </>
  );
}
