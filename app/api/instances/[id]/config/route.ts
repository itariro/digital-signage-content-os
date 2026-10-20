import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { eq } from 'drizzle-orm'
import { mutateStore } from '@/lib/store'
import { audit } from '@/lib/audit'
import { resolveActor } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

// Config patches are validated against the FrameStore top-level shape
// (spec §9: instance validates and applies atomically, retains the
// last-known-good doc on failure). Unknown keys and wrong container types
// are rejected before anything is written.
const patchSchema = z.object({
  activeId: z.string().nullable(),
  layouts: z.array(z.object({ id: z.string() }).passthrough()),
  presets: z.array(z.object({ id: z.string() }).passthrough()),
  customFonts: z.array(z.string()),
  schedule: z.record(z.string(), z.unknown()),
  albums: z.array(z.object({ id: z.string() }).passthrough()),
  experiences: z.record(z.string(), z.unknown()),
  notifications: z.array(z.record(z.string(), z.unknown())),
}).partial().strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid config patch' }, { status: 400 })
  }

  const db = getDb()
  const tables = getTables()
  const [doc] = await db.select().from(tables.frameDocuments).where(eq(tables.frameDocuments.identifier, id))
  if (!doc) return NextResponse.json({ error: 'instance not found' }, { status: 404 })

  // Apply through the per-frame serialized mutate path: single writer,
  // normalize repairs shape, persist bumps revision so the instance pulls.
  try {
    await mutateStore((s) => ({ ...s, ...(parsed.data as Partial<import('@/lib/types').FrameStore>) }), id)
  } catch (e: unknown) {
    console.error('config push failed for instance', id, e)
    return NextResponse.json({ error: 'config apply failed' }, { status: 500 })
  }
  await audit(outcome.actor, 'push_config', 'instance', id, { keys: Object.keys(parsed.data ?? {}) })
  return NextResponse.json({ ok: true })
}
