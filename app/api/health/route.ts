import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
import { getBobBridgeStats } from '@/lib/bob-bridge'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (getDatabaseMode() === 'sqlite') {
      const { getSqliteRaw } = await import('@/lib/db/sqlite')
      getSqliteRaw().prepare('SELECT 1').get()
    } else {
      const { sql } = await import('drizzle-orm')
      await getDb().execute(sql`SELECT 1`)
    }
    return NextResponse.json({ status: 'ok', database: 'connected', bob: getBobBridgeStats() })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', database: 'disconnected', error: String(error) },
      { status: 503 },
    )
  }
}
