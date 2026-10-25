import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/enroll-api'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function dropAuditTable() {
  const { getSqliteRaw } = await import('@/lib/db/sqlite')
  getSqliteRaw().exec('DROP TABLE audit_log')
}

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('POST /api/enroll', () => {
  it('redeems a valid code into the frame bundle', async () => {
    await freshDb()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    const { code } = await issueEnrollmentCode()
    const { POST } = await import('@/app/api/enroll/route')
    const res = await POST(jsonReq('http://console.test/api/enroll', { code }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deviceToken).toBeTruthy()
    expect(body.syncEndpoint).toBe('http://console.test/api/sync')
    expect(body.frameAdminSecret).toBeTruthy()
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('401 generic on garbage/expired/consumed; 400 on bad body', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/enroll/route')
    const bad = await POST(jsonReq('http://console.test/api/enroll', { code: 'nope-nope-nope-nope' }))
    expect(bad.status).toBe(401)
    const badBody = await POST(new NextRequest('http://console.test/api/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'oops' }))
    expect(badBody.status).toBe(400)
  })

  it('does not let changing x-forwarded-for values bypass the limiter', async () => {
    await freshDb()
    const { __resetLimits } = await import('@/lib/rate-limit')
    __resetLimits()
    delete env.TRUST_PROXY
    const { POST } = await import('@/app/api/enroll/route')
    let last = 0
    for (let i = 0; i < 12; i++) {
      const req = jsonReq('http://console.test/api/enroll', { code: `guess-${i}-padding` })
      req.headers.set('x-forwarded-for', `10.0.0.${i}`)
      last = (await POST(req)).status
    }
    expect(last).toBe(429)
  })

  it('still returns the bundle when the audit insert fails', async () => {
    await freshDb()
    const { __resetLimits } = await import('@/lib/rate-limit')
    __resetLimits()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    const { code } = await issueEnrollmentCode()
    await dropAuditTable()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { POST } = await import('@/app/api/enroll/route')
      const res = await POST(jsonReq('http://console.test/api/enroll', { code }))
      expect(res.status).toBe(200)
      expect((await res.json()).deviceToken).toBeTruthy()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('still returns 401 when the audit insert fails on rejection', async () => {
    await freshDb()
    const { __resetLimits } = await import('@/lib/rate-limit')
    __resetLimits()
    await dropAuditTable()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { POST } = await import('@/app/api/enroll/route')
      const res = await POST(jsonReq('http://console.test/api/enroll', { code: 'nope-nope-nope-nope' }))
      expect(res.status).toBe(401)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('POST /api/instances and rotate', () => {
  it('returns a code, never a token; rotate re-issues for the same instance', async () => {
    await freshDb()
    env.CONSOLE_ADMIN_TOKEN = 'api-admin-2'
    const { POST } = await import('@/app/api/instances/route')
    const res = await POST(new NextRequest('http://console.test/api/instances', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'api-admin-2' }, body: '{}',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.enrollmentCode).toBeTruthy()
    expect(body.deviceToken).toBeUndefined()

    const { POST: ROTATE } = await import('@/app/api/instances/[id]/rotate/route')
    const rot = await ROTATE(new NextRequest(`http://console.test/api/instances/${body.instanceId}/rotate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': 'api-admin-2' }, body: '{}',
    }), { params: Promise.resolve({ id: body.instanceId }) })
    expect(rot.status).toBe(200)
    const rotBody = await rot.json()
    expect(rotBody.instanceId).toBe(body.instanceId)
    expect(rotBody.enrollmentCode).toBeTruthy()
    delete env.CONSOLE_ADMIN_TOKEN
  })
})
