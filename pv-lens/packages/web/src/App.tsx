import { useMemo } from 'react';
import { parsePv } from '@pv-lens/core';
import { CurrentProtocolProvider, useCurrentProtocol } from './CurrentProtocolContext';
import { Home } from './Home';
import { SourcePanel } from './SourcePanel';
import { NarrativeView } from './narrative/NarrativeView';
import './styles.css';

/**
 * 规范叙事视图（ticket 04）：把当前 .pv 文本解析成语义模型并绘制泳道图。
 * 解析是纯转换（不进 server），按 source 记忆化，避免每次渲染重解析。
 */
function NarrativeSection({ source }: { source: string }) {
  const result = useMemo(() => parsePv(source), [source]);
  return <NarrativeView result={result} />;
}

/** 已装载视图：标题 + 只读源码面板 + 规范叙事视图；验证结果面板由后续工单（08）在此扩展。 */
function LoadedView() {
  const { current, clear } = useCurrentProtocol();
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
      <NarrativeSection source={current.source} />
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
