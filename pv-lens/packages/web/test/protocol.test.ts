import { describe, expect, it } from 'vitest';
import {
  BuiltinNotFoundError,
  loadBuiltinSample,
  loadImportedFile,
} from '../src/protocol';
import { getCoreSample, listLoadableSamples } from '@pv-lens/core';

// protocol.ts 是纯函数层（不依赖 DOM/浏览器 API），可在 node 环境直接单测。
describe('当前协议文本状态入口（ticket 02）', () => {
  it('内置样例装载返回完整 .pv 原文，且与 core 嵌入副本一致', () => {
    for (const s of listLoadableSamples()) {
      const loaded = loadBuiltinSample(s.def.id);
      expect(loaded.origin.kind).toBe('builtin');
      expect(loaded.source).toBe(s.source);
      expect(loaded.source.length).toBeGreaterThan(0);
      expect(loaded.title).toBe(s.def.title);
      expect(loaded.description.length).toBeGreaterThan(0);
    }
  });

  it('本地文件装载：文件名去 .pv 后缀作为标题，原文原样保留', () => {
    const src = 'free c: channel.\nprocess 0\n';
    const loaded = loadImportedFile('my-model.pv', src);
    expect(loaded.origin).toEqual({ kind: 'file', fileName: 'my-model.pv' });
    expect(loaded.title).toContain('my-model');
    expect(loaded.title).not.toContain('.pv');
    expect(loaded.source).toBe(src);
  });

  it('不含 .pv 后缀的文件名原样进入标题', () => {
    const loaded = loadImportedFile('notes.txt', 'x');
    expect(loaded.title).toContain('notes.txt');
  });

  it('未知内置 id 抛 BuiltinNotFoundError', () => {
    expect(() => loadBuiltinSample('no-such-id')).toThrow(BuiltinNotFoundError);
  });

  it('manifest 中每个样例都有对应文本（不出现 BuiltinNotFound）', () => {
    for (const s of listLoadableSamples()) {
      expect(() => loadBuiltinSample(s.def.id)).not.toThrow();
    }
    // 四个基准样例都在。
    expect(getCoreSample('hello')).toBeDefined();
    expect(getCoreSample('handshake-fixed')).toBeDefined();
    expect(getCoreSample('ns-mutual-auth')).toBeDefined();
    expect(getCoreSample('ns-original')).toBeDefined();
  });
});
