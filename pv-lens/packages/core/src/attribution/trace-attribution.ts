/**
 * 反例 trace 归因（ADR-0018 / 阶段 5）。
 *
 * 只做列表级归因：把 ProVerif derivation 的编号步骤按 `output {n}` / `input {n}`
 * 分组，列出“攻击者从哪条消息获得了哪些项”。无法归因的行逐字保留；
 * 不绘制几何攻击路径，也不把单条查询的反例写成协议整体结论。
 */

export type TraceEntryKind = 'output' | 'input' | 'construction' | 'hypothesis' | 'unknown';

export interface TraceAttributionEntry {
  id: string;
  kind: TraceEntryKind;
  /** ProVerif derivation 中的消息步编号（`output {6}` → 6）。 */
  step?: number;
  title: string;
  /** 该步骤中 `attacker(...)` 行给出的知识项（去重保序）。 */
  terms: readonly string[];
  /** 原始 derivation 行（逐字保留）。 */
  lines: readonly string[];
}

export interface TraceAttribution {
  entries: readonly TraceAttributionEntry[];
  /** 未被编号步骤消费的原文行（逐字保留）。 */
  unattributed: readonly string[];
  summary: string;
}

interface Block {
  number: number;
  lines: string[];
}

/** 解析 derivation 的编号块；`Derivation:` 之前的导语也作为原文保留。 */
export function attributeCounterexample(trace: string): TraceAttribution {
  const lines = trace.split('\n').map((line) => line.replace(/\r$/, ''));
  const blocks: Block[] = [];
  const unattributed: string[] = [];
  let current: Block | null = null;
  for (const line of lines) {
    const numbered = /^\s*(\d+)\.\s*(.*)$/.exec(line);
    if (numbered !== null) {
      if (current !== null) blocks.push(current);
      current = { number: Number(numbered[1]), lines: [line] };
      continue;
    }
    if (current !== null) current.lines.push(line);
    else if (line.trim().length > 0 && line.trim() !== 'Derivation:' && line.trim() !== 'Abbreviations:') {
      unattributed.push(line);
    }
  }
  if (current !== null) blocks.push(current);

  const entries: TraceAttributionEntry[] = [];
  blocks.forEach((block, index) => {
    const text = block.lines.join('\n');
    const stepMatches = [...text.matchAll(/\b(output|input)\s*\{(\d+)\}/g)];
    const lastOutput = [...stepMatches].reverse().find((match) => match[1] === 'output');
    const lastInput = [...stepMatches].reverse().find((match) => match[1] === 'input');
    const selected = lastOutput ?? lastInput;
    const kind: TraceEntryKind = lastOutput !== undefined
      ? 'output'
      : lastInput !== undefined
        ? 'input'
        : /hypothesis/i.test(text)
          ? 'hypothesis'
          : /Using the function|By \d|may obtain|may know/.test(text)
            ? 'construction'
            : 'unknown';
    const terms = extractAttackerTerms(block.lines);
    const step = selected === undefined ? undefined : Number(selected[2]);
    entries.push({
      id: `trace-step-${String(block.number)}-${String(index)}`,
      kind,
      ...(step === undefined ? {} : { step }),
      title: step === undefined
        ? kind === 'hypothesis'
          ? `假设 ${String(block.number)}`
          : kind === 'construction'
            ? `攻击者推导 ${String(block.number)}`
            : `未归类步骤 ${String(block.number)}`
        : `消息步 {${String(step)}} · ${kind === 'output' ? '攻击者收到' : '攻击者发送'}`,
      terms,
      lines: block.lines,
    });
  });

  const outputSteps = new Set(entries.filter((entry) => entry.kind === 'output' && entry.step !== undefined).map((entry) => entry.step));
  const knownTerms = new Set(entries.flatMap((entry) => entry.terms));
  const summary = outputSteps.size === 0
    ? `未从 derivation 中识别到输出消息；保留 ${String(entries.length)} 个编号步骤与 ${String(unattributed.length)} 行未归因原文。`
    : `攻击者从 ${String(outputSteps.size)} 条输出了解到 ${String(knownTerms.size)} 个不同项；共 ${String(entries.length)} 个编号步骤，${String(unattributed.length)} 行未归因原文。`;
  return { entries, unattributed, summary };
}

function extractAttackerTerms(lines: readonly string[]): string[] {
  const terms: string[] = [];
  for (const line of lines) {
    const match = /^\s*attacker\((.*)\)\.\s*$/.exec(line);
    if (match === null) continue;
    const term = match[1]?.trim();
    if (term !== undefined && term.length > 0 && !terms.includes(term)) terms.push(term);
  }
  return terms;
}
