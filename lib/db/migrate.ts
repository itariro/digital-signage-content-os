import { getDatabaseMode } from './mode'
import fs from 'node:fs'
import path from 'node:path'

export async function runMigrations() {
  if (getDatabaseMode() !== 'sqlite') return
  const { getSqliteRaw } = await import('./sqlite')
  const db = getSqliteRaw()
  const ddlPath = path.join(process.cwd(), 'drizzle/sqlite/0000_init.sql')
  const ddl = fs.readFileSync(ddlPath, 'utf8')
  // Run statement-by-statement: CREATE TABLE IF NOT EXISTS keeps fresh DBs
  // idempotent, while additive ALTER TABLE ... ADD COLUMN lines re-run
  // harmlessly on existing DBs (sqlite has no IF NOT EXISTS for columns).
  for (const raw of ddl.split(/;\s*(?:\r?\n|$)/)) {
    const stmt = raw.split(/\r?\n/).filter((line) => !line.trim().startsWith('--')).join('\n').trim()
    if (!stmt) continue
    try {
      db.exec(stmt)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(stmt.toUpperCase().startsWith('ALTER') && /duplicate column name/i.test(msg))) throw e
    }
  }
}
