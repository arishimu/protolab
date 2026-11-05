import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { useToggleSet } from './toggle-set';
import type { ExchangeSegment, MessagePairing, OperationKind, PairingDiagnostic, ParseResult, PvDiagnostic, SourceSpan } from '@pv-lens/core';
import { buildExchangeDag, conceptOf, deriveCryptoGroups } from '@pv-lens/core';
import { buildNarrativeLayout, diagnosticSeverityLabel } from './layout';
import {
  UNPAIRED_COLOR,
  VALUE_COLORS,
  buildStructuredNarrativeLayout,
  channelLineStyleOf,
  foldGuardBudgetOf,
  foldLabelBudgetOf,
  frameLabelBudgetOf,
} from './structured-layout';
import type {
  MessageLineStyle,
  MessagePillar,
  StructuredChip,
  StructuredConflict,
  StructuredNarrativeLayout,
  StructuredNode,
  StructuredOperatorClusterFold,
  StructuredValueBlock,
} from './structured-layout';
import type { SelectableEndpoint } from './pairing-selection';
import { Legend } from './Legend';
import { CryptoGroupToggle, CryptoOperationGroupSvg } from './CryptoOperationGroup';
import { GroupAuditPanel } from './GroupAuditPanel';
import { MessageList } from './MessageList';
import { CrossSegmentEdgeSvg, ExchangeSegmentBandSvg, ExchangeSegmentFoldSvg } from './ExchangeSegmentBand';
import { ConceptNote } from './ConceptNote';
import './v2.css';

/** 事件旗标与对应性矩阵的联动绑定（ticket 08）：形状按事件在查询中的角色区分。 */
export interface EventCorrespondenceBinding {
  /** 事件源码 offset → 前提（出现在某查询左侧）/ 结论（右侧）角色。 */
  rolesByOffset: ReadonlyMap<number, { premise: boolean; conclusion: boolean }>;
  selectedOffset: number | null;
  /** 单击旗标：选中事件，矩阵高亮其行/列。 */
  onSelect: (offset: number) => void;
  /** 双击旗标：选中该事件的自反对应性单元。 */
  onReflexive: (offset: number) => void;
}

/**
 * 图↔源码双向联动（ticket 10 / spec 67–68）：选中 span 是唯一共享状态——
 * 点画布对象选其 span（图→源码滚动高亮）；点源码行选该行区间（源码→图反向高亮，
 * 同名绑定因 span 不同天然只命中其一，不跨角色合并）。
 */
export interface SourceLinkBinding {
  selectedSpan: SourceSpan | null;
  /** 画布身份命中：值方块用 bindingId，端点/节点用对象 id；null 时退回 span 重叠。 */
  selectedId?: string | null;
  onSelectSpan: (span: SourceSpan) => void;
  /** 画布对象点击：同时记录身份与源码区间。 */
  onSelectIdentity?: (identity: string, span: SourceSpan) => void;
}

/**
 * 对象区间与选中区间是否重叠（反向高亮判定）。span 半开：end 落在行首（column ≤ 1）
 * 时该行不计入（与 SourcePanel 的高亮口径一致）。选中区间为单行时进一步按列相交判定，
 * 同行不同列的同名声明不串选；跨行区间按行级判定。
 */
export function spanOverlapsSelected(span: SourceSpan, selected: SourceSpan | null): boolean {
  if (selected === null) return false;
  const selectedEndLine = selected.end.column <= 1 ? selected.end.line - 1 : selected.end.line;
  const selectedSingleLine = selected.start.line === selectedEndLine;
  if (span.start.line > selectedEndLine || span.end.line < selected.start.line) return false;
  if (!selectedSingleLine) return true;
  // 选中区间单行：对象跨该行（多行 span）视为整行命中，否则按列区间相交。
  if (span.end.line > span.start.line) return true;
  return span.start.column < selected.end.column && span.end.column > selected.start.column;
}


export interface NarrativeViewProps {
  result: ParseResult;
  /** 统一配对 IR（自动 + 人工声明，`composeMessagePairings` 的输出）。 */
  pairings?: readonly MessagePairing[];
  /** 初始即折叠的分支（分支标记 item id）；默认全部展开。 */
  initialCollapsedBranches?: readonly string[];
  /** 初始即展开的算子簇（07b / spec 51：簇默认折叠，此 prop 供测试与外层控制初始态）。 */
  initialExpandedClusters?: readonly string[];
  /** 初始即折叠的密码操作组 id；缺省全部展开（展开态保持基线结构）。 */
  initialCollapsedCryptoGroups?: readonly string[];
  /** 初始交换段（会话内存注入，测试或外部恢复用）。 */
  initialExchangeSegments?: readonly ExchangeSegment[];
  /** 初始即折叠的交换段 id。 */
  initialCollapsedExchangeSegments?: readonly string[];
  /** 人工配对诊断（拒绝与顺序环），渲染为画布旁的警告条。 */
  manualDiagnostics?: readonly PairingDiagnostic[];
  /** 人工配对点选：当前选中的未配对发送端 id。 */
  pendingOutId?: string | null;
  /** 点选被拒的即时提示（自动端 / 未选发送端 / 跨信道），由 App 传入。 */
  selectionNotice?: string | null;
  /** 成功声明的即时撤销入口；缺省时不显示。 */
  onUndoSelection?: () => void;
  onEndpointSelect?: (endpoint: SelectableEndpoint) => void;
  /** 事件旗标与对应性矩阵联动（ticket 08）；缺省时旗标为普通标记。 */
  eventCorrespondence?: EventCorrespondenceBinding;
  /** 图↔源码双向联动（ticket 10）；缺省时画布对象不带源码联动。 */
  sourceLink?: SourceLinkBinding;
  /** D1 显式定位入口：选中画布对象后点「定位源码」滚动源码面板（页面滚动不变）。 */
  onFocusSource?: () => void;
  /** 当前是否存在可定位的选中对象（控制「定位源码」按钮的可用态）。 */
  canFocusSource?: boolean;
}

/** D2 画布滚动命令句柄：只滚动画布容器，页面滚动位置不变（ADR-0015 滚动所有权）。 */
export interface NarrativeViewHandle {
  /** 滚动到首个源码 offset 落在区间内的画布对象。 */
  scrollToSpan(span: SourceSpan): void;
  /** 滚动到指定源码 offset 的事件旗标。 */
  scrollToEvent(offset: number): void;
}

