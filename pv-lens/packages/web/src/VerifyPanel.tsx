/**
 * 验证结果面板（ticket 08）：对当前 `.pv` 文本跑一次本机 ProVerif，并按**查询**呈现结论。
 *
 * 输入只有两样：当前 `.pv` 全文（验证发的就是它，ADR-0001）与同一份文本的解析产物
 * （由 App 解析一次，叙事视图与这里共用）。解析侧的问题（降级 / 语法错误）只作为提示，
 * 不阻止验证——ProVerif 看到的是原始文本。
 *
 * 结果保留最近一次运行（重复运行覆盖）；失败按 `VerifyFailureKind` 分派中文指引
 * （措辞与安装/路径口径见 ADR-0002 与 `verify.ts`）。
 */

import { useMemo, useRef, useState } from 'react';
import type { ParseResult, PvQuery, SourceSpan } from '@pv-lens/core';
import { attributeCounterexample, parseProverifLocations, sanitizeStdout } from '@pv-lens/core';
import { describeVerifyFailureKind, requestVerification, verifyFailureGuidance } from './verify';
import type { VerifyFailure, VerifyOutcome } from './verify';
import { mapResultsToQueries, normalizeQueryForMatch, summarizeCoverage, VERDICT_META } from './query-presentation';
import type { QueryResultView, SessionQueryRef, VerificationCoverage } from './query-presentation';
import { useVerifyServiceHealth, verifyServiceHealthText } from './use-service-health';

/** 超时输入框的默认值（毫秒），与 server 适配器的默认值一致。 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface VerifyPanelProps {
  /** 当前 `.pv` 全文。 */
  source: string;
  /** 同一份 source 的解析产物（App 侧记忆化一次，叙事视图与验证面板共用）。 */
  parseResult: ParseResult;
  /** 定位查询源码区间（App 负责高亮与滚动画布）。 */
  onLocateSpan?: (span: SourceSpan) => void;
  /** 定位查询涉及的事件（App 负责联动旗标与对应性矩阵）。 */
  onSelectEvent?: (span: SourceSpan) => void;
  /** 会话目标的查询正文与原始锚点，用于标注来源并避免派生行号错位。 */
  sessionQueries?: readonly SessionQueryRef[];
}

/** 面板的最近一次运行状态：未跑 / 正在跑 / 跑完（成功或失败）。 */
type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; outcome: VerifyOutcome };

