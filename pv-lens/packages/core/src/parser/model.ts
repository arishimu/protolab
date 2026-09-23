/**
 * pv-lens core 语义模型：`parsePv` 的产物类型。
 *
 * 定位（ADR-0001）：`.pv` 文本是唯一真源，本模型是它的派生视图数据。只保留规范叙事视图
 * 所需的展示信息（角色 / 消息步骤 / 词项 / 查询 / 诊断），不追求完整 ProVerif 类型语义。
 * 术语遵循 CONTEXT.md：角色、信道、消息步骤、词项、查询、降级诊断。
 */

/** 源码位置：offset 为 0 基字符偏移，line / column 为 1 基。 */
export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

/** 源码区间 `[start, end)`。 */
export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

/** 词项叶子：绑定变量（角色参数 / 角色体里的 `let` 绑定 / `in` 模式变量）。 */
export interface VariableTerm {
  kind: 'variable';
  name: string;
  /** 源码里写明的类型标注（如 `in(c,x:bitstring)` 的 `bitstring`）。 */
  typeName?: string;
  /** 词项原文（源码切片，含类型标注）。 */
  text: string;
}

/** 词项叶子：名字与常量（`free` / `const` 声明的名字、`new` 生成的新鲜名、角色引用、字面量）。 */
export interface NameTerm {
  kind: 'name';
  name: string;
  /** 词项原文（源码切片）。 */
  text: string;
}

/** 构造子应用：`senc(m,k)` → functor `senc`，args 为 [m, k]。 */
export interface ApplicationTerm {
  kind: 'application';
  /** 构造子名（ticket 04 按它查密码学惯用记法映射表）。 */
  functor: string;
  args: readonly PvTerm[];
  text: string;
}

/** 元组：`(a,b,c)`。 */
export interface TupleTerm {
  kind: 'tuple';
  items: readonly PvTerm[];
  text: string;
}

/**
 * 等值模式 `=M`：接收到的词项必须等于 `M`。
 * 结构化保留被比较的词项 `M` 与原文（如 `=Na`），供展示端渲染为「等于某值」的模式；
 * ProVerif 的等值约束语义本身不在此建模。
 */
export interface EqualityTerm {
  kind: 'equality';
  term: PvTerm;
  /** 模式原文（源码切片，如 `=Na`）。 */
  text: string;
}

/** 解析不了的词项：保留原文兜底，并配一条 degraded 诊断。 */
export interface UnknownTerm {
  kind: 'unknown';
  text: string;
}

/** 结构化词项（构造子 + 参数 + 变量 / 名字 / 等值模式）。 */
export type PvTerm =
  | VariableTerm
  | NameTerm
  | ApplicationTerm
  | TupleTerm
  | EqualityTerm
  | UnknownTerm;

/** 标注相对所挂消息步骤的源码位置：`before` 出现在该步骤之前，`after` 出现在之后（尾部标注）。 */
export type AnnotationPlacement = 'before' | 'after';

/** `new` 生成的新鲜名（如 `new k:key`）。 */
export interface FreshName {
  name: string;
  typeName?: string;
  /** 语句原文（如 `new k:key`）。 */
  text: string;
  span: SourceSpan;
}

/** 挂在消息步骤上的事件标注（`event acceptsServer(k,pkX);`）。 */
export interface EventAnnotation {
  /** 事件名，如 `acceptsServer`。 */
  name: string;
  /** 事件原文（不含 `event` 关键字），如 `acceptsServer(k,pkX)`。 */
  text: string;
  placement: AnnotationPlacement;
  span: SourceSpan;
}

/**
 * 挂在消息步骤上的守卫条件或表操作语句注释。
 *
 * - `if`：`if cond then P [else Q]` 的条件 `cond` 原文。
 * - `get`：`get 模式 in P [else Q]` 的模式原文；continuation `P` 已内联展开为该步骤之后的
 *   消息步，故这条注释说明「取到匹配项才继续」。
 * - `let-pattern`：含等值模式 `=M` 的 `let` 语句模式原文。
 * - `insert`：`insert ...` 表操作语句的原文。
 *
 * 进程体是线性展开的，`if` / `get` 的 then（in）与 else 两条分支不保留树结构：两分支的
 * 消息步都带同一条条件 / 模式原文，不伪造反向条件（不臆造源码里没有的 `!cond`）。
 * 渲染端据此提示「该步骤处于受守卫分支」，但不区分 then / else。
 *
 * 挂载规则与 `EventAnnotation` 相同：`before` = 该语句出现在这条消息步骤之前；
 * `after` = 进程体结束时仍未消费、补挂到最后一条消息步骤上。
 */
export interface GuardNote {
  kind: 'if' | 'let-pattern' | 'get' | 'insert';
  /** 语句原文（内部连续空白压成单空格）。 */
  text: string;
  placement: AnnotationPlacement;
  span: SourceSpan;
}

