import { useEffect, useMemo, useState } from 'react';
import { composeMessagePairings, createCorrespondencePlan, deriveEventRoles, parsePv } from '@pv-lens/core';
import type { PairingIntent, SourceSpan } from '@pv-lens/core';
import { CorrespondencePanel } from './CorrespondencePanel';
import { CurrentProtocolProvider, useCurrentProtocol } from './CurrentProtocolContext';
import { Home } from './Home';
import { SourcePanel } from './SourcePanel';
import { NarrativeView } from './narrative/NarrativeView';
import type { EventCorrespondenceBinding, SourceLinkBinding } from './narrative/NarrativeView';
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

/** 已装载视图：标题 + 只读源码面板 + 规范叙事视图（ticket 04）+ 验证结果面板（ticket 08）。 */
function LoadedView() {
  const { current, clear } = useCurrentProtocol();
  // 解析是纯转换（不进 server）。在这里解析一次、按 source 记忆化，泳道图与验证面板共用，
  // 避免两处各解析一遍；`current` 为空时解析空串，随后立即返回（不在条件里调 hook）。
  const parseResult = useMemo(() => parsePv(current?.source ?? ''), [current?.source]);
  // 人工配对是会话内存里的声明式意图边（ADR-0005/0007）：切换协议即清空，不回写 `.pv`。
  const [manualIntents, setManualIntents] = useState<readonly PairingIntent[]>([]);
  const [selection, setSelection] = useState<PairingSelectionState>({ pendingOut: null });
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  useEffect(() => {
    setManualIntents([]);
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
      setSelectionNotice(null);
      return;
    }
    setSelectionNotice(result.reason === undefined ? null : SELECTION_REASONS[result.reason]);
  };
  if (!current) return null;

  // 对应性计划（ticket 08）：n² 有序 inj-event 对与事件角色（前提/结论）都从同一计划派生，
  // 旗标形状与矩阵共用同一份（deriveEventRoles），不两处各算。
  const correspondencePlan = useMemo(
    () => createCorrespondencePlan(current.source, parseResult),
    [current.source, parseResult],
  );
  const eventRolesByOffset = useMemo(() => deriveEventRoles(correspondencePlan), [correspondencePlan]);
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
  const eventCorrespondence: EventCorrespondenceBinding = useMemo(() => ({
    rolesByOffset: eventRolesByOffset,
    selectedOffset: selectedEventId === null ? null : offsetByEventId.get(selectedEventId) ?? null,
    onSelect: (offset) => {
      const event = eventByOffset.get(offset);
      setSelectedEventId(event === undefined ? null : event.id);
    },
    // 双击旗标 = 该事件的自反对应性（inj-event(A) ==> inj-event(A)）。
    onReflexive: (offset) => {
      const event = eventByOffset.get(offset);
      if (event === undefined) return;
      setSelectedEventId(event.id);
      setSelectedQueryId(`${event.id}=>${event.id}`);
    },
  }), [eventRolesByOffset, eventByOffset, offsetByEventId, selectedEventId]);

  // 图↔源码双向联动（ticket 10）：选中 span 是唯一共享状态——点画布对象高亮源码区间，
  // 点源码行反向高亮画布对象；同名绑定因 span 不同天然只命中其一。
  const [selectedSpan, setSelectedSpan] = useState<SourceSpan | null>(null);
  useEffect(() => {
    setSelectedSpan(null);
  }, [current]);
  const sourceLink = useMemo<SourceLinkBinding>(() => ({
    selectedSpan,
    onSelectSpan: setSelectedSpan,
  }), [selectedSpan]);

  const originText =
    current.origin.kind === 'builtin'
      ? `内置样例 · ${current.origin.sampleId}`
      : `本地导入 · ${current.origin.fileName}`;

  return (
    <div>
      <div className="loaded-head">
        <button type="button" className="btn" onClick={clear}>
          ← 返回选择
        </button>
        <h2>{current.title}</h2>
        <span className="origin">{originText}</span>
      </div>
      <p className="hint">{current.description}</p>
      <SourcePanel
        protocol={current}
        highlightSpan={selectedSpan}
        onSelectLine={setSelectedSpan}
      />
      <NarrativeView
        result={parseResult}
        pairings={pairingComposition.pairings}
        manualDiagnostics={pairingComposition.diagnostics}
        pendingOutId={selection.pendingOut?.id ?? null}
        selectionNotice={selectionNotice}
        onEndpointSelect={handleEndpointSelect}
        eventCorrespondence={eventCorrespondence}
        sourceLink={sourceLink}
      />
      <CorrespondencePanel
        plan={correspondencePlan}
        selectedEventId={selectedEventId}
        onSelectEvent={setSelectedEventId}
        selectedQueryId={selectedQueryId}
        onSelectQuery={setSelectedQueryId}
      />
      <VerifyPanel source={current.source} parseResult={parseResult} />
    </div>
  );
}

export function App() {
  return (
    <CurrentProtocolProvider>
      <div className="app">
        <header className="app-header">
          <h1>pv-lens</h1>
          <span className="subtitle">安全协议规范叙事视图 · 只读（画布编辑属二期）</span>
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
