import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  /** 初始即折叠的分支（分支标记 item id）；默认全部展开。 */
  initialCollapsedBranches?: readonly string[];
}

export function NarrativeView({ result, pairings = [], initialCollapsedBranches = [] }: NarrativeViewProps) {
  const [compactness, setCompactness] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [collapsedBranches, setCollapsedBranches] = useState<readonly string[]>(initialCollapsedBranches);
  const toggleBranch = (branchId: string): void => {
    setCollapsedBranches((current) => current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId]);
  };
  const structured = useMemo(
    () => buildStructuredNarrativeLayout(result, {
      pairings: legacyPairingsToMessagePairings(pairings),
      compactness,
      collapsedBranches,
    }),
    [result, pairings, compactness, collapsedBranches],
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
          <StructuredNarrativeCanvas layout={structured} zoom={zoom} legacy={legacy} onToggleBranch={toggleBranch} />
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
  onToggleBranch,
}: {
  layout: StructuredNarrativeLayout;
  zoom: number;
  legacy: ReturnType<typeof buildNarrativeLayout>;
  onToggleBranch: (branchId: string) => void;
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
        <g className="structured-arm-layer">
          {layout.armRuns.map((run) => <ArmRunSvg key={run.id} run={run} />)}
        </g>
        <g className="structured-branch-fold-layer">
          {layout.branchFolds.map((fold) => (
            <BranchFoldSvg key={fold.branchId} fold={fold} onToggleBranch={onToggleBranch} />
          ))}
        </g>
        <g className="structured-message-layer">
          {layout.pillars.map((pillar) => <MessagePillarSvg key={pillar.id} pillar={pillar} />)}
          {layout.endpoints.map((endpoint) => <EndpointSvg key={endpoint.id} endpoint={endpoint} messageIndex={layout.pillars.findIndex((pillar) => pillar.endpoints.some((candidate) => candidate.id === endpoint.id))} />)}
        </g>
        <g className="structured-node-layer">
          {layout.nodes
            .filter((node) => node.kind !== 'message' && node.kind !== 'branch' && (node.kind !== 'local' || node.bindingIds.length === 0))
            .map((node) => <StructuredNodeSvg key={node.id} node={node} />)}
        </g>
        <g className="structured-value-layer">
          {layout.methods.map((method) => <StructuredMethodSvg key={method.id} method={method} onToggleBranch={onToggleBranch} />)}
          {layout.chips.map((chip) => <StructuredChipSvg key={chip.id} chip={chip} />)}
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
              <rect className={`structured-channel structured-channel--${style}`} x={column.x + 6} y="28" width={column.width - 12} height={layout.height - 60} />
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
            {column.parameterLabelY !== undefined && (
              <text className="structured-parameter-label" x={column.x + column.width / 2} y={column.parameterLabelY} textAnchor="middle">参数</text>
            )}
            {isChannel && <text className="structured-channel-index" x={column.x + column.width / 2} y="48" textAnchor="middle">{channelGlyph(column.index)}</text>}
          </g>
        );
      })}
    </g>
  );
}

