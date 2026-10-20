import crypto from 'node:crypto'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export async function authenticateInstance(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1].trim()
  // Dev mode: shared secret. Dead in production — a leftover SYNC_SECRET
  // must never become a universal device identity (final review C-1).
  const secret = process.env.SYNC_SECRET
  if (secret && process.env.NODE_ENV !== 'production' && constantTimeEqual(token, secret)) {
    return 'dev-instance'
  }
  const db = getDb()
  const { instances } = getTables()
  const hash = hashToken(token)
  const rows = await db.select().from(instances).where(eq(instances.deviceTokenHash, hash))
  return rows[0]?.id ?? null
}
