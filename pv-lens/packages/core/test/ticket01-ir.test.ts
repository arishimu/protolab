import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePv } from '@pv-lens/core';

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function fixture(path: string): string {
  return readFileSync(join(coreDir, 'fixtures', path), 'utf8');
}

describe('ticket #01：规范叙事 IR 兼容层与基线生命线', () => {
  it('命名角色按源码顺序保留，内联 process 退回稳定的 main 角色', () => {
    const named = parsePv(`
      free c: channel.
      let first = out(c, a).
      let second = in(c, b).
      process first | second.
    `);
    expect(named.roles.map((role) => role.name)).toEqual(['first', 'second']);
    expect(named.mainProcess?.name).toBe('main');

    const inline = parsePv('free c: channel.\nprocess out(c, hello).');
    expect(inline.roles).toEqual([]);
    expect(inline.mainProcess?.name).toBe('main');
    expect(inline.mainProcess?.items.some((item) => item.kind === 'message')).toBe(true);
  });

  it('每个消息 item 都有稳定 endpoint 身份、方向、信道、wire term 和源码位置', () => {
    const source = `
      free c: channel.
      let role(pk: pkey) = out(c, pk); in(c, answer: bitstring).
      process role(pkA).
    `;
    const first = parsePv(source);
    const second = parsePv(source);
    const endpoints = first.roles[0].items
      .filter((item) => item.kind === 'message')
      .map((item) => item.endpoint);
    const secondEndpoints = second.roles[0].items
      .filter((item) => item.kind === 'message')
      .map((item) => item.endpoint);

    expect(endpoints.map((endpoint) => endpoint.id)).toEqual([
      'role:message:0',
      'role:message:1',
    ]);
    expect(endpoints.map((endpoint) => endpoint.direction)).toEqual(['out', 'in']);
    expect(endpoints.every((endpoint) => endpoint.channel.kind === 'name' && endpoint.channel.name === 'c')).toBe(true);
    expect(endpoints[0].wireTerm).toEqual(endpoints[0].term);
    expect(endpoints[1].wireTerm.kind).toBe('variable');
    expect(endpoints.map((endpoint) => endpoint.span.start.line)).toEqual([3, 3]);
    expect(endpoints).toEqual(secondEndpoints);
  });

  it('参数、!、| 状态固定在角色和消息 item 上', () => {
    const model = parsePv(`
      type pkey.
      free c: channel.
      let role(pk: pkey) = out(c, pk).
      process !role(pkA).
    `);
    const role = model.roles[0];
    expect(role.parameters).toMatchObject([{ name: 'pk', typeName: 'pkey' }]);
    expect(role.parameters[0]?.span.start.line).toBe(4);
    expect(role.replicated).toBe(true);
    expect(role.parallel).toBe(false);
    const message = role.items.find((item) => item.kind === 'message');
    expect(message?.kind).toBe('message');
    expect(message && message.replicated).toBe(true);
    expect(message && message.parallel).toBe(false);

    const parallel = parsePv(`
      free c: channel.
      let left = out(c, a).
      let right = in(c, b).
      process left | right.
    `);
    expect(parallel.roles.map((role) => role.parallel)).toEqual([true, true]);
    expect(parallel.roles.flatMap((role) => role.items.filter((item) => item.kind === 'message')).every((item) => item.parallel)).toBe(true);
  });

  it('保留信道、函数、析构、查询和带源码位置的降级诊断', () => {
    const model = parsePv(fixture('pv/multi-channel.pv'));
    expect(model.channels.map((channel) => channel.name)).toEqual(['c1', 'c2', 'c3']);
    expect(model.functions.map((fn) => fn.name)).toContain('senc');
    expect(model.destructors.map((destructor) => destructor.name)).toContain('sdec');
    expect(model.queries.map((query) => query.text)).toContain('attacker(s)');

    const degraded = parsePv(`
      free c: channel.
      let p = choice [true] out(c, x).
      process p.
    `);
    expect(degraded.hasDegraded).toBe(true);
    expect(degraded.diagnostics[0]?.severity).toBe('degraded');
    expect(degraded.diagnostics[0]?.span.start.line).toBeGreaterThan(1);
    expect(degraded.diagnostics[0]?.sourceText).toContain('choice');
  });
});
