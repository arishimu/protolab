/**
 * 概念注解库（ADR-0018 / 阶段 4）。
 *
 * 为图例、分组标签、查询性质与判定状态提供同一口径的定义、协议问题、
 * ProVerif 读法与文档锚点。纯数据 + 纯查询函数，不依赖 DOM。
 *
 * 纪律：注解解释“这个记号/标签是什么意思”，不把分组或查询成立写成安全结论。
 */

import type { Verdict } from '../verdict.js';
import type { GroupingOrigin, OperationKind } from '../grouping/operation-registry.js';

export type ConceptCategory = 'operation' | 'origin' | 'fold' | 'query' | 'verdict' | 'notation';

export type ConceptQueryKind = 'secrecy' | 'correspondence' | 'reachability' | 'other';

export interface ConceptAnchor {
  label: string;
  /** 文档相对路径或界面位置；仅作可读锚点，不保证可点击。 */
  href?: string;
  kind: 'doc' | 'canvas' | 'query' | 'event';
}

export interface Concept {
  id: string;
  category: ConceptCategory;
  label: string;
  definition: string;
  /** 读者在协议层面要回答的问题。 */
  protocolQuestion: string;
  /** 这条概念对应 ProVerif 文本里的什么。 */
  proverifReading: string;
  anchors: readonly ConceptAnchor[];
}

export type ConceptId =
  | `operation:${OperationKind}`
  | `origin:${GroupingOrigin | 'user'}`
  | 'fold:expanded'
  | 'fold:collapsed'
  | 'fold:semantic'
  | 'fold:density'
  | `query:${ConceptQueryKind}`
  | `verdict:${Verdict}`
  | `notation:${string}`;

const DOC_GROUPING: ConceptAnchor = { label: 'ADR-0018 语义分组', href: 'docs/adr/0018-semantic-grouping.md', kind: 'doc' };
const DOC_CONTEXT: ConceptAnchor = { label: 'CONTEXT.md 术语表', href: 'CONTEXT.md', kind: 'doc' };
const DOC_SECRECY: ConceptAnchor = { label: 'ProVerif 学习笔记：保密性', href: 'docs/proverif/note/02-secrecy.md', kind: 'doc' };
const DOC_AUTH: ConceptAnchor = { label: 'ProVerif 学习笔记：认证', href: 'docs/proverif/note/03-authentication.md', kind: 'doc' };
const DOC_OUTPUT: ConceptAnchor = { label: 'ProVerif 学习笔记：输出解读', href: 'docs/proverif/note/05-output.md', kind: 'doc' };
const ANCHOR_CANVAS: ConceptAnchor = { label: '画布组头 / 图例', kind: 'canvas' };

function operation(
  kind: OperationKind,
  label: string,
  definition: string,
  protocolQuestion: string,
  proverifReading: string,
): Concept {
  return {
    id: `operation:${kind}`,
    category: 'operation',
    label,
    definition,
    protocolQuestion,
    proverifReading,
    anchors: [DOC_CONTEXT, DOC_GROUPING, ANCHOR_CANVAS],
  };
}

function notation(key: string, label: string, definition: string, proverifReading: string): Concept {
  return {
    id: `notation:${key}`,
    category: 'notation',
    label,
    definition,
    protocolQuestion: '这张图里的这个记号表示什么？',
    proverifReading,
    anchors: [DOC_CONTEXT, DOC_GROUPING, { label: '画布图例', kind: 'canvas' }],
  };
}

