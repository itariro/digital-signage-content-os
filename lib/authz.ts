import { createHash, timingSafeEqual } from 'node:crypto'

export type AdminGate =
  | { ok: true; actor: string }
  | { ok: false; reason: 'misconfigured' | 'unauthorized' }

/**
 * Fail-closed admin gate for console/instance management APIs.
 * - No CONSOLE_ADMIN_TOKEN + production → reject (misconfigured). Never open by default.
 * - No CONSOLE_ADMIN_TOKEN + non-production → dev-open, tagged actor for audit trail.
 * - Token set → constant-time compare of sha256 digests (equal-length digests,
 *   so timingSafeEqual cannot throw on short/long headers).
 */
export function requireAdmin(request: Request): AdminGate {
  const configured = process.env.CONSOLE_ADMIN_TOKEN
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'misconfigured' }
    }
    return { ok: true, actor: 'dev-admin' }
  }
  const provided = request.headers.get('x-admin-token') ?? ''
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(configured).digest()
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: 'unauthorized' }
  }
  return { ok: true, actor: 'admin-token' }
}
