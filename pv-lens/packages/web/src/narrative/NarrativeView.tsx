import { useMemo, useState } from 'react';
import type { ParseResult, StepPairing } from '@pv-lens/core';
import { buildNarrativeLayout, diagnosticSeverityLabel } from './layout';
import {
  CHANNEL_STYLES,
  MESSAGE_COLORS,
  VALUE_COLORS,
  buildStructuredNarrativeLayout,
  legacyPairingsToMessagePairings,
} from './structured-layout';
import type { StructuredNarrativeLayout, StructuredNode } from './structured-layout';
import { Legend } from './Legend';
import './v2.css';


export interface NarrativeViewProps {
  result: ParseResult;
  pairings?: readonly StepPairing[];
}

export function NarrativeView({ result, pairings = [] }: NarrativeViewProps) {
  const [compactness, setCompactness] = useState(0);
  const [zoom, setZoom] = useState(1);
  const structured = useMemo(
    () => buildStructuredNarrativeLayout(result, {
      pairings: legacyPairingsToMessagePairings(pairings),
      compactness,
    }),
    [result, pairings, compactness],
  );
  const legacy = useMemo(() => buildNarrativeLayout(result, { pairings }), [result, pairings]);

  return (
    <section className="narrative" aria-label="规范叙事视图">
      <div className="narrative-heading">
        <h3 className="narrative-title">规范叙事视图</h3>
        <div className="narrative-controls" aria-label="画布控制">
          <label>
            紧凑度
            <input
              aria-label="画布紧凑度"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={compactness}
              onChange={(event) => setCompactness(Number(event.target.value))}
            />
          </label>
          <button type="button" className="icon-btn" aria-label="缩小画布" title="缩小画布" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}>−</button>
          <output aria-label="当前缩放">{Math.round(zoom * 100)}%</output>
          <button type="button" className="icon-btn" aria-label="放大画布" title="放大画布" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}>+</button>
          <button type="button" className="icon-btn icon-btn--wide" aria-label="适合宽度" title="适合宽度" onClick={() => setZoom(1)}>适合宽度</button>
        </div>
      </div>
      {structured.hasLanes ? (
        <>
          <p className="hint">
            纵轴是每个角色自己的消息序，信道是共享空间锚点；颜色只表示消息和值，不表示信道或验证结论。
            跨角色连接表达设计意图，不代表攻击者模型下的可达性。
          </p>
          <StructuredNarrativeCanvas layout={structured} zoom={zoom} legacy={legacy} />
          <NarrativeDiagnostics result={result} />
          <Legend />
        </>
      ) : (
        <NoRoleStructure result={result} />
      )}
    </section>
  );
}

