/**
 * 验证结果面板（ticket 08）：对当前 `.pv` 文本跑一次本机 ProVerif，并按**查询**呈现结论。
 *
 * 输入只有两样：当前 `.pv` 全文（验证发的就是它，ADR-0001）与同一份文本的解析产物
 * （由 App 解析一次，泳道图与这里共用）。解析侧的问题（降级 / 语法错误）只作为提示，
 * 不阻止验证——ProVerif 看到的是原始文本。
 *
 * 结果保留最近一次运行（重复运行覆盖）；失败按 `VerifyFailureKind` 分派中文指引
 * （措辞与安装/路径口径见 ADR-0002 与 `verify.ts`）。
 */

import { useMemo, useRef, useState } from 'react';
import type { ParseResult } from '@pv-lens/core';
import { describeVerifyFailure, requestVerification } from './verify';
import type { VerifyFailure, VerifyOutcome } from './verify';
import { mapResultsToQueries, VERDICT_META } from './query-presentation';
import type { QueryResultView } from './query-presentation';

/** 超时输入框的默认值（毫秒），与 server 适配器的默认值一致。 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface VerifyPanelProps {
  /** 当前 `.pv` 全文。 */
  source: string;
  /** 同一份 source 的解析产物（App 侧记忆化一次，泳道图与验证面板共用）。 */
  parseResult: ParseResult;
}

/** 面板的最近一次运行状态：未跑 / 正在跑 / 跑完（成功或失败）。 */
type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; outcome: VerifyOutcome };

export function VerifyPanel({ source, parseResult }: VerifyPanelProps) {
  const [timeoutText, setTimeoutText] = useState(String(DEFAULT_TIMEOUT_MS));
  const [state, setState] = useState<RunState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const timeoutMs = Number(timeoutText.trim());
  const timeoutValid = timeoutText.trim().length > 0 && Number.isFinite(timeoutMs) && timeoutMs > 0;
  const running = state.status === 'running';
  const outcome: VerifyOutcome | null = state.status === 'done' ? state.outcome : null;

  const views = useMemo(() => {
    if (outcome === null || !outcome.ok) return [];
    return mapResultsToQueries(outcome.results, parseResult.queries);
  }, [outcome, parseResult.queries]);

  async function run(): Promise<void> {
    if (running || !timeoutValid) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'running' });
    const next = await requestVerification(source, { timeoutMs, signal: controller.signal });
    if (abortRef.current === controller) abortRef.current = null;
    setState({ status: 'done', outcome: next });
  }

  function cancel(): void {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  return (
    <section className="verify" aria-label="验证结果">
      <h3 className="verify-title">验证结果（ProVerif）</h3>
      <p className="hint">
        把当前 `.pv` 原文交给本机 ProVerif 运行一次（`POST /api/verify`）。结果按查询逐条列出：
        查询原文 + 判定 + 解释；被证伪时可展开反例 trace 原文。判定措辞对照归一化语义
        （`is true` → 成立 / `is false` → 被证伪 / `cannot be proved` → 未能证明）。
      </p>

      <ParseNotices parseResult={parseResult} />

      <div className="verify-controls">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void run()}
          disabled={running || !timeoutValid}
        >
          运行验证
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

      {outcome !== null &&
        (outcome.ok ? (
          <VerifyResults views={views} stdout={outcome.stdout} />
        ) : (
          <VerifyFailureNotice outcome={outcome} />
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
          模型含解析器不支持的语法，已降级显示（泳道图里作为原文标注段保留）；验证仍按原始 `.pv` 文本运行。
        </p>
      )}
      {parseResult.hasErrors && (
        <div className="verify-notice verify-notice--error" role="alert">
          <p>
            模型有语法错误：泳道图只呈现能解析的部分。验证仍按原始 `.pv` 文本运行，
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

/** 成功结果：按查询逐条卡片 + 完整原始 stdout（可折叠）。 */
function VerifyResults({
  views,
  stdout,
}: {
  views: readonly QueryResultView[];
  stdout: string;
}) {
  return (
    <div className="verify-results">
      <h4 className="verify-subtitle">按查询的结论（共 {views.length} 条）</h4>
      {views.length === 0 ? (
        <p className="hint">
          ProVerif 没有输出任何 RESULT 行：可能是模型里没有 `query` 语句，或运行在中途结束。
          可用下面的完整原始输出核对。
        </p>
      ) : (
        <ul className="query-result-list">
          {views.map((view, index) => (
            <QueryResultCard key={view.cardId} index={index} view={view} />
          ))}
        </ul>
      )}
      <details className="raw-output">
        <summary>ProVerif 完整原始输出（stdout）</summary>
        <pre className="raw-output-body">
          <code>{stdout}</code>
        </pre>
      </details>
    </div>
  );
}

/**
 * 一条查询的结果卡片：用户查询原文（回到书写形式）+ 归一化形态 + 判定徽标 + 解释。
 * 被证伪时反例 trace 原文可展开。
 */
export function QueryResultCard({ index, view }: { index: number; view: QueryResultView }) {
  const meta = VERDICT_META[view.verdict];
  return (
    <li id={view.cardId} className={`query-card query-card--${meta.tone}`}>
      <div className="query-card-head">
        <span className="query-card-index">查询 {index + 1}</span>
        <span className={`verdict-badge verdict-badge--${meta.tone}`}>{view.verdictLabel}</span>
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
      <p className="query-card-normalized">
        归一化形态：<code>{view.normalizedQuery}</code>（判定针对它给出）
      </p>
      {view.variables.length > 0 && (
        <p className="query-card-vars">
          查询前缀声明的变量：<code>{view.variables.join(', ')}</code>
        </p>
      )}
      <p className="query-card-explanation">{meta.explanation}</p>
      {view.goalReachable !== null && (
        <p className="query-card-goal">
          <code>{view.goalReachable}</code>
        </p>
      )}
      {view.counterexampleTrace !== null && (
        <details className="counterexample">
          <summary>展开反例 / 攻击 trace 原文</summary>
          <pre className="counterexample-body">
            <code>{view.counterexampleTrace}</code>
          </pre>
        </details>
      )}
    </li>
  );
}

/** 失败呈现：按 kind 给中文指引；带输出时（模型报错 / 超时）原样附上。 */
export function VerifyFailureNotice({ outcome }: { outcome: VerifyFailure }) {
  return (
    <div className="verify-failure" role="alert">
      <h4 className="verify-failure-title">验证未能完成（{outcome.kind}）</h4>
      <p className="verify-failure-guidance">{describeVerifyFailure(outcome.kind, outcome)}</p>
      {outcome.exitCode !== undefined && (
        <p className="verify-failure-meta">
          退出码：<code>{outcome.exitCode === null ? '（无）' : String(outcome.exitCode)}</code>
        </p>
      )}
      {outcome.stderr !== undefined && outcome.stderr.length > 0 && (
        <OutputBlock summary="stderr（ProVerif 的错误信息）" text={outcome.stderr} />
      )}
      {outcome.stdout !== undefined && outcome.stdout.length > 0 && (
        <OutputBlock summary="stdout（ProVerif 的原始输出）" text={outcome.stdout} />
      )}
    </div>
  );
}

/** 失败时的原始输出折叠块（等宽 `<pre>`，逐字保留）。 */
function OutputBlock({ summary, text }: { summary: string; text: string }) {
  return (
    <details className="raw-output">
      <summary>{summary}</summary>
      <pre className="raw-output-body">
        <code>{text}</code>
      </pre>
    </details>
  );
}