export function VerifyPanel({ source, parseResult, onLocateSpan, onSelectEvent, sessionQueries = [] }: VerifyPanelProps) {
  const [timeoutText, setTimeoutText] = useState(String(DEFAULT_TIMEOUT_MS));
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // R10：载入即探测服务健康，避免点「运行验证」后才发现 server 未启动；运行结束后刷新。
  const { health, recheck } = useVerifyServiceHealth();

  const timeoutMs = Number(timeoutText.trim());
  const timeoutValid = timeoutText.trim().length > 0 && Number.isFinite(timeoutMs) && timeoutMs > 0;
  const running = state.status === 'running';
  const outcome: VerifyOutcome | null = state.status === 'done' ? state.outcome : null;

  const views = useMemo(() => {
    if (outcome === null || !outcome.ok) return [];
    return mapResultsToQueries(outcome.results, parseResult.queries, parseResult, sessionQueries);
  }, [outcome, parseResult.queries]);

  async function run(): Promise<void> {
    if (running || !timeoutValid) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'running' });
    const next = await requestVerification(source, { timeoutMs, signal: controller.signal });
    if (abortRef.current === controller) abortRef.current = null;
    setState({ status: 'done', outcome: next });
    setFinishedAt(new Date());
    recheck();
  }

  function cancel(): void {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /** D8 完成后的状态行文案：完成 / 取消 / 超时 / 其它失败（R10：不外露机器枚举）。 */
  const finishedStateText = (result: VerifyOutcome): string => {
    const at = finishedAt === null ? '' : `（${finishedAt.toLocaleTimeString('zh-CN', { hour12: false })}）`;
    if (result.ok) return `上次运行完成${at}`;
    if (result.kind === 'cancelled') return `上次运行已取消${at}`;
    if (result.kind === 'timeout') return `上次运行超时${at}`;
    return `上次运行未完成，见下方失败说明${at}`;
  };

  return (
    <section className="verify" aria-label="验证结果">
      <h3 className="verify-title">
        验证结果（ProVerif）
        <span className={`verify-health verify-health--${health}`} role="status" title={verifyServiceHealthText(health)}>
          <span className="verify-health-dot" aria-hidden="true" />
          {verifyServiceHealthText(health)}
        </span>
      </h3>
      <p className="hint">
        把当前 <code>.pv</code> 原文交给本机验证服务运行一次。结果按查询逐条列出：
        查询原文 + 判定 + 解释；被证伪时可展开反例 trace 原文。判定措辞对照归一化语义
        （<code>is true</code> → 成立 / <code>is false</code> → 被证伪 / <code>cannot be proved</code> → 未证出）。
      </p>

      <ParseNotices parseResult={parseResult} />

      <div className="verify-controls">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void run()}
          disabled={running || !timeoutValid}
          aria-busy={running}
        >
          {running && <span className="btn-spinner" aria-hidden="true" />}
          {running ? '运行中…' : '运行验证'}
        </button>
        {running && (
          <button type="button" className="btn" onClick={cancel}>
            取消
          </button>
        )}
        <label className="verify-timeout">
          超时（毫秒）
          <input
            type="number"
            min={1}
            step={1000}
            value={timeoutText}
            disabled={running}
            onChange={(event) => setTimeoutText(event.target.value)}
          />
        </label>
        {!timeoutValid && <span className="verify-error">超时必须是正数（毫秒）。</span>}
      </div>

      {running && (
        <p className="verify-progress" role="status">
          正在运行 ProVerif…（可随时点「取消」中断）
        </p>
      )}
      {outcome !== null && (
        <p className="verify-run-state" role="status">{finishedStateText(outcome)}</p>
      )}

      {outcome !== null &&
        (outcome.ok ? (
          <VerifyResults views={views} stdout={outcome.stdout} queries={parseResult.queries} onLocateSpan={onLocateSpan} onSelectEvent={onSelectEvent} />
        ) : (
          <VerifyFailureNotice outcome={outcome} source={source} />
        ))}
    </section>
  );
}