const OPERATION_CONCEPTS: readonly Concept[] = [
  operation('signature', '签名', '构造签名或验证签名的一次操作；签名方向由构造/解构标注。', '谁对什么消息签名，谁用哪个公钥验证？', '通常对应 fun sign / reduc checksign 或 getmess；签名不自动等于认证成立。'),
  operation('symmetric-encryption', '对称加密', '用同一把密钥把消息加密成密文。', '这段密文由谁加密、密钥由谁知道？', '通常对应 fun senc / enc 的构造子，或方程 d(c(m,k),k)=m 的 c。'),
  operation('symmetric-decryption', '对称解密', '用同一把密钥把密文还原成明文。', '谁能解开这段密文，解密是否只在持有密钥的角色内发生？', '通常对应 reduc 左侧的 sdec / dec 析构子。'),
  operation('asymmetric-encryption', '非对称加密', '用接收方公钥加密消息。', '这段密文发给谁，攻击者能否替换公钥？', '通常对应 fun aenc / encrypt，或方程 d(c(m,pk(sk)),sk)=m 的 c。'),
  operation('asymmetric-decryption', '非对称解密', '用私钥解开公钥加密的密文。', '哪个角色持有私钥，解密结果是否被后续检查？', '通常对应 reduc 左侧 adec / decrypt 析构子，密钥是私钥。'),
  operation('hash', '哈希', '把输入映射成定长摘要的单向函数。', '摘要用于校验完整性还是派生标识？', '通常对应无析构子的单参数 fun；别名 hash / h 属于名称启发。'),
  operation('key-derivation', '密钥派生', '从私钥或种子派生公钥/会话密钥等。', '派生出的密钥被谁使用，是否被当作可信身份？', '常见形状 pk(sk) / spk(sk)；名称启发为中置信，方程匹配优先。'),
  operation('unknown', '未识别', '未命中方程或别名，不自动折叠，保留原始函数名。', '这个函数在协议里承担什么作用？需要人工确认。', '注册表没有匹配；不把它写成加密、签名或任何安全结论。'),
];

const ORIGIN_CONCEPTS: readonly Concept[] = [
  { id: 'origin:equation', category: 'origin', label: '方程匹配', definition: '操作种类由 reduc 方程形状识别。', protocolQuestion: '这条分类有没有源码方程作依据？', proverifReading: '例如 d(c(m,k),k)=m 同时识别 c 与 d；方程优先于名称。', anchors: [DOC_GROUPING, ANCHOR_CANVAS] },
  { id: 'origin:name', category: 'origin', label: '名称启发', definition: '没有方程时，按函数名、返回类型与单参数形状推断。', protocolQuestion: '这个名字是否可能被误认为某种密码操作？', proverifReading: '只在中置信使用；不改变 .pv，也不替代方程。', anchors: [DOC_GROUPING, ANCHOR_CANVAS] },
  { id: 'origin:user', category: 'origin', label: '用户声明', definition: '用户在本次会话中覆盖了自动分类，仅存会话内存。', protocolQuestion: '这个覆盖是否反映了协议的真实意图？', proverifReading: '不修改 .pv、查询或验证输入；重置后回到自动分类。', anchors: [DOC_GROUPING, { label: '审计面板', kind: 'canvas' }] },
  { id: 'origin:unknown', category: 'origin', label: '未识别', definition: '没有任何自动依据，不自动折叠。', protocolQuestion: '是否需要人工确认这个操作的语义？', proverifReading: '保留原始函数名；不把低置信标签写成协议事实。', anchors: [DOC_GROUPING, ANCHOR_CANVAS] },
];

const FOLD_CONCEPTS: readonly Concept[] = [
  { id: 'fold:expanded', category: 'fold', label: '展开态', definition: '显示组内方法盒、输入/输出值与嵌套子组。', protocolQuestion: '这一步的完整操作链是什么？', proverifReading: '展开不改变消息、查询或验证结论。', anchors: [ANCHOR_CANVAS, DOC_GROUPING] },
  { id: 'fold:collapsed', category: 'fold', label: '折叠态', definition: '用组摘要隐藏成员，保留隐藏计数与被外部引用的幽灵值。', protocolQuestion: '被折叠的操作做了什么，哪些值还在后面使用？', proverifReading: '折叠是派生视图状态；不改变 .pv 与验证输入。', anchors: [ANCHOR_CANVAS, DOC_GROUPING] },
  { id: 'fold:semantic', category: 'fold', label: '语义折叠', definition: '按一次密码操作成组，摘要显示种类、方向与关键参数。', protocolQuestion: '这次操作在协议语义上是什么？', proverifReading: '语义分组来自 fun / reduc 与名称启发，不是 ProVerif 语法节点。', anchors: [DOC_GROUPING, ANCHOR_CANVAS] },
  { id: 'fold:density', category: 'fold', label: '密度折叠', definition: '连续多个算子步骤达到阈值后自动收成一格。', protocolQuestion: '这一串连续算子步骤大致在做什么？', proverifReading: '只为阅读密度服务，与语义分组状态相互独立。', anchors: [DOC_GROUPING, ANCHOR_CANVAS] },
];

