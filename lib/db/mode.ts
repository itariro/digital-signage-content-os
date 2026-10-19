export type DatabaseMode = 'sqlite' | 'postgres'

export function getDatabaseMode(): DatabaseMode {
  const mode = process.env.FRAME_MODE?.toLowerCase()
  if (mode === 'instance') return 'sqlite'
  if (mode === 'console') return 'postgres'
  if (process.env.DATABASE_URL) return 'postgres'
  return 'sqlite'
}
