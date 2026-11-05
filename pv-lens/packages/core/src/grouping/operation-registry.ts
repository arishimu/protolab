/**
 * 密码操作注册表：把 `fun` / `reduc` 声明与惯用名称翻译成可判定的操作种类。
 *
 * 识别顺序（决策票 01 第 4 节）：方程形状匹配优先于名称启发；两者都命中时取方程。
 * 注册表只描述「构造子/析构子是什么操作」，方向在声明层面已由方程位置或名称确定；
 * 未被任何规则命中的函数不出现在注册表里，调用方按「未识别」处理且不建组。
 */

import type { ApplicationTerm, FunctionSignature, ParseResult, PvTerm, ReducEquation, SourceSpan } from '../parser/model.js';

export type OperationKind =
  | 'signature'
  | 'symmetric-encryption'
  | 'symmetric-decryption'
  | 'asymmetric-encryption'
  | 'asymmetric-decryption'
  | 'hash'
  | 'key-derivation'
  | 'unknown';

export type OperationDirection = 'construct' | 'destruct';

/** 自动分类来源；`user` 只出现在分组结果里，不进入注册表。 */
export type GroupingOrigin = 'equation' | 'name' | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export interface OperationDescriptor {
  functor: string;
  kind: OperationKind;
  direction: OperationDirection;
  origin: GroupingOrigin;
  confidence: Confidence;
  /** 命中方程的源码区间，供审计面板回溯。 */
  equationSpan?: SourceSpan;
}

export interface OperationRegistry {
  /** 未识别的函数返回 undefined（不建组）。 */
  lookup(functor: string): OperationDescriptor | undefined;
  readonly descriptors: ReadonlyMap<string, OperationDescriptor>;
}

interface ClassifiedFunctor {
  functor: string;
  kind: OperationKind;
  direction: OperationDirection;
}

interface Candidate {
  descriptor: OperationDescriptor;
  priority: number;
}

const EQUATION_PRIORITY = 0;
const NAME_PRIORITY = 1;

/**
 * 名称启发别名（小写比较）。与 `symbolic-term.ts` 的惯用记法保持一致：
 * `encrypt` 走公钥括号，`senc*` / `enc` 走对称括号。
 */
const ALIASES: Readonly<Record<string, Omit<ClassifiedFunctor, 'functor'>>> = {
  senc: { kind: 'symmetric-encryption', direction: 'construct' },
  sencrypt: { kind: 'symmetric-encryption', direction: 'construct' },
  enc: { kind: 'symmetric-encryption', direction: 'construct' },
  sdec: { kind: 'symmetric-decryption', direction: 'destruct' },
  sdecrypt: { kind: 'symmetric-decryption', direction: 'destruct' },
  dec: { kind: 'symmetric-decryption', direction: 'destruct' },
  aenc: { kind: 'asymmetric-encryption', direction: 'construct' },
  aencrypt: { kind: 'asymmetric-encryption', direction: 'construct' },
  encrypt: { kind: 'asymmetric-encryption', direction: 'construct' },
  adec: { kind: 'asymmetric-decryption', direction: 'destruct' },
  adecrypt: { kind: 'asymmetric-decryption', direction: 'destruct' },
  decrypt: { kind: 'asymmetric-decryption', direction: 'destruct' },
  sign: { kind: 'signature', direction: 'construct' },
  sig: { kind: 'signature', direction: 'construct' },
  checksign: { kind: 'signature', direction: 'destruct' },
  verifysign: { kind: 'signature', direction: 'destruct' },
  verify: { kind: 'signature', direction: 'destruct' },
  getmess: { kind: 'signature', direction: 'destruct' },
  hash: { kind: 'hash', direction: 'construct' },
  h: { kind: 'hash', direction: 'construct' },
  sha: { kind: 'hash', direction: 'construct' },
  sha256: { kind: 'hash', direction: 'construct' },
  digest: { kind: 'hash', direction: 'construct' },
  pk: { kind: 'key-derivation', direction: 'construct' },
  spk: { kind: 'key-derivation', direction: 'construct' },
  pubkey: { kind: 'key-derivation', direction: 'construct' },
  public_key: { kind: 'key-derivation', direction: 'construct' },
  derivekey: { kind: 'key-derivation', direction: 'construct' },
  derive_key: { kind: 'key-derivation', direction: 'construct' },
  kdf: { kind: 'key-derivation', direction: 'construct' },
};

/** 返回类型命中哈希类型别名时，也把单参数函数视为哈希（名称启发，中置信度）。 */
const HASH_TYPE_ALIASES: readonly string[] = ['hash', 'hashvalue', 'digest'];

/**
 * 从解析结果构造注册表。`functions` 决定名称启发的候选集合；`equations` 决定高置信度分类。
 * 同一构造子被多条方程命中时保留最先出现的分类（解析结果本身是源码顺序）。
 */
