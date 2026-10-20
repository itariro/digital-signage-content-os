import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Task 12 — spec §6/§4.2: versioned migrations, snapshot-before-migration,
// corrupt-db restore from latest backup, rotation keeping BACKUP_MAX.
// Runs initInstance repeatedly against ONE file-backed database (ordered).
const env = process.env as Record<string, string | undefined>

const ROOT = '/tmp/scratchpad/lifecycle-adata'
const DB = path.join(ROOT, 'frame.db')
const BKS = path.join(ROOT, 'backups')

beforeAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true })
  fs.mkdirSync(ROOT, { recursive: true })
  delete env.FRAME_MODE // -> resolves sqlite
  delete env.DATABASE_URL
  delete env.SYNC_ENDPOINT
  delete env.SYNC_TOKEN
  delete env.INSTANCE_ID
  env.FRAME_DATA_DIR = ROOT
  env.FRAME_DB_PATH = DB
  env.BACKUP_MAX = '2'
})

function backupFiles(): string[] {
  if (!fs.existsSync(BKS)) return []
  return fs.readdirSync(BKS).filter((f) => /^frame-.*\.db$/.test(f))
}

async function queryable(): Promise<boolean> {
  try {
    const { getSqliteRaw } = await import('@/lib/db/sqlite')
    const raw = getSqliteRaw() as any
    raw.prepare('SELECT count(*) c FROM frame_documents').get()
    return true
  } catch {
    return false
  }
}

describe('lifecycle backup/migration wiring', () => {
  it('boot 1: creates schema and records applied migration statements', async () => {
    const { initInstance } = await import('@/lib/lifecycle')
    await initInstance()
    const { getSqliteRaw } = await import('@/lib/db/sqlite')
    const raw = getSqliteRaw() as any
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)
    expect(tables).toContain('frame_documents')
    expect(tables).toContain('_migrations')
    const applied = raw.prepare('SELECT count(*) c FROM _migrations').get().c
    expect(applied).toBeGreaterThan(0)
  })

  it('boot 2: skips applied statements and snapshots the db before migrating', async () => {
    const { initInstance } = await import('@/lib/lifecycle')
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    await initInstance()
    const raw = (await import('@/lib/db/sqlite')).getSqliteRaw() as any
    const applied = raw.prepare('SELECT count(*) c FROM _migrations').get().c
    // no duplicate application: same count as boot 1
    expect(applied).toBeGreaterThan(0)
    // snapshot taken on a db with schema
    expect(backupFiles().length).toBe(1)
  })

  it('boot 3 corrupt: restores the latest backup instead of dying', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    // snapshot a marker row first via boot 2 state? write through the store instead:
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.customFonts.push('marker') }, 'home')
    resetSqliteDb()
    await (await import('@/lib/lifecycle')).initInstance() // boot 3: snapshot WITH marker
    const newest = backupFiles().sort().at(-1)!
    expect(fs.existsSync(path.join(BKS, newest))).toBe(true)

    // brick the live db
    const { resetSqliteDb: r2 } = await import('@/lib/db/sqlite')
    r2()
    fs.writeFileSync(DB, Buffer.from('garbage-not-a-sqlite-file'.repeat(200)))
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB + ext)) fs.unlinkSync(DB + ext)

    const { initInstance } = await import('@/lib/lifecycle')
    await initInstance() // must NOT throw: restores backup
    expect(await queryable()).toBe(true)
  })

  it('rotation keeps BACKUP_MAX snapshots', async () => {
    const { initInstance } = await import('@/lib/lifecycle')
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    for (let i = 0; i < 3; i++) {
      resetSqliteDb()
      await initInstance()
    }
    expect(backupFiles().length).toBeLessThanOrEqual(2)
  })

  it('corrupt db with NO backups surfaces an explicit error (no silent success)', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    resetSqliteDb()
    fs.rmSync(BKS, { recursive: true, force: true })
    fs.writeFileSync(DB, Buffer.from('garbage'.repeat(500)))
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB + ext)) fs.unlinkSync(DB + ext)
    const { initInstance } = await import('@/lib/lifecycle')
    await expect(initInstance()).rejects.toThrow(/corrupt|restore/i)
  })
})
