/**
 * 当前协议的「文本状态入口」（ticket 02）。
 *
 * 这是渲染（ticket 04）与运行验证（ticket 07/08）两条管道共同消费的起点：
 * 两者都只认 .pv 文本（ADR-0001：文本是唯一真源）。本模块把「装载了什么、原文是什么」
 * 规约为一个纯数据对象 LoadedProtocol，与 React 解耦，便于在 node 环境做单元测试。
 */

import { getCoreSample, getSampleSource } from '@pv-lens/core';
import type { CoreSampleDef } from '@pv-lens/core';

/** 当前协议是从内置样例载入，还是从本地文件导入。 */
export type LoadOrigin =
  | { kind: 'builtin'; sampleId: string }
  | { kind: 'file'; fileName: string };

/**
 * 装载完成的协议：标题 + 来源 + .pv 全文。
 * 后续渲染/验证管道一律消费 .source（文本），本对象即为全局「当前协议」状态形状。
 */
export interface LoadedProtocol {
  /** UI 展示用的标题（内置样例为其中文名，文件导入为其文件名）。 */
  title: string;
  /** 说明文字（内置样例的简述；文件导入为固定说明）。 */
  description: string;
  /** 来源：内置 or 本地文件。 */
  origin: LoadOrigin;
  /** .pv 全文——渲染与运行验证的唯一输入。 */
  source: string;
}

/** 内置样例装载失败（id 不在 manifest，或嵌入副本缺失）。 */
export class BuiltinNotFoundError extends Error {
  readonly sampleId: string;
  constructor(sampleId: string) {
    super(`内置样例不存在: ${sampleId}`);
    this.name = 'BuiltinNotFoundError';
    this.sampleId = sampleId;
  }
}

/** 解析一个内置样例为 LoadedProtocol（id 无效时抛 BuiltinNotFoundError）。 */
export function loadBuiltinSample(sampleId: string): LoadedProtocol {
  const def: CoreSampleDef | undefined = getCoreSample(sampleId);
  if (!def) {
    throw new BuiltinNotFoundError(sampleId);
  }
  const source = getSampleSource(sampleId);
  if (source === undefined) {
    throw new BuiltinNotFoundError(sampleId);
  }
  return {
    title: def.title,
    description: def.description,
    origin: { kind: 'builtin', sampleId },
    source,
  };
}

/** 把本地读到的 .pv 文件内容装载为 LoadedProtocol。 */
export function loadImportedFile(fileName: string, source: string): LoadedProtocol {
  const base = fileName.endsWith('.pv') ? fileName.slice(0, -'.pv'.length) : fileName;
  return {
    title: `${base}（本地导入）`,
    description: `本地文件 ${fileName}，内容已装载为当前协议。`,
    origin: { kind: 'file', fileName },
    source,
  };
}