const QUERY_CONCEPTS: readonly Concept[] = [
  { id: 'query:secrecy', category: 'query', label: '保密性查询', definition: '询问攻击者是否能获得某个名字或值（attacker(...)）。', protocolQuestion: '这个秘密是否只对预期角色可见？', proverifReading: 'attacker(x) 在 stdout 中归一化为 not attacker(x[])：is true 表示攻击者无法获得。', anchors: [DOC_SECRECY, { label: '验证面板查询卡', kind: 'query' }] },
  { id: 'query:correspondence', category: 'query', label: '认证 / 对应性查询', definition: '询问一个事件是否总对应另一个事件（event(...) ==> event(...)）。', protocolQuestion: '某个角色完成动作时，另一个角色是否一定已经完成前置动作？', proverifReading: '==> 是 ProVerif 的对应性断言；inj-event 还要求一一对应。', anchors: [DOC_AUTH, { label: '验证面板查询卡', kind: 'query' }] },
  { id: 'query:reachability', category: 'query', label: '可达性查询', definition: '询问某个事件是否可能发生。', protocolQuestion: '这条路径在攻击者模型下是否可达？', proverifReading: '单个 event(...) 查询在 ProVerif 中作为可达性目标处理。', anchors: [DOC_AUTH, DOC_OUTPUT, { label: '验证面板查询卡', kind: 'query' }] },
  { id: 'query:other', category: 'query', label: '其它查询', definition: '未归类为保密性、对应性或可达性的查询。', protocolQuestion: '这条查询在协议层面到底问了什么？', proverifReading: '判定措辞按原始归一化结果保留，不强行套用性质解释。', anchors: [DOC_OUTPUT, { label: '验证面板查询卡', kind: 'query' }] },
];

const VERDICT_CONCEPTS: readonly Concept[] = [
  { id: 'verdict:true', category: 'verdict', label: '成立', definition: '归一化输出 is true：ProVerif 未找到反例。', protocolQuestion: '这条查询在 Dolev-Yao 模型下是否成立？', proverifReading: '成立只针对这条查询；不能推出协议整体安全。', anchors: [DOC_OUTPUT, { label: '查询卡判定徽标', kind: 'query' }] },
  { id: 'verdict:false', category: 'verdict', label: '被证伪', definition: '归一化输出 is false：ProVerif 找到反例。', protocolQuestion: '攻击路径从哪条消息获得了什么？', proverifReading: '查询不成立；反例 trace 是证据，不代表所有查询都失败。', anchors: [DOC_OUTPUT, { label: '查询卡反例 trace', kind: 'query' }] },
  { id: 'verdict:cannot-be-proved', category: 'verdict', label: '未证出', definition: '归一化输出 cannot be proved：既未证明也未证伪。', protocolQuestion: '是模型太复杂、缺少假设，还是性质需要人工判断？', proverifReading: '未证出不等于不成立，也不等于成立。', anchors: [DOC_OUTPUT, { label: '查询卡判定徽标', kind: 'query' }] },
];

