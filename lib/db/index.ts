import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { framePool?: Pool }

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  return (globalForDb.framePool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }))
}

export function getDb() {
  return drizzle(getPool(), { schema })
}
