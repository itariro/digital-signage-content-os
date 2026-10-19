import { getDatabaseMode } from './mode'
import * as pgSchema from './schema.pg'
import * as sqliteSchema from './schema.sqlite'

export function getTables() {
  return getDatabaseMode() === 'sqlite' ? sqliteSchema : pgSchema
}
