import { requireAdmin } from '@/lib/authz'
import type { OrganizationCustomRoleKey } from '@clerk/shared/types'

export type ActorResult = { ok: true; actor: string } | { ok: false; reason: 'misconfigured' | 'unauthorized' }

/**
 * Resolve a CONSOLE-operator actor: x-admin-token (automation) or a signed-in
 * Clerk session, with the optional CONSOLE_ADMIN_ROLE enforced on the Clerk
 * path. Device bearer tokens are NOT console credentials (final review C-1):
 * they authenticate /api/sync/* only, where ownership is checked per change.
 * Clerk is imported lazily and its failure tolerated so the helper stays
 * usable outside a Next request context (vitest route-handler tests).
 */
export async function resolveActor(request: Request): Promise<ActorResult> {
  const gate = requireAdmin(request)
  if (gate.ok) return { ok: true, actor: gate.actor }

  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId, has } = await auth()
    if (userId) {
      const role = process.env.CONSOLE_ADMIN_ROLE
      if (role && !has({ role: role as OrganizationCustomRoleKey })) {
        return { ok: false, reason: 'unauthorized' }
      }
      return { ok: true, actor: userId }
    }
  } catch {
    // no Clerk request context (e.g. unit test) — treat as signed out
  }

  return { ok: false, reason: gate.reason }
}

export function actorFailure(outcome: { ok: false; reason: string }) {
  return { status: outcome.reason === 'misconfigured' ? 500 : 401, error: outcome.reason }
}

export function actorResponse(outcome: ActorResult & { ok: false }) {
  const { status, error } = actorFailure(outcome)
  return Response.json({ error }, { status })
}
