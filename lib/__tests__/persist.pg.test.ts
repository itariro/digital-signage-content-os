import { describe, it, expect, beforeAll } from 'vitest'

// C4: console-mode persist() writes revision/contentHash/updatedBy — the PG
// frame_documents table must carry them or conflict detection is dead in PG.
// Gated on DATABASE_URL; the throwaway cluster is bootstrapped from drizzle/.
const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const env = process.env as Record<string, string | undefined>

suite('frame_documents sync columns on postgres', () => {
  beforeAll(async () => {
    const fs = await import('node:fs')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;')
    const files = fs.readdirSync('drizzle').filter((n) => n.endsWith('.sql')).sort()
    for (const f of files) {
      await client.query(fs.readFileSync(`drizzle/${f}`, 'utf8'))
    }
    await client.end()
    env.FRAME_MODE = 'console'
  }, 60_000)

  it('persist() writes and increments revision across two mutations', async () => {
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.customFonts.push('pg-rev-test-1') }, 'home')
    await mutateStore((s) => { s.customFonts.push('pg-rev-test-2') }, 'home')

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const tables = getTables() as any
    const [row] = await getDb().select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'home'))
    // created at default revision 1, two persists bump it to 3
    expect(row.revision).toBe(3)
    expect(row.contentHash).toBeTruthy()
    expect(row.updatedBy).toBe('instance')
  }, 60_000)

  it('handlePush reads the PG revision column for conflict detection', async () => {
    const { handlePush } = await import('@/lib/sync/server')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const tables = getTables() as any

    // 'home' now sits at revision 3; a push declaring baseRevision 1 must conflict.
    const outcome = await handlePush('home', [{
      idempotencyKey: 'pg-conflict-1', entityType: 'frame_document', entityId: 'home',
      operation: 'upsert', payload: { v: 'stale' }, baseRevision: 1,
    }])
    expect(outcome.conflicts.length).toBe(1)
    expect(outcome.conflicts[0].remoteRevision).toBe(3)

    // revision untouched by the conflicted push
    const [row] = await getDb().select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, 'home'))
    expect(row.revision).toBe(3)

    const db = getDb() as any
    await db.delete(tables.syncConflicts)
    await db.delete(tables.idempotencyKeys)
  }, 60_000)
})
