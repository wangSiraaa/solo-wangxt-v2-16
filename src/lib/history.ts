/**
 * 调整历史：仅记录“页级调整”（排除/恢复指定页）。
 * 纸张设置由 IndexedDB 持久化、不纳入该撤销栈；导出前检查可在任何历史点执行。
 */
import { ref, computed } from 'vue';

export interface HistoryState {
  excluded: number[];
}

export function useAdjustHistory(initial: ReadonlySet<number>) {
  const past = ref<HistoryState[]>([]);
  const present = ref<HistoryState>({ excluded: [...initial].sort((a, b) => a - b) });
  const future = ref<HistoryState[]>([]);

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  function commit(next: ReadonlySet<number>) {
    past.value.push(present.value);
    if (past.value.length > 100) past.value.shift();
    present.value = { excluded: [...next].sort((a, b) => a - b) };
    future.value = [];
  }

  function undo(): HistoryState | null {
    const prev = past.value.pop();
    if (!prev) return null;
    future.value.push(present.value);
    present.value = prev;
    return present.value;
  }

  function redo(): HistoryState | null {
    const next = future.value.pop();
    if (!next) return null;
    past.value.push(present.value);
    present.value = next;
    return present.value;
  }

  return { present, canUndo, canRedo, commit, undo, redo };
}
