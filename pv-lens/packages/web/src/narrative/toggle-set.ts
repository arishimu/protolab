import { useState } from 'react';

/**
 * 字符串集合的「成员在/不在」切换（07b）：分支折叠与算子簇展开共用同一状态形——
 * 数组保序、contains/filter 切换。返回 [集合, 切换函数]。
 */
export function useToggleSet(initial: readonly string[]): [readonly string[], (id: string) => void] {
  const [members, setMembers] = useState<readonly string[]>(initial);
  const toggle = (id: string): void => {
    setMembers((current) => current.includes(id)
      ? current.filter((member) => member !== id)
      : [...current, id]);
  };
  return [members, toggle];
}
