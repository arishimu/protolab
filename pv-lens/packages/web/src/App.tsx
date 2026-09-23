import { useMemo } from 'react';
import { pairSteps, parsePv } from '@pv-lens/core';
import { CurrentProtocolProvider, useCurrentProtocol } from './CurrentProtocolContext';
import { Home } from './Home';
import { SourcePanel } from './SourcePanel';
import { NarrativeView } from './narrative/NarrativeView';
import { VerifyPanel } from './VerifyPanel';
import './styles.css';

/** 已装载视图：标题 + 只读源码面板 + 规范叙事视图（ticket 04）+ 验证结果面板（ticket 08）。 */
function LoadedView() {
  const { current, clear } = useCurrentProtocol();
  // 解析是纯转换（不进 server）。在这里解析一次、按 source 记忆化，泳道图与验证面板共用，
  // 避免两处各解析一遍；`current` 为空时解析空串，随后立即返回（不在条件里调 hook）。
  const parseResult = useMemo(() => parsePv(current?.source ?? ''), [current?.source]);
  // 设计意图配对（ADR-0003）：两方协议按类型 + 源码顺序给跨泳道连线；解析结果变则重算。
  const pairings = useMemo(() => pairSteps(parseResult), [parseResult]);
  if (!current) return null;

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
      <SourcePanel protocol={current} />
      <NarrativeView result={parseResult} pairings={pairings} />
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
