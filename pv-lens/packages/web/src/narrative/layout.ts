/**
 * 规范叙事视图的确定性布局（ticket 04）。
 *
 * 纯函数：`ParseResult` 进 → 泳道 / 步骤卡片 / 诊断卡片 / 跨泳道连线的坐标与文本出。
 * 不依赖 DOM（浏览器布局引擎不参与），坐标全部由 `NARRATIVE_METRICS` 的固定常量算出，
 * 同一模型两次调用结果相同，可在 node 下断言。
 *
 * 泳道选择的规则（对齐 core 的 parsePv 契约）：
 * - 有命名进程时，每个命名进程一条泳道（主进程是协议启动处、不是协议参与方，不单独成泳道）；
 * - 没有任何命名进程而有内联主进程时（如 hello），主进程渲染为一条名为 `main` 的泳道；
 * - 两者都没有时 `hasLanes` 为 false，视图据此显示中文提示而非白屏。
 *
 * 未配对与配对接缝（ticket 06）：默认 `pairings` 为空 ⇒ 每个步骤卡片都标 `未配对`，
 * 布局绝不臆造连线。传入 pairing 时，其两个端点步骤去掉 `未配对` 标注，并产出一条
 * 跨泳道连线（连线形态由渲染端决定，布局只给端点锚点）。
 */

import type { MessageStep, ParseResult, PvDiagnostic, PvRole } from '@pv-lens/core';
import { renderTerm } from '@pv-lens/core';

/** 布局用的固定尺寸常量（改这里即可整体缩放，视图与测试共用同一份）。 */
export const NARRATIVE_METRICS = {
  /** 画布四周留白。 */
  margin: 24,
  /** 单条泳道宽度。 */
  laneWidth: 380,
  /** 泳道标题区高度。 */
  laneHeaderHeight: 44,
  /** 泳道之间的水平间距（跨泳道连线走这里）。 */
  laneGap: 48,
  /** 泳道底部留白。 */
  lanePaddingBottom: 16,
  /** 步骤卡片宽度（居中于泳道内）。 */
  cardWidth: 340,
  /** 卡片之间的垂直间距。 */
  cardGap: 12,
  /** 卡片内一行文本的行高。 */
  lineHeight: 16,
  /** 一行文本的基线相对行顶的下移量。 */
  lineBaseline: 12,
  /** 卡片左右内边距。 */
  cardPaddingX: 10,
  /** 卡片上下内边距。 */
  cardPaddingY: 8,
  /** 卡片文本每行最多字符数（按等宽字体 + 卡片宽度定的估计值）。 */
  maxLineChars: 48,
  /** 泳道之后的「未归属诊断」区标题高度。 */
  unassignedTitleHeight: 28,
  /** 泳道区与「未归属诊断」区之间的间距。 */
  sectionGap: 24,
} as const;

/** 步骤卡片的一行文本；`kind` 决定渲染端的样式（不是语义信息）。 */
export interface LayoutTextLine {
  kind: 'header' | 'term' | 'fresh' | 'event' | 'guard' | 'message' | 'source';
  text: string;
}

/** 一个消息步骤的卡片。 */
export interface StepCard {
  /** 所属泳道在 `NarrativeLayout.lanes` 里的下标（配对锚点用它）。 */
  roleIndex: number;
  /** 该步骤在 `role.steps` 里的下标（配对锚点用它）。 */
  stepIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: 'out' | 'in';
  /** 中文方向标签：`发出` / `接收`。 */
  directionLabel: '发出' | '接收';
  /** 图形箭头：`→`（发出）/ `←`（接收）。 */
  arrow: '→' | '←';
  /** 信道词项的符号化渲染结果（如 `c`）。 */
  channelText: string;
  /** 消息词项的符号化渲染结果（如 `{[pkX,pkB,k]skB}pkX`）。 */
  termText: string;
  /** 步骤对应源码行号（1 基）。 */
  lineNumber: number;
  /** 该步骤是否处于复制 `!` 作用域内。 */
  replicated: boolean;
  /** 该步骤是否处于并行 `|` 组合内。 */
  parallel: boolean;
  /** 是否未配对（默认全部为 true；被 pairing 指到的端点转为 false）。 */
  unpaired: boolean;
  /** 卡片角标（未配对 / `!` / `|`），渲染端据此选样式并在标题行右侧绘制。 */
  badges: readonly StepBadge[];
  /** 逐行文本（已按 `maxLineChars` 折行，一行对应一个 `<text>` 行）。 */
  lines: readonly LayoutTextLine[];
}

