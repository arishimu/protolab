import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { parsePv } from '@pv-lens/core';
import { AUTO_FIT_MIN, NarrativeView, fitZoomOf } from '../src/narrative/NarrativeView';
import { layoutHintOf } from '../src/Home';

// ticket #19：P2 布局与缩放（D6 适合宽度、E1 断点文案、E2 双栏与画布限高）。
// 双栏几何与滚动所有权的浏览器级验收记录在整改文档第 7 节与 ADR-0015。
// R08：自动适配最小可读缩放、窄屏画布在前、源码可隐藏。

const webDir = fileURLToPath(new URL('..', import.meta.url));

describe('ticket #19：P2 布局与缩放（D6/E1/E2）', () => {
  it('D6/R08 fitZoomOf：比例低于 90% 保持 100%，不再压到 60%', () => {
    expect(fitZoomOf(866, 1100)).toBe(1);
    expect(fitZoomOf(600, 1100)).toBe(1);
    expect(fitZoomOf(990, 1100)).toBeCloseTo(AUTO_FIT_MIN, 6);
    expect(fitZoomOf(1000, 1100)).toBeCloseTo(1000 / 1100, 6);
    expect(fitZoomOf(1920, 1100)).toBe(1);
    expect(fitZoomOf(1200, 900)).toBe(1);
    expect(fitZoomOf(0, 1100)).toBe(1);
  });

  it('D6 控制条含 100% 复位按钮与适合宽度的按下态', () => {
    const source = readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', 'hello.pv'), 'utf8');
    const html = renderToString(createElement(NarrativeView, { result: parsePv(source) }));
    expect(html).toContain('复位到 100% 缩放');
    expect(html).toMatch(/aria-pressed="true"[^>]*>适合宽度|>适合宽度<[\s\S]{0,80}aria-pressed/);
    expect(html).toContain('aria-live="polite"');
  });

  it('R08 缩放读出旁提供等效正文字号提示', () => {
    const source = readFileSync(join(webDir, '..', 'core', 'fixtures', 'pv', 'hello.pv'), 'utf8');
    const html = renderToString(createElement(NarrativeView, { result: parsePv(source) }));
    expect(html).toContain('正文约 9px');
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.narrative-zoom-font\s*\{/);
  });

  it('E1/R08 首页文案由断点决定：宽屏提左侧并列，窄屏提画布在前', () => {
    expect(layoutHintOf(true)).toContain('左侧');
    expect(layoutHintOf(true)).toContain('并列');
    expect(layoutHintOf(false)).toContain('先显示');
    expect(layoutHintOf(false)).not.toContain('左侧');
  });

  it('E2 双栏与画布限高的 CSS 约束就位（1280px 断点与 ADR-0015 一致）', () => {
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.app\s*\{[^}]*max-width:\s*min\(1600px,\s*100%\)/s);
    expect(styles).toMatch(/@media \(min-width:\s*1280px\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(320px,\s*420px\)\s+minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.source-column\s*\{[^}]*position:\s*sticky/s);
    const v2 = readFileSync(join(webDir, 'src', 'narrative', 'v2.css'), 'utf8');
    expect(v2).toMatch(/\.narrative-viewport\s*\{[^}]*max-height:\s*75vh[^}]*overflow:\s*auto/s);
    expect(v2).toMatch(/\.narrative-controls--sticky\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
  });

  it('R08 窄屏堆叠画布在前，源码列可显式隐藏且画布占满宽度', () => {
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.loaded-columns\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    expect(styles).toMatch(/\.canvas-column\s*\{[^}]*order:\s*-1/s);
    expect(styles).toMatch(/\.loaded-columns--source-hidden \.source-column\s*\{[^}]*display:\s*none/s);
    expect(styles).toMatch(/\.loaded-columns--source-hidden\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    const app = readFileSync(join(webDir, 'src', 'App.tsx'), 'utf8');
    expect(app).toContain("sessionStorage.getItem('pv-lens-source-hidden')");
    expect(app).toMatch(/aria-pressed=\{sourceHidden\}/);
  });

  it('R16 源码面板提供自动换行开关（会话记忆）与宽屏可拖拽分栏', () => {
    const sourcePanel = readFileSync(join(webDir, 'src', 'SourcePanel.tsx'), 'utf8');
    expect(sourcePanel).toContain("sessionStorage.getItem('pv-lens-source-wrap')");
    expect(sourcePanel).toMatch(/aria-pressed=\{wrap\}/);
    expect(sourcePanel).toMatch(/source-body\$\{wrap \? ' source-body--wrap' : ''\}/);
    const app = readFileSync(join(webDir, 'src', 'App.tsx'), 'utf8');
    expect(app).toContain("sessionStorage.getItem('pv-lens-source-col-width')");
    expect(app).toContain('column-divider');
    expect(app).toMatch(/Math\.min\(560,\s*Math\.max\(280,/);
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.source-body--wrap\s*\{[^}]*white-space:\s*pre-wrap/s);
    expect(styles).toMatch(/\.column-divider\s*\{[^}]*display:\s*none/s);
    expect(styles).toMatch(/@media \(min-width:\s*1280px\)\s*\{[\s\S]*?\.column-divider\s*\{[\s\S]*?cursor:\s*col-resize/s);
  });

  it('R18 说明文字行宽约 70 字符，宽屏单行不超过约 900px', () => {
    const styles = readFileSync(join(webDir, 'src', 'styles.css'), 'utf8');
    expect(styles).toMatch(/\.hint\s*\{[^}]*max-width:\s*70ch/s);
  });

  it('R19 首页提供阅读路径、favicon 与服务健康状态', () => {
    const index = readFileSync(join(webDir, 'index.html'), 'utf8');
    expect(index).toMatch(/<link rel="icon"[^>]*favicon\.svg/);
    const home = readFileSync(join(webDir, 'src', 'Home.tsx'), 'utf8');
    expect(home).toContain('reading-path');
    expect(home).toContain('useVerifyServiceHealth');
  });
});
