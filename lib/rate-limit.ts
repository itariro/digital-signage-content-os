// Fixed-window in-memory limiter for /api/enroll and /api/admin/login.
// Per-process best-effort: a horizontally scaled console counts per instance.
// Enrollment code entropy covers what an imperfect limiter misses (spec §3.2).
type Window = { count: number; resetAt: number }

export const MAX_WINDOWS = 10_000
export const SWEEP_EVERY = 256

const windows = new Map<string, Window>()
let checks = 0

export interface LimitResult { allowed: boolean; retryAfterMs: number }

function dropExpired(t: number): void {
  for (const [k, w] of windows) if (t >= w.resetAt) windows.delete(k)
}

// The key being checked is never evicted, so a full map cannot turn an active
// brute-force bucket into a fresh one. Map iteration follows insertion order,
// which is O(1) amortised instead of sorting the whole map on every request.
function evictOldest(keepKey: string): void {
  for (const k of windows.keys()) {
    if (k !== keepKey) {
      windows.delete(k)
      return
    }
  }
}

export function checkLimit(key: string, max: number, windowMs: number, now: () => number = Date.now): LimitResult {
  const t = now()
  checks += 1
  if (checks % SWEEP_EVERY === 0) dropExpired(t)

  const w = windows.get(key)
  if (!w || t >= w.resetAt) {
    if (windows.size >= MAX_WINDOWS) {
      dropExpired(t)
      if (windows.size >= MAX_WINDOWS) evictOldest(key)
    }
    windows.set(key, { count: 1, resetAt: t + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }
  w.count += 1
  if (w.count > max) return { allowed: false, retryAfterMs: w.resetAt - t }
  return { allowed: true, retryAfterMs: 0 }
}

// Drop stale windows. Exported for tests and manual operational sweeps.
export function sweepLimits(now: () => number = Date.now): void {
  dropExpired(now())
}

export function __resetLimits(): void {
  windows.clear()
  checks = 0
}

export function __limitsSize(): number {
  return windows.size
}
