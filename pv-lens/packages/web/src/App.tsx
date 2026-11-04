import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { composeMessagePairings, createCorrespondencePlan, narrativeRoleOrder, parsePv } from '@pv-lens/core';
import type { PairingIntent, SourceSpan } from '@pv-lens/core';
import { CorrespondencePanel } from './CorrespondencePanel';
import { CurrentProtocolProvider, useCurrentProtocol } from './CurrentProtocolContext';
import { Home } from './Home';
import { SourcePanel } from './SourcePanel';
import type { SourceFocusRequest } from './SourcePanel';
import { NarrativeView } from './narrative/NarrativeView';
import type { EventCorrespondenceBinding, NarrativeViewHandle, SourceLinkBinding } from './narrative/NarrativeView';
import { firstReferenceSpanOf } from './source-reference';
import { reducePairingSelection } from './narrative/pairing-selection';
import type { PairingSelectionState, SelectableEndpoint } from './narrative/pairing-selection';
import { VerifyPanel } from './VerifyPanel';
import './styles.css';

/** 点选被拒时的用户可见文案（拒绝原因 → 提示）。 */
const SELECTION_REASONS: Readonly<Record<string, string>> = {
  'automatic-endpoint': '自动配对好的端点不能人工配对；请点未配对的发送端。',
  'in-without-pending': '请先点选一个发送端（未配对或已人工配对的扇出源），再点接收端声明设计意图。',
  'channel-mismatch': '人工配对必须使用同一信道；请点同一信道上的接收端。',
};

/**
 * D2 面板可见性检查 + 页面级滚动（ADR-0015）：目标面板完全在视口内时不动页面；
 * 否则只把面板边界带入视口（nearest），不把面板内容居中。
 */
function revealPanel(node: Element | null): void {
  if (node === null || typeof window === 'undefined') return;
  const rect = node.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
  node.scrollIntoView({ block: 'nearest' });
}

const revealPanelBySelector = (selector: string): void => {
  if (typeof document === 'undefined') return;
  revealPanel(document.querySelector(selector));
};

/** 已装载视图：标题 + 只读源码面板 + 规范叙事视图（ticket 04）+ 验证结果面板（ticket 08）。
 * E2（ADR-0015）：1280px 以上源码列与画布列并列；源码面板 sticky，画布容器限高内部滚动。 */
