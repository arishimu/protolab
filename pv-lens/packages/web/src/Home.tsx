import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useCurrentProtocol } from './CurrentProtocolContext';
import type { SampleKind } from '@pv-lens/core';

/** 内置样例「形态」的中文标签与样式类（标签/类名同源，避免两处 switch 漂移）。 */
const KIND_META: Record<SampleKind, { label: string; cls: string }> = {
  'all-green': { label: '全绿', cls: 'kind-tag kind-tag--all-green' },
  'secrecy-broken': { label: '保密性破坏', cls: 'kind-tag kind-tag--secrecy-broken' },
  'auth-broken': { label: '认证破坏', cls: 'kind-tag kind-tag--auth-broken' },
};

/**
 * 首页：内置样例列表（任选其一即装载）+「导入 .pv 文件」（读取本地文件装载）。
 * 装载只发生在这里，改动 current 即被 App 感知（ticket 02）。
 */
export function Home() {
  const { samples, loadSample, loadLocalText } = useCurrentProtocol();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件（重置 input 值）。
    if (!file) return;
    try {
      const text = await file.text();
      if (text.trim().length === 0) {
        setImportError(`文件「${file.name}」为空，无法装载。`);
        return;
      }
      setImportError(null);
      loadLocalText(file.name, text);
    } catch {
      setImportError(`读取文件「${file.name}」失败，请重试或换一个 .pv 文件。`);
    }
  }

  return (
    <div className="home">
      <h2>选择一个内置协议开始</h2>
      <p className="hint">
        任选其一即装载为当前协议；其源码会显示在右侧只读面板中。
      </p>
      <ul className="sample-list">
        {samples.map(({ def }) => {
          const meta = KIND_META[def.kind];
          return (
            <li key={def.id}>
              <button
                type="button"
                className="sample-card"
                onClick={() => loadSample(def.id)}
              >
                <span className="name">
                  {def.title}
                  <span className={meta.cls}>{meta.label}</span>
                </span>
                <span className="desc">{def.description}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2>或导入自己的模型</h2>
      <div className="import-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => fileRef.current?.click()}
        >
          导入 .pv 文件
        </button>
        <span className="hint">从本地磁盘选择一个 .pv 文本文件，将其内容装载为当前协议。</span>
        <input
          ref={fileRef}
          type="file"
          accept=".pv,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => void onFilePicked(e)}
        />
      </div>
      {importError && <p className="import-error">{importError}</p>}
    </div>
  );
}
