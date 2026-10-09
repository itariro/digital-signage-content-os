export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  delete(key: string): void
  clear(): void
  size(): number
}

/**
 * A tiny TTL cache. Used for the in-process frame store so a warm instance
 * serves fresh data instead of caching indefinitely (which caused stale stores
 * in multi-instance deployments).
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const map = new Map<string, { value: T; expiresAt: number }>()
  return {
    get(key) {
      const entry = map.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        map.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      map.set(key, { value, expiresAt: now() + ttlMs })
    },
    delete(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
    size() {
      return map.size
    },
  }
}
