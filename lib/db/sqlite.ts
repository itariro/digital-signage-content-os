import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.sqlite'
import path from 'node:path'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
const DB_PATH = process.env.FRAME_DB_PATH || path.join(DATA_DIR, 'frame.db')

let _db: ReturnType<typeof drizzle> | null = null

export function getSqliteDb() {
  if (_db) return _db
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}

export function getSqlitePath() { return DB_PATH }

export function resetSqliteDb() { _db = null }
