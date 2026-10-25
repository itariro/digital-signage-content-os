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

  it('rejects a non-positive or non-finite TTL', async () => {
    await freshDb()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    for (const ttl of [0, -1, Number.NaN, Infinity]) {
      await expect(issueEnrollmentCode(undefined, ttl)).rejects.toBeInstanceOf(RangeError)
    }
  })

  it('a newly issued code consumes the previous code for the same instance', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
    const bundle = await redeemEnrollmentCode(second.code)
    expect(bundle).toBeTruthy()
    expect(bundle!.instanceId).toBe(first.instanceId)
  })

  it('the older code stays dead after the newest code redeems', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(second.code)).toBeTruthy()
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
  })

  it('a successful redeem consumes every other outstanding code for the instance', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const first = await issueEnrollmentCode()
    const now = new Date()
    await getDb().insert(getTables().enrollmentCodes).values({
      codeHash: hashToken('manual-code-b'),
      instanceId: first.instanceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    })

    expect(await redeemEnrollmentCode(first.code)).toBeTruthy()
    expect(await redeemEnrollmentCode('manual-code-b')).toBeNull()
  })

  it('stores the token hash and never the token itself', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')
    const { instanceId, code } = await issueEnrollmentCode()
    const bundle = await redeemEnrollmentCode(code)

    const t = getTables()
    const [row] = await getDb().select().from(t.instances).where(eq(t.instances.id, instanceId))
    expect(row.deviceTokenHash).toBe(hashToken(bundle!.deviceToken))
    expect(JSON.stringify(row)).not.toContain(bundle!.deviceToken)
    const codeRows = await getDb().select().from(t.enrollmentCodes)
    expect(JSON.stringify(codeRows)).not.toContain(bundle!.deviceToken)
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

  it('returns null when the instance is revoked before redeem and leaves the code consumed', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')
    const { instanceId, code } = await issueEnrollmentCode()
    const t = getTables()
    await getDb().delete(t.instances).where(eq(t.instances.id, instanceId))
    expect(await redeemEnrollmentCode(code)).toBeNull()
    const rows = await getDb().select().from(t.enrollmentCodes)
      .where(eq(t.enrollmentCodes.codeHash, hashToken(code)))
    expect(rows[0].consumedAt).not.toBeNull()
  })
})
