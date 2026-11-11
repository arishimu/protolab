import { useCallback, useState } from 'react';

/**
 * 字符串集合的「成员在/不在」切换（07b）：分支折叠与算子簇展开共用同一状态形——
 * 数组保序、contains/filter 切换。返回 [集合, 切换函数, 整组设置, 整体替换]。
 */
export function useToggleSet(initial: readonly string[]): [
  readonly string[],
  (id: string) => void,
  (ids: readonly string[], present: boolean) => void,
  (ids: readonly string[]) => void,
] {
  const [members, setMembers] = useState<readonly string[]>(initial);
  const toggle = useCallback((id: string): void => {
    setMembers((current) => current.includes(id)
      ? current.filter((member) => member !== id)
      : [...current, id]);
  }, []);
  const setAll = useCallback((ids: readonly string[], present: boolean): void => {
    setMembers((current) => {
      if (!present) return current.filter((member) => !ids.includes(member));
      const next = [...current];
      for (const id of ids) if (!next.includes(id)) next.push(id);
      return next;
    });
  }, []);
  const replace = useCallback((ids: readonly string[]): void => {
    setMembers([...ids]);
  }, []);
  return [members, toggle, setAll, replace];
}
