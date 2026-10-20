import { requireAdmin } from '@/lib/authz'
import { authenticateInstance } from '@/lib/sync/auth'

export type ActorResult = { ok: true; actor: string } | { ok: false; reason: 'misconfigured' | 'unauthorized' }

/**
 * Resolve a write-capable actor for console-side APIs from any of:
 * 1. device bearer token (kiosk/instance automation),
 * 2. x-admin-token header (operator automation, fail-closed gate),
 * 3. a signed-in Clerk session (editor humans).
 * Clerk is imported lazily and its failure tolerated so the helper stays
 * usable outside a Next request context (vitest route-handler tests).
 */
export async function resolveActor(request: Request): Promise<ActorResult> {
  const device = await authenticateInstance(request).catch(() => null)
  if (device) return { ok: true, actor: `device:${device}` }

  const gate = requireAdmin(request)
  if (gate.ok) return { ok: true, actor: gate.actor }

  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (userId) return { ok: true, actor: userId }
  } catch {
    // no Clerk request context (e.g. unit test) — treat as signed out
  }

  return { ok: false, reason: gate.reason }
}

export function actorFailure(outcome: { ok: false; reason: string }) {
  return { status: outcome.reason === 'misconfigured' ? 500 : 401, error: outcome.reason }
}
