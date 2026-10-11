/** 草稿层测试使用的最小平台 store, 不模拟浏览器渲染或宿主存储. */
export function createSnapshotStore<T>(initial: T) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(value: T) { snapshot = value; for (const listener of listeners) listener() },
  }
}
