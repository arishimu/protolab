/** pv-lens core 语义模型：`.pv` 文本派生出的规范叙事 IR。 */

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

/** 条件比较运算。 */
export type ConditionOperator = '=' | '<>';

export interface ConditionComparison {
  kind: 'comparison';
  operator: ConditionOperator;
  left: PvTerm;
  right: PvTerm;
}

export interface ConditionCompound {
  kind: 'compound';
  operator: '&&' | '||';
  clauses: readonly Condition[];
}

export interface UnknownCondition {
  kind: 'unknown';
  text: string;
}

export type Condition = ConditionComparison | ConditionCompound | UnknownCondition;

/** 词项叶子：绑定变量。bindingId 只在新版值层投影中出现。 */
export interface VariableTerm {
  kind: 'variable';
  name: string;
  typeName?: string;
  text: string;
  bindingId?: string;
}

/** 词项叶子：名字与常量。 */
export interface NameTerm {
  kind: 'name';
  name: string;
  text: string;
}

/** 构造子应用。 */
export interface ApplicationTerm {
  kind: 'application';
  functor: string;
  args: readonly PvTerm[];
  text: string;
}

/** 元组。 */
export interface TupleTerm {
  kind: 'tuple';
  items: readonly PvTerm[];
  text: string;
}

/** `let x = if c then a else b` 的值选择。 */
export interface ConditionalTerm {
  kind: 'conditional';
  condition: Condition;
  thenTerm: PvTerm;
  elseTerm: PvTerm;
  text: string;
}

/** 等值模式 `=M`。 */
export interface EqualityTerm {
  kind: 'equality';
  term: PvTerm;
  text: string;
}

/** 解析不了的词项：保留原文兜底。 */
export interface UnknownTerm {
  kind: 'unknown';
  text: string;
}

export type PvTerm =
  | VariableTerm
  | NameTerm
  | ApplicationTerm
  | TupleTerm
  | ConditionalTerm
  | EqualityTerm
  | UnknownTerm;

export type AnnotationPlacement = 'before' | 'after';

export interface FreshName {
  name: string;
  typeName?: string;
  text: string;
  span: SourceSpan;
}

export interface EventAnnotation {
  name: string;
  text: string;
  placement: AnnotationPlacement;
  span: SourceSpan;
}

export interface GuardNote {
  kind: 'if' | 'let-pattern' | 'get' | 'insert';
  text: string;
  placement: AnnotationPlacement;
  span: SourceSpan;
}

export interface StepAnnotations {
  freshNames: readonly FreshName[];
  events: readonly EventAnnotation[];
  guards: readonly GuardNote[];
  replicated: boolean;
  parallel: boolean;
}

/** 兼容投影：角色的一次 `out` / `in`。 */
export interface MessageStep {
  direction: 'out' | 'in';
  channel: PvTerm;
  term: PvTerm;
  annotations: StepAnnotations;
  span: SourceSpan;
}

export interface RoleParameter {
  name: string;
  typeName?: string;
  /** 参数在角色定义中的源码区间，用于画布值方块与源码联动。 */
  span: SourceSpan;
}

export type BindingKind = 'parameter' | 'new' | 'in' | 'let' | 'get';

export interface Binding {
  id: string;
  roleName: string;
  name: string;
  kind: BindingKind;
  typeName?: string;
  span: SourceSpan;
  itemId?: string;
}

export interface MessageEndpoint {
  kind: 'message';
  id: string;
  roleName: string;
  roleIndex: number;
  itemIndex: number;
  stepIndex: number;
  direction: 'out' | 'in';
  channel: PvTerm;
  /** 信道上实际承载的词项；接收端则保留接收模式。 */
  wireTerm: PvTerm;
  term: PvTerm;
  /** 该消息端在接收模式中引入的绑定。发送端为空。 */
  bindingIds: readonly string[];
  span: SourceSpan;
  sourceStep: MessageStep;
}

export interface MessageItem {
  kind: 'message';
  id: string;
  endpoint: MessageEndpoint;
  span: SourceSpan;
  replicated: boolean;
  parallel: boolean;
}

