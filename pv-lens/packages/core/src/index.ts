/**
 * @pv-lens/core 公共入口。
 *
 * 纯 TypeScript：本目录（src）不 import 任何 Node / 浏览器 / 网络 API，
 * 从而同一份代码既能被浏览器端（web，React 自绘 SVG）加载，
 * 也能被 Node 端（server，spawn ProVerif）加载。
 *
 * fixture 资产（.pv 原文与 ProVerif stdout 录制）作为提交文件存放在
 * `packages/core/fixtures/`，本模块仅以「相对路径 + 期望判定」的纯数据清单
 * 暴露它们的契约；测试在各自 test/ 目录经 fs 读取真实文件核对（ticket 01）。
 */

/** ProVerif 对一条查询给出的判定值。 */
export type Verdict = 'true' | 'false' | 'cannot-be-proved';

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
