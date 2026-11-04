import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SourceSpan } from '@pv-lens/core';
import type { LoadedProtocol } from './protocol';

/** D1 定位请求：`nonce` 保证对同一区间的重复定位也能触发滚动。 */
export interface SourceFocusRequest {
  span: SourceSpan;
  nonce: number;
}

/**
 * 只读源码面板（ticket 02 建立、ticket 10 行结构化）：按行切块渲染并带行号，
 * 支撑与叙事画布的双向源码联动——
 * - `highlightSpan`：区间覆盖的行高亮（图→源码，点击画布对象时由外层传入）；
 * - `referenceSpan`：参数绑定的首个引用行浅高亮（D3 双区间分色）；
 * - `onSelectLine`：点击行回报该行的源码区间（源码→图，外层据此反向高亮画布对象）；
 * - `focusRequest`：显式定位（D1）。选中只高亮不滚动；用户点「定位源码」才滚动，
 *   且滚动只发生在面板自己的容器内，不夺取页面滚动所有权（ADR-0015）。
 */
/** F4：按行号在行号槽渲染的错误/降级标记（title 带定位与消息）。 */
export interface SourceLineDiagnostic {
  line: number;
  label: string;
  message: string;
}

export function SourcePanel({
  protocol,
  highlightSpan = null,
  referenceSpan = null,
  focusRequest = null,
  diagnostics = [],
  onSelectLine,
}: {
  protocol: LoadedProtocol;
  highlightSpan?: SourceSpan | null;
  referenceSpan?: SourceSpan | null;
  focusRequest?: SourceFocusRequest | null;
  diagnostics?: readonly SourceLineDiagnostic[];
  onSelectLine?: (span: SourceSpan) => void;
}) {
  const diagnosticsByLine = new Map(diagnostics.map((diagnostic) => [diagnostic.line, diagnostic]));
  const bodyRef = useRef<HTMLPreElement>(null);
  const panelRef = useRef<HTMLDetailsElement>(null);
  const lineCount = protocol.source.split('\n').length;
  const originLabel = protocol.origin.kind === 'builtin' ? '内置样例' : '本地导入';
  // R16：长行自动换行开关（sessionStorage 会话记忆）；默认不换行 + 横向滚动。
  const [wrap, setWrap] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('pv-lens-source-wrap') === '1';
    } catch {
      return false;
    }
  });
  const toggleWrap = (): void => {
    setWrap((current) => {
      const next = !current;
      try {
        if (next) window.sessionStorage.setItem('pv-lens-source-wrap', '1');
        else window.sessionStorage.removeItem('pv-lens-source-wrap');
      } catch {
        /* sessionStorage 不可用时仅本次装载内生效。 */
      }
      return next;
    });
  };

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

  // 显式定位：先展开折叠的面板，再在容器内滚动到目标行居中，页面滚动位置不变。
  useEffect(() => {
    if (focusRequest === null || bodyRef.current === null) return;
    if (panelRef.current !== null) panelRef.current.open = true;
    const lineNode = bodyRef.current.querySelector(`[data-line="${String(focusRequest.span.start.line)}"]`);
    if (lineNode instanceof HTMLElement) {
      bodyRef.current.scrollTop = lineNode.offsetTop - bodyRef.current.clientHeight / 2;
    }
  }, [focusRequest]);

  /** span 是 [start, end) 区间：end 落在行首（column ≤ 1）时该行不计入高亮。 */
  const lineRangeOf = (span: SourceSpan): { start: number; end: number } => {
    const endLine = span.end.column <= 1 ? span.end.line - 1 : span.end.line;
    return { start: span.start.line, end: Math.max(span.start.line, endLine) };
  };
  const highlightRange = highlightSpan === null ? null : lineRangeOf(highlightSpan);
  // 浅高亮仅用于主高亮未覆盖的行（同一行同时是声明与引用时主高亮优先）。
  const referenceRange = referenceSpan === null ? null : lineRangeOf(referenceSpan);

  // R20：源码行的 roving tabindex——仅当前行可 Tab 停留（默认第 1 行），
  // ↑/↓ 在行间移动，Home/End 到首尾，Enter/Space 触发与单击相同的反向联动。
  const [focusedLine, setFocusedLine] = useState(1);
  const focusLine = (lineNo: number): void => {
    const clamped = Math.min(Math.max(1, lineNo), lineCount);
    setFocusedLine(clamped);
    (bodyRef.current?.querySelector(`[data-line="${String(clamped)}"]`) as HTMLElement | null)?.focus();
  };
  const handleLineKeyDown = (event: ReactKeyboardEvent<HTMLElement>, lineNo: number, offset: number, text: string): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? lineNo + 1
        : event.key === 'ArrowUp' ? lineNo - 1
          : event.key === 'Home' ? 1
            : lineCount;
      focusLine(next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (onSelectLine === undefined) return;
      event.preventDefault();
      onSelectLine({
        start: { offset, line: lineNo, column: 1 },
        end: { offset: offset + text.length, line: lineNo, column: text.length + 1 },
      });
    }
  };

  return (
    <details className="source-panel" open aria-label="协议源码（只读）" ref={panelRef}>
      <summary>
        <span className="chevron">▸</span>
        <span>协议源码（只读）</span>
        <span className="meta">
          {originLabel} · {lineCount} 行
        </span>
      </summary>
      <div className="source-panel-tools">
        <button
          type="button"
          className="btn btn--small"
          aria-pressed={wrap}
          onClick={toggleWrap}
          title={wrap ? '当前自动换行；点击改为不换行（横向滚动）' : '当前不换行，长行可横向滚动；点击改为自动换行'}
        >
          {wrap ? '不换行' : '自动换行'}
        </button>
        <span className="source-panel-tools-hint">{wrap ? '长行自动换行显示' : '长行横向滚动阅读'}</span>
      </div>
      <pre className={`source-body${wrap ? ' source-body--wrap' : ''}`} ref={bodyRef}>
        {lines.map((line, index) => {
          const lineNo = index + 1;
          const highlighted = highlightRange !== null && lineNo >= highlightRange.start && lineNo <= highlightRange.end;
          const referenced = !highlighted && referenceRange !== null && lineNo >= referenceRange.start && lineNo <= referenceRange.end;
          const lineDiagnostic = diagnosticsByLine.get(lineNo);
          return (
            <code
              key={lineNo}
              className={`source-line${highlighted ? ' source-line--highlight' : ''}${referenced ? ' source-line--reference' : ''}${lineDiagnostic !== undefined ? ' source-line--diagnostic' : ''}`}
              data-line={lineNo}
              role="button"
              tabIndex={lineNo === focusedLine ? 0 : -1}
              onKeyDown={onSelectLine === undefined ? undefined : (event) => handleLineKeyDown(event, lineNo, line.offset, line.text)}
              onClick={onSelectLine === undefined ? undefined : () => onSelectLine({
                start: { offset: line.offset, line: lineNo, column: 1 },
                end: { offset: line.offset + line.text.length, line: lineNo, column: line.text.length + 1 },
              })}
            >
              <span className="source-line-number" aria-hidden="true">{lineNo}</span>
              {lineDiagnostic !== undefined && (
                <span
                  className={`source-line-marker source-line-marker--${lineDiagnostic.label.includes('错误') ? 'error' : 'degraded'}`}
                  title={`${lineDiagnostic.label}：${lineDiagnostic.message}`}
                  aria-label={`${lineDiagnostic.label} ${lineDiagnostic.message}`}
                >
                  ●
                </span>
              )}
              {line.text.length === 0 ? ' ' : line.text}
            </code>
          );
        })}
      </pre>
    </details>
  );
}
