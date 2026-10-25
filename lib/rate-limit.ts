// Fixed-window in-memory limiter for /api/enroll and /api/admin/login.
// Per-process best-effort: a horizontally scaled console counts per instance.
// Enrollment code entropy covers what an imperfect limiter misses (spec §3.2).
type Window = { count: number; resetAt: number }
const windows = new Map<string, Window>()

export interface LimitResult { allowed: boolean; retryAfterMs: number }

export function checkLimit(key: string, max: number, windowMs: number, now: () => number = Date.now): LimitResult {
  const t = now()
  // Lazily sweep to prevent unbounded map growth
  sweepLimits(now)
  const w = windows.get(key)
  if (!w || t >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: t + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }
  w.count += 1
  if (w.count > max) return { allowed: false, retryAfterMs: w.resetAt - t }
  return { allowed: true, retryAfterMs: 0 }
}

// Drop stale windows so the map cannot grow without bound. Callers on the
// request path invoke this cheaply; keys are bounded either way.
export function sweepLimits(now: () => number = Date.now): void {
  const t = now()
  for (const [k, w] of windows) if (t >= w.resetAt) windows.delete(k)
}

export function __resetLimits(): void { windows.clear() }