function LoadedView() {
  const { current, clear } = useCurrentProtocol();
  // 解析是纯转换（不进 server）。在这里解析一次、按 source 记忆化，叙事视图与验证面板共用，
  // 避免两处各解析一遍；`current` 为空时解析空串，随后立即返回（不在条件里调 hook）。
  const parseResult = useMemo(() => parsePv(current?.source ?? ''), [current?.source]);
  // 人工配对是会话内存里的声明式意图边（ADR-0005/0007）：切换协议即清空，不回写 `.pv`。
  const [manualIntents, setManualIntents] = useState<readonly PairingIntent[]>([]);
  const [manualIntentChannels, setManualIntentChannels] = useState<readonly string[]>([]);
  const [selection, setSelection] = useState<PairingSelectionState>({ pendingOut: null });
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  // R08：显式隐藏源码列（画布占满宽度），选择记忆到会话（sessionStorage），不跨会话保留。
  const [sourceHidden, setSourceHidden] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('pv-lens-source-hidden') === '1';
    } catch {
      return false;
    }
  });
  const toggleSourceHidden = (): void => {
    setSourceHidden((hidden) => {
      const next = !hidden;
      try {
        if (next) window.sessionStorage.setItem('pv-lens-source-hidden', '1');
        else window.sessionStorage.removeItem('pv-lens-source-hidden');
      } catch {
        /* sessionStorage 不可用时仅本次装载内生效。 */
      }
      return next;
    });
  };
  // R16：宽屏源码列宽可拖拽（280–560px，sessionStorage 会话记忆）；null = 未拖过，用 CSS 默认。
  const [sourceColumnWidth, setSourceColumnWidth] = useState<number | null>(() => {
    try {
      const raw = window.sessionStorage.getItem('pv-lens-source-col-width');
      return raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    } catch {
      return null;
    }
  });
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const persistColumnWidth = (width: number): void => {
    try {
      window.sessionStorage.setItem('pv-lens-source-col-width', String(width));
    } catch {
      /* 记忆失败不影响本次使用。 */
    }
  };
  const columnsStyle = sourceHidden
    ? undefined
    : sourceColumnWidth === null
      ? ({ gridTemplateColumns: 'minmax(320px, 420px) 6px minmax(0, 1fr)' } as CSSProperties)
      : ({ gridTemplateColumns: `${String(sourceColumnWidth)}px 6px minmax(0, 1fr)` } as CSSProperties);
  useEffect(() => {
    setManualIntents([]);
    setManualIntentChannels([]);
    setSelection({ pendingOut: null });
    setSelectionNotice(null);
  }, [current]);
  // 统一 IR：自动配对 + 会话内人工声明合成，诊断驱动画布旁的配对警告条。
  const pairingComposition = useMemo(
    () => composeMessagePairings(parseResult, manualIntents),
    [parseResult, manualIntents],
  );
  const handleEndpointSelect = (endpoint: SelectableEndpoint): void => {
    const result = reducePairingSelection(selection, { kind: 'select', endpoint });
    setSelection(result.state);
    const intent = result.intent;
    if (intent !== undefined) {
      setManualIntents((currentIntents) => [...currentIntents, intent]);
      setManualIntentChannels((currentChannels) => [...currentChannels, endpoint.channelName]);
      // D7：成功声明给出可见确认（信道 + 角色名 + 方向），广播时逐条累加。
      const roleNames = narrativeRoleOrder(parseResult).map((role) => role.name);
      setSelectionNotice(
        `已声明配对：信道 ${endpoint.channelName} · ${roleNames[intent.outEnd.roleIndex] ?? '?'} 发送 → ${roleNames[intent.inEnd.roleIndex] ?? '?'} 接收`,
      );
      return;
    }
    setSelectionNotice(result.reason === undefined ? null : SELECTION_REASONS[result.reason]);
  };
  /** D7：已声明配对清单条目——声明 + 合成结果中的类型不符警告（无警告则不显示）。 */
  const manualPairingEntries = useMemo(() => {
    const refKeyOf = (ref: { roleIndex: number; stepIndex: number }): string => `${String(ref.roleIndex)}:${String(ref.stepIndex)}`;
    const roleNames = narrativeRoleOrder(parseResult).map((role) => role.name);
    return manualIntents.map((intent, index) => {
      const pairing = pairingComposition.pairings.find((candidate) =>
        candidate.origin === 'manual'
        && refKeyOf(candidate.outEnd) === refKeyOf(intent.outEnd)
        && refKeyOf(candidate.inEnd) === refKeyOf(intent.inEnd));
      return {
        index,
        outRole: roleNames[intent.outEnd.roleIndex] ?? `角色 ${String(intent.outEnd.roleIndex)}`,
        inRole: roleNames[intent.inEnd.roleIndex] ?? `角色 ${String(intent.inEnd.roleIndex)}`,
        channel: manualIntentChannels[index] ?? null,
        warning: pairing?.warning,
      };
    });
  }, [manualIntents, manualIntentChannels, pairingComposition, parseResult]);
  const clearManualIntents = (): void => {
    setManualIntents([]);
    setManualIntentChannels([]);
    setSelection({ pendingOut: null });
    setSelectionNotice(null);
  };
  const revokeManualIntent = (index: number): void => {
    // D7：撤销该条声明并重新合成配对（顺序约束随之更新），其余声明保留。
    setManualIntents((currentIntents) => currentIntents.filter((_, position) => position !== index));
    setManualIntentChannels((currentChannels) => currentChannels.filter((_, position) => position !== index));
    setSelection({ pendingOut: null });
    setSelectionNotice(null);
  };
  const canUndoSelection = manualIntents.length > 0 && selectionNotice?.startsWith('已声明配对') === true;
  if (!current) return null;

  // 对应性计划（ticket 08）：n² 有序对与事件角色都从同一计划派生；声明目标按原查询
  // 语义运行，探索性有序对使用 inj-event 探针。旗标形状与矩阵共用同一份。
  const correspondencePlan = useMemo(
    () => createCorrespondencePlan(current.source, parseResult),
    [current.source, parseResult],
  );
  const eventByOffset = useMemo(
    () => new Map(correspondencePlan.events.map((event) => [event.span.start.offset, event])),
    [correspondencePlan],
  );
  const offsetByEventId = useMemo(
    () => new Map(correspondencePlan.events.map((event) => [event.id, event.span.start.offset])),
    [correspondencePlan],
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedEventId(null);
    setSelectedQueryId(null);
  }, [current]);

  // C2：旗标形状按选中查询派生——未选中查询时全部中性空心菱形；选中后恰一前提一结论
  //（自反对时同一事件两者皆是）。全量角色映射仍由 deriveEventRoles 提供，仅不再驱动形状。
  const eventRolesByOffset = useMemo(() => {
    const roles = new Map<number, { premise: boolean; conclusion: boolean }>();
    if (selectedQueryId === null) return roles;
    const query = correspondencePlan.queries.find((candidate) => candidate.id === selectedQueryId);
    if (query === undefined) return roles;
    const reflexive = query.from.id === query.to.id;
    roles.set(query.from.span.start.offset, { premise: true, conclusion: reflexive });
    if (!reflexive) roles.set(query.to.span.start.offset, { premise: false, conclusion: true });
    return roles;
  }, [selectedQueryId, correspondencePlan]);
  const eventCorrespondence: EventCorrespondenceBinding = useMemo(() => ({
    rolesByOffset: eventRolesByOffset,
    selectedOffset: selectedEventId === null ? null : offsetByEventId.get(selectedEventId) ?? null,
    onSelect: (offset) => {
      const event = eventByOffset.get(offset);
      if (event === undefined) return;
      // D4：单击同一事件两次 = 查询其自反对应性（与双击同效）；首次单击只选中行列。
      if (selectedEventId === event.id) {
        setSelectedQueryId(`${event.id}=>${event.id}`);
      } else {
        setSelectedEventId(event.id);
      }
      // D2：点击旗标把矩阵带入视口，不滚动源码面板。
      revealPanelBySelector('section.correspondence');
    },
    // 双击旗标 = 该事件的自反对应性（inj-event(A) ==> inj-event(A)）。
    onReflexive: (offset) => {
      const event = eventByOffset.get(offset);
      if (event === undefined) return;
      setSelectedEventId(event.id);
      setSelectedQueryId(`${event.id}=>${event.id}`);
      revealPanelBySelector('section.correspondence');
    },
  }), [eventRolesByOffset, eventByOffset, offsetByEventId, selectedEventId]);
  const handleSelectQuery = (queryId: string | null): void => {
    setSelectedQueryId(queryId);
    if (queryId === null) return;
    // D5：单元选中取代事件选中，强弱高亮完全由选中查询派生（残留旗标选中会多出一个强高亮）。
    setSelectedEventId(null);
    // D2：矩阵单元点击只滚动画布容器到前提事件，页面滚动仅在画布不可见时发生。
    const fromId = queryId.split('=>')[0];
    const offset = offsetByEventId.get(fromId);
    if (offset !== undefined) {
      narrativeRef.current?.scrollToEvent(offset);
      revealPanelBySelector('section.narrative');
    }
  };

  // 图↔源码双向联动（ticket 10）：选中 span 是唯一共享状态——点画布对象高亮源码区间，
  // 点源码行反向高亮画布对象；同名绑定因 span 不同天然只命中其一。
  const [selectedSpan, setSelectedSpan] = useState<SourceSpan | null>(null);
  // 画布身份命中（A6）：值方块按 bindingId、端点/节点按对象 id；源码行点击清空身份。
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  // D3 双区间分色：参数绑定的首个引用行浅高亮。
  const [referenceSpan, setReferenceSpan] = useState<SourceSpan | null>(null);
  // D1 定位与选中分离：selectedSpan 只高亮；「定位源码」才产生 focusRequest，页面不滚动。
  const [focusRequest, setFocusRequest] = useState<SourceFocusRequest | null>(null);
  const narrativeRef = useRef<NarrativeViewHandle>(null);
  useEffect(() => {
    setSelectedSpan(null);
    setSelectedIdentity(null);
    setReferenceSpan(null);
    setFocusRequest(null);
  }, [current]);
  const sourceLink = useMemo<SourceLinkBinding>(() => ({
    selectedSpan,
    selectedId: selectedIdentity,
    onSelectSpan: (span) => {
      setSelectedSpan(span);
      setSelectedIdentity(null);
      setReferenceSpan(null);
    },
    onSelectIdentity: (identity, span) => {
      setSelectedIdentity(identity);
      setSelectedSpan(span);
      setReferenceSpan(firstReferenceSpanOf(parseResult, identity, span));
    },
  }), [selectedSpan, selectedIdentity, parseResult]);
  const handleSelectLine = (span: SourceSpan): void => {
    setSelectedSpan(span);
    setSelectedIdentity(null);
    setReferenceSpan(null);
    // D2：源码行点击只滚动画布容器并在画布上高亮；页面滚动仅在画布不可见时发生。
    narrativeRef.current?.scrollToSpan(span);
    revealPanelBySelector('section.narrative');
  };
  const handleFocusSource = (): void => {
    if (selectedSpan === null) return;
    setFocusRequest({ span: selectedSpan, nonce: Date.now() });
    revealPanelBySelector('.source-column');
  };

  const originText =
    current.origin.kind === 'builtin'
      ? `内置样例 · ${current.origin.sampleId}`
      : `本地导入 · ${current.origin.fileName}`;
  // R11：标题下显式提示降级数量，点击滚动画布到首个降级节点（虚线琥珀胶囊按原文保留）。
  const degradedDiagnostics = parseResult.diagnostics.filter((diagnostic) => diagnostic.severity === 'degraded');
  const firstDegradedOffset = degradedDiagnostics[0]?.span.start.offset ?? null;

  return (
    <div>
      <div className="loaded-head">
        <button type="button" className="btn" onClick={clear}>
          ← 返回选择
        </button>
        <button
          type="button"
          className="btn"
          onClick={toggleSourceHidden}
          aria-pressed={sourceHidden}
          title={sourceHidden ? '恢复源码列（宽屏回到双栏并列）' : '暂时隐藏源码列，画布占满宽度'}
        >
          {sourceHidden ? '显示源码' : '隐藏源码'}
        </button>
        <h2>{current.title}</h2>
        <span className="origin">{originText}</span>
      </div>
      <p className="hint">{current.description}</p>
      {degradedDiagnostics.length > 0 && (
        <p className="degraded-banner" role="status">
          {`解析降级 ${String(degradedDiagnostics.length)} 处：解析器不支持的语句在画布中按原文保留（虚线琥珀胶囊）。`}
          {firstDegradedOffset !== null && (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                narrativeRef.current?.scrollToEvent(firstDegradedOffset);
                revealPanelBySelector('section.narrative');
              }}
            >
              定位首个降级节点
            </button>
          )}
        </p>
      )}
      <div
        className={`loaded-columns${sourceHidden ? ' loaded-columns--source-hidden' : ''}`}
        style={columnsStyle}
      >
        <div className="source-column">
          <SourcePanel
            protocol={current}
            highlightSpan={selectedSpan}
            referenceSpan={referenceSpan}
            focusRequest={focusRequest}
            diagnostics={parseResult.diagnostics.map((diagnostic) => ({
              line: diagnostic.span.start.line,
              label: diagnostic.severity === 'error' ? '错误诊断' : '降级诊断',
              message: `${'L'}${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)} ${diagnostic.message}`,
            }))}
            onSelectLine={handleSelectLine}
          />
        </div>
        {!sourceHidden && (
          <div
            className="column-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="拖拽调整源码列宽度"
            title="拖拽调整源码列宽度（280–560px）"
            onPointerDown={(event) => {
              // 默认起点取 CSS minmax 的实际上限（420px），与未拖拽时的渲染宽度一致。
              dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: sourceColumnWidth ?? 420,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragStateRef.current;
              if (drag === null || drag.pointerId !== event.pointerId) return;
              const next = Math.min(560, Math.max(280, drag.startWidth + event.clientX - drag.startX));
              setSourceColumnWidth(next);
            }}
            onPointerUp={(event) => {
              if (dragStateRef.current?.pointerId === event.pointerId) {
                dragStateRef.current = null;
                setSourceColumnWidth((width) => {
                  if (width !== null) persistColumnWidth(width);
                  return width;
                });
              }
            }}
          />
        )}
        <div className="canvas-column">
          <NarrativeView
            ref={narrativeRef}
            result={parseResult}
            pairings={pairingComposition.pairings}
            manualDiagnostics={pairingComposition.diagnostics}
            pendingOutId={selection.pendingOut?.id ?? null}
            selectionNotice={selectionNotice}
            onUndoSelection={canUndoSelection ? () => revokeManualIntent(manualIntents.length - 1) : undefined}
            onEndpointSelect={handleEndpointSelect}
            eventCorrespondence={eventCorrespondence}
            sourceLink={sourceLink}
            onFocusSource={handleFocusSource}
            canFocusSource={selectedSpan !== null}
          />
          {manualPairingEntries.length > 0 && (
            <section className="manual-pairings" aria-label="已声明配对">
              <h3 className="manual-pairings-title">
                已声明配对（{String(manualPairingEntries.length)} 条，仅本次会话）
                <button type="button" className="btn" onClick={clearManualIntents}>全部清除</button>
              </h3>
              <ol className="manual-pairings-list">
                {manualPairingEntries.map((entry) => (
                  <li key={String(entry.index)} className="manual-pairings-item">
                    <span>
                      {entry.channel === null ? '' : `信道 ${entry.channel} · `}
                      {entry.outRole} 发送 → {entry.inRole} 接收
                    </span>
                    {entry.warning !== undefined && <span className="pairing-warning pairing-warning--type-mismatch">{entry.warning}</span>}
                    <button type="button" className="btn manual-pairings-revoke" onClick={() => revokeManualIntent(entry.index)}>撤销</button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <CorrespondencePanel
            plan={correspondencePlan}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            selectedQueryId={selectedQueryId}
            onSelectQuery={handleSelectQuery}
          />
          <VerifyPanel source={current.source} parseResult={parseResult} />
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <CurrentProtocolProvider>
      <div className="app">
        <header className="app-header">
          <h1>pv-lens</h1>
          <span className="subtitle">安全协议规范叙事视图 · 当前版本只读</span>
        </header>
        <ContentView />
      </div>
    </CurrentProtocolProvider>
  );
}

function ContentView() {
  const { current } = useCurrentProtocol();
  return current ? <LoadedView /> : <Home />;
}
