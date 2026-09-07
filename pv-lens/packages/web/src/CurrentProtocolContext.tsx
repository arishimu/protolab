import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  loadBuiltinSample,
  loadImportedFile,
} from './protocol';
import type { LoadedProtocol } from './protocol';
import { listLoadableSamples } from '@pv-lens/core';
import type { LoadableSample } from '@pv-lens/core';

/**
 * 当前协议全局状态（ticket 02 的状态入口）。
 *
 * 渲染与运行验证管道将来都从这里取 .source；本 context 只是持有
 * LoadedProtocol 并提供装载动作，不含任何图/验证逻辑。
 */
export interface CurrentProtocolState {
  /** 已装载的协议；尚未装载时为空。 */
  current: LoadedProtocol | null;
  /** 内置样例清单（含 .pv 原文），首页选择用。 */
  samples: readonly LoadableSample[];
  /** 装载一个内置样例。 */
  loadSample: (sampleId: string) => void;
  /** 装载一个本地导入的 .pv 文本。 */
  loadLocalText: (fileName: string, text: string) => void;
  /** 清空当前协议，回到未装载态。 */
  clear: () => void;
}

const CurrentProtocolContext = createContext<CurrentProtocolState | null>(null);

export function CurrentProtocolProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<LoadedProtocol | null>(null);

  const samples = useMemo<readonly LoadableSample[]>(() => listLoadableSamples(), []);

  const loadSample = useCallback((sampleId: string) => {
    setCurrent(loadBuiltinSample(sampleId));
  }, []);

  const loadLocalText = useCallback((fileName: string, text: string) => {
    setCurrent(loadImportedFile(fileName, text));
  }, []);

  const clear = useCallback(() => setCurrent(null), []);

  const value = useMemo<CurrentProtocolState>(
    () => ({ current, samples, loadSample, loadLocalText, clear }),
    [current, samples, loadSample, loadLocalText, clear],
  );

  return (
    <CurrentProtocolContext.Provider value={value}>
      {children}
    </CurrentProtocolContext.Provider>
  );
}

export function useCurrentProtocol(): CurrentProtocolState {
  const ctx = useContext(CurrentProtocolContext);
  if (!ctx) {
    throw new Error('useCurrentProtocol 必须在 <CurrentProtocolProvider> 内使用');
  }
  return ctx;
}
