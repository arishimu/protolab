import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coreSamples, parsePv } from '@pv-lens/core';
import type { Binding, Condition, PvTerm, RoleItem } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(path: string): string {
  return readFileSync(join(coreDir, 'fixtures', path), 'utf8');
}

function variables(term: PvTerm): Extract<PvTerm, { kind: 'variable' }>[] {
  const result: Extract<PvTerm, { kind: 'variable' }>[] = [];
  const visit = (current: PvTerm): void => {
    if (current.kind === 'variable') result.push(current);
    if (current.kind === 'application') current.args.forEach(visit);
    if (current.kind === 'tuple') current.items.forEach(visit);
    if (current.kind === 'conditional') {
      visitCondition(current.condition);
      visit(current.thenTerm);
      visit(current.elseTerm);
    }
    if (current.kind === 'equality') visit(current.term);
  };
  const visitCondition = (condition: Condition): void => {
    if (condition.kind === 'comparison') {
      visit(condition.left);
      visit(condition.right);
    } else if (condition.kind === 'compound') {
      condition.clauses.forEach(visitCondition);
    }
  };
  visit(term);
  return result;
}

function itemOf<T extends RoleItem['kind']>(items: readonly RoleItem[], kind: T, index = 0): Extract<RoleItem, { kind: T }> {
  const item = items.filter((candidate) => candidate.kind === kind)[index];
  if (item === undefined) throw new Error(`missing ${kind} item #${index}`);
  return item as Extract<RoleItem, { kind: T }>;
}

function bindingByName(bindings: readonly Binding[], name: string, kind: Binding['kind']): Binding {
  const binding = bindings.find((candidate) => candidate.name === name && candidate.kind === kind);
  if (binding === undefined) throw new Error(`missing ${kind} binding ${name}`);
  return binding;
}

