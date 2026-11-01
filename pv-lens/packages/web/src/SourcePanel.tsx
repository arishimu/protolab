import { useEffect, useMemo, useRef } from 'react';
import type { SourceSpan } from '@pv-lens/core';
import type { LoadedProtocol } from './protocol';

/**
 * 只读源码面板（ticket 02 建立、ticket 10 行结构化）：按行切块渲染并带行号，
 * 支撑与叙事画布的双向源码联动——
 * - `highlightSpan`：区间覆盖的行高亮（图→源码，点击画布对象时由外层传入）；
 * - `onSelectLine`：点击行回报该行的源码区间（源码→图，外层据此反向高亮画布对象）；
 * - 高亮变化时自行滚动到起始行（block: center）。
 */
export function SourcePanel({
  protocol,
  highlightSpan = null,
  onSelectLine,
}: {
  protocol: LoadedProtocol;
  highlightSpan?: SourceSpan | null;
  onSelectLine?: (span: SourceSpan) => void;
}) {
  const bodyRef = useRef<HTMLPreElement>(null);
  const lineCount = protocol.source.split('\n').length;
  const originLabel = protocol.origin.kind === 'builtin' ? '内置样例' : '本地导入';

  /** 每行的 [起始 offset, 行文本]；点击行时由此拼出该行的源码区间（列 1 起、行尾止）。 */
  const lines = useMemo(() => {
    const entries: Array<{ offset: number; text: string }> = [];
    let offset = 0;
    for (const text of protocol.source.split('\n')) {
      entries.push({ offset, text });
      offset += text.length + 1;
    }
    return entries;
  }, [protocol.source]);

  useEffect(() => {
    if (highlightSpan === null || bodyRef.current === null) return;
    const lineNode = bodyRef.current.querySelector(`[data-line="${String(highlightSpan.start.line)}"]`);
    if (lineNode instanceof HTMLElement) lineNode.scrollIntoView({ block: 'center' });
  }, [highlightSpan]);

  // span 是 [start, end) 区间：end 落在行首（column ≤ 1）时该行不计入高亮。
  const highlightRange = highlightSpan === null ? null : (() => {
    const endLine = highlightSpan.end.column <= 1 ? highlightSpan.end.line - 1 : highlightSpan.end.line;
    return { start: highlightSpan.start.line, end: Math.max(highlightSpan.start.line, endLine) };
  })();

  return (
    <details className="source-panel" open aria-label="协议源码（只读）">
      <summary>
        <span className="chevron">▸</span>
        <span>协议源码（只读）</span>
        <span className="meta">
          {originLabel} · {lineCount} 行
        </span>
      </summary>
      <pre className="source-body" ref={bodyRef}>
        {lines.map((line, index) => {
          const lineNo = index + 1;
          const highlighted = highlightRange !== null && lineNo >= highlightRange.start && lineNo <= highlightRange.end;
          return (
            <code
              key={lineNo}
              className={`source-line${highlighted ? ' source-line--highlight' : ''}`}
              data-line={lineNo}
              onClick={onSelectLine === undefined ? undefined : () => onSelectLine({
                start: { offset: line.offset, line: lineNo, column: 1 },
                end: { offset: line.offset + line.text.length, line: lineNo, column: line.text.length + 1 },
              })}
            >
              <span className="source-line-number" aria-hidden="true">{lineNo}</span>
              {line.text.length === 0 ? ' ' : line.text}
            </code>
          );
        })}
      </pre>
    </details>
  );
}
