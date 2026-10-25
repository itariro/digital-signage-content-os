import crypto from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
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
  const db = getDb()
  const t = getTables()
  const now = new Date()
  let id = instanceId
  if (!id) {
    id = nanoid(12)
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
  }
  const code = nanoid(20)
  const expiresAt = new Date(now.getTime() + ttlMs)
  await db.insert(t.enrollmentCodes).values({ codeHash: hashToken(code), instanceId: id, createdAt: now, expiresAt })
  return { instanceId: id, code, expiresAt }
}

/**
 * Atomic single-use redeem. The plaintext device token is minted here and
 * returned; it is never stored. Null covers unknown/expired/consumed codes and
 * deleted instances alike (spec §5: one generic failure).
 */
export async function redeemEnrollmentCode(code: string): Promise<EnrollBundle | null> {
  const db = getDb()
  const t = getTables()
  const codeHash = hashToken(code)
  const now = new Date()

  const claimed = await db.update(t.enrollmentCodes)
    .set({ consumedAt: now })
    .where(and(eq(t.enrollmentCodes.codeHash, codeHash), isNull(t.enrollmentCodes.consumedAt), gt(t.enrollmentCodes.expiresAt, now)))
    .returning({ instanceId: t.enrollmentCodes.instanceId })

  const row = claimed[0] as { instanceId: string } | undefined
  if (!row) return null

  const instanceId = row.instanceId
  const found = await db.select({ id: t.instances.id }).from(t.instances)
    .where(eq(t.instances.id, instanceId))
  if (!found.length) return null // Instance revoked between issue and redeem: code burned, generic failure (spec §5).

  const deviceToken = nanoid(32)
  await db.update(t.instances).set({ deviceTokenHash: hashToken(deviceToken) }).where(eq(t.instances.id, instanceId))

  return {
    instanceId,
    deviceToken,
    frameAdminSecret: crypto.randomBytes(32).toString('base64url'),
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
  }
}
