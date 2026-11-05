/**
 * 内置样例导读（ADR-0018 / 阶段 4）。
 *
 * 每一步给出一个可在真实源码/画布定位的目标；目标只做阅读引导，
 * 不把“查询成立”写成协议安全结论。
 */

import { collectEventReferences, narrativeRoleOrder } from '@pv-lens/core';
import type { ParseResult, SourceSpan } from '@pv-lens/core';

export type GuideTarget =
  | { kind: 'source'; line: number; column?: number; label?: string }
  | { kind: 'event'; name: string; roleName?: string }
  | { kind: 'query'; index: number };

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  target: GuideTarget;
}

export interface SampleGuide {
  sampleId: string;
  title: string;
  summary: string;
  steps: readonly GuideStep[];
}

export const SAMPLE_GUIDES: Readonly<Record<string, SampleGuide>> = {
  hello: {
    sampleId: 'hello',
    title: 'hello：从明文信道开始',
    summary: '最短样例：信道是公开的，两个自由名字分别代表会泄露和不会泄露的秘密。',
    steps: [
      { id: 'hello-channel', title: '公开信道', body: 'free c: channel 表示所有角色共享的公开信道。', target: { kind: 'source', line: 3, label: '信道声明' } },
      { id: 'hello-secret', title: '私有名字', body: 'RSA 与 Cocks 都是 free [private] 名字；private 只是建模声明，是否泄露由查询回答。', target: { kind: 'source', line: 6, label: 'RSA 声明' } },
      { id: 'hello-rsa', title: 'RSA 保密性查询', body: '攻击者能否从 out(c,RSA) 获得 RSA？查看该查询的判定与反例 trace。', target: { kind: 'query', index: 0 } },
      { id: 'hello-cocks', title: 'Cocks 保密性查询', body: '对比 Cocks：同为私有名字，但从未发送到公开信道上。', target: { kind: 'query', index: 1 } },
    ],
  },
  'handshake-fixed': {
    sampleId: 'handshake-fixed',
    title: '握手修正版：对称、非对称与签名',
    summary: '观察一次握手如何同时使用三种密码操作，并用事件查询表达认证目标。',
    steps: [
      { id: 'hs-senc', title: '对称加密方程', body: 'reduc sdec(senc(m,k),k)=m 同时给出加密与解密方向。', target: { kind: 'source', line: 5, label: '对称方程' } },
      { id: 'hs-sign', title: '签名验证', body: 'checksign 与 sign 组成签名操作；它本身不自动等于认证成立。', target: { kind: 'source', line: 28, label: '签名方程' } },
      { id: 'hs-event', title: '事件旗标', body: 'acceptsServer 是服务器接受事件；对应性查询会引用它。', target: { kind: 'event', name: 'acceptsServer' } },
      { id: 'hs-secrecy', title: '保密性查询', body: 'attacker(s) 询问会话密钥 s 是否可能泄露。', target: { kind: 'query', index: 0 } },
      { id: 'hs-auth', title: '单射认证查询', body: 'inj-event(termServer) ==> inj-event(acceptsClient) 要求事件一一对应。', target: { kind: 'query', index: 2 } },
    ],
  },
  'ns-original': {
    sampleId: 'ns-original',
    title: 'NS 原版：Lowe 攻击',
    summary: '原版 Needham-Schroeder 的 B 侧认证被 Lowe 攻击证伪；对照保密性查询阅读反例。',
    steps: [
      { id: 'ns-aenc', title: '公钥加密方程', body: 'adec(aenc(x,pk(y)),y)=x 说明加密用公钥、解密用私钥。', target: { kind: 'source', line: 9, label: '非对称方程' } },
      { id: 'ns-event', title: 'B 侧开始事件', body: 'beginBparam 标记 Bob 开始与某个公钥通信。', target: { kind: 'event', name: 'beginBparam' } },
      { id: 'ns-auth', title: 'B 侧认证查询', body: 'endBparam ==> beginBparam 被证伪；展开反例 trace 看攻击者如何重放。', target: { kind: 'query', index: 0 } },
      { id: 'ns-secrecy', title: 'B 的保密性', body: 'secretBNa 的保密性同样被证伪；注意区分“这条查询失败”与其他查询的判定。', target: { kind: 'query', index: 4 } },
    ],
  },
  'ns-mutual-auth': {
    sampleId: 'ns-mutual-auth',
    title: 'NS 修正版：互认证与签名',
    summary: '修正版引入签名与身份检查，两条互认证查询都成立。',
    steps: [
      { id: 'nsm-decrypt', title: '解密方程', body: 'decrypt(encrypt(x,pk(y)),y)=x 是 NS 消息加密的核心。', target: { kind: 'source', line: 22, label: '解密方程' } },
      { id: 'nsm-input', title: '身份检查', body: '发起者先检查对端身份是否诚实，再继续协议。', target: { kind: 'source', line: 72, label: '身份检查' } },
      { id: 'nsm-event', title: '发起者事件', body: 'termI 标记发起者完成的消息视图。', target: { kind: 'event', name: 'termI' } },
      { id: 'nsm-query1', title: '发起者互认证', body: 'termI ==> acceptsR 要求响应者接受过同一组值。', target: { kind: 'query', index: 0 } },
      { id: 'nsm-query2', title: '响应者互认证', body: 'termR ==> acceptsI 是反方向的单射认证查询。', target: { kind: 'query', index: 1 } },
    ],
  },
};

export function guideOf(sampleId: string | undefined): SampleGuide | undefined {
  return sampleId === undefined ? undefined : SAMPLE_GUIDES[sampleId];
}

/** 把导读目标解析为真实 span；目标不存在时返回 null（测试据此守住“真实锚点”）。 */
export function resolveGuideTarget(
  target: GuideTarget,
  source: string,
  parseResult: ParseResult,
): { span: SourceSpan; label: string } | null {
  if (target.kind === 'source') {
    const lines = source.split('\n');
    const lineText = lines[target.line - 1];
    if (lineText === undefined) return null;
    let offset = 0;
    for (let index = 0; index < target.line - 1; index += 1) offset += (lines[index]?.length ?? 0) + 1;
    const column = target.column ?? (lineText.search(/\S/) >= 0 ? lineText.search(/\S/) + 1 : 1);
    const start = { offset: offset + column - 1, line: target.line, column };
    const endOffset = offset + Math.max(1, lineText.trimEnd().length);
    return {
      span: { start, end: { offset: endOffset, line: target.line, column: Math.max(column, lineText.trimEnd().length) } },
      label: target.label ?? `源码 L${String(target.line)}`,
    };
  }
  if (target.kind === 'event') {
    const roles = narrativeRoleOrder(parseResult);
    const event = collectEventReferences(parseResult).find((candidate) =>
      candidate.name === target.name && (target.roleName === undefined || roles[candidate.roleIndex]?.name === target.roleName));
    if (event === undefined) return null;
    return { span: event.span, label: `事件 ${target.name}` };
  }
  const query = parseResult.queries[target.index];
  if (query === undefined) return null;
  return { span: query.span, label: `查询 ${String(target.index + 1)}` };
}
