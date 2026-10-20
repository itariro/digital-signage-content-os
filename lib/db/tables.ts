import { getDatabaseMode } from './mode'
import * as pgSchema from './schema.pg'
import * as sqliteSchema from './schema.sqlite'

// Dialect boundary (Task 13): both drizzle drivers expose the same query API
// and the two schema modules expose the same field names by construction
// (drizzle-kit mirrors them; persist.pg.test + e2e tests run both sides).
// The runtime value pairs the driver with its own schema module (mode
// dispatch in getDb/getTables), so one canonical shape can describe both.
// The two casts below are the ONLY dialect escape hatches in the codebase;
// call sites get real types and a missing pg column (finding C4) can no
// longer compile silently.
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export type Tables = typeof pgSchema

export function getTables(): Tables {
  return (getDatabaseMode() === 'sqlite' ? sqliteSchema : pgSchema) as unknown as Tables
}

export type { NodePgDatabase as DbType } from 'drizzle-orm/node-postgres'
