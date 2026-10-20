import { getDatabaseMode } from './mode'
import fs from 'node:fs'
import path from 'node:path'

export async function runMigrations() {
  if (getDatabaseMode() !== 'sqlite') return
  const { getSqliteRaw } = await import('./sqlite')
  const db = getSqliteRaw()
  const ddlPath = path.join(process.cwd(), 'drizzle/sqlite/0000_init.sql')
  const ddl = fs.readFileSync(ddlPath, 'utf8')
  db.exec(ddl)
}
