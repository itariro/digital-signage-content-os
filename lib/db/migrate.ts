import { getDatabaseMode } from './mode'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export async function runMigrations() {
  if (getDatabaseMode() !== 'sqlite') return
  const { getSqliteRaw } = await import('./sqlite')
  const raw = getSqliteRaw()
  const ddlPath = path.join(process.cwd(), 'drizzle/sqlite/0000_init.sql')
  const ddl = fs.readFileSync(ddlPath, 'utf8')

  // Version tracking: every statement is hashed and recorded once. Re-runs
  // skip applied statements entirely; the duplicate-column tolerance stays
  // for databases created before _migrations existed (statements replay
  // against a schema that already has them).
  raw.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const recorded = new Set((raw.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name))

  const statements = ddl
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.split(/\r?\n/).filter((line) => !line.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean)

  const tx = raw.transaction(() => {
    for (const stmt of statements) {
      const name = crypto.createHash('sha1').update(stmt).digest('hex')
      if (recorded.has(name)) continue
      try {
        raw.exec(stmt)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!(stmt.toUpperCase().startsWith('ALTER') && /duplicate column name/i.test(msg))) throw e
      }
      raw.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now())
    }
  })
  tx()
}