function MessagePillarSvg({ pillar }: { pillar: StructuredNarrativeLayout['pillars'][number] }) {
  const frameY = pillar.frameY;
  return (
    <g className="structured-message-pillar" data-identity={pillar.id} data-term={pillar.termText} aria-label={`消息 M${String(pillar.sequence)} · 信道 ${pillar.channelName} · ${pillar.termText}`}>
      <rect x={pillar.channelX - 5} y={pillar.top - 6} width="10" height={Math.max(12, pillar.bottom - pillar.top + 12)} fill={pillar.color} />
      <text x={pillar.channelX + 10} y={pillar.top + 4} fill={pillar.color}>M{pillar.sequence}</text>
      <g className="structured-message-frame">
        <title>{pillar.termText}</title>
        <rect className={`structured-term-chip structured-term-chip--${pillar.termPresentation}`} x={pillar.channelX - 28} y={frameY - 11} width="56" height="22" stroke={pillar.color} />
        <text x={pillar.channelX} y={frameY + 4} textAnchor="middle">{truncate(pillar.termText, 8)}</text>
      </g>
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
  // 消息一律画直线（对齐 prototype 05）：跨过中间生命线也不上拱，不做跨线弧。
  const path = `M ${start} ${endpoint.y} L ${end} ${endpoint.y}`;
  // 未配对词项靠近信道轨（T2 的信道段），给中间留出构造盒的位置。
  const chipX = endpoint.roleX + (endpoint.channelX - endpoint.roleX) * 0.72;
  // 箭头只指向「抵达目标」：配对消息的发送段不画箭头（在发送端画起点圆点），
  // 接收段与未配对端（指向信道轨）才有箭头。
  const showArrow = endpoint.unpaired || endpoint.direction === 'in';
  const startDot = !endpoint.unpaired && endpoint.direction === 'out';
  return (
    <g className={`structured-endpoint${endpoint.unpaired ? ' structured-endpoint--unpaired narrative-card--unpaired' : ' narrative-edge'}`} data-identity={endpoint.id} data-channel={endpoint.channelName} aria-label={`${endpoint.direction === 'out' ? '发出' : '接收'} ${endpoint.termText} · 信道 ${endpoint.channelName}`}>
      <path d={path} stroke={color} markerEnd={showArrow ? marker : undefined} />
      {startDot && (
        <circle
          className="structured-sender-dot"
          cx={endpoint.roleX + Math.sign(endpoint.channelX - endpoint.roleX) * 30}
          cy={endpoint.y}
          r="3.5"
          fill={color}
        />
      )}
      {endpoint.unpaired && (
        <>
          <title>{endpoint.termText}</title>
          <rect className={`structured-term-chip structured-term-chip--${endpoint.termPresentation}`} x={chipX - 35} y={endpoint.y - 11} width="70" height="22" stroke={color} />
          <text x={chipX} y={endpoint.y + 4} textAnchor="middle">{truncate(endpoint.termText, 10)}</text>
          <circle className="structured-unpaired-dot" cx={endpoint.channelX} cy={endpoint.y} r="5" />
        </>
      )}
    </g>
  );
}

function StructuredNodeSvg({ node }: { node: StructuredNode }) {
  const label = truncate(node.label, node.labelMaxChars);
  if (node.kind === 'event') {
    // 事件旗标：生命线上的实心旗 + 右侧标签（前提/结论区分归 #08）。
    return (
      <g className="structured-event" data-source-offset={node.span.start.offset} aria-label={node.label}>
        <title>{node.label}</title>
        <path d={`M ${node.x + node.width / 2} ${node.y + 7} l 12 6 l -12 6 z`} />
        <text x={node.labelX} y={node.y + 18} textAnchor={node.labelAnchor}>{label}</text>
      </g>
    );
  }
  if (node.kind === 'branch') {
    // 分支占位：生命线上的横 tick + 守卫原文（#03 会换成等值检查盒 + 臂道）。
    return (
      <g className="structured-node structured-node--branch" data-source-offset={node.span.start.offset} aria-label={node.label}>
        <title>{node.label}</title>
        <line x1={node.x + 8} x2={node.x + node.width - 8} y1={node.y + node.height / 2} y2={node.y + node.height / 2} />
        <text x={node.labelX} y={node.y + node.height / 2 + 4} textAnchor={node.labelAnchor}>{label}</text>
      </g>
    );
  }
  return (
    <g className={`structured-node structured-node--${node.kind}`} data-source-offset={node.span.start.offset} aria-label={node.label}>
      <title>{node.label}</title>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} />
      <text
        x={node.labelAnchor === 'middle' ? node.x + node.width / 2 : node.labelX}
        y={node.y + node.height / 2 + 4}
        textAnchor={node.labelAnchor}
      >
        {label}
      </text>
    </g>
  );
}

