import { describe, it, expect, beforeAll, afterEach } from 'vitest'

// /api/sync/run must take config from instance env only (C5): no attacker-
// supplied endpoint/token, authenticated, and no SSRF to disallowed hosts.
const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  // /api/sync/run only exists on instances (sqlite); with DATABASE_URL set in
  // the environment, FRAME_MODE must explicitly pin instance mode.
  env.FRAME_MODE = 'instance'
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/run-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

let fetchCalls: string[] = []
function stubFetch(response: unknown) {
  fetchCalls = []
  globalThis.fetch = (async (input: any) => {
    fetchCalls.push(String(input))
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
}
afterEach(() => {
  fetchCalls = []
  delete env.SYNC_ENDPOINT
  delete env.SYNC_TOKEN
  delete env.INSTANCE_ID
  delete env.CONSOLE_ADMIN_TOKEN
  delete env.SYNC_ALLOWED_HOSTS
  delete env.NODE_ENV
})

async function runRequest(body: unknown, headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  return new NextRequest('http://localhost/api/sync/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const PRODUCTION = { NODE_ENV: 'production', CONSOLE_ADMIN_TOKEN: 'admin-tok' }

describe('sync-run lockdown', () => {
  it('rejects bodies carrying an attacker endpoint', async () => {
    Object.assign(env, PRODUCTION)
    await freshDb()
    const { POST } = await import('@/app/api/sync/run/route')
    const res = await POST(await runRequest(
      { endpoint: 'http://evil.example', token: 'stolen', instanceId: 'x' },
      { 'x-admin-token': 'admin-tok' },
    ))
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated calls fail-closed in production', async () => {
    env.NODE_ENV = 'production'
    delete env.CONSOLE_ADMIN_TOKEN
    await freshDb()
    const { POST } = await import('@/app/api/sync/run/route')
    const res = await POST(await runRequest({}))
    expect(res.status).toBe(500) // misconfigured → closed, never open
  })

  it('refuses a non-allowlisted SYNC_ENDPOINT host without attempting fetch (SSRF)', async () => {
    Object.assign(env, PRODUCTION, {
      SYNC_ALLOWED_HOSTS: 'console.internal',
      SYNC_ENDPOINT: 'https://internal-metadata.attacker.example',
      SYNC_TOKEN: 'devtok',
      INSTANCE_ID: 'inst-x',
    })
    stubFetch({ accepted: [], conflicts: [], rejected: [] })
    const { POST } = await import('@/app/api/sync/run/route')
    const res = await POST(await runRequest({}, { 'x-admin-token': 'admin-tok' }))
    expect(res.status).toBe(400)
    expect(fetchCalls).toEqual([])
  })

  it('refuses plaintext http to a non-loopback host', async () => {
    Object.assign(env, PRODUCTION, {
      SYNC_ENDPOINT: 'http://10.0.0.8:3000',
      SYNC_TOKEN: 'devtok',
      INSTANCE_ID: 'inst-x',
    })
    stubFetch({ accepted: [], conflicts: [], rejected: [] })
    const { POST } = await import('@/app/api/sync/run/route')
    const res = await POST(await runRequest({}, { 'x-admin-token': 'admin-tok' }))
    expect(res.status).toBe(400)
    expect(fetchCalls).toEqual([])
  })

  it('runs a cycle from env config over loopback when authorized', async () => {
    Object.assign(env, PRODUCTION, {
      SYNC_ENDPOINT: 'http://127.0.0.1:4321',
      SYNC_TOKEN: 'devtok',
      INSTANCE_ID: 'inst-x',
    })
    await freshDb()
    stubFetch({ accepted: [], conflicts: [], rejected: [], changes: [], cursor: new Date().toISOString() })
    const { POST } = await import('@/app/api/sync/run/route')
    const res = await POST(await runRequest({}, { 'x-admin-token': 'admin-tok' }))
    expect(res.status).toBe(200)
    expect(fetchCalls.length).toBeGreaterThan(0)
    expect(fetchCalls[0]).toContain('127.0.0.1:4321')
  })
})
