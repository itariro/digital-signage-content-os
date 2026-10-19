import { getDatabaseMode } from './mode'

export function getTables() {
  if (getDatabaseMode() === 'sqlite') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./schema.sqlite') as typeof import('./schema.sqlite')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./schema.pg') as typeof import('./schema.pg')
}
