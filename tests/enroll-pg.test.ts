import { describe, it, expect, beforeAll } from 'vitest'

// Gated on DATABASE_URL, like lib/__tests__/persist.pg.test.ts. The suite creates
// its own database and applies every drizzle/*.sql migration before importing the
// service, so it never touches the operator's working database.
const env = process.env as Record<string, string | undefined>
const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

suite('enrollment redeem on postgres', () => {
  beforeAll(async () => {
    const fs = await import('node:fs')
    const { Client } = await import('pg')
    const baseUrl = process.env.DATABASE_URL!
    const admin = new Client({ connectionString: baseUrl })
    await admin.connect()
    await admin.query('DROP DATABASE IF EXISTS frame_enroll')
    await admin.query('CREATE DATABASE frame_enroll')
    await admin.end()

    const target = new URL(baseUrl)
    target.pathname = '/frame_enroll'
    const connUrl = target.toString()
    const conn = new Client({ connectionString: connUrl })
    await conn.connect()
    const files = fs.readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()
    for (const file of files) {
      await conn.query(fs.readFileSync(`drizzle/${file}`, 'utf8'))
    }
    await conn.end()

    process.env.DATABASE_URL = connUrl
    env.FRAME_MODE = 'console'
  }, 60_000)

  it('redeems a code and stores only the token hash', async () => {
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')

    const { instanceId, code } = await issueEnrollmentCode()
    const bundle = await redeemEnrollmentCode(code)
    expect(bundle).toBeTruthy()
    expect(bundle!.instanceId).toBe(instanceId)
    expect(bundle!.deviceToken.length).toBeGreaterThanOrEqual(32)

    const t = getTables()
    const [row] = await getDb().select().from(t.instances).where(eq(t.instances.id, instanceId))
    expect(row.deviceTokenHash).toBe(hashToken(bundle!.deviceToken))
    expect(JSON.stringify(row)).not.toContain(bundle!.deviceToken)
  }, 60_000)

  it('consumes older codes when a new code is issued', async () => {
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
    expect(await redeemEnrollmentCode(second.code)).toBeTruthy()
  }, 60_000)

  it('returns null and leaves the code consumed when the instance is gone', async () => {
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
  }, 60_000)
})
