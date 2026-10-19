// Usage: DATABASE_URL=postgres://... FRAME_DB_PATH=/path/to/frame.db npx tsx scripts/migrate-pg-to-sqlite.ts
import { Pool } from 'pg'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL required')
  const dbPath = process.env.FRAME_DB_PATH || './frame.db'
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const pool = new Pool({ connectionString: databaseUrl })
  const { rows } = await pool.query('SELECT identifier, name, data, resolution_width, resolution_height, screen_width_mm, screen_height_mm FROM frame_documents')

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  // ensure schema
  const ddl = fs.readFileSync(path.join(process.cwd(), 'drizzle/sqlite/0000_init.sql'), 'utf8')
  sqlite.exec(ddl)

  const insert = sqlite.prepare(`INSERT OR REPLACE INTO frame_documents (id, identifier, name, data, created_at, updated_at, revision, resolution_width, resolution_height, screen_width_mm, screen_height_mm) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  const now = Date.now()
  for (const r of rows) {
    insert.run(r.identifier, r.identifier, r.name, JSON.stringify(r.data), now, now, 1, r.resolution_width, r.resolution_height, r.screen_width_mm, r.screen_height_mm)
  }
  console.log(`Migrated ${rows.length} frame documents to ${dbPath}`)
  await pool.end()
  sqlite.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
