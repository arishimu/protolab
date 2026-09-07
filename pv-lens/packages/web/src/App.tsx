import { CurrentProtocolProvider, useCurrentProtocol } from './CurrentProtocolContext';
import { Home } from './Home';
import { SourcePanel } from './SourcePanel';
import './styles.css';

/** 已装载视图：标题 + 只读源码面板；渲染/验证区域由后续工单（04/08）在此扩展。 */
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
      <p className="hint" style={{ marginTop: '1rem' }}>
        规范叙事视图（泳道图）与运行验证将在此协议文本之上展开——本阶段仅到文本与源码展示。
      </p>
    </div>
  );
}

export function App() {
  return (
    <CurrentProtocolProvider>
      <div className="app">
        <header className="app-header">
          <h1>pv-lens</h1>
          <span className="subtitle">安全协议规范叙事视图 · 只读源码（本阶段）</span>
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
