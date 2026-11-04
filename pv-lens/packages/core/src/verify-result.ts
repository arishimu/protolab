/**
 * Seam B：ProVerif stdout → 按查询的结构化验证结果。
 *
 * 纯 TypeScript，不依赖任何 Node / 浏览器 API：输入是 proverif 的 stdout 文本，
 * 输出是每条查询的结构化验证结论（见 CONTEXT.md「验证结论」）。
 *
 * 解析依据本机 ProVerif 2.05 实测（见 fixtures/proverif/*.stdout.txt）：
 *
 * - 输出按查询分节：节首为 `Starting query <归一化查询>`，节尾为
 *   `RESULT <归一化查询> is true|false.` 或 `RESULT <归一化查询> cannot be proved.`。
 * - 一条 `query a; b;` 语句会展开成多个 `Starting query` 节，且不保证有
 *   `-- Query ... in process` 头，故只以 `Starting query` 行切节。
 * - 证伪时 `Starting query` 与 `RESULT` 之间是反例 trace（`Derivation:` 起）。
 *   注意 `cannot be proved` 也会打印 derivation（"重复动作近似"下的假推导，
 *   ProVerif 会在其前另起一行 `Could not find a trace corresponding to this derivation.`），
 *   那不是攻击 trace，故只对 `is false` 的节产出 counterexampleTrace。
 *   （见 docs/proverif/note/05-output.md 的「假攻击案例」。）
 * - 形如 `RESULT (even event(...) ...)` 的括号内衍生行是对偶查询的补充说明，
 *   query 以 `(` 开头，不是独立查询的判定，必须排除。
 * - 判定只信 `RESULT` 行：proverif 退出码为 0 不代表性质成立。
 */

import type { Verdict } from './verdict.js';

/** 单条查询的验证结论。 */
export interface VerificationResult {
  /** stdout 中呈现的归一化查询原文（如 `attacker(x)` 会显示为 `not attacker(x)`）。 */
  query: string;
  verdict: Verdict;
  /** 该节的 `goal reachable: ...` 行原文；该节没有这一行时为 null。 */
  goalReachable: string | null;
  /**
   * 该节的反例 / 攻击 trace 原文（`Derivation:` 行起、到本节 RESULT 行前止，逐字保留）。
   *
   * 仅当判定为 `false`（被证伪）时非 null；`true` / `cannot-be-proved` 一律为 null——
   * `cannot be proved` 的 derivation 是近似导致的假推导，不是真实攻击路径
   * （CONTEXT.md「反例 / 攻击 trace」定义）。
   */
  counterexampleTrace: string | null;
}

const STARTING_QUERY_PREFIX = 'Starting query ';
const GOAL_REACHABLE_PREFIX = 'goal reachable: ';
const DERIVATION_LINE = 'Derivation:';

/**
 * 判定行。兼容实测的两种形态：`RESULT <query> is true|false.` 与
 * `RESULT <query> cannot be proved.`（后者实测无 `is`，ticket 字面形态也一并兼容）。
 * query 以 `(` 开头的是括号内衍生行，排除。
 */
const RESULT_RE = /^RESULT ([^(].*?) (?:is )?(true|false|cannot be proved)\.\s*$/;

const VERDICT_BY_TEXT: Record<string, Verdict> = {
  true: 'true',
  false: 'false',
  'cannot be proved': 'cannot-be-proved',
};

/** 适配器 mkdtemp 临时目录前缀（F3 脱敏口径；部署边界为 Linux/WSL 的 /tmp）。 */
const VERIFY_TEMP_DIR_RE = /\/tmp\/pv-lens-verify-[A-Za-z0-9_-]+\//g;

/** F4：ProVerif stdout 里的源码定位（行/列保持 ProVerif 原文口径）。 */
export interface ProverifLocation {
  line: number;
  column: number;
  text: string;
}

/**
 * F4：解析 stdout 中的 `line N, character(s) M` 定位，生成与工具诊断并列的结构化位置。
 * 同一行多处定位按出现顺序保留；无定位返回空数组。
 */
export function parseProverifLocations(stdout: string): ProverifLocation[] {
  const locations: ProverifLocation[] = [];
  const pattern = /line (\d+), characters? (\d+)(?:-(\d+))?/g;
  for (const match of stdout.matchAll(pattern)) {
    const line = Number(match[1]);
    const column = Number(match[2]);
    if (Number.isFinite(line) && Number.isFinite(column) && line > 0) {
      locations.push({ line, column, text: match[0] });
    }
  }
  return locations;
}

/**
 * F3：stdout 展示前的临时目录脱敏——把验证服务为运行生成的临时绝对目录替换为空，
 * 文件名（`model.pv`）保留，用户看到的定位形如 `File "model.pv", line 7`。
 * 原始输出仍可通过「未处理输出」入口独立核对。
 */
export function sanitizeStdout(stdout: string): string {
  return stdout.replace(VERIFY_TEMP_DIR_RE, '');
}

/**
 * 把 ProVerif stdout 解析成按查询的验证结论。
 *
 * 只依据 `RESULT` 行产出结果：缺 RESULT 行的残段（proverif 中途失败/被杀）不产出结果，
 * 调用方据适配器那边的失败分类判断原因。
 */
export function parseVerifyStdout(stdout: string): VerificationResult[] {
  const results: VerificationResult[] = [];
  let goalReachable: string | null = null;
  let traceLines: string[] = [];
  let inDerivation = false;

  for (const line of stdout.replace(/\r\n/g, '\n').split('\n')) {
    const resultMatch = RESULT_RE.exec(line);
    if (resultMatch) {
      const verdictText = resultMatch[2] ?? '';
      const verdict = VERDICT_BY_TEXT[verdictText] ?? 'cannot-be-proved';
      const trace = traceLines.join('\n').trimEnd();
      results.push({
        query: resultMatch[1] ?? '',
        verdict,
        goalReachable,
        counterexampleTrace: verdict === 'false' && trace.length > 0 ? trace : null,
      });
      // RESULT 行收尾本节；后续行（衍生 RESULT 行、Verification summary 等）不属本节。
      goalReachable = null;
      traceLines = [];
      inDerivation = false;
      continue;
    }

    if (line.startsWith(STARTING_QUERY_PREFIX)) {
      goalReachable = null;
      traceLines = [];
      inDerivation = false;
      continue;
    }

    if (line.startsWith(GOAL_REACHABLE_PREFIX)) {
      goalReachable = line.trimEnd();
      continue;
    }

    if (!inDerivation && line.trimEnd() === DERIVATION_LINE) {
      inDerivation = true;
      traceLines.push(DERIVATION_LINE);
      continue;
    }

    if (inDerivation) {
      traceLines.push(line.trimEnd());
    }
  }

  return results;
}
