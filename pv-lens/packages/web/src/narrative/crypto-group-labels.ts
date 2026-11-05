/** 密码操作组的中文标签：布局摘要、审计面板与图例共用同一份，避免三处漂移。 */

import type { GroupConfidence, GroupingOrigin, OperationDirection, OperationKind } from '@pv-lens/core';

export const OPERATION_KIND_LABELS: Readonly<Record<OperationKind, string>> = {
  signature: '签名',
  'symmetric-encryption': '对称加密',
  'symmetric-decryption': '对称解密',
  'asymmetric-encryption': '非对称加密',
  'asymmetric-decryption': '非对称解密',
  hash: '哈希',
  'key-derivation': '密钥派生',
  unknown: '未识别',
};

export const OPERATION_DIRECTION_LABELS: Readonly<Record<OperationDirection, string>> = {
  construct: '构造',
  destruct: '解构',
};

export const GROUP_ORIGIN_LABELS: Readonly<Record<GroupingOrigin | 'user', string>> = {
  equation: '方程匹配',
  name: '名称启发',
  user: '用户声明',
  unknown: '未识别',
};

export const GROUP_CONFIDENCE_LABELS: Readonly<Record<GroupConfidence, string>> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
  user: '用户声明',
};
