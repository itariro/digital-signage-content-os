import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`)
    return NextResponse.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', database: 'disconnected', error: String(error) },
      { status: 503 },
    )
  }
}
