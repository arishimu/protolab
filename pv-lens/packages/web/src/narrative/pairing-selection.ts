/**
 * 人工配对的画布点选状态机（ticket 06）：点未配对发送端选中、再点同信道未配对接收端
 * 即声明一条设计意图；重复点同一发送端可继续扇出（ADR-0007 点 1）。
 * 纯函数、不触 DOM——App 层接线，状态与意图都在会话内存，切换协议由调用方清空。
 */

import type { PairingIntent } from '@pv-lens/core';

export interface SelectableEndpoint {
  id: string;
  roleIndex: number;
  stepIndex: number;
  direction: 'out' | 'in';
  channelName: string;
  /** 配对态：未配对 / 已人工配对（可追加声明，扇出与合流）/ 已自动配对（不可人工选择）。 */
  pairingState: 'unpaired' | 'manual' | 'automatic';
}

export interface PairingSelectionState {
  pendingOut: SelectableEndpoint | null;
}

export type PairingSelectionAction =
  | { kind: 'select'; endpoint: SelectableEndpoint }
  | { kind: 'reset' };

export interface PairingSelectionResult {
  state: PairingSelectionState;
  /** 非 undefined 时本次动作产出一条人工声明，由调用方并入意图列表。 */
  intent?: PairingIntent;
  /** 拒绝原因：调用方据此提示；对应分支的 state 保持或按规则更新。 */
  reason?: 'automatic-endpoint' | 'in-without-pending' | 'channel-mismatch';
}

export function reducePairingSelection(
  state: PairingSelectionState,
  action: PairingSelectionAction,
): PairingSelectionResult {
  if (action.kind === 'reset') return { state: { pendingOut: null } };
  const { endpoint } = action;
  // 自动配对端不可人工选择（ADR-0005 边界 3）；已人工配对的端点仍可追加声明（扇出 / 合流）。
  if (endpoint.pairingState === 'automatic') return { state, reason: 'automatic-endpoint' };

  if (endpoint.direction === 'out') {
    // 再点同一发送端 = 取消选择；点另一发送端 = 更换扇出源。
    const pendingOut = state.pendingOut?.id === endpoint.id ? null : endpoint;
    return { state: { pendingOut } };
  }
  const pendingOut = state.pendingOut;
  if (pendingOut === null) {
    return { state, reason: 'in-without-pending' };
  }
  if (pendingOut.channelName !== endpoint.channelName) {
    return { state, reason: 'channel-mismatch' };
  }
  // 声明成立：清空选择（继续扇出需重新点发送端，与 ADR-0007 的重复点选一致）。
  return {
    state: { pendingOut: null },
    intent: {
      outEnd: { roleIndex: pendingOut.roleIndex, stepIndex: pendingOut.stepIndex },
      inEnd: { roleIndex: endpoint.roleIndex, stepIndex: endpoint.stepIndex },
    },
  };
}