function StructuredNarrativeCanvas({
  layout,
  zoom,
  legacy,
}: {
  layout: StructuredNarrativeLayout;
  zoom: number;
  legacy: ReturnType<typeof buildNarrativeLayout>;
}) {
  const pairedEndpointCount = layout.endpoints.filter((endpoint) => !endpoint.unpaired).length;
  const messageCount = pairedEndpointCount / 2;
  return (
    <div className="narrative-canvas narrative-canvas--structured">
      <svg
        width={layout.width * zoom}
        height={layout.height * zoom}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`规范叙事视图：${layout.columns.filter((column) => column.kind === 'role').length} 条泳道，${messageCount} 条跨泳道连线`}
      >
        <defs>
          {MESSAGE_COLORS.map((color, index) => (
            <marker key={color} id={`message-arrow-${String(index)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
        <StructuredColumns layout={layout} />
        <g className="structured-message-layer">
          {layout.pillars.map((pillar) => <MessagePillarSvg key={pillar.id} pillar={pillar} />)}
          {layout.endpoints.map((endpoint) => <EndpointSvg key={endpoint.id} endpoint={endpoint} messageIndex={layout.pillars.findIndex((pillar) => pillar.endpoints.some((candidate) => candidate.id === endpoint.id))} />)}
        </g>
        <g className="structured-node-layer">
          {layout.nodes
            .filter((node) => node.kind !== 'message' && (node.kind !== 'local' || node.bindingIds.length === 0))
            .map((node) => <StructuredNodeSvg key={node.id} node={node} />)}
        </g>
        <g className="structured-value-layer">
          {layout.methods.map((method) => <StructuredMethodSvg key={method.id} method={method} />)}
          {layout.valueBlocks.map((block) => <StructuredValueBlockSvg key={block.id} block={block} />)}
        </g>
        {layout.conflicts.map((conflict) => (
          <g key={conflict.id} className="structured-conflict" aria-label={conflict.message}>
            <path d={`M ${layout.width - 42} ${conflict.y - 10} l 10 20 h -20 z`} />
            <text x={layout.width - 26} y={conflict.y + 4}>{conflict.message}</text>
          </g>
        ))}
        {/* 兼容旧 DOM 查询：旧布局数据不参与可见几何。 */}
        <title>{legacy.hasLanes ? 'v2 结构化叙事布局' : '无角色结构'}</title>
      </svg>
    </div>
  );
}

function StructuredColumns({ layout }: { layout: StructuredNarrativeLayout }) {
  return (
    <g className="structured-columns">
      {layout.columns.map((column) => {
        const isChannel = column.kind === 'channel';
        const style = CHANNEL_STYLES[column.index % CHANNEL_STYLES.length];
        return (
          <g key={`${column.kind}-${column.name}`} className={`structured-column structured-column--${column.kind}`} data-identity={column.name}>
            {isChannel ? (
              <rect className={`structured-channel structured-channel--${style}`} x={column.x + 10} y="28" width={column.width - 20} height={layout.height - 60} />
            ) : (
              <line className="structured-lifeline" x1={column.x + column.width / 2} x2={column.x + column.width / 2} y1="62" y2={layout.height - 24} />
            )}
            <text className="structured-column-label" x={column.x + column.width / 2} y="20" textAnchor="middle">{isChannel ? `信道 ${column.name}` : column.name}</text>
            {!isChannel && column.signatureText !== undefined && column.signatureText.length > 0 && (
              <text
                className="structured-column-signature"
                x={column.x + column.width / 2}
                y="36"
                textAnchor="middle"
                aria-label={column.signatureText}
              >
                <title>{column.signatureText}</title>
                {truncate(column.signatureText, 24)}
              </text>
            )}
            {!isChannel && (column.replicated || column.parallel) && (
              <text className="structured-column-flags" x={column.x + column.width / 2} y="51" textAnchor="middle">
                {[column.replicated ? '!' : '', column.parallel ? '|' : ''].filter(Boolean).join(' ')}
              </text>
            )}
            {isChannel && <text className="structured-channel-index" x={column.x + column.width / 2} y="48" textAnchor="middle">{channelGlyph(column.index)}</text>}
          </g>
        );
      })}
    </g>
  );
}

function MessagePillarSvg({ pillar }: { pillar: StructuredNarrativeLayout['pillars'][number] }) {
  return (
    <g className="structured-message-pillar" data-identity={pillar.id} aria-label={`消息 ${pillar.sequence} · 信道 ${pillar.channelName}`}>
      <rect x={pillar.channelX - 5} y={pillar.top - 6} width="10" height={Math.max(12, pillar.bottom - pillar.top + 12)} fill={pillar.color} />
      <text x={pillar.channelX + 10} y={pillar.top + 4} fill={pillar.color}>M{pillar.sequence}</text>
    </g>
  );
}

function EndpointSvg({
  endpoint,
  messageIndex,
}: {
  endpoint: StructuredNarrativeLayout['endpoints'][number];
  messageIndex: number;
}) {
  const color = messageIndex >= 0 ? MESSAGE_COLORS[messageIndex % MESSAGE_COLORS.length] : '#C2410C';
  const marker = messageIndex >= 0 ? `url(#message-arrow-${String(messageIndex % MESSAGE_COLORS.length)})` : undefined;
  const start = endpoint.direction === 'out' ? endpoint.roleX : endpoint.channelX;
  const end = endpoint.direction === 'out' ? endpoint.channelX : endpoint.roleX;
  const curve = Math.abs(end - start) > 100 ? (start + end) / 2 : start + (end - start) / 2;
  const path = `M ${start} ${endpoint.y} Q ${curve} ${endpoint.y - 16} ${end} ${endpoint.y}`;
  return (
    <g className={`structured-endpoint${endpoint.unpaired ? ' structured-endpoint--unpaired narrative-card--unpaired' : ' narrative-edge'}`} data-identity={endpoint.id} data-channel={endpoint.channelName} aria-label={`${endpoint.direction === 'out' ? '发出' : '接收'} ${endpoint.termText} · 信道 ${endpoint.channelName}`}>
      <path d={path} stroke={color} markerEnd={marker} />
      <rect className={`structured-term-chip structured-term-chip--${endpoint.termPresentation}`} x={(start + end) / 2 - 35} y={endpoint.y - 11} width="70" height="22" stroke={color} />
      <text x={(start + end) / 2} y={endpoint.y + 4} textAnchor="middle">{truncate(endpoint.termText, 10)}</text>
      {endpoint.unpaired && <circle className="structured-unpaired-dot" cx={endpoint.channelX} cy={endpoint.y} r="5" />}
    </g>
  );
}

function StructuredNodeSvg({ node }: { node: StructuredNode }) {
  if (node.kind === 'event') {
    return (
      <g className="structured-event" data-source-offset={node.span.start.offset} aria-label={node.label}>
        <path d={`M ${node.x + node.width / 2} ${node.y + 5} l 9 9 l -9 9 l -9 -9 z`} />
        <line x1={node.x + node.width / 2 + 8} y1={node.y + 10} x2={node.x + node.width / 2 + 20} y2={node.y - 3} />
        <text x={node.x + node.width / 2 + 24} y={node.y + 18}>{node.label}</text>
      </g>
    );
  }
  return (
    <g className={`structured-node structured-node--${node.kind}`} data-source-offset={node.span.start.offset} aria-label={node.label}>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} />
      <text x={node.x + node.width / 2} y={node.y + node.height / 2 + 4} textAnchor="middle">{truncate(node.label, 8)}</text>
    </g>
  );
}

function StructuredMethodSvg({ method }: { method: StructuredNarrativeLayout['methods'][number] }) {
  const halfWidth = method.width / 2;
  const halfHeight = method.height / 2;
  const points = method.direction === 'construct'
    ? [
        [method.x - halfWidth, method.y - halfHeight + 5],
        [method.x + halfWidth, method.y - halfHeight],
        [method.x + halfWidth, method.y + halfHeight],
        [method.x - halfWidth, method.y + halfHeight - 5],
      ]
    : [
        [method.x - halfWidth, method.y - halfHeight],
        [method.x + halfWidth, method.y - halfHeight],
        [method.x + 25, method.y + halfHeight],
        [method.x - 25, method.y + halfHeight],
      ];
  const directionLabel = method.direction === 'construct'
    ? '构造'
    : method.direction === 'destruct'
      ? '解构'
      : '选择';
  return (
    <g
      className={`structured-method structured-method--${method.direction}`}
      data-source-offset={method.sourceSpan.start.offset}
      aria-label={`${directionLabel}方法 ${method.label}`}
    >
      <polygon points={points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')} />
      <text x={method.x} y={method.y + 4} textAnchor="middle">{truncate(method.label, 10)}</text>
    </g>
  );
}

function StructuredValueBlockSvg({ block }: { block: StructuredNarrativeLayout['valueBlocks'][number] }) {
  const occurrenceLabel = block.occurrence === 'binding'
    ? '绑定'
    : block.occurrence === 'equality'
      ? '等值复制'
      : '引用';
  return (
    <g
      className={`structured-value-block structured-value-block--${block.occurrence}`}
      data-binding-id={block.bindingId}
      data-source-offset={block.sourceSpan.start.offset}
      aria-label={`${occurrenceLabel} ${block.label}`}
    >
      <rect
        x={block.x - block.width / 2}
        y={block.y - block.height / 2}
        width={block.width}
        height={block.height}
        fill={block.color}
      />
      <text x={block.x} y={block.y + 4} textAnchor="middle">{truncate(block.label, 8)}</text>
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function channelGlyph(index: number): string {
  return ['①', '②', '③', '④', '⑤'][index] ?? `(${String(index + 1)})`;
}

function NarrativeDiagnostics({ result }: { result: ParseResult }) {
  if (result.diagnostics.length === 0) return null;
  return (
    <section className="narrative-diagnostics" aria-label="解析诊断">
      <h4>解析诊断</h4>
      <ul className="diagnostic-list">
        {result.diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.span.start.offset}-${index}`} className={`diagnostic-item diagnostic-item--${diagnostic.severity}`}>
            <span className="diagnostic-severity">{diagnosticSeverityLabel(diagnostic.severity)}</span>
            <span className="diagnostic-line">{`L${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)}`}</span>
            <span className="diagnostic-message">{diagnostic.message}</span>
            <code className="diagnostic-source">{diagnostic.sourceText}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
function NoRoleStructure({ result }: { result: ParseResult }) {
  return (
    <div className="narrative-empty" role="status">
      <p className="narrative-empty-lead">
        当前 `.pv` 里没有可识别的角色结构：既没有命名进程，也没有内联主进程，因此无法绘制规范叙事视图。
      </p>
      <p className="hint">下面是解析器给出的诊断，可用于定位模型里的问题：</p>
      {result.diagnostics.length === 0 ? (
        <p className="hint">解析器没有给出任何诊断。</p>
      ) : (
        <ul className="diagnostic-list">
          {result.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.span.start.offset}-${index}`} className={`diagnostic-item diagnostic-item--${diagnostic.severity}`}>
              <span className="diagnostic-severity">{diagnosticSeverityLabel(diagnostic.severity)}</span>
              <span className="diagnostic-line">{`L${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)}`}</span>
              <span className="diagnostic-message">{diagnostic.message}</span>
              <code className="diagnostic-source">{diagnostic.sourceText}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { VALUE_COLORS };
