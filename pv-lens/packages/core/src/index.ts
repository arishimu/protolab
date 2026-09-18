/**
 * @pv-lens/core 公共入口。
 *
 * 纯 TypeScript：本目录（src）不 import 任何 Node / 浏览器 / 网络 API，
 * 从而同一份代码既能被浏览器端（web，React 自绘 SVG）加载，
 * 也能被 Node 端（server，spawn ProVerif）加载。
 *
 * 内置样例的 .pv 原文以数据形式嵌入（src/sample-texts.generated.ts，由
 * scripts/sync-sample-texts.mjs 生成），故浏览器无需 fs 即可读取当前协议文本。
 */

import { sampleTexts } from './sample-texts.generated.js';
import type { Verdict } from './verdict.js';

/** ProVerif 对一条查询给出的判定值。类型定义在叶子模块 src/verdict.ts。 */
export type { Verdict } from './verdict.js';

/** 一条（归一化）查询的期望判定：query 为 ProVerif stdout 中呈现的原文形态。 */
export interface ExpectedVerdict {
  /** stdout 中呈现的查询原文（含归一化的 `not ` 前缀等）。 */
  query: string;
  verdict: Verdict;
}

/** 展示语义：该内置样例在全绿 / 保密性破坏 / 认证破坏三种形态中属于哪种。 */
export type SampleKind = 'all-green' | 'secrecy-broken' | 'auth-broken';

/** 内置基准样例的元信息与 fixture 契约。 */
export interface CoreSampleDef {
  /** 稳定英文 id，跨版本不变。 */
  id: string;
  /** 中文短名（UI 内置列表用）。 */
  title: string;
  /** 中文简述（UI 首页样例列表的说明文字，ticket 02 用）。 */
  description: string;
  kind: SampleKind;
  /** fixture 相对路径（相对本包 fixtures/），.pv 原文。 */
  pvFile: string;
  /** fixture 相对路径（相对本包 fixtures/），ProVerif 2.05 stdout 全量录制。 */
  stdoutFile: string;
  /** 录制 stdout 里应出现的 RESULT 判定（来自本机 ProVerif 2.05 实测）。 */
  expectedVerdicts: readonly ExpectedVerdict[];
}

/**
 * 四个基准样例。stdout 与本表由本机 ProVerif 2.05 实跑录制并核对
 * （见 fixtures/proverif/*.stdout.txt），是 Seam A / Seam B 黄金 fixture 的验收口径。
 */
export const coreSamples: readonly CoreSampleDef[] = [
  {
    id: 'hello',
    title: 'hello（保密性最小冒烟）',
    description: '最小冒烟样例：hello 世界，仅验证公开信道上发送的 RSA 明文是否泄露。',
    kind: 'secrecy-broken',
    pvFile: 'pv/hello.pv',
    stdoutFile: 'proverif/hello.stdout.txt',
    expectedVerdicts: [
      { query: 'not attacker(RSA[])', verdict: 'false' },
      { query: 'not attacker(Cocks[])', verdict: 'true' },
    ],
  },
  {
    id: 'handshake-fixed',
    title: '握手修正版（全绿）',
    description: '中规模握手协议修正版：对称/非对称加密与签名并用，附事件，三条查询全部成立。',
    kind: 'all-green',
    pvFile: 'pv/handshake-fixed.pv',
    stdoutFile: 'proverif/handshake-fixed.stdout.txt',
    expectedVerdicts: [
      { query: 'not attacker(s[])', verdict: 'true' },
      {
        query: 'event(termClient(x_2,y_1)) ==> event(acceptsServer(x_2,y_1))',
        verdict: 'true',
      },
      {
        query: 'inj-event(termServer(x_2)) ==> inj-event(acceptsClient(x_2))',
        verdict: 'true',
      },
    ],
  },
  {
    id: 'ns-mutual-auth',
    title: 'NS 修正版（互认证成立）',
    description: 'Needham-Schroeder 修正版（Lowe）：四角色，两条互认证查询全部成立。',
    kind: 'all-green',
    pvFile: 'pv/ns-mutual-auth.pv',
    stdoutFile: 'proverif/ns-mutual-auth.stdout.txt',
    expectedVerdicts: [
      {
        query: 'inj-event(termI(x,B[],m_2)) ==> inj-event(acceptsR(x,B[],m_2))',
        verdict: 'true',
      },
      {
        query: 'inj-event(termR(A[],x,m_2)) ==> inj-event(acceptsI(A[],x,m_2))',
        verdict: 'true',
      },
    ],
  },
  {
    id: 'ns-original',
    title: 'NS 原版（含 Lowe 攻击）',
    description: 'Needham-Schroeder 原版：B 侧互认证被 Lowe 攻击证伪，演示反例与 trace。',
    kind: 'auth-broken',
    pvFile: 'pv/ns-original.pv',
    stdoutFile: 'proverif/ns-original.stdout.txt',
    expectedVerdicts: [
      {
        query: 'inj-event(endBparam(x)) ==> inj-event(beginBparam(x))',
        verdict: 'false',
      },
      {
        query: 'inj-event(endAparam(x)) ==> inj-event(beginAparam(x))',
        verdict: 'true',
      },
      { query: 'not attacker(secretANa[])', verdict: 'true' },
      { query: 'not attacker(secretANb[])', verdict: 'true' },
      { query: 'not attacker(secretBNa[])', verdict: 'false' },
      { query: 'not attacker(secretBNb[])', verdict: 'false' },
    ],
  },
];