function StructuredMethodSvg({
  method,
  onToggleBranch,
}: {
  method: StructuredNarrativeLayout['methods'][number];
  onToggleBranch: (branchId: string) => void;
}) {
  const halfWidth = method.width / 2;
  const halfHeight = method.height / 2;
  const narrowHeight = halfHeight - 5;
  // 竖置（解构 / 选择）：上宽下窄，窄底贴输出方块；
  // 横置（构造）：窄端朝消息，长端贴生命线侧。
  const narrowRight = method.narrowTowards !== 'left';
  const points = method.direction === 'construct'
    ? (narrowRight
        ? [
            [method.x - halfWidth, method.y - halfHeight],
            [method.x + halfWidth, method.y - narrowHeight],
            [method.x + halfWidth, method.y + narrowHeight],
            [method.x - halfWidth, method.y + halfHeight],
          ]
        : [
            [method.x - halfWidth, method.y - narrowHeight],
            [method.x + halfWidth, method.y - halfHeight],
            [method.x + halfWidth, method.y + halfHeight],
            [method.x - halfWidth, method.y + narrowHeight],
          ])
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
      : method.direction === 'check'
        ? '检查'
        : '选择';
  return (
    <g
      className={`structured-method structured-method--${method.direction}`}
      data-source-offset={method.sourceSpan.start.offset}
      aria-label={`${directionLabel}方法 ${method.label}`}
    >
      <polygon points={points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')} />
      <text x={method.x} y={method.y + 4} textAnchor="middle">{truncate(method.label, 10)}</text>
      {method.connector !== undefined && (
        <text className="structured-check-connector" x={method.x - halfWidth - 10} y={method.y + 4} textAnchor="end">{method.connector}</text>
      )}
      {method.caption !== undefined && (
        <text className="structured-method-caption" x={method.x} y={method.y + halfHeight + 9} textAnchor="middle">
          <title>{method.caption}</title>
          {truncate(method.caption, 16)}
        </text>
      )}
      {method.branchId !== undefined && (
        <BranchToggleSvg method={method} onToggleBranch={onToggleBranch} />
      )}
    </g>
  );
}

/** 展开态守卫盒旁的折叠开关：一个分支一个（复合守卫只在第一行挂）。 */
function BranchToggleSvg({
  method,
  onToggleBranch,
}: {
  method: StructuredNarrativeLayout['methods'][number];
  onToggleBranch: (branchId: string) => void;
}) {
  const branchId = method.branchId;
  if (branchId === undefined) return null;
  const branchText = method.branchText ?? '';
  const halfWidth = method.width / 2;
  return (
    <g
      className="structured-branch-toggle"
      role="button"
      tabIndex={0}
      data-branch-id={branchId}
      aria-label={`折叠分支 ${branchText}`}
      onClick={() => onToggleBranch(branchId)}
      onKeyDown={(event) => activateOnKey(event, () => onToggleBranch(branchId))}
    >
      <title>{`折叠分支 ${branchText}`}</title>
      <rect x={method.x + halfWidth + 3} y={method.y - 7} width="14" height="14" rx="4" />
      <text x={method.x + halfWidth + 10} y={method.y + 4} textAnchor="middle">▾</text>
    </g>
  );
}

function BranchFoldSvg({
  fold,
  onToggleBranch,
}: {
  fold: StructuredNarrativeLayout['branchFolds'][number];
  onToggleBranch: (branchId: string) => void;
}) {
  return (
    <g
      className="structured-branch-fold"
      role="button"
      tabIndex={0}
      data-branch-id={fold.branchId}
      aria-label={`展开分支 ${fold.guardText}（隐藏 ${String(fold.hiddenCount)} 步）`}
      onClick={() => onToggleBranch(fold.branchId)}
      onKeyDown={(event) => activateOnKey(event, () => onToggleBranch(fold.branchId))}
    >
      <title>{fold.label}</title>
      <rect
        x={fold.x - fold.width / 2}
        y={fold.y - fold.height / 2}
        width={fold.width}
        height={fold.height}
        rx={fold.height / 2}
      />
      <text x={fold.x} y={fold.y + 4} textAnchor="middle">
        {truncate(fold.label, Math.max(4, Math.floor((fold.width - 12) / 6.2)))}
      </text>
    </g>
  );
}

/** 让 role="button" 的 SVG 元素像真按钮一样响应 Enter / Space。 */
function activateOnKey(event: KeyboardEvent<SVGGElement>, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
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

function ArmRunSvg({ run }: { run: StructuredNarrativeLayout['armRuns'][number] }) {
  const top = run.top;
  const bottom = run.empty ? top + 18 : Math.max(run.bottom, top + 18);
  return (
    <g
      className={`structured-arm structured-arm--${run.arm}${run.empty ? ' structured-arm--empty' : ''}`}
      data-identity={run.id}
      aria-label={`分支臂道 ${run.label}`}
    >
      <line className="structured-arm-rail" x1={run.railX} x2={run.railX} y1={top} y2={bottom} />
      <line className="structured-arm-tick" x1={run.railX} x2={run.lifelineX} y1={top} y2={top} />
      <line className="structured-arm-tick" x1={run.railX} x2={run.lifelineX} y1={bottom} y2={bottom} />
      <text className="structured-arm-label" x={run.railX + 5} y={top + 12} textAnchor="start">{run.label}</text>
    </g>
  );
}

function StructuredChipSvg({ chip }: { chip: StructuredNarrativeLayout['chips'][number] }) {
  const kindLabel = chip.kind === 'derived'
    ? '派生芯片'
    : chip.kind === 'condition'
      ? '条件芯片'
      : '模式芯片';
  return (
    <g className={`structured-chip structured-chip--${chip.kind}`} data-source-offset={chip.sourceSpan.start.offset} aria-label={`${kindLabel} ${chip.text}`}>
      <title>{chip.text}</title>
      <rect x={chip.x - chip.width / 2} y={chip.y - chip.height / 2} width={chip.width} height={chip.height} rx="4" />
      <text x={chip.x} y={chip.y + 4} textAnchor="middle">{truncate(chip.text, 9)}</text>
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