export const NarrativeView = forwardRef<NarrativeViewHandle, NarrativeViewProps>(function NarrativeView({
  result,
  pairings = [],
  initialCollapsedBranches = [],
  initialExpandedClusters = [],
  initialCollapsedCryptoGroups = [],
  initialExchangeSegments = [],
  initialCollapsedExchangeSegments = [],
  manualDiagnostics = [],
  pendingOutId = null,
  selectionNotice = null,
  onUndoSelection,
  onEndpointSelect,
  eventCorrespondence,
  sourceLink,
  onFocusSource,
  canFocusSource = false,
}: NarrativeViewProps, ref) {
  const [compactness, setCompactness] = useState(0);
  const [zoom, setZoom] = useState(1);
  // C13：人工配对显式入口——模式内展示三步说明；未进入时保留一行常驻说明。
  const [pairingMode, setPairingMode] = useState(false);
  // D6 适合宽度：默认自动适配容器；用户手动缩放后退出，点「适合宽度」重新进入。
  const [autoFit, setAutoFit] = useState(true);
  // R04：适合页面是全图概览，可低于手动缩放下限；展开与全屏是两种更大的阅读视口。
  const [fitPage, setFitPage] = useState(false);
  const [expandedView, setExpandedView] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canBackToTop, setCanBackToTop] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [collapsedBranches, toggleBranch] = useToggleSet(initialCollapsedBranches);
  // 高密度算子簇默认折叠（spec 51，与分支相反）；集合语义 = 用户已点开的簇。
  const [expandedClusters, toggleOperatorCluster] = useToggleSet(initialExpandedClusters);
  // 密码操作组默认展开（展开态保持基线）；集合语义 = 已折叠的组。
  const [collapsedCryptoGroups, toggleCryptoGroup, setCryptoGroupsCollapsed] = useToggleSet(initialCollapsedCryptoGroups);
  const [cryptoGroupOverrides, setCryptoGroupOverrides] = useState<Readonly<Record<string, OperationKind>>>({});
  const exchangeDag = useMemo(() => buildExchangeDag(result, pairings), [result, pairings]);
  const [exchangeSegments, setExchangeSegments] = useState<readonly ExchangeSegment[]>(initialExchangeSegments);
  const [collapsedExchangeSegments, toggleExchangeSegment, setExchangeSegmentsCollapsed] = useToggleSet(initialCollapsedExchangeSegments);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const activeConcept = activeConceptId === null ? null : conceptOf(activeConceptId) ?? null;
  // 切换协议即清空会话内的折叠状态与用户覆盖（决策 01 第 5.3 条）。
  const lastGroupResultRef = useRef(result);
  useEffect(() => {
    if (lastGroupResultRef.current === result) return;
    lastGroupResultRef.current = result;
    setCryptoGroupOverrides({});
    setCryptoGroupsCollapsed([], false);
    setExchangeSegments([]);
    setExchangeSegmentsCollapsed([], false);
  }, [result, setCryptoGroupsCollapsed, setExchangeSegmentsCollapsed]);

  const visibleRoleNames = useMemo(
    () => new Set(result.roles.length > 0 ? result.roles.map((role) => role.name) : result.mainProcess === null ? [] : [result.mainProcess.name]),
    [result],
  );
  const autoCryptoGroups = useMemo(
    () => deriveCryptoGroups(result).filter((group) => visibleRoleNames.has(group.roleName)),
    [result, visibleRoleNames],
  );
  const cryptoGroups = useMemo(
    () => deriveCryptoGroups(result, { overrides: cryptoGroupOverrides }).filter((group) => visibleRoleNames.has(group.roleName)),
    [result, cryptoGroupOverrides, visibleRoleNames],
  );
  const setCryptoGroupKind = (groupId: string, kind: OperationKind): void => {
    const automatic = autoCryptoGroups.find((group) => group.id === groupId)?.kind;
    setCryptoGroupOverrides((current) => {
      const next = { ...current };
      if (automatic === kind) delete next[groupId];
      else next[groupId] = kind;
      return next;
    });
  };
  const resetCryptoGroup = (groupId: string): void => {
    setCryptoGroupOverrides((current) => {
      if (!(groupId in current)) return current;
      const next = { ...current };
      delete next[groupId];
      return next;
    });
  };
  const collapseAllCryptoGroups = (): void => {
    setCryptoGroupsCollapsed(cryptoGroups.map((group) => group.id), true);
  };
  const expandAllCryptoGroups = (): void => {
    setCryptoGroupsCollapsed(cryptoGroups.map((group) => group.id), false);
  };
  const locateCryptoGroup = (groupId: string): void => {
    const group = cryptoGroups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return;
    sourceLink?.onSelectSpan(group.sourceSpan);
    scrollOffsetRangeIntoView(group.sourceSpan.start.offset, group.sourceSpan.end.offset);
  };
  const addExchangeSegment = (segment: ExchangeSegment): void => {
    setExchangeSegments((current) => [...current, segment]);
    setExchangeSegmentsCollapsed([segment.id], false);
  };
  const renameExchangeSegment = (segmentId: string, label: string | null): void => {
    setExchangeSegments((current) => current.map((segment) =>
      segment.id === segmentId ? { ...segment, label } : segment));
  };
  const removeExchangeSegment = (segmentId: string): void => {
    setExchangeSegments((current) => current.filter((segment) => segment.id !== segmentId));
    setExchangeSegmentsCollapsed([segmentId], false);
  };
  const collapseAllExchangeSegments = (): void => {
    setExchangeSegmentsCollapsed(exchangeSegments.map((segment) => segment.id), true);
  };
  const expandAllExchangeSegments = (): void => {
    setExchangeSegmentsCollapsed(exchangeSegments.map((segment) => segment.id), false);
  };
  const structured = useMemo(
    () => buildStructuredNarrativeLayout(result, {
      pairings,
      compactness,
      collapsedBranches,
      expandedOperatorClusters: expandedClusters,
      collapsedCryptoGroups,
      cryptoGroups,
      exchangeDag,
      exchangeSegments,
      collapsedExchangeSegments,
    }),
    [result, pairings, compactness, collapsedBranches, expandedClusters, collapsedCryptoGroups, cryptoGroups, exchangeDag, exchangeSegments, collapsedExchangeSegments],
  );
  const legacy = useMemo(
    () => buildNarrativeLayout(result, { pairings: pairings.map((pairing) => ({ from: pairing.outEnd, to: pairing.inEnd })) }),
    [result, pairings],
  );
  const hasSelectableEndpoints = useMemo(
    () => pairings.length < countEndpoints(result),
    [pairings, result],
  );
  // R06：进入配对模式前先判断是否存在同信道的发送端/接收端候选，避免进入死模式。
  const pairingCandidateInfo = useMemo(() => {
    const manualIds = new Set(
      structured.pillars.filter((pillar) => pillar.origin === 'manual').flatMap((pillar) => pillar.endpoints.map((endpoint) => endpoint.id)),
    );
    const selectable = structured.endpoints.filter((endpoint) => endpoint.unpaired || manualIds.has(endpoint.id));
    const canPair = selectable.some((out) => out.direction === 'out'
      && selectable.some((incoming) => incoming.direction === 'in'
        && incoming.roleIndex !== out.roleIndex
        && incoming.channelName === out.channelName));
    return { manualIds, selectableCount: selectable.length, canPair };
  }, [structured]);

  useEffect(() => {
    const node = viewportRef.current;
    if (node === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // D2 命令句柄：按源码 offset 定位画布对象，只滚动视口容器。
  useImperativeHandle(ref, () => ({
    scrollToSpan: (span) => scrollOffsetRangeIntoView(span.start.offset, span.end.offset),
    scrollToEvent: (offset) => scrollOffsetRangeIntoView(offset, offset + 1),
  }), []);
  const scrollOffsetRangeIntoView = (start: number, end: number): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const candidates = viewport.querySelectorAll('[data-source-offset]');
    let target: Element | null = null;
    for (const node of candidates) {
      const value = Number(node.getAttribute('data-source-offset'));
      if (Number.isFinite(value) && value >= start && value < end) {
        target = node;
        break;
      }
    }
    if (target === null) return;
    const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTop = top - viewport.clientHeight / 2;
  };

  const fittedZoom = useMemo(
    () => viewportWidth === null ? null : fitZoomOf(viewportWidth, structured.width),
    [viewportWidth, structured.width],
  );
  useEffect(() => {
    if (autoFit && fittedZoom !== null) setZoom(fittedZoom);
  }, [autoFit, fittedZoom]);
  /** R04：按视口可用宽高计算全图概览缩放；画布上方的控制条与提示也计入预留高度。 */
  function applyFitPage(): void {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const canvas = viewport.querySelector('.narrative-canvas--structured');
    const viewportTop = viewport.getBoundingClientRect().top;
    const canvasTop = canvas === null
      ? 0
      : canvas.getBoundingClientRect().top - viewportTop + viewport.scrollTop;
    const availableHeight = Math.max(120, viewport.clientHeight - canvasTop - 56);
    const next = fitPageZoomOf(viewport.clientWidth - 2, availableHeight, structured.width, structured.height);
    setZoom(next);
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    setCanBackToTop(false);
  }
  useEffect(() => {
    if (!fitPage) return;
    const request = requestAnimationFrame(applyFitPage);
    return () => cancelAnimationFrame(request);
  }, [fitPage, fullscreen, expandedView, viewportWidth, viewportHeight, structured.width, structured.height]);
  // R04：全屏时锁住页面滚动，Esc 退出；清理时恢复原值。
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);
  // 切换协议时回到默认视口；缩放与滚动不跨协议保留。
  useEffect(() => {
    setZoom(1);
    setAutoFit(true);
    setFitPage(false);
    setExpandedView(false);
    setFullscreen(false);
    setCanBackToTop(false);
    const viewport = viewportRef.current;
    if (viewport !== null) {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
  }, [result]);
  const zoomFloor = fitPage ? ZOOM_OVERVIEW_MIN : ZOOM_MIN;
  /** 手动缩放（± 与 100%）退出适合宽度与适合页面；概览内的缩小仍允许到 R04 下限。 */
  const manualZoom = (next: number): void => {
    setAutoFit(false);
    if (next >= ZOOM_MIN) setFitPage(false);
    setZoom(next);
  };
  const fitWidth = (): void => {
    setFitPage(false);
    setAutoFit(true);
    if (fittedZoom !== null) setZoom(fittedZoom);
  };
  const fitPageView = (): void => {
    setAutoFit(false);
    setExpandedView(false);
    setFitPage(true);
    requestAnimationFrame(applyFitPage);
  };
  const toggleExpandedView = (): void => {
    setFullscreen(false);
    if (fitPage) {
      // 离开全图概览进入展开阅读时恢复适合宽度，避免保留 12%–20% 的概览缩放。
      setFitPage(false);
      setAutoFit(true);
    }
    setExpandedView((value) => !value);
  };
  const toggleFullscreen = (): void => {
    setExpandedView(false);
    setFullscreen((value) => !value);
  };
  const backToTop = (): void => {
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  };
  const handleViewportScroll = (): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const next = viewport.scrollTop > 160;
    setCanBackToTop((current) => current === next ? current : next);
  };

  return (
    <section className={`narrative${pairingMode ? ' narrative--pairing-mode' : ''}`} aria-label="规范叙事视图">
      <div className="narrative-heading">
        <h3 className="narrative-title">规范叙事视图</h3>
        {hasSelectableEndpoints && (
          <button
            type="button"
            className="btn narrative-pairing-toggle"
            aria-pressed={pairingMode}
            onClick={() => setPairingMode((value) => !value)}
            disabled={!pairingMode && !pairingCandidateInfo.canPair}
            title={pairingCandidateInfo.canPair
              ? '进入后按三步声明：点发送端 → 点同信道接收端 → 完成声明'
              : '当前没有同信道的未配对发送端与接收端，无法进入人工配对'}
          >
            {pairingMode ? '退出配对' : '人工配对'}
          </button>
        )}
        {onFocusSource !== undefined && (
          <button
            type="button"
            className="btn narrative-focus-source"
            onClick={onFocusSource}
            disabled={!canFocusSource}
            title={canFocusSource ? '在源码面板中定位当前选中对象（只滚动源码容器）' : '先点击画布中的对象'}
          >
            定位源码
          </button>
        )}
      </div>
      <div
        className={`narrative-viewport${fitPage ? ' narrative-viewport--fit-page' : ''}${expandedView ? ' narrative-viewport--expanded' : ''}${fullscreen ? ' narrative-viewport--fullscreen' : ''}`}
        ref={viewportRef}
        onScroll={handleViewportScroll}
      >
        <div className="narrative-controls narrative-controls--sticky" aria-label="画布控制">
          <label className="narrative-compactness">
            紧凑度
            <input
              aria-label="画布紧凑度"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={compactness}
              aria-valuetext={`紧凑度 ${compactness.toFixed(1)}，${compactnessTierOf(compactness)}`}
              onChange={(event) => setCompactness(Number(event.target.value))}
            />
            <span className="narrative-compactness-ticks" aria-hidden="true">宽松 · 紧凑</span>
            <output className="narrative-compactness-readout" aria-live="polite">{compactness.toFixed(1)} · {compactnessTierOf(compactness)}</output>
          </label>
          {structured.cryptoGroups.length > 0 && (
            <>
              <button
                type="button"
                className="icon-btn icon-btn--wide"
                aria-label="折叠全部密码操作组"
                title="折叠全部密码操作组；保留用户声明与密度折叠状态"
                onClick={collapseAllCryptoGroups}
              >折叠密码组</button>
              <button
                type="button"
                className="icon-btn icon-btn--wide"
                aria-label="展开全部密码操作组"
                title="展开全部密码操作组；保留用户声明与密度折叠状态"
                onClick={expandAllCryptoGroups}
              >展开密码组</button>
            </>
          )}
          {exchangeSegments.length > 0 && (
            <>
              <button
                type="button"
                className="icon-btn icon-btn--wide"
                aria-label="折叠全部交换段"
                title="折叠全部交换段；段头计数、事件芯片与跨段边保留"
                onClick={collapseAllExchangeSegments}
              >折叠交换段</button>
              <button
                type="button"
                className="icon-btn icon-btn--wide"
                aria-label="展开全部交换段"
                title="展开全部交换段；消息回到原有因果位置"
                onClick={expandAllExchangeSegments}
              >展开交换段</button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="缩小画布"
            title="缩小画布"
            onClick={() => manualZoom(nextZoomOf(zoom, -1, zoomFloor))}
            disabled={zoom <= zoomFloor + 1e-9}
          >−</button>
          <output className="narrative-zoom-readout" aria-label="当前缩放" aria-live="polite">{Math.round(zoom * 100)}%</output>
          <span className="narrative-zoom-font" aria-hidden="true">{`正文约 ${String(Math.round(NARRATIVE_BASE_FONT_PX * zoom))}px`}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="放大画布"
            title="放大画布"
            onClick={() => manualZoom(nextZoomOf(zoom, 1, zoomFloor))}
            disabled={zoom >= ZOOM_MAX - 1e-9}
          >+</button>
          <button
            type="button"
            className="icon-btn"
            aria-label="复位到 100% 缩放"
            title="复位到 100% 缩放"
            onClick={() => manualZoom(1)}
          >100%</button>
          <button
            type="button"
            className="icon-btn icon-btn--wide"
            aria-label="适合宽度"
            title="按容器宽度自动缩放画布"
            aria-pressed={autoFit}
            onClick={fitWidth}
          >适合宽度</button>
          <button
            type="button"
            className="icon-btn icon-btn--wide"
            aria-label="适合页面"
            title="按容器宽高缩放，显示完整协议概览"
            aria-pressed={fitPage}
            onClick={fitPageView}
          >适合页面</button>
          <button
            type="button"
            className="icon-btn icon-btn--wide"
            aria-label="展开画布"
            title={expandedView ? '恢复画布限高并内部滚动' : '取消画布限高，由页面滚动查看完整协议'}
            aria-pressed={expandedView}
            onClick={toggleExpandedView}
          >{expandedView ? '收起画布' : '展开画布'}</button>
          <button
            type="button"
            className="icon-btn icon-btn--wide"
            aria-label="全屏画布"
            title={fullscreen ? '退出全屏（Esc）' : '在全屏视口中阅读画布'}
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
          >{fullscreen ? '退出全屏' : '全屏'}</button>
        </div>
        {fitPage && zoom < ZOOM_MIN && (
          <p className="hint narrative-overview-hint" role="status">
            {fullscreen ? '全图概览：文字较小，可放大阅读。' : '全图概览：文字较小，可放大或进入全屏阅读。'}
          </p>
        )}
      {structured.hasLanes && (
        <p className="hint narrative-caption-hint">
          纵轴是每个角色自己的消息序，信道是共享空间锚点；颜色只表示消息和值，不表示信道或验证结论。
          跨角色连接表达设计意图，不代表攻击者模型下的可达性。
        </p>
      )}
      {structured.hasLanes && hasSelectableEndpoints && !pairingMode && (
        <p className="hint narrative-pairing-entry-hint">
          {pairingCandidateInfo.canPair
            ? '可点选未配对端点声明收发关系（人工配对）；自动配对仅适用于两方协议。'
            : '当前没有同信道的未配对发送端与接收端，无法进入人工配对。'}
        </p>
      )}
      {pairingMode && (
        <p className="hint narrative-pairing-steps" role="status">
          人工配对三步：1. 点一个未配对发送端；2. 点同信道的未配对接收端；3. 声明即时生效并可撤销。
          重复选择同一发送端可继续广播扇出；声明只在本次会话内，不回写 <code>.pv</code>。
        </p>
      )}
      <div className="narrative-scroll-body">
        {structured.hasLanes ? (
          <>
            {pendingOutId !== null && (
              <p className="hint narrative-pairing-hint" role="status">
                已选中发送端：点同信道的未配对接收端即声明设计意图（再点同一发送端取消）；
                重复选择同一发送端可继续广播扇出。声明只在本次会话内，不回写 `.pv`。
              </p>
            )}
            {selectionNotice !== null && (
              <p className="pairing-warning pairing-warning--selection" role="status">
                {selectionNotice}
                {onUndoSelection !== undefined && (
                  <button type="button" className="btn pairing-warning-undo" onClick={onUndoSelection}>
                    撤销上一条
                  </button>
                )}
              </p>
            )}
            {manualDiagnostics.length > 0 && (
              <ul className="narrative-pairing-warnings" aria-label="配对声明诊断">
                {manualDiagnostics.map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.kind}-${String(index)}`}
                    className={`pairing-warning pairing-warning--${diagnostic.kind}`}
                  >
                    {diagnostic.message}
                  </li>
                ))}
              </ul>
            )}
            <StructuredNarrativeCanvas
              layout={structured}
              zoom={zoom}
              legacy={legacy}
              onToggleBranch={toggleBranch}
              onToggleCluster={toggleOperatorCluster}
              onToggleCryptoGroup={toggleCryptoGroup}
              onToggleExchangeSegment={toggleExchangeSegment}
              onShowConcept={setActiveConceptId}
              pendingOutId={pendingOutId}
              pairingMode={pairingMode}
              onEndpointSelect={onEndpointSelect}
              eventCorrespondence={eventCorrespondence}
              sourceLink={sourceLink}
            />
          </>
        ) : (
          <NoRoleStructure result={result} />
        )}
      </div>
      {canBackToTop && !expandedView && (
        <div className="narrative-back-to-top-wrap">
          <button type="button" className="btn narrative-back-to-top" onClick={backToTop}>
            回到顶部
          </button>
        </div>
      )}
      </div>
      {structured.hasLanes && (
        <>
          <NarrativeDiagnostics unassigned={structured.unassignedDiagnostics} />
          {structured.conflicts.length > 0 && (
            <section className="narrative-conflicts" aria-label="布局冲突列表">
              <h4 className="narrative-conflicts-title">布局冲突（{String(structured.conflicts.length)} 处）</h4>
              <ul className="narrative-conflicts-list">
                {structured.conflicts.map((conflict, index) => {
                  const number = index + 1;
                  const location = conflictLocationOf(conflict);
                  return (
                    <li
                      key={conflict.id}
                      id={`layout-conflict-${String(number)}`}
                      data-conflict-number={number}
                      className="narrative-conflicts-item"
                    >
                      <span className="narrative-conflicts-number">冲突 {number}</span>
                      {location.length > 0 && <span className="narrative-conflicts-location">{location}</span>}
                      <span className="narrative-conflicts-message">{conflict.message}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="hint">冲突表示布局为保证可读性做了避让；不影响协议语义与验证结论。</p>
            </section>
          )}
          <MessageList
            result={result}
            dag={exchangeDag}
            segments={exchangeSegments}
            collapsedSegments={new Set(collapsedExchangeSegments)}
            onCreate={addExchangeSegment}
            onToggleSegment={toggleExchangeSegment}
            onRenameSegment={renameExchangeSegment}
            onRemoveSegment={removeExchangeSegment}
            onCollapseAll={collapseAllExchangeSegments}
            onExpandAll={expandAllExchangeSegments}
          />
          <GroupAuditPanel
            groups={structured.cryptoGroups}
            autoGroups={autoCryptoGroups}
            collapsed={new Set(collapsedCryptoGroups)}
            overrides={new Map(Object.entries(cryptoGroupOverrides))}
            onToggle={toggleCryptoGroup}
            onOverride={setCryptoGroupKind}
            onReset={resetCryptoGroup}
            onCollapseAll={collapseAllCryptoGroups}
            onExpandAll={expandAllCryptoGroups}
            onLocate={locateCryptoGroup}
            onShowConcept={setActiveConceptId}
          />
          <Legend layout={structured} result={result} onShowConcept={setActiveConceptId} />
        </>
      )}
      <ConceptNote concept={activeConcept} onClose={() => setActiveConceptId(null)} />
    </section>
  );
});

/** ticket 27：冲突的可见定位串（角色名 + 源码行），标记与列表共用同一份。 */
function conflictLocationOf(conflict: StructuredConflict): string {
  return [
    conflict.roleName,
    conflict.sourceLine === undefined ? undefined : `L${String(conflict.sourceLine)}`,
  ].filter((part): part is string => part !== undefined).join(' · ');
}

function StructuredNarrativeCanvas({
  layout,
  zoom,
  legacy,
  onToggleBranch,
  onToggleCluster,
  onToggleCryptoGroup,
  onToggleExchangeSegment,
  onShowConcept,
  pendingOutId,
  pairingMode,
  onEndpointSelect,
  eventCorrespondence,
  sourceLink,
}: {
  layout: StructuredNarrativeLayout;
  zoom: number;
  legacy: ReturnType<typeof buildNarrativeLayout>;
  onToggleBranch: (branchId: string) => void;
  onToggleCluster: (clusterId: string) => void;
  onToggleCryptoGroup: (groupId: string) => void;
  onToggleExchangeSegment: (segmentId: string) => void;
  onShowConcept: (conceptId: string) => void;
  pendingOutId: string | null;
  pairingMode: boolean;
  onEndpointSelect?: (endpoint: SelectableEndpoint) => void;
  eventCorrespondence?: EventCorrespondenceBinding;
  sourceLink?: SourceLinkBinding;
}) {
  const messageCount = layout.pillars.length;
  const manualEndpointIds = new Set(
    layout.pillars.filter((pillar) => pillar.origin === 'manual').flatMap((pillar) => pillar.endpoints.map((endpoint) => endpoint.id)),
  );
  /** R06：线上词项芯片与端点共享同一源码区间；由芯片反查其端点，复用同一选择状态机。 */
  const endpointOfChip = (chip: StructuredChip): StructuredNarrativeLayout['endpoints'][number] | undefined =>
    layout.endpoints.find((endpoint) =>
      endpoint.roleIndex === chip.roleIndex && endpoint.sourceSpan.start.offset === chip.sourceSpan.start.offset);
  /** 源码联动 props 的统一拼装：有身份时按身份命中，否则按 span 重叠。 */
  const sourcePropsOf = (span: SourceSpan, identity?: string): { sourceSelected: boolean; onSourceSelect?: () => void } => {
    if (sourceLink === undefined) return { sourceSelected: false };
    const byIdentity = identity !== undefined && sourceLink.selectedId !== undefined && sourceLink.selectedId !== null;
    return {
      sourceSelected: byIdentity
        ? sourceLink.selectedId === identity
        : spanOverlapsSelected(span, sourceLink.selectedSpan),
      onSourceSelect: identity !== undefined && sourceLink.onSelectIdentity !== undefined
        ? () => sourceLink.onSelectIdentity?.(identity, span)
        : () => sourceLink.onSelectSpan(span),
    };
  };
  // 合流抽头（ADR-0008）：一个接收端被多条消息命中时，在信道侧并排画各消息色的抽头点。
  const pillarsByEndpointId = new Map<string, MessagePillar[]>();
  layout.pillars.forEach((pillar) => {
    pillar.endpoints.forEach((endpoint) => {
      const list = pillarsByEndpointId.get(endpoint.id) ?? [];
      list.push(pillar);
      pillarsByEndpointId.set(endpoint.id, list);
    });
  });
  return (
    <div className="narrative-canvas narrative-canvas--structured">
      <svg
        width={layout.width * zoom}
        height={layout.height * zoom}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`规范叙事视图：${layout.columns.filter((column) => column.kind === 'role').length} 条角色列，${messageCount} 条跨角色列连线`}
      >
        <defs>
          {layout.pillars.map((pillar) => (
            <marker key={pillar.id} id={`message-arrow-${pillar.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={pillar.color} />
            </marker>
          ))}
          <marker id="unpaired-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={UNPAIRED_COLOR} />
          </marker>
          <pattern id="value-pattern-slash" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M -1 4 L 4 -1" stroke="#1f2937" strokeWidth="1" />
          </pattern>
          <pattern id="value-pattern-backslash" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M -1 -1 L 4 4" stroke="#1f2937" strokeWidth="1" />
          </pattern>
          <pattern id="value-pattern-dots" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#1f2937" />
          </pattern>
        </defs>
        <StructuredColumns layout={layout} />
        <g className="structured-exchange-band-layer">
          {layout.exchangeSegmentBands.map((band) => (
            <ExchangeSegmentBandSvg
              key={band.id}
              band={band}
              onToggle={onToggleExchangeSegment}
              {...sourcePropsOf(band.sourceSpan, band.id)}
            />
          ))}
        </g>
        <g className="structured-arm-layer">
          {layout.armRuns.map((run) => <ArmRunSvg key={run.id} run={run} />)}
        </g>
        <g className="structured-message-layer">
          {layout.pillars.map((pillar) => <MessagePillarSvg key={pillar.id} pillar={pillar} />)}
          {layout.endpoints.map((endpoint) => {
            const tapPillars = pillarsByEndpointId.get(endpoint.id) ?? [];
            return (
              <EndpointSvg
                key={endpoint.id}
                endpoint={endpoint}
                messageIndex={tapPillars[0] === undefined ? -1 : layout.pillars.indexOf(tapPillars[0])}
                tapPillars={tapPillars}
                pending={pendingOutId === endpoint.id}
                pairingMode={pairingMode}
                onSelect={onEndpointSelect}
                {...sourcePropsOf(endpoint.sourceSpan, endpoint.id)}
              />
            );
          })}
        </g>
        {/* 信道帧置顶（B1）：端点线在帧外停止，帧内文字压在连线上。 */}
        <g className="structured-frame-layer">
          {layout.pillars.map((pillar) => <MessageFrameSvg key={`frame-${pillar.id}`} pillar={pillar} />)}
        </g>
        <g className="structured-cross-edge-layer">
          {layout.crossSegmentEdges.map((edge) => <CrossSegmentEdgeSvg key={edge.id} edge={edge} />)}
        </g>
        <g className="structured-value-layer">
          {layout.methods.map((method) => (
            <StructuredMethodSvg
              key={method.id}
              method={method}
              onToggleBranch={onToggleBranch}
              onToggleCryptoGroup={onToggleCryptoGroup}
              {...sourcePropsOf(method.sourceSpan, method.id)}
            />
          ))}
          {layout.cryptoGroupFolds.map((fold) => (
            <CryptoOperationGroupSvg
              key={fold.groupId}
              fold={fold}
              onToggle={onToggleCryptoGroup}
              onShowConcept={onShowConcept}
              {...sourcePropsOf(fold.sourceSpan, fold.groupId)}
            />
          ))}
          {layout.chips.map((chip) => {
            const endpoint = chip.kind === 'wire' ? endpointOfChip(chip) : undefined;
            const selectable = endpoint !== undefined
              && onEndpointSelect !== undefined
              && (endpoint.unpaired || manualEndpointIds.has(endpoint.id));
            return (
              <StructuredChipSvg
                key={chip.id}
                chip={chip}
                pairingMode={pairingMode}
                selectable={selectable}
                onToggleCryptoGroup={onToggleCryptoGroup}
                onSelectEndpoint={selectable && endpoint !== undefined
                  ? () => onEndpointSelect?.({
                    id: endpoint.id,
                    roleIndex: endpoint.roleIndex,
                    stepIndex: endpoint.stepIndex,
                    direction: endpoint.direction,
                    channelName: endpoint.channelName,
                    pairingState: endpoint.unpaired ? 'unpaired' : 'manual',
                  })
                  : undefined}
                {...sourcePropsOf(chip.sourceSpan, chip.id)}
              />
            );
          })}
          {layout.valueBlocks.map((block) => (
            <StructuredValueBlockSvg
              key={block.id}
              block={block}
              {...sourcePropsOf(block.sourceSpan, block.bindingId)}
            />
          ))}
        </g>
        <g className="structured-exchange-fold-layer">
          {layout.exchangeSegmentFolds.map((fold) => (
            <ExchangeSegmentFoldSvg
              key={`${fold.segmentId}:${String(fold.roleIndex)}`}
              fold={fold}
              onToggle={onToggleExchangeSegment}
            />
          ))}
        </g>
        {/* 角色内诊断条（ticket 10 / spec 71）：带位置的原文标注段入角色列，点选联动源码。 */}
        {layout.roleDiagnostics.map((strip) => (
          <RoleDiagnosticsSvg
            key={`diag-${String(strip.roleIndex)}`}
            strip={strip}
            selectedSpan={sourceLink?.selectedSpan ?? null}
            onSelectSpan={sourceLink?.onSelectSpan}
          />
        ))}
        {/* 折叠条压在值层之上（F8）：折叠态文字永远可见；臂道轨道从折叠条背后穿过。 */}
        <g className="structured-branch-fold-layer">
          {layout.branchFolds.map((fold) => (
            <BranchFoldSvg
              key={fold.branchId}
              fold={fold}
              onToggleBranch={onToggleBranch}
              {...sourcePropsOf(fold.sourceSpan, fold.branchId)}
            />
          ))}
        </g>
        {/* 折叠算子簇（07b / spec 51）：同分支折叠条，压在值层之上保证文字可见。 */}
        <g className="structured-operator-fold-layer">
          {layout.operatorFolds.map((fold) => (
            <OperatorClusterFoldSvg
              key={fold.clusterId}
              fold={fold}
              onToggleCluster={onToggleCluster}
              {...sourcePropsOf(fold.sourceSpan, fold.clusterId)}
            />
          ))}
        </g>
        {/* 文本节点置顶（F4）：事件/分支/本地标签永远盖住线与芯片，不被虚线划穿。 */}
        <g className="structured-node-layer">
          {layout.nodes
            .filter((node) => node.kind !== 'message' && node.kind !== 'branch' && (node.kind !== 'local' || node.bindingIds.length === 0))
            .map((node) => (
              <StructuredNodeSvg
                key={node.id}
                node={node}
                eventBinding={eventCorrespondence === undefined || node.kind !== 'event' ? undefined : {
                  roles: eventCorrespondence.rolesByOffset.get(node.span.start.offset),
                  selected: eventCorrespondence.selectedOffset === node.span.start.offset,
                  onSelect: () => eventCorrespondence.onSelect(node.span.start.offset),
                  onReflexive: () => eventCorrespondence.onReflexive(node.span.start.offset),
                }}
                {...sourcePropsOf(node.span, node.id)}
              />
            ))}
        </g>
        {/* C8：布局冲突标记逐条锚定所属角色列右侧，短标签 + title 全文；列表见画布下方。 */}
        {layout.conflicts.map((conflict, index) => {
          const number = index + 1;
          const location = conflictLocationOf(conflict);
          // 角色列按水平序列排布，顺序与 narrativeRoleOrder 不一定一致（如 NS 修正版），
          // 因此按角色名锚定，避免标记落在相邻角色列上。
          const roleColumns = layout.columns.filter((column) => column.kind === 'role');
          const anchorColumn = roleColumns.find((column) => column.name === conflict.roleName) ?? roleColumns[0];
          // 标记放在角色列与相邻列之间的空隙，避开列心的值方块（宽 50）与线上芯片；
          // 非末列向右放，末列向左放，文字沿空隙延伸，不压住任何列内对象。
          const columnIndex = anchorColumn === undefined ? -1 : layout.columns.indexOf(anchorColumn);
          const placeRight = anchorColumn === undefined || columnIndex < layout.columns.length - 1;
          const anchorX = anchorColumn === undefined
            ? layout.width - 42
            : placeRight
              ? anchorColumn.x + anchorColumn.width - 9
              : anchorColumn.x + 9;
          const textX = placeRight ? anchorX + 11 : anchorX - 6;
          const textAnchor = placeRight ? 'start' : 'end';
          const detail = `冲突 ${number}${location.length > 0 ? ` · ${location}` : ''}：${conflict.message}`;
          return (
            <g
              key={conflict.id}
              id={`layout-conflict-marker-${String(number)}`}
              className="structured-conflict"
              role="alert"
              data-conflict-number={number}
              aria-label={detail}
              onClick={() => document.getElementById(`layout-conflict-${String(number)}`)?.scrollIntoView({ block: 'nearest' })}
            >
              <title>{detail}</title>
              <path d={`M ${anchorX} ${conflict.y - 9} l 9 18 h -18 z`} />
              <text className="structured-text-halo" x={textX} y={conflict.y + 4} textAnchor={textAnchor}>冲突 {number}</text>
            </g>
          );
        })}
        {/* 兼容旧 DOM 查询：旧布局数据不参与可见几何。 */}
        <title>{legacy.hasLanes ? '规范叙事视图' : '无角色结构'}</title>
      </svg>
    </div>
  );
}

function StructuredColumns({ layout }: { layout: StructuredNarrativeLayout }) {
  return (
    <g className="structured-columns">
      {layout.columns.map((column) => {
        const isChannel = column.kind === 'channel';
        // R09/R17：序号字形与线型都按水平序列位置（channelOrder）生成，与图例描述同源。
        const channelOrder = column.channelOrder ?? column.index;
        const style = channelLineStyleOf(channelOrder);
        return (
          <g key={`${column.kind}-${column.name}`} className={`structured-column structured-column--${column.kind}`} data-identity={column.name}>
            {isChannel ? (
              <rect className={`structured-channel structured-channel--${style}`} x={column.x + 6} y="28" width={column.width - 12} height={layout.height - 60} />
            ) : (
              <line className="structured-lifeline" x1={column.x + column.width / 2} x2={column.x + column.width / 2} y1="62" y2={layout.height - 24} />
            )}
            <text className="structured-column-label" x={column.x + column.width / 2} y="20" textAnchor="middle">{isChannel ? `信道 ${column.name} ${channelGlyph(channelOrder)}` : column.name}</text>
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
              <text className="structured-parameter-label structured-text-halo" x={column.x + column.width / 2 + 8} y={column.parameterLabelY} textAnchor="start">参数</text>
            )}
            {isChannel && <title>{`信道序号 ${channelGlyph(channelOrder)}：按水平序列从左到右编号；超过五个信道时以 (n) 形式显示`}</title>}
          </g>
        );
      })}
    </g>
  );
}

function MessagePillarSvg({ pillar }: { pillar: StructuredNarrativeLayout['pillars'][number] }) {
  const labelY = Math.max(52, pillar.top - 10 - pillar.lane * 2);
  return (
    <g className="structured-message-pillar" data-identity={pillar.id} data-term={pillar.termText} aria-label={`消息 M${String(pillar.sequence)} · 信道 ${pillar.channelName} · ${pillar.termText}${pillar.origin === 'manual' ? ' · 人工声明' : ''}`}>
      <rect
        className="structured-message-pillar-fill"
        x={pillar.laneX - 4}
        y={pillar.top - 6}
        width="8"
        height={Math.max(12, pillar.bottom - pillar.top + 12)}
        fill={pillar.color}
      />
      <line
        className={`structured-message-pillar-line structured-message-pillar-line--${pillar.lineStyle}`}
        x1={pillar.laneX}
        x2={pillar.laneX}
        y1={pillar.top - 6}
        y2={pillar.bottom + 6}
        stroke={pillar.color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={messageDashOf(pillar.lineStyle)}
      />
      <text className="structured-text-halo" x={pillar.laneX + 8} y={labelY} fill={pillar.color}>M{pillar.sequence}</text>
    </g>
  );
}

function MessageFrameSvg({ pillar }: { pillar: StructuredNarrativeLayout['pillars'][number] }) {
  const frameY = pillar.frameY;
  const originLabel = pillar.origin === 'manual' ? ' · 人工声明' : '';
  return (
    <g className="structured-message-frame">
      <title>{`${pillar.termText}${originLabel}`}</title>
      <rect
        className={`structured-term-chip structured-term-chip--${pillar.termPresentation}`}
        x={pillar.channelX - pillar.frameWidth / 2}
        y={frameY - 11}
        width={pillar.frameWidth}
        height="22"
        stroke={pillar.color}
      />
      {/* identity 接收去重（F5）：接收绑定的值身份色以帧内色带标注，角色列省略同名词块。 */}
      {pillar.termValueColor !== undefined && (
        <rect className="structured-term-value-strip" x={pillar.channelX - pillar.frameWidth / 2 + 2} y={frameY - 8} width="3.5" height="16" fill={pillar.termValueColor} />
      )}
      <text className="structured-text-halo" x={pillar.channelX} y={frameY + 4} textAnchor="middle">{truncate(pillar.termText, frameLabelBudgetOf(pillar.frameWidth))}</text>
    </g>
  );
}

function messageDashOf(style: MessageLineStyle): string {
  if (style === 'short-dash') return '6 3';
  if (style === 'dot') return '1.5 3.5';
  return 'none';
}

function EndpointSvg({
  endpoint,
  messageIndex,
  tapPillars,
  pending,
  pairingMode,
  onSelect,
  sourceSelected,
  onSourceSelect,
}: {
  endpoint: StructuredNarrativeLayout['endpoints'][number];
  messageIndex: number;
  /** 命中该端点的消息柱：多于一条 = 合流端，并排抽头区分（ADR-0008）。 */
  tapPillars: readonly MessagePillar[];
  pending: boolean;
  pairingMode: boolean;
  onSelect?: (endpoint: SelectableEndpoint) => void;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  const primaryPillar = tapPillars[0];
  const color = primaryPillar?.color ?? UNPAIRED_COLOR;
  const marker = primaryPillar === undefined ? 'url(#unpaired-arrow)' : `url(#message-arrow-${primaryPillar.id})`;
  const baseAnchor = endpoint.unpaired ? endpoint.wireX ?? endpoint.channelX : primaryPillar?.laneX ?? endpoint.channelX;
  const towardsChannel = Math.sign(baseAnchor - endpoint.roleX) || 1;
  const nearFrame = primaryPillar !== undefined
    && Math.abs(endpoint.y - primaryPillar.frameY) <= 12
    && Math.abs(endpoint.channelX - endpoint.roleX) > primaryPillar.frameWidth / 2 + 4;
  const frameEdge = primaryPillar === undefined
    ? baseAnchor
    : primaryPillar.channelX - towardsChannel * (primaryPillar.frameWidth / 2 + 4);
  const channelAnchor = nearFrame ? frameEdge : baseAnchor;
  const arrowGap = endpoint.unpaired ? 6 : 0;
  const start = endpoint.direction === 'out' ? endpoint.roleX : channelAnchor - towardsChannel * arrowGap;
  const end = endpoint.direction === 'out' ? channelAnchor - towardsChannel * arrowGap : endpoint.roleX;
  // 消息一律画直线（对齐 prototype 05）：跨过中间生命线也不上拱，不做跨线弧。
  const path = `M ${start} ${endpoint.y} L ${end} ${endpoint.y}`;
  // 箭头只指向「抵达目标」：配对消息的发送段不画箭头（在发送端画起点圆点），
  // 接收段与未配对端（指向信道轨）才有箭头。
  const showArrow = endpoint.unpaired || endpoint.direction === 'in';
  const startDot = !endpoint.unpaired && endpoint.direction === 'out';
  const dash = primaryPillar === undefined ? undefined : messageDashOf(primaryPillar.lineStyle);
  // 可选 = 未配对或已人工配对（扇出/合流可追加声明，票 06 验收 1）；自动配对端不可选。
  const manualPaired = tapPillars.some((pillar) => pillar.origin === 'manual');
  const selectable = onSelect !== undefined && (endpoint.unpaired || manualPaired);
  const pairingState = endpoint.unpaired ? 'unpaired' : manualPaired ? 'manual' : 'automatic';
  // V4：可选端可键盘聚焦（Tab）并按 Enter / Space 选择，与鼠标点选同一状态机。
  const selectEndpoint = (): void => {
    if (!selectable) return;
    onSelect?.({
      id: endpoint.id,
      roleIndex: endpoint.roleIndex,
      stepIndex: endpoint.stepIndex,
      direction: endpoint.direction,
      channelName: endpoint.channelName,
      pairingState,
    });
  };
  return (
    <g
      className={`structured-endpoint${endpoint.unpaired ? ' structured-endpoint--unpaired narrative-card--unpaired' : ' narrative-edge'}${selectable ? ' structured-endpoint--selectable' : ''}${selectable && pairingMode ? ' structured-endpoint--candidate' : ''}${pending ? ' structured-endpoint--pending' : ''}${!endpoint.unpaired && manualPaired ? ' structured-endpoint--manual' : ''}${sourceSelected === true ? ' structured-source-selected' : ''}`}
      data-identity={endpoint.id}
      data-channel={endpoint.channelName}
      aria-label={`${endpoint.direction === 'out' ? '发出' : '接收'} ${endpoint.termText} · 信道 ${endpoint.channelName}${selectable ? ' · 可选为人工配对端（Enter 选择）' : ''}`}
      {...(selectable ? { role: 'button', tabIndex: 0, onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateOnKey(event, selectEndpoint) } : {})}
      onClick={selectable || onSourceSelect !== undefined ? () => {
        // D1：可选端单击只更新配对选择，不触发源码高亮与滚动；双击才定位源码。
        // 非可选端（自动配对端）单击仍是源码联动。
        if (selectable) {
          selectEndpoint();
          return;
        }
        onSourceSelect?.();
      } : undefined}
      onDoubleClick={onSourceSelect !== undefined ? onSourceSelect : undefined}
    >
      {selectable && <path className="structured-endpoint-hit" d={path} />}
      <path d={path} stroke={color} markerEnd={showArrow ? marker : undefined} strokeDasharray={dash} />
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
          <circle className="structured-unpaired-dot" cx={channelAnchor} cy={endpoint.y} r="5" />
        </>
      )}
      {/* 已配对端点的命中提示（ticket 06 移交）：hover 提示 + 可点选视觉，声明扇出/合流有明确落点。 */}
      {!endpoint.unpaired && manualPaired && (
        <title>{`已人工配对（M${String(messageIndex + 1)}）：点选可作为${endpoint.direction === 'out' ? '广播发送端' : '合流端'}追加声明`}</title>
      )}
      {tapPillars.length > 1 && (
        <g className="structured-merge-taps" aria-label={`合流端：命中 ${String(tapPillars.length)} 条消息`}>
          {tapPillars.map((pillar) => (
            <circle
              key={pillar.id}
              cx={pillar.laneX}
              cy={endpoint.y}
              r="4"
              fill={pillar.color}
            />
          ))}
        </g>
      )}
    </g>
  );
}

/** C13：消息端点总数（存在未配对端点时提供人工配对入口）。 */
function countEndpoints(result: ParseResult): number {
  return result.roles.reduce(
    (total, role) => total + role.items.filter((item) => item.kind === 'message').length,
    0,
  );
}

/** C9/R05：超预算标签优先在空格、逗号、括号或等号处断行；不把标识符劈成两段。 */
export function splitLabelLines(text: string, budget: number): string[] {
  if (budget <= 0 || text.length <= budget) return [text];
  const head = text.slice(0, budget);
  const cut = Math.max(
    head.lastIndexOf(' '),
    head.lastIndexOf(','),
    head.lastIndexOf('('),
    head.lastIndexOf('='),
  );
  if (cut <= 0) return [text];
  const first = text.slice(0, cut + 1).trimEnd();
  const rest = text.slice(cut + 1).trimStart();
  if (rest.length <= budget) return [first, rest];
  return [first, `${rest.slice(0, Math.max(1, budget - 1)).trimEnd()}…`];
}

/** C9：按行数组渲染 tspan（第二行起 dy 11px），全文保留在 title。 */
function LabelLinesSvg({ lines, x, baselineY, anchor }: { lines: readonly string[]; x: number; baselineY: number; anchor: 'start' | 'middle' | 'end' }): ReactElement {
  return (
    <text className="structured-text-halo" x={x} y={baselineY} textAnchor={anchor}>
      {lines.map((line, index) => (
        <tspan key={String(index)} x={x} dy={index === 0 ? 0 : 11}>{line}</tspan>
      ))}
    </text>
  );
}

function StructuredNodeSvg({
  node,
  eventBinding,
  sourceSelected,
  onSourceSelect,
}: {
  node: StructuredNode;
  eventBinding?: { roles?: { premise: boolean; conclusion: boolean }; selected: boolean; onSelect: () => void; onReflexive: () => void };
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  // C9/R05：事件与分支标签按语义边界拆两行；本地步骤与降级原文保持单行全文，
  // 不再用空格把切片拼回去，避免把 `not attacker(Na)` 改成 `not attacke r(Na)`。
  const lines = node.kind === 'event' || node.kind === 'branch'
    ? splitLabelLines(node.label, node.labelMaxChars)
    : [node.label];
  const label = node.label;
  // 置顶标签配不透明底（F4）：跨角色列消息线从文字背后穿过，而不是划穿文字。
  const labelWidth = Math.max(...lines.map((line) => line.length * 6.2)) + 8;
  const labelBg = (baselineY: number): ReactElement => (
    <rect
      className="structured-label-bg"
      x={node.labelAnchor === 'end' ? node.labelX - labelWidth + 4 : node.labelX - 4}
      y={baselineY - 11}
      width={labelWidth}
      height={lines.length > 1 ? '25' : '14'}
      rx="3"
    />
  );
  if (node.kind === 'event') {
    // 事件旗标（ticket 08 / C2）：默认中性空心菱形；仅当选中查询时该查询的前提画
    // 填充菱形、结论画旗标。单击选中（矩阵高亮其行/列）、双击查自反对应性。
    const premise = eventBinding?.roles?.premise === true;
    const conclusion = eventBinding?.roles?.conclusion === true;
    const neutral = !premise && !conclusion;
    const cx = node.markerX ?? node.x + node.width / 2;
    const markerY = node.markerY ?? node.y + 15;
    // R20：事件旗标可键盘聚焦，Enter/Space 与单击同一状态机（对应性联动 + 源码联动）。
    const eventClickable = eventBinding !== undefined || onSourceSelect !== undefined;
    const activateEvent = (): void => {
      eventBinding?.onSelect();
      onSourceSelect?.();
    };
    return (
      <g
        className={`structured-event${premise ? ' structured-event--premise' : ''}${conclusion ? ' structured-event--conclusion' : ''}${eventBinding?.selected === true ? ' structured-event--selected' : ''}${eventClickable ? ' structured-event--clickable' : ''}${sourceSelected === true ? ' structured-source-selected' : ''}`}
        data-source-offset={node.span.start.offset}
        aria-label={node.label}
        {...(eventClickable ? { role: 'button', tabIndex: 0, onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateOnKey(event, activateEvent) } : {})}
        onClick={eventClickable ? activateEvent : undefined}
        onDoubleClick={eventBinding?.onReflexive}
      >
        <title>{`${node.label}${premise ? ' · 前提' : ''}${conclusion ? ' · 结论' : ''}（单击选中行列，再次单击查询自反对应性；双击同效）`}</title>
        {node.anchorX !== undefined && (
          <line className="structured-event-connector" x1={node.anchorX} x2={cx} y1={markerY} y2={markerY} />
        )}
        {conclusion && <path d={`M ${cx} ${markerY - 8} l 12 6 l -12 6 z`} />}
        {premise && <path className="structured-event-diamond" d={`M ${cx - (conclusion ? 9 : 0)} ${markerY - 14} l 5 6 l -5 6 l -5 -6 z`} />}
        {neutral && <path className="structured-event-neutral" d={`M ${cx} ${markerY - 10} l 6 8 l -6 8 l -6 -8 z`} />}
        {labelBg(node.y + 18 + (lines.length > 1 ? 5 : 0))}
        <LabelLinesSvg lines={lines} x={node.labelX} baselineY={node.y + 18} anchor={node.labelAnchor} />
      </g>
    );
  }
  if (node.kind === 'branch') {
    // 分支占位：生命线上的横 tick + 守卫原文（#03 会换成等值检查盒 + 臂道）。
    return (
      <g
        className={`structured-node structured-node--branch${sourceSelected === true ? ' structured-source-selected' : ''}`}
        data-source-offset={node.span.start.offset}
        aria-label={node.label}
        {...(onSourceSelect !== undefined ? { role: 'button', tabIndex: 0, onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateOnKey(event, onSourceSelect) } : {})}
        onClick={onSourceSelect}
      >
        <title>{node.label}</title>
        <line x1={node.x + 8} x2={node.x + node.width - 8} y1={node.y + node.height / 2} y2={node.y + node.height / 2} />
        {labelBg(node.y + node.height / 2 + 4)}
        <LabelLinesSvg lines={lines} x={node.labelX} baselineY={node.y + node.height / 2 + 4} anchor={node.labelAnchor} />
      </g>
    );
  }
  // C4：insert 显示为带文字的浅黄胶囊（解析器不支持的表操作按原文保留），不再画空矩形。
  // C14/R11：降级语句原文保留但改用独立警示样式（虚线边框 + 琥珀），不再与 insert 共用胶囊。
  const isInsertNode = node.inserted === true;
  const isDegradedNode = node.degraded === true;
  return (
    <g
      className={`structured-node structured-node--${node.kind}${isInsertNode ? ' structured-node--insert' : ''}${isDegradedNode ? ' structured-node--degraded' : ''}${sourceSelected === true ? ' structured-source-selected' : ''}`}
      data-source-offset={node.span.start.offset}
      aria-label={isDegradedNode ? `解析器不支持，已按原文保留：${node.label}` : node.label}
      {...(onSourceSelect !== undefined ? { role: 'button', tabIndex: 0, onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateOnKey(event, onSourceSelect) } : {})}
      onClick={onSourceSelect}
    >
      <title>{isDegradedNode ? `解析器不支持，已按原文保留：${node.label}` : node.label}</title>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={isInsertNode || isDegradedNode ? node.height / 2 : 0} />
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
  onToggleCryptoGroup,
  sourceSelected,
  onSourceSelect,
}: {
  method: StructuredNarrativeLayout['methods'][number];
  onToggleBranch: (branchId: string) => void;
  onToggleCryptoGroup: (groupId: string) => void;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
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
  const captionText = method.caption === undefined ? undefined : truncate(method.caption, 16);
  const captionWidth = captionText === undefined ? 0 : captionText.length * 5.6 + 4;
  return (
    <g
      className={`structured-method structured-method--${method.direction}${sourceSelected === true ? ' structured-source-selected' : ''}`}
      data-source-offset={method.sourceSpan.start.offset}
      aria-label={`${directionLabel}方法 ${method.label}`}
      onClick={onSourceSelect}
    >
      <polygon points={points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')} />
      <text x={method.x} y={method.y + 4} textAnchor="middle">{truncate(method.label, 10)}</text>
      {method.connector !== undefined && (
        <text className="structured-check-connector structured-text-halo" x={method.x - halfWidth - 10} y={method.y + 4} textAnchor="end">{method.connector}</text>
      )}
      {captionText !== undefined && (
        <>
          <rect
            className="structured-caption-bg"
            x={method.x - captionWidth / 2}
            y={method.y + halfHeight - 2}
            width={captionWidth}
            height="12"
            rx="2"
          />
          <text className="structured-method-caption structured-text-halo" x={method.x} y={method.y + halfHeight + 9} textAnchor="middle">
            <title>{method.caption}</title>
            {captionText}
          </text>
        </>
      )}
      {method.branchId !== undefined && (
        <BranchToggleSvg method={method} onToggleBranch={onToggleBranch} />
      )}
      {method.groupId !== undefined && (
        <CryptoGroupToggle
          x={method.x + halfWidth - 7}
          y={method.y - halfHeight + 5}
          groupId={method.groupId}
          expanded={method.groupExpanded ?? true}
          nested={method.groupNested === true}
          onToggle={onToggleCryptoGroup}
        />
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
  // 开关放在臂道（信道外侧）的反面，避免与臂道轨道打架。
  const toggleX = method.x - (method.outward ?? 1) * (halfWidth + 10);
  return (
    <g
      className="structured-branch-toggle"
      role="button"
      tabIndex={0}
      data-branch-id={branchId}
      aria-label={`折叠分支 ${branchText}`}
      onClick={(event) => {
        // 开关是嵌在方法盒（可点选源码联动）内的独立按钮：只做折叠，不冒泡成源码选择。
        event.stopPropagation();
        onToggleBranch(branchId);
      }}
      onKeyDown={(event) => activateOnKey(event, () => onToggleBranch(branchId))}
    >
      <title>{`折叠分支 ${branchText}`}</title>
      <rect x={toggleX - 7} y={method.y - 7} width="14" height="14" rx="4" />
      <text x={toggleX} y={method.y + 4} textAnchor="middle">▾</text>
    </g>
  );
}

function BranchFoldSvg({
  fold,
  onToggleBranch,
  sourceSelected,
  onSourceSelect,
}: {
  fold: StructuredNarrativeLayout['branchFolds'][number];
  onToggleBranch: (branchId: string) => void;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  return (
    <g
      className={`structured-branch-fold${sourceSelected === true ? ' structured-source-selected' : ''}`}
      role="button"
      tabIndex={0}
      data-branch-id={fold.branchId}
      aria-label={`展开分支 ${fold.guardText}（隐藏 ${String(fold.hiddenCount)} 步）`}
      onClick={() => {
        onToggleBranch(fold.branchId);
        onSourceSelect?.();
      }}
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
      {/* C10：左侧守卫文本（随宽截断），右侧固定徽标 +N 不参与截断。 */}
      <text className="structured-text-halo" x={fold.x - fold.width / 2 + 8} y={fold.y + 4} textAnchor="start">
        ▸ {truncate(fold.guardText, foldGuardBudgetOf(fold.width))}
      </text>
      <text className="structured-branch-fold-badge" x={fold.x + fold.width / 2 - 7} y={fold.y + 4} textAnchor="end">
        +{String(fold.hiddenCount)}
      </text>
    </g>
  );
}

/** 折叠算子簇条（07b / spec 51–53）：表面列主导算子名与数量，悬停浮卡列内含算子与幽灵值，点开还原。 */
function OperatorClusterFoldSvg({
  fold,
  onToggleCluster,
  sourceSelected,
  onSourceSelect,
}: {
  fold: StructuredOperatorClusterFold;
  onToggleCluster: (clusterId: string) => void;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  const ghostText = fold.ghostLabels.length > 0
    ? `；仍被后续引用的值：${fold.ghostLabels.join('、')}`
    : '';
  return (
    <g
      className={`structured-operator-fold${sourceSelected === true ? ' structured-source-selected' : ''}`}
      role="button"
      tabIndex={0}
      data-cluster-id={fold.clusterId}
      aria-label={`展开算子簇 ${fold.label}（隐藏 ${String(fold.hiddenCount)} 步；内含 ${fold.memberLabels.join('、')}）`}
      onClick={() => {
        onToggleCluster(fold.clusterId);
        onSourceSelect?.();
      }}
      onKeyDown={(event) => activateOnKey(event, () => onToggleCluster(fold.clusterId))}
    >
      <title>{`算子：${fold.memberLabels.join('、')}${ghostText}`}</title>
      <rect
        x={fold.x - fold.width / 2}
        y={fold.y - fold.height / 2}
        width={fold.width}
        height={fold.height}
        rx={fold.height / 2}
      />
      <text x={fold.x} y={fold.y + 4} textAnchor="middle">
        {truncate(fold.label, foldLabelBudgetOf(fold.width))}
      </text>
    </g>
  );
}

/**
 * 角色内诊断条（ticket 10 / spec 71–72）：归属该角色的诊断以带位置的标注段画在角色列顶部
 * ——降级带原文、错误带中文消息（几何与文字预算由布局给出，此处只画）；
 * 点选任意一条联动源码高亮（onSelectSpan）。
 */
function RoleDiagnosticsSvg({
  strip,
  selectedSpan,
  onSelectSpan,
}: {
  strip: StructuredNarrativeLayout['roleDiagnostics'][number];
  selectedSpan: SourceSpan | null;
  onSelectSpan?: (span: SourceSpan) => void;
}) {
  return (
    <g className="structured-role-diagnostics" role="group" aria-label={`角色内解析诊断 ${String(strip.entries.length)} 条`}>
      {strip.entries.map((entry) => (
        <g
          key={`${entry.diagnostic.span.start.offset}-${entry.text}`}
          className={`structured-diagnostic-chip structured-diagnostic-chip--${entry.diagnostic.severity}${spanOverlapsSelected(entry.diagnostic.span, selectedSpan) ? ' structured-source-selected' : ''}`}
          data-source-offset={entry.diagnostic.span.start.offset}
          aria-label={entry.fullText}
          onClick={onSelectSpan === undefined ? undefined : () => onSelectSpan(entry.diagnostic.span)}
        >
          <title>{entry.fullText}</title>
          <rect x={strip.x - strip.width / 2} y={entry.y - 8} width={strip.width} height="16" rx="3" />
          <text x={strip.x - strip.width / 2 + 5} y={entry.y + 3}>{truncate(entry.text, entry.textBudget)}</text>
        </g>
      ))}
    </g>
  );
}

/** 视口缩放边界与步长（ticket 10 票面：60%–180%、步长 10%；「适合宽度」复位 100%）。 */
export const ZOOM_MIN = 0.6;
/** C12 紧凑度档位名：0–0.33 宽松、0.34–0.66 标准、0.67–1 紧凑。 */
export function compactnessTierOf(value: number): string {
  if (value <= 0.33) return '宽松';
  if (value <= 0.66) return '标准';
  return '紧凑';
}
/** R08 自动适配的最小可读缩放：比例低于该值时保持 100% 并允许横向滚动，不再压缩文字。 */
export const AUTO_FIT_MIN = 0.9;
/** R08 字号提示基准：画布正文标签（事件、词项、诊断）在 100% 下的字号（v2.css）。 */
export const NARRATIVE_BASE_FONT_PX = 9;
/** D6/R08 适合宽度纯函数：布局超出容器时按比例缩到刚好放下；比例低于 AUTO_FIT_MIN 时
 * 保持 100% 并允许横向滚动（最小可读缩放），不把正文标签压得更小。手动缩放下限仍为 60%。 */
export function fitZoomOf(containerWidth: number, layoutWidth: number): number {
  if (!(containerWidth > 0) || !(layoutWidth > 0)) return 1;
  const ratio = containerWidth / layoutWidth;
  if (ratio < AUTO_FIT_MIN) return 1;
  return Math.min(1, ratio);
}
/** R04 适合页面纯函数：同时按宽高适配；概览允许低于手动缩放下限。 */
export const ZOOM_OVERVIEW_MIN = 0.12;
export function fitPageZoomOf(
  containerWidth: number,
  containerHeight: number,
  layoutWidth: number,
  layoutHeight: number,
): number {
  if (!(containerWidth > 0) || !(containerHeight > 0) || !(layoutWidth > 0) || !(layoutHeight > 0)) return 1;
  const ratio = Math.min(containerWidth / layoutWidth, containerHeight / layoutHeight);
  return Math.min(1, Math.max(ZOOM_OVERVIEW_MIN, ratio));
}
export const ZOOM_MAX = 1.8;
export const ZOOM_STEP = 0.1;

/** 缩放步进（纯函数）：±步长并 clamp 到边界；display 侧按 Math.round(zoom*100)% 取整。 */
export function nextZoomOf(current: number, direction: -1 | 1, minimum = ZOOM_MIN): number {
  return Math.min(ZOOM_MAX, Math.max(minimum, current + direction * ZOOM_STEP));
}

/** 让 role="button" 的 SVG 元素像真按钮一样响应 Enter / Space。 */
function activateOnKey(event: KeyboardEvent<SVGGElement>, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function StructuredValueBlockSvg({
  block,
  sourceSelected,
  onSourceSelect,
}: {
  block: StructuredValueBlock;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  // 幽灵值块（spec 52）：折叠算子簇下方仍被后续引用的产出；文案/样式区分，几何与常规方块同式。
  const ghost = block.ghost === true;
  // aria 带值身份序号（09）：读屏者以「值 n」与图例 token 列表（序号 + 绑定名）对齐。
  const label = ghost
    ? `折叠簇引用值 ${block.label}（值 ${String(block.ordinal)}）`
    : block.occurrence === 'binding'
      ? `绑定 ${block.label}（值 ${String(block.ordinal)}）`
      : block.occurrence === 'equality'
        ? `等值复制 ${block.label}（值 ${String(block.ordinal)}）`
        : `引用 ${block.label}（值 ${String(block.ordinal)}）`;
  // ticket 26：字号提升到 11px 后，4–5 字符的标签会与右上角值序号相碰；
  // 长标签轻微左移，给序号让出角落（3 字符短名保持居中）。最多显示 5 字符。
  const labelShift = Math.max(0, Math.min(5, block.label.length) - 3) * 3;
  const labelText = truncate(block.label, 5);
  return (
    <g
      className={`structured-value-block structured-value-block--${block.occurrence}${ghost ? ' structured-value-block--ghost' : ''}${sourceSelected === true ? ' structured-source-selected' : ''}`}
      data-binding-id={block.bindingId}
      data-source-offset={block.sourceSpan.start.offset}
      aria-label={label}
      onClick={onSourceSelect}
    >
      {ghost && <title>{`折叠算子簇仍被后续引用的值：${block.label}`}</title>}
      <rect
        x={block.x - block.width / 2}
        y={block.y - block.height / 2}
        width={block.width}
        height={block.height}
        fill={block.color}
      />
      {block.pattern !== 'none' && (
        <rect
          className={`structured-value-pattern structured-value-pattern--${block.pattern}`}
          x={block.x - block.width / 2 + 2}
          y={block.y - block.height / 2 + 2}
          width="3"
          height={Math.max(2, block.height - 4)}
          fill={`url(#value-pattern-${block.pattern})`}
        />
      )}
      <text x={block.x - labelShift} y={block.y + 4} textAnchor="middle">{labelText}</text>
      {/* 值身份序号（09 / spec 65 / B4）：嵌入方块右上角，任何后续元素都不会单独覆盖。 */}
      <text className="structured-value-ordinal structured-text-halo" x={block.x + block.width / 2 - 3} y={block.y - block.height / 2 + 7} textAnchor="end">{String(block.ordinal)}</text>
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
      <text
        className="structured-arm-label"
        x={run.railX + run.outward * 5}
        y={top + 12}
        textAnchor={run.outward > 0 ? 'start' : 'end'}
      >{run.label}</text>
    </g>
  );
}

function StructuredChipSvg({
  chip,
  pairingMode,
  selectable,
  onSelectEndpoint,
  onToggleCryptoGroup,
  sourceSelected,
  onSourceSelect,
}: {
  chip: StructuredNarrativeLayout['chips'][number];
  pairingMode?: boolean;
  selectable?: boolean;
  onSelectEndpoint?: () => void;
  onToggleCryptoGroup?: (groupId: string) => void;
  sourceSelected?: boolean;
  onSourceSelect?: () => void;
}) {
  const kindLabel = chip.kind === 'derived'
    ? '派生芯片'
    : chip.kind === 'condition'
      ? '条件芯片'
      : chip.kind === 'wire'
        ? '线上词项'
        : '模式芯片';
  // 宽度由布局按文字估算（F2）：截断预算跟随芯片宽度，不再固定 9 字符。
  const maxChars = chip.kind === 'wire' ? Math.max(3, Math.floor((chip.width - 8) / 5.6)) : 9;
  const clickable = selectable === true && onSelectEndpoint !== undefined;
  return (
    <g
      className={`structured-chip structured-chip--${chip.kind}${clickable ? ' structured-chip--selectable' : ''}${clickable && pairingMode ? ' structured-chip--candidate' : ''}${sourceSelected === true ? ' structured-source-selected' : ''}`}
      data-source-offset={chip.sourceSpan.start.offset}
      aria-label={`${kindLabel} ${chip.text}${clickable ? ' · 可选为人工配对端（Enter 选择）' : ''}`}
      {...(clickable ? { role: 'button', tabIndex: 0, onKeyDown: (event: KeyboardEvent<SVGGElement>) => activateOnKey(event, onSelectEndpoint) } : {})}
      onClick={clickable ? onSelectEndpoint : onSourceSelect}
      onDoubleClick={onSourceSelect}
    >
      <title>{chip.text}</title>
      {clickable && (
        <rect
          className="structured-chip-hit"
          x={chip.x - chip.width / 2 - 4}
          y={chip.y - 12}
          width={chip.width + 8}
          height="24"
          rx="6"
        />
      )}
      <rect x={chip.x - chip.width / 2} y={chip.y - chip.height / 2} width={chip.width} height={chip.height} rx="4" stroke={chip.color} />
      <text x={chip.x} y={chip.y + 4} textAnchor="middle">{truncate(chip.text, maxChars)}</text>
      {chip.groupId !== undefined && onToggleCryptoGroup !== undefined && (
        <CryptoGroupToggle
          x={chip.x + chip.width / 2 - 7}
          y={chip.y - chip.height / 2 + 1}
          groupId={chip.groupId}
          expanded={chip.groupExpanded ?? true}
          nested
          onToggle={onToggleCryptoGroup}
        />
      )}
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function channelGlyph(index: number): string {
  return ['①', '②', '③', '④', '⑤'][index] ?? `(${String(index + 1)})`;
}

function NarrativeDiagnostics({ unassigned }: { unassigned: readonly PvDiagnostic[] }) {
  // ticket 10：归属角色的诊断已画进角色列（布局的 roleDiagnostics），这里只保留未归属的
  // （布局的 unassignedDiagnostics，归属只算一次）——每条诊断「角色内或未归属」只出现一次。
  if (unassigned.length === 0) return null;
  return (
    <section className="narrative-diagnostics" aria-label="解析诊断">
      <h4>解析诊断（未归属角色）</h4>
      <ul className="diagnostic-list">
        {unassigned.map((diagnostic, index) => (
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