/** 消息步骤的标注集合。 */
export interface StepAnnotations {
  /** 该步骤之前声明的 `new` 新鲜名（尾部残留的会补到最后一条步骤上）。 */
  freshNames: readonly FreshName[];
  /** 挂在该步骤上的事件。
   *  规则：`event` 语句挂到其后最近的消息步骤（`before`）；角色体结束时仍未被消费的
   *  事件挂到最后一条消息步骤（`after`）。 */
  events: readonly EventAnnotation[];
  /** 生效于该步骤的守卫条件与表操作语句注释（`if` / `let-pattern` / `get` / `insert`），
   *  挂载规则与事件相同。线性展开下 `if` 的 then / else 分支共带同一条条件原文，见 GuardNote。 */
  guards: readonly GuardNote[];
  /** 该步骤是否处于复制 `!` 作用域内（角色体被 `!` 包裹，或该角色被 `!` 实例化）。 */
  replicated: boolean;
  /** 该步骤是否处于并行 `|` 组合内（角色体内 `|` 分支，或该角色与其他角色 `|` 并行）。 */
  parallel: boolean;
}

/** 消息步骤：角色的一次 `out(c, term)`（发出）或 `in(c, pattern)`（接收）。 */
export interface MessageStep {
  direction: 'out' | 'in';
  /** 信道词项（如 `c`）。 */
  channel: PvTerm;
  /** 消息词项：`out` 为发出的消息，`in` 为接收模式。 */
  term: PvTerm;
  annotations: StepAnnotations;
  /** 对应源码中该 `out` / `in` 语句的位置（供泳道图与源码联动）。 */
  span: SourceSpan;
}

/** 角色的展示用参数（命名进程的形式参数）。 */
export interface RoleParameter {
  name: string;
  typeName?: string;
}

/**
 * 一条角色泳道的数据。
 *
 * 主进程（`process` 关键字后的内联进程，无名字）不作协议角色，而是作为
 * `ParseResult.mainProcess` 的伪角色单独给出，理由见 parsePv 的契约注释。
 */
export interface PvRole {
  /** 角色名：命名进程的名字；主进程固定为 `main`。 */
  name: string;
  parameters: readonly RoleParameter[];
  /** 该角色体内按源码顺序展开的消息步骤。 */
  steps: readonly MessageStep[];
  /** 该角色是否可并发多会话：在启动处被 `!` 实例化，或其体内使用 `!`。 */
  replicated: boolean;
  /** 该角色是否与其他角色并行组合：在启动处处于 `|` 分支，或其体内使用 `|`。 */
  parallel: boolean;
  /** 角色定义（主进程为 `process` 到进程体结尾）在源码中的范围。 */
  span: SourceSpan;
}

/**
 * 构造子的类型签名（`fun name(argtypes): rettype`）。
 *
 * 声明区此前整体跳过不建模；意图配对（ADR-0003）需要返回类型做轻量类型推断，故收回模型。
 * `reduc` 声明仍是析构函数、不在此列。
 */
export interface FunctionSignature {
  name: string;
  /** 参数类型名；不写类型的位置为空串。 */
  argTypes: readonly string[];
  returnType: string;
}

/** `free` / `const` 声明的具名类型（`free a, b: t` → 两个条目）。typeName 缺失表示未标注。 */
export interface TypedName {
  name: string;
  typeName?: string;
}

/** 一条查询：用户书写的查询原文（可被结果面板映射回展示）。 */
export interface PvQuery {
  /** 查询表达式原文（去掉 `query` 关键字与变量声明前缀；内部连续空白压成单空格）。 */
  text: string;
  /** 变量声明前缀里的变量名（`query x:key,y:pkey; ...` → `['x','y']`），无前缀则为空数组。 */
  variables: readonly string[];
  /** 查询表达式在源码中的范围。 */
  span: SourceSpan;
}

/** 诊断级别：`degraded` 是可跳过的不支持语法（部分仍可解析），`error` 是语法错误。 */
export type DiagnosticSeverity = 'degraded' | 'error';

/** 一条诊断：中文消息 + 源码定位 + 原文片段。 */
export interface PvDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: SourceSpan;
  /** span 对应的源码原文片段（空白压成单行，超长截断）。 */
  sourceText: string;
}

/** `parsePv` 的返回值：`.pv` 文本的语义模型。 */
export interface ParseResult {
  /** 是否至少有一条 `error` 级诊断（语法错误）。 */
  hasErrors: boolean;
  /** 是否至少有一条 `degraded` 级诊断（不支持的语法，已跳过）。 */
  hasDegraded: boolean;
  /** 协议角色（`.pv` 里的命名进程），按源码顺序。 */
  roles: readonly PvRole[];
  /** 主进程伪角色；`.pv` 里没有 `process` 时为 null。 */
  mainProcess: PvRole | null;
  /** 查询列表，按源码顺序。 */
  queries: readonly PvQuery[];
  /** `fun` 构造子签名，按声明顺序。 */
  functions: readonly FunctionSignature[];
  /** `free` / `const` 具名类型，按声明顺序。 */
  names: readonly TypedName[];
  /** 诊断列表，按源码位置排序。 */
  diagnostics: readonly PvDiagnostic[];
}
