import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useCurrentProtocol } from './CurrentProtocolContext';
import { useVerifyServiceHealth, verifyServiceHealthText } from './use-service-health';
import type { SampleKind } from '@pv-lens/core';

/** 内置样例「形态」的中文标签与样式类（标签/类名同源，避免两处 switch 漂移）。 */
const KIND_META: Record<SampleKind, { label: string; cls: string }> = {
  'all-green': { label: '查询全部成立', cls: 'kind-tag kind-tag--all-green' },
  'secrecy-broken': { label: '保密性破坏', cls: 'kind-tag kind-tag--secrecy-broken' },
  'auth-broken': { label: '认证破坏', cls: 'kind-tag kind-tag--auth-broken' },
};

/** E1 双栏断点（与 styles.css 的 1280px 媒体查询同值，ADR-0015）。 */
export const LAYOUT_TWO_COLUMN_BREAKPOINT = 1280;

/** E1/R08 装载提示文案由布局断点决定，不写死方向（纯函数供测试）；窄屏画布在前。 */
export function layoutHintOf(wideLayout: boolean): string {
  return wideLayout
    ? '选择任一样例后，源码显示在左侧只读面板，规范叙事视图并列显示在右侧。'
    : '选择任一样例后，规范叙事视图先显示，源码面板随后显示。';
}

/**
 * 首页：内置样例列表（任选其一即装载）+「导入 .pv 文件」（读取本地文件装载）。
 * 装载只发生在这里，改动 current 即被 App 感知（ticket 02）。
 */
export function Home() {
  const { samples, loadSample, loadLocalText } = useCurrentProtocol();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // R19：首页即显示验证服务健康状态（server 未启动时提前提示，不用等点运行才发现）。
  const { health } = useVerifyServiceHealth();

  async function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件（重置 input 值）。
    if (!file) return;
    try {
      const text = await file.text();
      if (text.trim().length === 0) {
        setImportError(`文件 ${file.name} 为空，无法装载。`);
        return;
      }
      setImportError(null);
      loadLocalText(file.name, text);
    } catch {
      setImportError(`读取文件 ${file.name} 失败，请重试或选择其他 .pv 文件。`);
    }
  }

  // E1：文案随双栏断点切换，断点变化时自动更新。
  const [wideLayout, setWideLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(min-width: ${String(LAYOUT_TWO_COLUMN_BREAKPOINT)}px)`).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(`(min-width: ${String(LAYOUT_TWO_COLUMN_BREAKPOINT)}px)`);
    const listener = (event: MediaQueryListEvent): void => setWideLayout(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return (
    <div className="home">
      <h2>
        选择一个内置协议开始
        <span className={`verify-health verify-health--${health}`} role="status" title={verifyServiceHealthText(health)}>
          <span className="verify-health-dot" aria-hidden="true" />
          {verifyServiceHealthText(health)}
        </span>
      </h2>
      <p className="hint">{layoutHintOf(wideLayout)}</p>
      {/* R19：首次使用者的 3–5 行阅读路径。 */}
      <ol className="reading-path" aria-label="如何阅读这张图">
        <li>装载后先看画布：竖向虚线是角色生命线，矩形是信道，横向连线表示消息的设计意图，不代表攻击者可达。</li>
        <li>同色值方块表示同一个绑定；消息用 M 序号和线型区分。</li>
        <li>安全性问题由画布下方的验证面板回答：运行 ProVerif，按查询读取判定和反例 trace。</li>
        <li>多角色模型可用人工配对声明收发关系。声明仅在本次会话有效，不回写 .pv。</li>
      </ol>
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
        <span className="hint">从本地磁盘选择 .pv 文件，载入为当前协议。</span>
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
