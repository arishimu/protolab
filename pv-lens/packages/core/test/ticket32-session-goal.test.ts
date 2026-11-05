import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildSessionGoalSource,
  collectEventReferences,
  coreSamples,
  createAuthenticationGoal,
  createReachabilityGoal,
  parsePv,
  roleLocalFreshHint,
  roleLocalFreshNames,
  secrecyCandidates,
  sessionGoalQueryBody,
  sessionGoalQueryTexts,
} from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(rel: string): string {
  return readFileSync(join(coreDir, 'fixtures', rel), 'utf8');
}

function model(id: string) {
  return parsePv(fixture(join('pv', `${id}.pv`)));
}

describe('阶段 5：保密性会话目标', () => {
  it('只把顶层 free [private] 名字列为候选', () => {
    expect(secrecyCandidates(model('handshake-fixed')).map((goal) => goal.name)).toEqual(['s']);
    expect(secrecyCandidates(model('hello')).map((goal) => goal.name)).toEqual(['Cocks', 'RSA']);
    expect(secrecyCandidates(model('ns-original')).map((goal) => goal.name)).toEqual([
      'secretANa',
      'secretANb',
      'secretBNa',
      'secretBNb',
    ]);
    expect(secrecyCandidates(model('multi-channel')).every((goal) => goal.name !== 'c1')).toBe(true);
  });

  it('候选带查询文本、来源与源码 span，且 origin 为 session', () => {
    const [goal] = secrecyCandidates(model('handshake-fixed'));
    expect(goal).toMatchObject({ kind: 'secrecy', origin: 'session', queryText: 'attacker(s)' });
    expect(goal?.sourceSpan?.start.line).toBe(33);
    expect(goal?.id).toBe('session:secrecy:s');
  });

  it('角色内 new 不生成 attacker 目标，只给出建模提示', () => {
    const names = roleLocalFreshNames(model('handshake-fixed'));
    expect(names.some((name) => name.name === 'k' && name.roleName === 'serverB')).toBe(true);
    const hint = roleLocalFreshHint(names[0]!);
    expect(hint).toContain('不是顶层 free 秘密名');
    expect(hint).toContain('free');
  });
});

describe('阶段 5：认证与可达性会话目标', () => {
  it('认证目标复用参数化对应性查询文本', () => {
    const result = model('handshake-fixed');
    const events = collectEventReferences(result);
    const termClient = events.find((event) => event.name === 'termClient');
    const acceptsServer = events.find((event) => event.name === 'acceptsServer');
    expect(termClient).toBeDefined();
    expect(acceptsServer).toBeDefined();
    if (termClient === undefined || acceptsServer === undefined) return;

    const injective = createAuthenticationGoal(result, termClient.id, acceptsServer.id, true);
    const plain = createAuthenticationGoal(result, termClient.id, acceptsServer.id, false);
    expect(injective?.queryText).toContain('inj-event(termClient');
    expect(injective?.queryText).toContain('inj-event(acceptsServer');
    expect(plain?.queryText).toContain('event(termClient');
    expect(plain?.queryText).not.toContain('inj-event');
    expect(injective).toMatchObject({ kind: 'authentication', origin: 'session', injective: true });
    expect(injective?.id).toContain('inj');
    expect(plain?.id).toContain(':event');
  });

  it('可达性目标生成带类型变量的 event 查询', () => {
    const result = model('handshake-fixed');
    const event = collectEventReferences(result).find((candidate) => candidate.name === 'termClient');
    expect(event).toBeDefined();
    if (event === undefined) return;
    const goal = createReachabilityGoal(result, event.id);
    expect(goal).toMatchObject({ kind: 'reachability', origin: 'session' });
    expect(goal?.queryText).toContain('event(termClient(');
    expect(goal?.queryText).toContain('x0:key');
    expect(goal?.queryText).toContain('x1:pkey');
  });
});

describe('阶段 5：派生文本与四样例', () => {
  it('会话目标插入首个 process 之前，不修改原 source，也不重复已有查询', () => {
    const source = fixture('pv/handshake-fixed.pv');
    const result = parsePv(source);
    const secrecy = secrecyCandidates(result)[0]!;
    const events = collectEventReferences(result);
    const auth = createAuthenticationGoal(result, events[0]!.id, events[1]!.id, true)!;
    const derived = buildSessionGoalSource(source, [secrecy, auth]);
    expect(source).not.toBe(derived);
    expect(derived.indexOf(`query ${secrecy.queryText}.`)).toBeLessThan(derived.search(/\bprocess\b/));
    expect(derived).toContain('query attacker(s).');

    const withDuplicate = `${source}\nquery ${secrecy.queryText}.`;
    const duplicate = buildSessionGoalSource(withDuplicate, [secrecy]);
    expect(duplicate.match(/query attacker\(s\)\./g)?.length)
      .toBe(withDuplicate.match(/query attacker\(s\)\./g)?.length);
  });

  it('四个内置样例都能生成可解析的会话目标文本', () => {
    for (const sample of coreSamples) {
      const source = fixture(sample.pvFile);
      const result = parsePv(source);
      const goals = [
        ...secrecyCandidates(result).slice(0, 1),
        ...(collectEventReferences(result).length >= 2
          ? [createAuthenticationGoal(result, collectEventReferences(result)[0]!.id, collectEventReferences(result)[1]!.id, true)!]
          : []),
        ...(collectEventReferences(result).length >= 1
          ? [createReachabilityGoal(result, collectEventReferences(result)[0]!.id)!]
          : []),
      ];
      expect(goals.every((goal) => goal.origin === 'session')).toBe(true);
      const derived = buildSessionGoalSource(source, goals);
      const parsed = parsePv(derived);
      expect(parsed.hasErrors, sample.id).toBe(false);
      const added = goals.filter((goal) => !source.includes(`query ${goal.queryText}.`)).length;
      expect(parsed.queries.length).toBe(result.queries.length + added);
      expect(sessionGoalQueryTexts(goals).every((text) => parsed.queries.some((query) => query.text === sessionGoalQueryBody(text)))).toBe(true);
    }
  });
});
