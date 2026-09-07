import type { LoadedProtocol } from './protocol';

/** 只读源码面板：展示当前协议全文，可折叠/展开（ticket 02）。 */
export function SourcePanel({ protocol }: { protocol: LoadedProtocol }) {
  const lineCount = protocol.source.split('\n').length;
  const originLabel = protocol.origin.kind === 'builtin' ? '内置样例' : '本地导入';

  return (
    <details className="source-panel" open aria-label="协议源码（只读）">
      <summary>
        <span className="chevron">▸</span>
        <span>协议源码（只读）</span>
        <span className="meta">
          {originLabel} · {lineCount} 行
        </span>
      </summary>
      <pre className="source-body">
        <code>{protocol.source}</code>
      </pre>
    </details>
  );
}