export function buildOperationRegistry(
  result: Pick<ParseResult, 'equations' | 'functions' | 'destructors'>,
): OperationRegistry {
  const candidates = new Map<string, Candidate>();

  const add = (
    functor: string,
    kind: OperationKind,
    direction: OperationDirection,
    origin: GroupingOrigin,
    confidence: Confidence,
    priority: number,
    equationSpan?: SourceSpan,
  ): void => {
    const existing = candidates.get(functor);
    if (existing !== undefined && existing.priority <= priority) return;
    candidates.set(functor, {
      descriptor: {
        functor,
        kind,
        direction,
        origin,
        confidence,
        ...(equationSpan === undefined ? {} : { equationSpan }),
      },
      priority,
    });
  };

  for (const equation of result.equations) {
    for (const classified of classifyEquation(equation)) {
      add(classified.functor, classified.kind, classified.direction, 'equation', 'high', EQUATION_PRIORITY, equation.span);
    }
  }

  const destructorNames = new Set(result.destructors.map((destructor) => destructor.name));
  for (const signature of result.functions) {
    const byName = aliasOf(signature);
    if (byName !== undefined) {
      // 哈希与密钥派生按定义必须是单参数函数；名称相同但形状不符时不猜。
      if ((byName.kind === 'hash' || byName.kind === 'key-derivation') && signature.argTypes.length !== 1) continue;
      if (byName.kind === 'hash' && destructorNames.has(signature.name)) continue;
      add(signature.name, byName.kind, byName.direction, 'name', 'medium', NAME_PRIORITY);
      continue;
    }
    if (destructorNames.has(signature.name)) continue;
    if (signature.argTypes.length === 1 && hashLike(signature)) {
      add(signature.name, 'hash', 'construct', 'name', 'medium', NAME_PRIORITY);
    }
  }

  // 只在 `reduc` 左侧出现的析构子也要参与名称启发（方程解析失败时仍能保留候选）。
  for (const name of destructorNames) {
    if (candidates.has(name)) continue;
    const byName = ALIASES[name.toLowerCase()];
    if (byName === undefined) continue;
    // 析构子只有解密/验签类别名有意义；构造类别名出现在 `reduc` 左侧时按解构处理。
    add(name, byName.kind, 'destruct', 'name', 'medium', NAME_PRIORITY);
  }

  const descriptors = new Map<string, OperationDescriptor>();
  for (const [functor, candidate] of candidates) descriptors.set(functor, candidate.descriptor);
  return {
    descriptors,
    lookup: (functor) => descriptors.get(functor),
  };
}

function aliasOf(signature: FunctionSignature): Omit<ClassifiedFunctor, 'functor'> | undefined {
  return ALIASES[signature.name.toLowerCase()];
}

function hashLike(signature: FunctionSignature): boolean {
  const name = signature.name.toLowerCase();
  if (ALIASES[name]?.kind === 'hash') return true;
  return HASH_TYPE_ALIASES.includes(signature.returnType.toLowerCase());
}

/** 按方程形状识别操作；不匹配时返回空数组。 */
export function classifyEquation(equation: ReducEquation): readonly ClassifiedFunctor[] {
  const left = equation.left.term;
  if (left.kind !== 'application') return [];
  const destructor = left;
  const right = equation.right.term;

  // 解密形状：d(c(m,k),k) = m 或 d(c(m,pk(sk)),sk) = m。
  if (destructor.args.length >= 2) {
    const cipher = destructor.args[0];
    const outerKey = destructor.args[1];
    if (cipher.kind === 'application' && cipher.args.length >= 2) {
      const payload = cipher.args[0];
      const innerKey = cipher.args[1];
      if (sameTerm(payload, right)) {
        if (sameTerm(innerKey, outerKey)) {
          return [
            { functor: cipher.functor, kind: 'symmetric-encryption', direction: 'construct' },
            { functor: destructor.functor, kind: 'symmetric-decryption', direction: 'destruct' },
          ];
        }
        if (isDerivedKeyOf(innerKey, outerKey)) {
          return [
            { functor: cipher.functor, kind: 'asymmetric-encryption', direction: 'construct' },
            { functor: destructor.functor, kind: 'asymmetric-decryption', direction: 'destruct' },
          ];
        }
      }
    }
  }

  // 签名形状：checksign(sign(m,sk),pk(sk)) = m 或 getmess(sign(m,sk)) = m。
  if (destructor.args.length >= 1) {
    const signed = destructor.args[0];
    if (signed.kind === 'application' && signed.args.length >= 2 && sameTerm(signed.args[0], right)) {
      const signingKey = signed.args[1];
      const outerKey = destructor.args[1];
      const keyMatches = outerKey === undefined || sameTerm(keyBasis(outerKey), signingKey);
      if (keyMatches && destructor.functor !== signed.functor) {
        return [
          { functor: signed.functor, kind: 'signature', direction: 'construct' },
          { functor: destructor.functor, kind: 'signature', direction: 'destruct' },
        ];
      }
    }
  }

  return [];
}

/** `pk(sk)` 这类公钥派生：内层密钥是外层私钥的单参数函数结果。 */
function isDerivedKeyOf(innerKey: PvTerm, outerKey: PvTerm): boolean {
  if (innerKey.kind !== 'application' || innerKey.args.length !== 1) return false;
  return sameTerm(innerKey.args[0], outerKey);
}

/** 取密钥表达式的基底：`pk(sk)` → `sk`，其余原样返回。 */
function keyBasis(term: PvTerm): PvTerm {
  if (term.kind === 'application' && term.args.length === 1) return keyBasis(term.args[0]);
  return term;
}

/** 结构化比较两个词项（忽略原文、类型与绑定 id），用于方程形状匹配。 */
function sameTerm(a: PvTerm, b: PvTerm): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'variable':
    case 'name':
      return a.name === (b as typeof a).name;
    case 'application':
      return sameApplication(a, b as ApplicationTerm);
    case 'tuple': {
      const other = b as Extract<PvTerm, { kind: 'tuple' }>;
      return a.items.length === other.items.length && a.items.every((item, index) => sameTerm(item, other.items[index]));
    }
    case 'conditional':
      return a.text === (b as typeof a).text;
    case 'equality':
      return sameTerm(a.term, (b as typeof a).term);
    case 'unknown':
      return a.text === b.text;
  }
}

function sameApplication(a: ApplicationTerm, b: ApplicationTerm): boolean {
  return a.functor === b.functor && a.args.length === b.args.length && a.args.every((arg, index) => sameTerm(arg, b.args[index]));
}