/** 解析侧提示条：降级不阻止验证，语法错误照旧发给 ProVerif（它才是指出模型问题的权威）。 */
function ParseNotices({ parseResult }: { parseResult: ParseResult }) {
  if (!parseResult.hasDegraded && !parseResult.hasErrors) return null;

  return (
    <div className="parse-notices">
      {parseResult.hasDegraded && (
        <p className="verify-notice verify-notice--info" role="status">
          {`模型含解析器不支持的语法，已降级显示（${String(parseResult.diagnostics.filter((diagnostic) => diagnostic.severity === 'degraded').length)} 处；叙事视图里作为原文标注段保留）；验证仍按原始 .pv 文本运行。`}
        </p>
      )}
      {parseResult.hasErrors && (
        <div className="verify-notice verify-notice--error" role="alert">
          <p>
            模型有语法错误：叙事视图只呈现能解析的部分。验证仍按原始 <code>.pv</code> 文本运行，
            以 ProVerif 自己的报错为准。
          </p>
          <ul className="diagnostic-list">
            {parseResult.diagnostics
              .filter((diagnostic) => diagnostic.severity === 'error')
              .map((diagnostic, index) => (
                <li
                  key={`${diagnostic.span.start.offset}-${String(index)}`}
                  className="diagnostic-item diagnostic-item--error"
                >
                  <span className="diagnostic-severity">错误诊断</span>
                  <span className="diagnostic-line">
                    {`L${String(diagnostic.span.start.line)}:${String(diagnostic.span.start.column)}`}
                  </span>
                  <span className="diagnostic-message">{diagnostic.message}</span>
                  <code className="diagnostic-source">{diagnostic.sourceText}</code>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * R12：按 ProVerif 自己的查询分节切分 stdout（以 `Starting query ` 行为界，与 core 的
 * `parseVerifyStdout` 同一口径）；首节是运行准备与全局输出。纯函数、node 可测。
 */
export function splitStdoutSections(text: string): readonly string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('Starting query ')) {
      if (current.some((kept) => kept.trim().length > 0)) sections.push(current.join('\n'));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.some((kept) => kept.trim().length > 0)) sections.push(current.join('\n'));
  return sections;
}

/** 分节标题：`Starting query x.` 行取原文前 60 字符；其余节为「运行准备与全局输出」。 */
function sectionSummaryOf(section: string): string {
  const firstLine = section.split('\n').find((line) => line.trim().length > 0) ?? '';
  if (firstLine.startsWith('Starting query ')) {
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  }
  return '运行准备与全局输出';
}

/** R12：完整 stdout 的分节折叠视图——操作条（复制 / 下载 / 换行 / 展开全部）+ 逐节 `<details>`。 */
function StdoutSections({ stdout }: { stdout: string }) {
  const sanitized = useMemo(() => sanitizeStdout(stdout), [stdout]);
  const sections = useMemo(() => splitStdoutSections(sanitized), [sanitized]);
  const [wrap, setWrap] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const setAllSections = (open: boolean): void => {
    listRef.current?.querySelectorAll('details').forEach((element) => {
      (element as HTMLDetailsElement).open = open;
    });
  };
  return (
    <details className="raw-output">
      <summary>ProVerif 完整原始输出（临时路径已省略，按查询分节）</summary>
      <OutputActions
        text={sanitized}
        fileName="proverif-stdout.txt"
        wrap={wrap}
        onToggleWrap={() => setWrap((value) => !value)}
        onExpandAll={() => setAllSections(true)}
        onCollapseAll={() => setAllSections(false)}
      />
      <div className="raw-output-sections" ref={listRef}>
        {sections.map((section, index) => (
          <details className="raw-output raw-output--section" key={String(index)} open={sections.length <= 2}>
            <summary>{sectionSummaryOf(section)}</summary>
            <pre className={`raw-output-body${wrap ? ' raw-output-body--wrap' : ''}`}>
              <code>{section}</code>
            </pre>
          </details>
        ))}
      </div>
      <details className="raw-output raw-output--raw">
        <summary>查看未处理输出</summary>
        <pre className="raw-output-body">
          <code>{stdout}</code>
        </pre>
      </details>
    </details>
  );
}

/** 成功结果：按查询逐条卡片 + 完整原始 stdout（可折叠）。 */
function VerifyResults({
  views,
  stdout,
  queries,
  onLocateSpan,
  onSelectEvent,
}: {
  views: readonly QueryResultView[];
  stdout: string;
  queries: readonly PvQuery[];
  onLocateSpan?: (span: SourceSpan) => void;
  onSelectEvent?: (span: SourceSpan) => void;
  /** 会话目标的查询正文与原始锚点，用于标注来源并避免派生行号错位。 */
  sessionQueries?: readonly SessionQueryRef[];
}) {
  const coverage = summarizeCoverage(views, queries);
  return (
    <div className="verify-results">
      <CoverageSummary coverage={coverage} />
      <h4 className="verify-subtitle">按查询的结论（共 {views.length} 条）</h4>
      {views.length === 0 ? (
        <p className="hint">
          ProVerif 没有输出任何 RESULT 行：可能是模型里没有 <code>query</code> 语句，或运行在中途结束。
          可用下面的完整原始输出核对。
        </p>
      ) : (
        <ul className="query-result-list">
          {views.map((view, index) => (
            <QueryResultCard
              key={view.cardId}
              index={index}
              view={view}
              onLocateSpan={onLocateSpan}
              onSelectEvent={onSelectEvent}
            />
          ))}
        </ul>
      )}
      {/* F3：展示前脱敏临时目录；未处理原文保留二级入口供独立核对。 */}
      <StdoutSections stdout={stdout} />
    </div>
  );
}


function CoverageSummary({ coverage }: { coverage: VerificationCoverage }) {
  return (
    <section className="coverage-summary" aria-label="验证覆盖摘要">
      <div className="coverage-summary-head">
        <h5>验证覆盖摘要</h5>
        <span className="coverage-counts">
          查询 {coverage.declaredQueries} · 已验证 {coverage.verifiedQueries} · 匹配 {coverage.matchedQueries}
          {' · '}声明目标 {coverage.byOrigin.declared} / 会话目标 {coverage.byOrigin.session}
          {' · '}保密性 {coverage.byKind.secrecy} / 认证 {coverage.byKind.correspondence} / 可达性 {coverage.byKind.reachability}
        </span>
      </div>
      <p className="coverage-note">{coverage.note}</p>
    </section>
  );
}

/**
 * 一条查询的结果卡片：用户查询原文（回到书写形式）+ 判定徽标 + 解释。
 * R14：归一化形态仅在与其书写形式不同（规范化比较）时另列；查询前缀声明与证明中的
 * 对应事实收进折叠的「证明细节」。被证伪时反例 trace 原文可展开（R12：可复制 / 下载）。
 */
export function QueryResultCard({
  index,
  view,
  onLocateSpan,
  onSelectEvent,
}: {
  index: number;
  view: QueryResultView;
  onLocateSpan?: (span: SourceSpan) => void;
  onSelectEvent?: (span: SourceSpan) => void;
  /** 会话目标的查询正文与原始锚点，用于标注来源并避免派生行号错位。 */
  sessionQueries?: readonly SessionQueryRef[];
}) {
  const meta = VERDICT_META[view.verdict];
  // R14：与 query-presentation 的兜底匹配同口径——去 not / [] / 空白后比较。
  const normalizedSame = view.userText !== null
    && normalizeQueryForMatch(view.userText) === normalizeQueryForMatch(view.normalizedQuery);
  const [traceWrap, setTraceWrap] = useState(false);
  const attribution = useMemo(
    () => view.counterexampleTrace === null ? null : attributeCounterexample(view.counterexampleTrace),
    [view.counterexampleTrace],
  );
  return (
    <li id={view.cardId} className={`query-card query-card--${meta.tone}`}>
      <div className="query-card-head">
        <span className="query-card-index">查询 {index + 1}</span>
        <span className={`query-origin-badge query-origin-badge--${view.origin}`}>{view.originLabel}</span>
        <span className={`verdict-badge verdict-badge--${meta.tone}`}>{view.propertyVerdictLabel}</span>
      </div>
      <p className="query-card-label">用户书写的查询</p>
      {view.userText !== null ? (
        <code className="query-card-user">{view.userText}</code>
      ) : (
        <>
          <code className="query-card-user">{view.normalizedQuery}</code>
          <p className="hint">未匹配到用户查询原文，上面显示的是 ProVerif 的归一化形态。</p>
        </>
      )}
      {!normalizedSame && (
        <p className="query-card-normalized">
          归一化形态：<code>{view.normalizedQuery}</code>（判定针对它给出）
        </p>
      )}
      <dl className="query-card-lines">
        <div><dt>协议问题</dt><dd>{view.protocolQuestion}</dd></div>
        <div><dt>ProVerif 读法</dt><dd>{view.proverifReading}</dd></div>
        <div><dt>判定含义</dt><dd>{view.verdictMeaning}</dd></div>
      </dl>
      {(view.sourceSpan !== null || view.eventAnchors.length > 0) && (
        <div className="query-card-anchors">
          {view.sourceSpan !== null && (
            onLocateSpan === undefined
              ? <span>查询源码 L{view.sourceSpan.start.line}</span>
              : <button type="button" className="btn btn--small" onClick={() => onLocateSpan(view.sourceSpan!)}>
                  定位查询源码 L{view.sourceSpan.start.line}
                </button>
          )}
          {view.eventAnchors.map((anchor) => (
            onSelectEvent === undefined
              ? <span key={anchor.id}>{anchor.name}（{anchor.roleName}）</span>
              : <button type="button" key={anchor.id} className="btn btn--small" onClick={() => onSelectEvent(anchor.span)}>
                  定位事件 {anchor.name}（{anchor.roleName}）
                </button>
          ))}
        </div>
      )}
      {(view.variables.length > 0 || (view.goalReachable !== null && view.verdict === 'true')) && (
        <details className="query-card-proof">
          <summary>证明细节</summary>
          {view.variables.length > 0 && (
            <p className="query-card-vars">
              查询前缀声明的变量：<code>{view.variables.join(', ')}</code>
            </p>
          )}
          {view.goalReachable !== null && view.verdict === 'true' && (
            <p className="query-card-goal"><code>{view.goalReachable}</code></p>
          )}
        </details>
      )}
      {attribution !== null && (
        <section className="trace-attribution" aria-label="反例归因">
          <h5>攻击者从哪条消息获得什么</h5>
          <p className="trace-attribution-summary">{attribution.summary}</p>
          <ul className="trace-attribution-list">
            {attribution.entries.map((entry) => (
              <li key={entry.id} className={`trace-attribution-entry trace-attribution-entry--${entry.kind}`}>
                <strong>{entry.title}</strong>
                {entry.terms.length > 0 && (
                  <span className="trace-attribution-terms">
                    {entry.terms.map((term) => <code key={term}>{term}</code>)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {attribution.unattributed.length > 0 && (
            <details className="trace-attribution-raw">
              <summary>未归因原文（{attribution.unattributed.length} 行）</summary>
              <pre>{attribution.unattributed.join('\n')}</pre>
            </details>
          )}
        </section>
      )}
      {view.counterexampleTrace !== null && (
        <details className="counterexample">
          <summary>
            {view.goalReachable !== null && view.verdict === 'false'
              ? '攻击路径摘要与反例 trace'
              : '展开反例 / 攻击 trace 原文'}
          </summary>
          {view.goalReachable !== null && view.verdict === 'false' && (
            <p className="query-card-goal">
              ProVerif 报告的攻击路径摘要：<code>{view.goalReachable}</code>
            </p>
          )}
          <OutputActions
            text={view.counterexampleTrace}
            fileName={`proverif-trace-query-${String(index + 1)}.txt`}
            wrap={traceWrap}
            onToggleWrap={() => setTraceWrap((value) => !value)}
          />
          <pre className={`counterexample-body${traceWrap ? ' raw-output-body--wrap' : ''}`}>
            <code>{view.counterexampleTrace}</code>
          </pre>
        </details>
      )}
    </li>
  );
}

/**
 * 失败呈现（R10：面向用户只显示中文类别与指引；kind 枚举、HTTP 细节与退出码收进
 * 可折叠的「技术细节」）。带输出时（模型报错 / 超时）原样附上；模型报错时附源码行片段。
 */
export function VerifyFailureNotice({ outcome, source }: { outcome: VerifyFailure; source?: string }) {
  // F4：模型报错时解析 ProVerif 的行列定位，与工具诊断并列（两者指向可能不同的 token）。
  const locations = outcome.kind === 'proverif-error' && outcome.stdout !== undefined
    ? parseProverifLocations(outcome.stdout)
    : [];
  const sourceLines = useMemo(() => (source === undefined ? [] : source.split('\n')), [source]);
  return (
    <div className="verify-failure" role="alert">
      <h4 className="verify-failure-title">
        验证未能完成：{describeVerifyFailureKind(outcome.kind)}
      </h4>
      <p className="verify-failure-guidance">{verifyFailureGuidance(outcome.kind)}</p>
      <details className="verify-failure-tech">
        <summary>技术细节</summary>
        <p>类别代码：<code>{outcome.kind}</code></p>
        <p className="verify-failure-tech-message">{outcome.message}</p>
        {outcome.exitCode !== undefined && (
          <p>
            退出码：<code>{outcome.exitCode === null ? '（无）' : String(outcome.exitCode)}</code>
          </p>
        )}
      </details>
      {locations.length > 0 && (
        <ul className="diagnostic-list" aria-label="ProVerif 定位">
          {locations.map((location, index) => (
            <li key={`${String(location.line)}:${String(location.column)}:${String(index)}`} className="diagnostic-item diagnostic-item--error">
              <span className="diagnostic-severity">ProVerif 定位</span>
              <span className="diagnostic-line">{`L${String(location.line)}:${String(location.column)}`}</span>
              <span className="diagnostic-message">
                指向 ProVerif 报告的语法失败处；工具定位指向缺失 token 所在的左括号，两者可能不同
                {sourceLines[location.line - 1] !== undefined && (
                  <>
                    ；该行为 <code className="diagnostic-source">{sourceLines[location.line - 1]}</code>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {outcome.stderr !== undefined && outcome.stderr.length > 0 && (
        <OutputBlock summary="stderr（ProVerif 的错误信息）" text={outcome.stderr} fileName="proverif-stderr.txt" />
      )}
      {outcome.stdout !== undefined && outcome.stdout.length > 0 && (
        <OutputBlock summary="stdout（ProVerif 的原始输出，临时路径已省略）" text={sanitizeStdout(outcome.stdout)} fileName="proverif-stdout.txt" />
      )}
    </div>
  );
}

/** R12：复制到剪贴板，返回是否成功（未授权 / 不支持时返回 false，由界面给提示）。 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** R12：把文本作为文件下载（Blob + 临时 a 标签，不经过网络）。 */
function downloadText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** R12：复制 / 下载 / 适合宽度 / 展开全部 的操作条，stdout 与 trace 折叠块共用。 */
export function OutputActions({
  text,
  fileName,
  wrap,
  onToggleWrap,
  onExpandAll,
  onCollapseAll,
}: {
  text: string;
  fileName: string;
  wrap: boolean;
  onToggleWrap: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'failed'>('idle');
  return (
    <div className="raw-output-actions" role="group" aria-label="输出操作">
      <button
        type="button"
        className="btn btn--small"
        onClick={() => {
          void copyText(text).then((ok) => {
            setCopyState(ok ? 'ok' : 'failed');
            window.setTimeout(() => setCopyState('idle'), 2500);
          });
        }}
      >
        复制
      </button>
      <button type="button" className="btn btn--small" onClick={() => downloadText(text, fileName)}>
        下载
      </button>
      <button
        type="button"
        className="btn btn--small"
        aria-pressed={wrap}
        onClick={onToggleWrap}
        title={wrap ? '当前自动换行；点击改为不换行（横向滚动）' : '当前不换行；点击改为适合宽度（自动换行）'}
      >
        {wrap ? '不换行' : '适合宽度'}
      </button>
      {onExpandAll !== undefined && (
        <button type="button" className="btn btn--small" onClick={onExpandAll}>展开全部</button>
      )}
      {onCollapseAll !== undefined && (
        <button type="button" className="btn btn--small" onClick={onCollapseAll}>收起全部</button>
      )}
      {copyState !== 'idle' && (
        <span className={`raw-output-copy-state${copyState === 'ok' ? ' raw-output-copy-state--ok' : ''}`} role="status">
          {copyState === 'ok' ? '已复制' : '复制未成功（浏览器未授权剪贴板）'}
        </span>
      )}
    </div>
  );
}

/** 失败时的原始输出折叠块（等宽 `<pre>`，逐字保留；R12 增加复制 / 下载 / 换行切换）。 */
function OutputBlock({ summary, text, fileName }: { summary: string; text: string; fileName: string }) {
  const [wrap, setWrap] = useState(false);
  return (
    <details className="raw-output">
      <summary>{summary}</summary>
      <OutputActions
        text={text}
        fileName={fileName}
        wrap={wrap}
        onToggleWrap={() => setWrap((value) => !value)}
      />
      <pre className={`raw-output-body${wrap ? ' raw-output-body--wrap' : ''}`}>
        <code>{text}</code>
      </pre>
    </details>
  );
}
