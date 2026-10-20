import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// requireAdmin must read env at call time so each case can set NODE_ENV/token fresh.
// Next's process.env typing makes NODE_ENV readonly; tests mutate through a view.
const env = process.env as Record<string, string | undefined>
function requestWith(header?: string) {
  const headers: Record<string, string> = {}
  if (header !== undefined) headers['x-admin-token'] = header
  return new Request('http://localhost/api/instances', { headers })
}

describe('requireAdmin', () => {
  const ORIGINAL = { ...env }
  beforeEach(() => {
    delete env.CONSOLE_ADMIN_TOKEN
  })
  afterEach(() => {
    for (const k of Object.keys(env)) delete env[k]
    Object.assign(env, ORIGINAL)
  })

  it('fails closed in production when CONSOLE_ADMIN_TOKEN is unset', async () => {
    env.NODE_ENV = 'production'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith('anything'))
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('misconfigured')
  })

  it('fails closed in production when CONSOLE_ADMIN_TOKEN is unset even with no header', async () => {
    env.NODE_ENV = 'production'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith())
    expect(gate.ok).toBe(false)
  })

  it('opens in development only when NODE_ENV is not production', async () => {
    env.NODE_ENV = 'development'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith())
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.actor).toBe('dev-admin')
  })

  it('accepts the correct x-admin-token', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'secret-token-123'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith('secret-token-123'))
    expect(gate.ok).toBe(true)
    if (gate.ok) expect(gate.actor).toBe('admin-token')
  })

  it('rejects a wrong x-admin-token', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'secret-token-123'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith('wrong-token'))
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('unauthorized')
  })

  it('rejects a missing x-admin-token header', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'secret-token-123'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith())
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('unauthorized')
  })

  it('rejects a wrong token of the same length as the real one', async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'aaaaaaaaaaaaaaaa'
    const { requireAdmin } = await import('@/lib/authz')
    const gate = requireAdmin(requestWith('bbbbbbbbbbbbbbbb'))
    expect(gate.ok).toBe(false)
  })
})
