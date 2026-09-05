import { coreSamples } from '@pv-lens/core';

// ticket 01 脚手架占位页：仅证明 @pv-lens/core 能被浏览器端按包名解析并渲染。
// 真正的「规范叙事视图 + 源码面板 + 结果面板」单页布局见 ticket 04 / 08。
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
      <h1>pv-lens</h1>
      <p>安全协议规范叙事视图 · 脚手架（ticket 01）就绪。</p>
      <h2>内置样例（来自 @pv-lens/core）</h2>
      <ul>
        {coreSamples.map((s) => (
          <li key={s.id}>
            <code>{s.id}</code> — {s.title}
          </li>
        ))}
      </ul>
    </main>
  );
}