const NOTATION_CONCEPTS: readonly Concept[] = [
  notation('crypto-notation', '密码学惯用记法', '把 encrypt / senc / sign / hash 等构造子渲染成密码学常见写法。', '记法只是构造子的简写，不改变词项结构。'),
  notation('functor-fallback', '函数调用写法', '未命中惯用记法的构造子按 functor(a, b) 显示。', '名称保留原样，提示这不是已知的密码学简写。'),
  notation('tuple', '元组', '把多个词项组合成一个元组。', '元组是 ProVerif 词项结构，不是一次独立密码操作。'),
  notation('equality', '等值模式', '接收模式要求传入值等于 M。', '对应 ProVerif 的 =M 模式，参与模式匹配。'),
  notation('value-block', '值方块', '表示一个角色本地绑定及其引用/等值复制。', '值身份来自 ProVerif 变量绑定，不是攻击者知识。'),
  notation('method-box', '方法盒', '表示构造、解构、选择或检查的一次算子应用。', '对应 fun / reduc 中的构造子或析构子。'),
  notation('wire-chip', '线上词项', '未配对消息在信道上携带的完整词项。', '显示发送端词项；未配对不代表信道不存在。'),
  notation('derived-chip', '派生芯片', '表示解构产出、条件或表模式的中间值。', '不产生新的值身份，只是阅读辅助。'),
  notation('unpaired', '未配对', '消息步骤没有声明跨角色收发关系。', '不推断可达性；人工配对只是设计意图。'),
  notation('message-pillar', '消息柱', '设计意图上的 out → in 消息流。', '连线不代表攻击者模型下可达；安全性看 RESULT。'),
  notation('direction', '方向', '消息或方法盒的发送/接收、构造/解构方向。', '方向来自源码位置，不是安全结论。'),
  notation('channel-order', '信道序号', '按水平序列从左到右给信道编号与线型。', '序号与线型是阅读锚点，不表达信任关系。'),
  notation('scope-flags', '作用域标记', '角色级的复制 ! 或并行 | 标记。', '对应进程作用域，不改变单次消息语义。'),
  notation('event', '事件旗标', '角色执行的 event 标记。', 'event 是 ProVerif 事件，可用于对应性查询。'),
  notation('branch-lane', '分支臂道', 'if 条件的 then/else 臂道与守卫。', '分支是进程控制流，不改变查询集合。'),
  notation('local-ops', '本地步骤', '角色内 new / let / get / insert 等本地语句。', '本地步骤影响词项与绑定，不是消息。'),
  notation('crypto-group', '密码操作组', '把一次密码操作的方法盒与值收成可折叠摘要。', '语义分组来自 fun / reduc 分类，不改变 .pv。'),
  notation('density-fold', '密度折叠', '把连续多个算子步骤收成一格。', '只降低阅读密度，不改变协议语义。'),
  notation('exchange-segment', '交换段', '把一段连续、因果凸的完整消息收成段带。', '段只折叠消息层；跨段边仍保留因果可见性。'),
  notation('diagnostics', '诊断标注', '解析降级或语法错误以原文/中文消息保留。', '诊断不阻止验证；ProVerif 仍读取原始 .pv。'),
];

const ALL_CONCEPTS: readonly Concept[] = [
  ...OPERATION_CONCEPTS,
  ...ORIGIN_CONCEPTS,
  ...FOLD_CONCEPTS,
  ...QUERY_CONCEPTS,
  ...VERDICT_CONCEPTS,
  ...NOTATION_CONCEPTS,
];

export const CONCEPTS: ReadonlyMap<string, Concept> = new Map(ALL_CONCEPTS.map((concept) => [concept.id, concept]));

export function conceptOf(id: ConceptId | string): Concept | undefined {
  return CONCEPTS.get(id);
}

export function operationConceptId(kind: OperationKind): ConceptId {
  return `operation:${kind}`;
}

export function originConceptId(origin: GroupingOrigin | 'user'): ConceptId {
  return `origin:${origin}`;
}

export function queryConceptId(kind: ConceptQueryKind | string): ConceptId {
  return `query:${kind}` as ConceptId;
}

export function verdictConceptId(verdict: Verdict): ConceptId {
  return `verdict:${verdict}`;
}

export function notationConceptId(key: string): ConceptId {
  return `notation:${key}`;
}

/** 图例/分组的全部概念 id（测试据此检查覆盖）。 */
export const CONCEPT_IDS: readonly string[] = ALL_CONCEPTS.map((concept) => concept.id);
