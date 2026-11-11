/**
 * 验证服务健康探测（R10）：前端对 GET /api/health 的唯一消费点。
 *
 * 载入模型后即探测一次，避免用户点「运行验证」后才发现 server 未启动；
 * 运行结束后可再探测刷新状态。探测失败不打扰用户（静默降级为「未启动」）。
 * R19 复用同一 hook 在首页与装载页标题区显示状态。
 */

import { useCallback, useEffect, useState } from 'react';

export type VerifyServiceHealth = 'checking' | 'up' | 'down';

export interface VerifyServiceHealthState {
  health: VerifyServiceHealth;
  /** 手动刷新探测（运行验证结束后调用，状态变化后能更新）。 */
  recheck: () => void;
}

/** 探测一次 /api/health；任何异常（网络层/HTTP 非 200/结构不符）都算「未启动」。 */
async function probeHealth(): Promise<VerifyServiceHealth> {
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    if (!response.ok) return 'down';
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null && (payload as { ok?: unknown }).ok === true) {
      return 'up';
    }
    return 'down';
  } catch {
    return 'down';
  }
}

export function useVerifyServiceHealth(): VerifyServiceHealthState {
  const [health, setHealth] = useState<VerifyServiceHealth>('checking');
  const recheck = useCallback((): void => {
    void probeHealth().then(setHealth);
  }, []);
  useEffect(() => {
    recheck();
  }, [recheck]);
  return { health, recheck };
}

/** 状态点的中文文案（供面板与首页共用；健康时不强调，未启动时给出启动指引）。 */
export function verifyServiceHealthText(health: VerifyServiceHealth): string {
  if (health === 'up') return '验证服务已连接';
  if (health === 'down') return '验证服务未启动；在 pv-lens 目录执行 pnpm start';
  return '正在检查验证服务…';
}
