import { describe, expect, it } from 'vitest';
import { serverInfo } from '../src/index.js';
import { coreSamples } from '@pv-lens/core';

// 干净环境冒烟：证明 core 可被 Node 端依赖、server 可导入 core 的公共接口。
describe('server 脚手架', () => {
  it('serverInfo 回显 core 的内置样例数', () => {
    const info = serverInfo();
    expect(info.name).toBe('pv-lens-server');
    expect(info.builtinSampleCount).toBe(coreSamples.length);
    expect(info.builtinSampleCount).toBeGreaterThan(0);
  });
});