/** 卡片角标：`kind` 供渲染端选样式，`label` 是显示文字（不拿显示文字当类型用）。 */
export interface StepBadge {
  kind: 'unpaired' | 'replicated' | 'parallel';
  label: string;
}

/** 消息方向 → 箭头与中文标签（卡片标题与布局共用同一份，避免两处各写一遍）。 */
export function stepDirectionMeta(direction: 'out' | 'in'): {
  arrow: '→' | '←';
  label: '发出' | '接收';
} {
  return direction === 'out' ? { arrow: '→', label: '发出' } : { arrow: '←', label: '接收' };
}

/** 诊断级别 → 中文标签（布局与视图共用同一份）。 */
export function diagnosticSeverityLabel(severity: 'degraded' | 'error'): '降级诊断' | '错误诊断' {
  return severity === 'degraded' ? '降级诊断' : '错误诊断';
}

/** 一条诊断的「原文标注卡片」。 */
export interface DiagnosticCard {
  severity: 'degraded' | 'error';
  /** 中文严重级别标签：`降级诊断` / `错误诊断`。 */
  severityLabel: '降级诊断' | '错误诊断';
  message: string;
  sourceText: string;
  /** 诊断源码行号（1 基）。 */
  lineNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: readonly LayoutTextLine[];
}

