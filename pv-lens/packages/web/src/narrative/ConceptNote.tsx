/**
 * 概念注解抽屉（ADR-0018 / 阶段 4）：图例、组标签与审计面板共用的解释面板。
 */

import type { ReactElement } from 'react';
import type { Concept } from '@pv-lens/core';

export interface ConceptNoteProps {
  concept: Concept | null;
  onClose: () => void;
}

export function ConceptNote({ concept, onClose }: ConceptNoteProps): ReactElement | null {
  if (concept === null) return null;
  return (
    <aside className="concept-note" role="dialog" aria-label={`概念注解：${concept.label}`}>
      <header className="concept-note-head">
        <h4>{concept.label}</h4>
        <button type="button" className="btn btn--small" onClick={onClose} aria-label="关闭概念注解">关闭</button>
      </header>
      <dl className="concept-note-body">
        <div><dt>定义</dt><dd>{concept.definition}</dd></div>
        <div><dt>协议问题</dt><dd>{concept.protocolQuestion}</dd></div>
        <div><dt>ProVerif 读法</dt><dd>{concept.proverifReading}</dd></div>
      </dl>
      <p className="concept-note-anchors">
        锚点：{concept.anchors.map((anchor) => anchor.label).join(' · ')}
      </p>
    </aside>
  );
}