export interface LocalItem {
  kind: 'local';
  id: string;
  operation: 'new' | 'let' | 'get' | 'insert' | 'degraded';
  span: SourceSpan;
  text: string;
  name?: string;
  bindingId?: string;
  bindingIds: readonly string[];
  term?: PvTerm;
  pattern?: PvTerm;
}

export interface EventItem {
  kind: 'event';
  id: string;
  name: string;
  /** event 的参数词项；参数中的变量引用保留 bindingId。 */
  args: readonly PvTerm[];
  /** 兼容旧调用方的首个参数投影。 */
  term?: PvTerm;
  text: string;
  span: SourceSpan;
}

export interface BranchItem {
  kind: 'branch';
  id: string;
  marker: 'branch' | 'else' | 'join';
  /** 链接同一分支的三个标记（branch / else / join）。 */
  linkId?: string;
  /** 守卫原文与来源：`if` 条件或 `get` 表模式。 */
  guardText?: string;
  guardKind?: 'if' | 'get';
  guard?: Condition;
  arm: 'then' | 'else' | 'main';
  span: SourceSpan;
  depth: number;
  empty?: boolean;
}

export type RoleItem = MessageItem | LocalItem | EventItem | BranchItem;

export interface PvRole {
  name: string;
  parameters: readonly RoleParameter[];
  /** 兼容 v1 的消息步骤投影。 */
  steps: readonly MessageStep[];
  /** v2 的连续 item 标记流。 */
  items: readonly RoleItem[];
  /** 角色本地绑定表。 */
  bindings: readonly Binding[];
  replicated: boolean;
  parallel: boolean;
  span: SourceSpan;
}

export interface FunctionSignature {
  name: string;
  argTypes: readonly string[];
  returnType: string;
}

export interface TypedName {
  name: string;
  typeName?: string;
  /** 是否带 `[private]` 属性（顶层自由秘密名）。 */
  private?: boolean;
  /** 名字与类型标注在源码中的区间。 */
  span?: SourceSpan;
}

export interface ChannelDeclaration {
  name: string;
  typeName?: string;
  span?: SourceSpan;
}

export interface DestructorDeclaration {
  name: string;
  span?: SourceSpan;
}

/** 带源码区间的词项引用：分类与分组只保存引用，不复制词项文本。 */
export interface TermReference {
  term: PvTerm;
  span: SourceSpan;
}

/** `reduc` 方程的形式参数（`forall m: bitstring, k: key`）。 */
export interface ReducParameter {
  name: string;
  typeName?: string;
  span: SourceSpan;
}

/**
 * 结构化 `reduc` 方程：`forall ...; left = right [attrs]`。
 *
 * `destructor` 是左侧最外层构造子；方程无法结构化时不会进入本列表，
 * 而是以 `degraded` 诊断保留原文。
 */
export interface ReducEquation {
  destructor: string;
  parameters: readonly ReducParameter[];
  left: TermReference;
  right: TermReference;
  /** 方程后缀属性（如 `[convergent]`）的原文记号。 */
  attributes: readonly string[];
  span: SourceSpan;
}

/** 事件声明 `event name(t1, t2).`：形参类型供对应性查询生成变量声明。 */
export interface EventDeclaration {
  name: string;
  argTypes: readonly string[];
  span: SourceSpan;
}

export interface PvQuery {
  text: string;
  variables: readonly string[];
  span: SourceSpan;
}

export type DiagnosticSeverity = 'degraded' | 'error';

export interface PvDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: SourceSpan;
  sourceText: string;
}

export interface ParseResult {
  hasErrors: boolean;
  hasDegraded: boolean;
  roles: readonly PvRole[];
  mainProcess: PvRole | null;
  queries: readonly PvQuery[];
  events: readonly EventDeclaration[];
  functions: readonly FunctionSignature[];
  names: readonly TypedName[];
  channels: readonly ChannelDeclaration[];
  destructors: readonly DestructorDeclaration[];
  /** `reduc` 声明的结构化方程；未知或损坏的方程只留诊断，不在此列。 */
  equations: readonly ReducEquation[];
  bindings: readonly Binding[];
  diagnostics: readonly PvDiagnostic[];
}
