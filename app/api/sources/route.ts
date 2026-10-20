import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'

const sourceSchema = z.object({
  frameId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).default('home'),
  kind: z.enum(['calendar', 'rss']),
  name: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()),
})

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  const contentSources = getTables().contentSources
  const rows = await getDb().select().from(contentSources).where(eq(contentSources.frameId, frameId))
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const parsed = sourceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid source' }, { status: 400 })
  const now = new Date()
  const source = { id: nanoid(12), ...parsed.data, createdAt: now, updatedAt: now }
  const contentSources = getTables().contentSources
  await getDb().insert(contentSources).values(source)
  return NextResponse.json(source, { status: 201 })
}
