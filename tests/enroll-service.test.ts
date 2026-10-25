import { describe, it, expect, beforeAll } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  env.FRAME_MODE = 'instance'
  delete env.DATABASE_URL
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/enroll-svc'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('enroll service', () => {
  it('issues a code and redeems the bundle, minting the device token on redeem', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { instanceId, code, expiresAt } = await issueEnrollmentCode()
    expect(instanceId).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(code.length).toBeGreaterThanOrEqual(20)

    const bundle = await redeemEnrollmentCode(code)
    expect(bundle).toBeTruthy()
    expect(bundle!.instanceId).toBe(instanceId)
    expect(bundle!.deviceToken.length).toBeGreaterThanOrEqual(32)
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(60_000)
  })

  it('the minted token authenticates against sync (bootstrap-via-enroll path, spec §6.7)', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { instanceId, code } = await issueEnrollmentCode()
    const bundle = await redeemEnrollmentCode(code)
    const { NextRequest } = await import('next/server')
    const { authenticateInstance } = await import('@/lib/sync/auth')
    const req = new NextRequest('http://x/api/sync/pull', { headers: { Authorization: `Bearer ${bundle!.deviceToken}` } })
    expect(await authenticateInstance(req)).toBe(instanceId)
  })

  it('rejects expired, unknown, and double redemption', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')

    expect(await redeemEnrollmentCode('never-issued')).toBeNull()

    const { code } = await issueEnrollmentCode(undefined, 1000)
    await new Promise((r) => setTimeout(r, 1100))
    expect(await redeemEnrollmentCode(code)).toBeNull()

    const live = await issueEnrollmentCode()
    expect(await redeemEnrollmentCode(live.code)).toBeTruthy()
    expect(await redeemEnrollmentCode(live.code)).toBeNull()
  })

  it('concurrent redemption: exactly one winner', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { code } = await issueEnrollmentCode()
    const results = await Promise.all([redeemEnrollmentCode(code), redeemEnrollmentCode(code)])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('rotate re-points a new code at an existing instance and replaces the token hash', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const b1 = await redeemEnrollmentCode(first.code)
    const again = await issueEnrollmentCode(first.instanceId)
    expect(again.instanceId).toBe(first.instanceId)
    const b2 = await redeemEnrollmentCode(again.code)
    expect(b2!.deviceToken).not.toBe(b1!.deviceToken)

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const t = getTables()
    const { eq } = await import('drizzle-orm')
    const rows = await getDb().select().from(t.instances).where(eq(t.instances.id, first.instanceId))
    expect(rows).toHaveLength(1)
    expect(rows[0].deviceTokenHash).toBe(hashToken(b2!.deviceToken))
  })

  it('stores only the hashed code', async () => {
    await freshDb()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    const { code } = await issueEnrollmentCode()
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const rows = await getDb().select().from(getTables().enrollmentCodes)
    expect(rows[0].codeHash).not.toContain(code)
    const { hashToken } = await import('@/lib/sync/auth')
    expect(rows[0].codeHash).toBe(hashToken(code))
  })
})