/** 以 id 查内置样例。 */
export function getCoreSample(id: string): CoreSampleDef | undefined {
  return coreSamples.find((s) => s.id === id);
}

/**
 * 读取内置样例的 .pv 原文（浏览器与 Node 均可，无 fs 依赖）。
 * 数据来自 src/sample-texts.generated.ts（fixtures 的嵌入副本，见 drift 守卫测试）。
 */
export function getSampleSource(id: string): string | undefined {
  return sampleTexts[id];
}

/** 内置样例全集（含每个样例的 .pv 原文），供 UI 装载当前协议时一次取到元信息 + 文本。 */
export interface LoadableSample {
  def: CoreSampleDef;
  /** 该样例的 .pv 原文。 */
  source: string;
}

/** 列出全部内置样例及其 .pv 原文。 */
export function listLoadableSamples(): readonly LoadableSample[] {
  return coreSamples.map((def) => ({ def, source: sampleTexts[def.id] }));
}

/**
 * Seam A（ticket 03）：`.pv` 文本 → 语义模型。
 *
 * 纯转换：字符串进、结构化数据出；不读文件、不抛异常，解析失败一律以诊断返回。
 * 类型定义见 src/parser/model.ts，契约说明见 src/parser/parse.ts 文件头。
 */
export { parsePv, MAIN_PROCESS_NAME } from './parser/parse.js';
export type {
  AnnotationPlacement,
  ApplicationTerm,
  DiagnosticSeverity,
  EqualityTerm,
  EventAnnotation,
  FreshName,
  GuardNote,
  MessageStep,
  NameTerm,
  ParseResult,
  PvDiagnostic,
  PvQuery,
  PvRole,
  PvTerm,
  RoleParameter,
  SourcePosition,
  SourceSpan,
  StepAnnotations,
  TupleTerm,
  UnknownTerm,
  VariableTerm,
} from './parser/model.js';

/**
 * core 公开能力：词项符号化渲染（spec.md「core 公开能力」第 2 条）。
 *
 * 纯函数 `renderTerm`：构造子 → 密码学惯用记法（未知构造子回退函数调用写法）；
 * `NOTATION_LEGEND` 供 UI 图例复用同一份映射表。浏览器与 Node 双端可用。
 */
export { renderTerm, NOTATION_LEGEND } from './symbolic-term.js';
export type { NotationLegendEntry } from './symbolic-term.js';

/**
 * Seam B（ticket 07）：ProVerif stdout → 按查询切分的结构化验证结果。
 *
 * 纯转换：记录 stdout 文本进、结构化结果出；判定只以 RESULT 行为准。
 */
export { parseVerifyStdout } from './verify-result.js';
export type { VerificationResult } from './verify-result.js';

/**
 * 保守配对引擎（ticket 06）：跨泳道 out → in 配对判定，只在双向唯一可确定时连线。
 * `pairSteps` 的下标对齐 `narrativeRoleOrder` 的泳道顺序，可直接喂给 web 的布局。
 */
export { pairSteps, narrativeRoleOrder } from './pairing.js';
export type { StepPairing, StepPairingAnchor } from './pairing.js';
