import crypto from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
import * as sqliteSchema from '@/lib/db/schema.sqlite'
import { getSqliteDb } from '@/lib/db/sqlite'
import { getTables } from '@/lib/db/tables'
import { hashToken } from '@/lib/sync/auth'

export interface IssuedCode { instanceId: string; code: string; expiresAt: Date }
export interface EnrollBundle {
  instanceId: string
  deviceToken: string
  frameAdminSecret: string
  clerkPublishableKey: string
}

const CODE_TTL_MS = 15 * 60 * 1000

/** Create the instance row (token hash stays NULL until redeem) + seed frame doc. */
export async function issueEnrollmentCode(instanceId?: string, ttlMs: number = CODE_TTL_MS): Promise<IssuedCode> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('enrollment code TTL must be a positive finite number')
  }

  const db = getDb()
  const t = getTables()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  const code = nanoid(20)
  const codeHash = hashToken(code)

  if (!instanceId) {
    const id = nanoid(12)
    await db.insert(t.instances).values({ id, deviceTokenHash: null, createdAt: now })
    const existing = await db.select({ id: t.frameDocuments.id }).from(t.frameDocuments)
      .where(eq(t.frameDocuments.identifier, id))
    if (!existing.length) {
      const { seed } = await import('@/lib/store')
      await db.insert(t.frameDocuments).values({
        id, identifier: id, name: `Frame ${id}`, data: seed(),
        createdAt: now, updatedAt: now, revision: 1, resolutionWidth: 1920, resolutionHeight: 1080,
      })
    }
    await db.insert(t.enrollmentCodes).values({ codeHash, instanceId: id, createdAt: now, expiresAt })
    return { instanceId: id, code, expiresAt }
  }

  // A rotate replaces the old code. Consume every outstanding code for the
  // instance and insert the new one in the same transaction, so a leaked old
  // code cannot overwrite the token after the legitimate frame enrolls.
  if (getDatabaseMode() === 'sqlite') {
    const st = sqliteSchema
    getSqliteDb().transaction((tx) => {
      tx.update(st.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(st.enrollmentCodes.instanceId, instanceId), isNull(st.enrollmentCodes.consumedAt)))
        .run()
      tx.insert(st.enrollmentCodes)
        .values({ codeHash, instanceId, createdAt: now, expiresAt })
        .run()
    })
  } else {
    await db.transaction(async (tx) => {
      await tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.instanceId, instanceId), isNull(t.enrollmentCodes.consumedAt)))
      await tx.insert(t.enrollmentCodes).values({ codeHash, instanceId, createdAt: now, expiresAt })
    })
  }
  return { instanceId, code, expiresAt }
}

/**
 * Atomic single-use redeem. The plaintext device token is minted here and
 * returned; it is never stored. Null covers unknown/expired/consumed codes and
 * deleted instances alike (spec §5: one generic failure).
 */
export async function redeemEnrollmentCode(code: string): Promise<EnrollBundle | null> {
  const codeHash = hashToken(code)
  const now = new Date()
  // Generate before the transaction: a crypto failure must not burn a code.
  const frameAdminSecret = crypto.randomBytes(32).toString('base64url')

  if (getDatabaseMode() === 'sqlite') {
    const t = sqliteSchema
    const sdb = getSqliteDb()
    let bundle: EnrollBundle | null = null
    sdb.transaction((tx) => {
      const claimed = tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.codeHash, codeHash), isNull(t.enrollmentCodes.consumedAt), gt(t.enrollmentCodes.expiresAt, now)))
        .returning({ instanceId: t.enrollmentCodes.instanceId })
        .all()

      const row = claimed[0] as { instanceId: string } | undefined
      if (!row) return

      // UPDATE ... RETURNING closes the select-then-update race: a deleted
      // instance returns no row and the code stays consumed.
      const deviceToken = nanoid(32)
      const updated = tx.update(t.instances)
        .set({ deviceTokenHash: hashToken(deviceToken) })
        .where(eq(t.instances.id, row.instanceId))
        .returning({ id: t.instances.id })
        .all()
      if (!updated.length) return

      tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.instanceId, row.instanceId), isNull(t.enrollmentCodes.consumedAt)))
        .run()

      bundle = {
        instanceId: row.instanceId,
        deviceToken,
        frameAdminSecret,
        clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      }
    })
    return bundle
  }

  const db = getDb()
  const t = getTables()
  return db.transaction(async (tx) => {
    const claimed = await tx.update(t.enrollmentCodes)
      .set({ consumedAt: now })
      .where(and(eq(t.enrollmentCodes.codeHash, codeHash), isNull(t.enrollmentCodes.consumedAt), gt(t.enrollmentCodes.expiresAt, now)))
      .returning({ instanceId: t.enrollmentCodes.instanceId })

    const row = claimed[0] as { instanceId: string } | undefined
    if (!row) return null

    const deviceToken = nanoid(32)
    const updated = await tx.update(t.instances)
      .set({ deviceTokenHash: hashToken(deviceToken) })
      .where(eq(t.instances.id, row.instanceId))
      .returning({ id: t.instances.id })
    if (!updated.length) return null

    await tx.update(t.enrollmentCodes)
      .set({ consumedAt: now })
      .where(and(eq(t.enrollmentCodes.instanceId, row.instanceId), isNull(t.enrollmentCodes.consumedAt)))

    return {
      instanceId: row.instanceId,
      deviceToken,
      frameAdminSecret,
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    }
  })
}