/** 一条泳道。 */
export interface NarrativeLane {
  /** 在 `NarrativeLayout.lanes` 里的下标（配对锚点用它；有命名角色时与 `roles` 下标一致）。 */
  roleIndex: number;
  name: string;
  /** `main` 表示内联主进程伪角色（没有任何命名进程时的兜底泳道）。 */
  kind: 'role' | 'main';
  /** 展示用参数签名（如 `(pkS: spkey, skA: skey)`）；无参为空串。 */
  signatureText: string;
  replicated: boolean;
  parallel: boolean;
  /** 该泳道的消息步骤数。 */
  stepCount: number;
  cards: readonly StepCard[];
  /** 归入该泳道的诊断卡片（span 落在角色 `role.span` 内的诊断）。 */
  diagnosticCards: readonly DiagnosticCard[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 配对端点：`roleIndex` 为泳道下标，`stepIndex` 为该泳道内的步骤下标。 */
export interface StepPairingAnchor {
  roleIndex: number;
  stepIndex: number;
}

/** 一条跨泳道配对（ticket 06 的保守配对引擎产出，渲染端只消费）。 */
export interface StepPairing {
  from: StepPairingAnchor;
  to: StepPairingAnchor;
}

/** 一条跨泳道连线的端点锚点（卡片边缘中点），连线形态由渲染端决定。 */
export interface CrossLaneEdge {
  from: StepPairingAnchor & { x: number; y: number };
  to: StepPairingAnchor & { x: number; y: number };
}

/** 「未归属诊断」区（落不进任何泳道的诊断）。 */
export interface UnassignedSection {
  title: string;
  x: number;
  /** 标题区顶部（渲染端在 `y + lineBaseline + 4` 处画文字基线）。 */
  y: number;
}

/** 布局产物：视图据此自绘 SVG。 */
export interface NarrativeLayout {
  lanes: readonly NarrativeLane[];
  /** 落不进任何泳道的诊断（泳道之后的「未归属诊断」区）。 */
  unassignedDiagnostics: readonly DiagnosticCard[];
  /** 有配对的步骤之间的跨泳道连线；默认（无配对）为空。 */
  crossLaneEdges: readonly CrossLaneEdge[];
  /** 「未归属诊断」区；无未归属诊断时为 null。 */
  unassignedSection: UnassignedSection | null;
  width: number;
  height: number;
  /** 是否有可画的泳道；false 时视图显示「无角色结构」中文提示而非白屏。 */
  hasLanes: boolean;
}

/** `buildNarrativeLayout` 的选项：`pairings` 缺省为空 ⇒ 全部步骤标未配对。 */
export interface NarrativeLayoutOptions {
  pairings?: readonly StepPairing[];
}

const { margin, laneWidth, laneHeaderHeight, laneGap, lanePaddingBottom, cardWidth } =
  NARRATIVE_METRICS;
const { cardGap, lineHeight, cardPaddingY, maxLineChars } = NARRATIVE_METRICS;
const { unassignedTitleHeight, sectionGap } = NARRATIVE_METRICS;

/** 按字符数折行；优先在窗口内的最后一个空格处断行（找不到合适的空格就硬断）。 */
function wrapText(text: string, limit: number): string[] {
  const source = text.trim();
  if (source.length <= limit) return [source];
  const lines: string[] = [];
  let rest = source;
  while (rest.length > limit) {
    const spaceAt = rest.lastIndexOf(' ', limit);
    const cut = spaceAt > limit / 2 ? spaceAt : limit;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) lines.push(rest);
  return lines;
}

/** 卡片高度 = 上下内边距 + 行数 × 行高（内容驱动，保证文本行都落在卡片内）。 */
function heightOfLines(lines: readonly LayoutTextLine[]): number {
  return cardPaddingY * 2 + lines.length * lineHeight;
}

function pushWrapped(lines: LayoutTextLine[], kind: LayoutTextLine['kind'], text: string): void {
  for (const part of wrapText(text, maxLineChars)) {
    lines.push({ kind, text: part });
  }
}

/** 守卫注释的中文前缀：`if cond` / `let 模式 =` / `get 模式` / `insert 语句`。 */
function guardText(guard: MessageStep['annotations']['guards'][number]): string {
  switch (guard.kind) {
    case 'if':
      return `if ${guard.text}`;
    case 'let-pattern':
      return `let ${guard.text} =`;
    case 'get':
      return `get ${guard.text}`;
    case 'insert':
      return `insert ${guard.text}`;
  }
}

/** 步骤卡片的逐行文本：标题行（方向/信道/行号）+ 符号化词项 + new / event / 守卫注释。 */
function stepCardLines(step: MessageStep): LayoutTextLine[] {
  const { arrow, label } = stepDirectionMeta(step.direction);
  const lines: LayoutTextLine[] = [
    {
      kind: 'header',
      text: `${arrow} ${label} · 信道 ${renderTerm(step.channel)} · L${step.span.start.line}`,
    },
  ];
  pushWrapped(lines, 'term', renderTerm(step.term));
  for (const fresh of step.annotations.freshNames) {
    pushWrapped(lines, 'fresh', fresh.text);
  }
  for (const event of step.annotations.events) {
    pushWrapped(lines, 'event', `event ${event.text}`);
  }
  for (const guard of step.annotations.guards) {
    pushWrapped(lines, 'guard', guardText(guard));
  }
  return lines;
}

/** 诊断卡片的逐行文本：中文严重级别 + 行:列 / 中文 message / 原文 sourceText。 */
function diagnosticCardLines(diagnostic: PvDiagnostic): LayoutTextLine[] {
  const severityLabel = diagnosticSeverityLabel(diagnostic.severity);
  const location = `L${diagnostic.span.start.line}:${diagnostic.span.start.column}`;
  const lines: LayoutTextLine[] = [
    { kind: 'header', text: `${severityLabel} · ${location}` },
  ];
  pushWrapped(lines, 'message', diagnostic.message);
  pushWrapped(lines, 'source', diagnostic.sourceText);
  return lines;
}

function diagnosticCard(
  diagnostic: PvDiagnostic,
  x: number,
  y: number,
): DiagnosticCard {
  const lines = diagnosticCardLines(diagnostic);
  return {
    severity: diagnostic.severity,
    severityLabel: diagnosticSeverityLabel(diagnostic.severity),
    message: diagnostic.message,
    sourceText: diagnostic.sourceText,
    lineNumber: diagnostic.span.start.line,
    x,
    y,
    width: cardWidth,
    height: heightOfLines(lines),
    lines,
  };
}

/** 诊断是否落在该角色的源码范围内（前闭后开，按字符 offset 判定）。 */
function diagnosticInRole(diagnostic: PvDiagnostic, role: PvRole): boolean {
  const offset = diagnostic.span.start.offset;
  return offset >= role.span.start.offset && offset < role.span.end.offset;
}

interface LaneSource {
  role: PvRole;
  kind: 'role' | 'main';
}

/**
 * 选出要画成泳道的角色：有命名进程就用命名进程，否则退回内联主进程（`main`）。
 * 两者都没有时返回空数组，视图据此显示「无角色结构」中文提示。
 */
function selectLaneSources(result: ParseResult): LaneSource[] {
  if (result.roles.length > 0) {
    return result.roles.map((role) => ({ role, kind: 'role' as const }));
  }
  if (result.mainProcess !== null) {
    return [{ role: result.mainProcess, kind: 'main' as const }];
  }
  return [];
}

function signatureOf(role: PvRole): string {
  if (role.parameters.length === 0) return '';
  const params = role.parameters
    .map((p) => (p.typeName === undefined ? p.name : `${p.name}: ${p.typeName}`))
    .join(', ');
  return `(${params})`;
}

function anchorKey(anchor: StepPairingAnchor): string {
  return `${anchor.roleIndex}:${anchor.stepIndex}`;
}

/**
 * 把语义模型算成确定性布局。`options.pairings` 缺省为空数组：所有步骤卡片都带
 * `未配对` 标注、`crossLaneEdges` 为空（绝不臆造连线）。
 *
 * 配对锚点里越界的 `roleIndex` / `stepIndex`（或两个端点指向同一张卡片）一律忽略，
 * 不画线也不去掉未配对标注——渲染端只呈现可信的配对。
 */
export function buildNarrativeLayout(
  result: ParseResult,
  options: NarrativeLayoutOptions = {},
): NarrativeLayout {
  const sources = selectLaneSources(result);

  // 第一遍：按源码顺序铺好泳道与卡片，全部按「未配对」起步。
  const lanes: NarrativeLane[] = sources.map((source, roleIndex) => {
    const { role, kind } = source;
    const laneX = margin + roleIndex * (laneWidth + laneGap);
    const laneY = margin;
    const cardX = laneX + (laneWidth - cardWidth) / 2;
    let cursorY = laneY + laneHeaderHeight;

    const cards: StepCard[] = role.steps.map((step, stepIndex) => {
      const lines = stepCardLines(step);
      const height = heightOfLines(lines);
      const directionMeta = stepDirectionMeta(step.direction);
      const badges: StepBadge[] = [{ kind: 'unpaired', label: '未配对' }];
      if (step.annotations.replicated) badges.push({ kind: 'replicated', label: '!' });
      if (step.annotations.parallel) badges.push({ kind: 'parallel', label: '|' });
      const card: StepCard = {
        roleIndex,
        stepIndex,
        x: cardX,
        y: cursorY,
        width: cardWidth,
        height,
        direction: step.direction,
        directionLabel: directionMeta.label,
        arrow: directionMeta.arrow,
        channelText: renderTerm(step.channel),
        termText: renderTerm(step.term),
        lineNumber: step.span.start.line,
        replicated: step.annotations.replicated,
        parallel: step.annotations.parallel,
        unpaired: true,
        badges,
        lines,
      };
      cursorY += height + cardGap;
      return card;
    });

    // 归入本泳道的诊断（span 落在角色 span 内）：接在步骤卡片下面同列堆叠。
    const diagnosticCards: DiagnosticCard[] = result.diagnostics
      .filter((diagnostic) => diagnosticInRole(diagnostic, role))
      .map((diagnostic) => {
        const card = diagnosticCard(diagnostic, cardX, cursorY);
        cursorY += card.height + cardGap;
        return card;
      });

    const contentBottom = cursorY - cardGap;
    const height =
      Math.max(contentBottom, laneY + laneHeaderHeight) + lanePaddingBottom - laneY;
    return {
      roleIndex,
      name: role.name,
      kind,
      signatureText: signatureOf(role),
      replicated: role.replicated,
      parallel: role.parallel,
      stepCount: role.steps.length,
      cards,
      diagnosticCards,
      x: laneX,
      y: laneY,
      width: laneWidth,
      height,
    };
  });

  // 第二遍：解析配对锚点（越界/同卡一律忽略），给出连线端点并去掉端点的未配对标注。
  const laneByIndex = new Map(lanes.map((lane) => [lane.roleIndex, lane]));
  const pairedKeys = new Set<string>();
  const crossLaneEdges: CrossLaneEdge[] = [];

  for (const pairing of options.pairings ?? []) {
    const from = laneByIndex.get(pairing.from.roleIndex)?.cards[pairing.from.stepIndex];
    const to = laneByIndex.get(pairing.to.roleIndex)?.cards[pairing.to.stepIndex];
    if (from === undefined || to === undefined) continue;
    if (from === to) continue;
    pairedKeys.add(anchorKey(pairing.from));
    pairedKeys.add(anchorKey(pairing.to));
    crossLaneEdges.push({
      from: { ...pairing.from, x: from.x + from.width, y: from.y + from.height / 2 },
      to: { ...pairing.to, x: to.x, y: to.y + to.height / 2 },
    });
  }

  const finalLanes =
    pairedKeys.size === 0
      ? lanes
      : lanes.map((lane) => ({
          ...lane,
          cards: lane.cards.map((card) =>
            pairedKeys.has(`${card.roleIndex}:${card.stepIndex}`)
              ? { ...card, unpaired: false, badges: card.badges.filter((b) => b.kind !== 'unpaired') }
              : card,
          ),
        }));

  // 落不进任何泳道的诊断 → 「未归属诊断」区（泳道之后）。
  const laneRoles = sources.map((source) => source.role);
  const unassigned = result.diagnostics.filter(
    (diagnostic) => !laneRoles.some((role) => diagnosticInRole(diagnostic, role)),
  );

  let maxLaneHeight = 0;
  for (const lane of finalLanes) maxLaneHeight = Math.max(maxLaneHeight, lane.height);
  const lanesBottom = margin + maxLaneHeight;

  let unassignedSection: UnassignedSection | null = null;
  const unassignedDiagnostics: DiagnosticCard[] = [];
  let bottom = lanesBottom + margin;

  if (unassigned.length > 0) {
    const titleY = lanesBottom + sectionGap;
    unassignedSection = { title: '未归属诊断', x: margin, y: titleY };
    let cursorY = titleY + unassignedTitleHeight;
    for (const diagnostic of unassigned) {
      const card = diagnosticCard(diagnostic, margin, cursorY);
      unassignedDiagnostics.push(card);
      cursorY += card.height + cardGap;
    }
    bottom = cursorY - cardGap + margin;
  }

  const width =
    finalLanes.length > 0
      ? margin * 2 + finalLanes.length * laneWidth + (finalLanes.length - 1) * laneGap
      : margin * 2 + cardWidth;

  return {
    lanes: finalLanes,
    unassignedDiagnostics,
    crossLaneEdges,
    unassignedSection,
    width,
    height: Math.max(bottom, margin * 2),
    hasLanes: finalLanes.length > 0,
  };
}
