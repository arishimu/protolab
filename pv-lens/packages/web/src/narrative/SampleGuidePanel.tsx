/**
 * 样例导读面板（ADR-0018 / 阶段 4）：四步左右的阅读路径，每步定位真实源码/事件/查询。
 */

import type { ReactElement } from 'react';
import type { ParseResult, SourceSpan } from '@pv-lens/core';
import { guideOf, resolveGuideTarget } from '../sample-guides';

export interface SampleGuidePanelProps {
  sampleId: string | undefined;
  source: string;
  parseResult: ParseResult;
  onLocateSpan: (span: SourceSpan) => void;
  onSelectEvent: (span: SourceSpan) => void;
}

export function SampleGuidePanel({
  sampleId,
  source,
  parseResult,
  onLocateSpan,
  onSelectEvent,
}: SampleGuidePanelProps): ReactElement | null {
  const guide = guideOf(sampleId);
  if (guide === undefined) return null;
  return (
    <details className="sample-guide">
      <summary>样例导读 · {guide.title}</summary>
      <p className="sample-guide-summary">{guide.summary}</p>
      <ol className="sample-guide-steps">
        {guide.steps.map((step, index) => {
          const target = resolveGuideTarget(step.target, source, parseResult);
          if (target === null) return null;
          const locate = (): void => {
            if (step.target.kind === 'event') onSelectEvent(target.span);
            else onLocateSpan(target.span);
          };
          return (
            <li key={step.id} className="sample-guide-step">
              <span className="sample-guide-index">{index + 1}</span>
              <div className="sample-guide-copy">
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
              <button type="button" className="btn btn--small" onClick={locate} title={`定位：${target.label}`}>
                定位{target.label}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