describe('ticket #02：值绑定与词项追踪', () => {
  const source = [
    'type bitstring.',
    'type key.',
    'free c: channel.',
    'fun wrap(bitstring, key): bitstring.',
    'reduc forall x: bitstring, k: key; unwrap(wrap(x,k),k) = x.',
    'event accepted(bitstring).',
    'let alice(seed: bitstring) =',
    '  new nonce: bitstring;',
    '  out(c, wrap(nonce, seed));',
    '  in(c, (reply: bitstring, =seed));',
    '  let derived = if seed = reply then nonce else reply in',
    '  get records(=seed, saved) in',
    '  event accepted(derived);',
    '  out(c, derived).',
    'let bob(seed: bitstring) = in(c, seed: bitstring); out(c, seed).',
    'process alice(a) | bob(b).',
  ].join('\n');

  it('为参数、new、in、let、get 建立稳定来源，并把引用回填到 bindingId', () => {
    const first = parsePv(source);
    const second = parsePv(source);
    const alice = first.roles[0];
    const bindings = alice.bindings;

    expect(bindings.map(({ name, kind }) => [name, kind])).toEqual([
      ['seed', 'parameter'],
      ['nonce', 'new'],
      ['reply', 'in'],
      ['derived', 'let'],
      ['saved', 'get'],
    ]);
    expect(bindings.map((binding) => binding.id)).toEqual(
      second.roles[0].bindings.map((binding) => binding.id),
    );

    const parameter = bindingByName(bindings, 'seed', 'parameter');
    const fresh = bindingByName(bindings, 'nonce', 'new');
    const incoming = bindingByName(bindings, 'reply', 'in');
    const saved = bindingByName(bindings, 'saved', 'get');
    const derived = bindingByName(bindings, 'derived', 'let');

    const out = itemOf(alice.items, 'message', 0);
    expect(variables(out.endpoint.term).map((term) => term.bindingId)).toEqual([fresh.id, parameter.id]);

    const incomingItem = itemOf(alice.items, 'message', 1);
    expect(variables(incomingItem.endpoint.term).map((term) => term.bindingId)).toEqual([
      incoming.id,
      parameter.id,
    ]);

    const letItem = itemOf(alice.items, 'local', 1);
    expect(letItem.operation).toBe('let');
    expect(letItem.bindingIds).toEqual([derived.id]);
    expect(letItem.pattern?.kind).toBe('variable');
    expect((letItem.term?.kind)).toBe('conditional');
    if (letItem.term?.kind === 'conditional') {
      expect(variables(letItem.term.condition.left).map((term) => term.bindingId)).toEqual([parameter.id]);
      expect(variables(letItem.term.condition.right).map((term) => term.bindingId)).toEqual([incoming.id]);
      expect(variables(letItem.term.thenTerm).map((term) => term.bindingId)).toEqual([fresh.id]);
      expect(variables(letItem.term.elseTerm).map((term) => term.bindingId)).toEqual([incoming.id]);
    }

    const getItem = itemOf(alice.items, 'local', 2);
    expect(getItem.operation).toBe('get');
    expect(getItem.bindingIds).toEqual([saved.id]);
    expect(variables(getItem.pattern!).map((term) => term.bindingId)).toEqual([
      parameter.id,
      saved.id,
    ]);

    const event = itemOf(alice.items, 'event');
    expect(event.args).toHaveLength(1);
    expect(variables(event.args![0]).map((term) => term.bindingId)).toEqual([derived.id]);

    const afterGet = itemOf(alice.items, 'message', 2);
    expect(variables(afterGet.endpoint.term).map((term) => term.bindingId)).toEqual([derived.id]);
    expect(alice.items[afterGet.endpoint.itemIndex]).toBe(afterGet);
  });

  it('同名绑定按角色隔离，接收模式与新鲜名不互相合并', () => {
    const result = parsePv(source);
    const [alice, bob] = result.roles;
    const aliceSeed = bindingByName(alice.bindings, 'seed', 'parameter');
    const aliceReply = bindingByName(alice.bindings, 'reply', 'in');
    const bobSeed = bindingByName(bob.bindings, 'seed', 'parameter');
    const bobIncoming = bindingByName(bob.bindings, 'seed', 'in');

    expect(aliceSeed.id).not.toBe(bobSeed.id);
    expect(aliceReply.id).not.toBe(bobIncoming.id);
    expect(variables(bob.items.filter((item) => item.kind === 'message')[1].endpoint.term)[0].bindingId).toBe(
      bobIncoming.id,
    );
    expect(result.bindings.filter((binding) => binding.name === 'seed')).toHaveLength(3);
  });

  it('四个基准样例保留值层结构，构造函数不会被误记为析构函数', () => {
    const results = coreSamples.map((sample) => parsePv(fixture(sample.pvFile)));
    expect(results.every((result) => !result.hasErrors)).toBe(true);

    const bindingKinds = new Set(results.flatMap((result) => result.bindings.map((binding) => binding.kind)));
    expect(bindingKinds).toEqual(new Set(['parameter', 'new', 'in', 'let', 'get']));

    for (const result of results) {
      const constructors = new Set(result.functions.map((fn) => fn.name));
      expect(result.destructors.every((destructor) => !constructors.has(destructor.name))).toBe(true);
    }

    const mutualAuth = parsePv(fixture('pv/ns-mutual-auth.pv'));
    const initiator = mutualAuth?.roles.find((role) => role.name === 'processInitiator');
    const conditional = initiator?.items.find(
      (item) => item.kind === 'local' && item.operation === 'let' && item.term?.kind === 'conditional',
    );
    expect(conditional?.kind).toBe('local');
    expect(initiator?.items.some((item) => item.kind === 'event' && item.args.length > 0)).toBe(true);
  });

  it('无法可靠结构化的 let 右侧与事件参数保留原文并给出降级诊断', () => {
    const result = parsePv([
      'free c: channel.',
      'event accepted(bitstring).',
      'let p(x: bitstring) = let y = ??? in event accepted(???); out(c, x).',
      'process p(a).',
    ].join('\n'));

    const local = result.roles[0].items.find((item) => item.kind === 'local' && item.operation === 'let');
    const event = result.roles[0].items.find((item) => item.kind === 'event');
    expect(local?.term).toEqual({ kind: 'unknown', text: '???' });
    expect(event?.args).toEqual([{ kind: 'unknown', text: '???' }]);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'degraded')).toHaveLength(2);
  });
});
