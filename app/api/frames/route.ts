import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
const { frameDocuments } = getTables() as any
import { readStore } from '@/lib/store'
import type { FrameStore } from '@/lib/types'
import { resolveDisplay, clockParts } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

function validId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

export async function GET() {
  const documents = await getDb().select().from(frameDocuments).orderBy(desc(frameDocuments.updatedAt))
  const now = new Date()
  return NextResponse.json(await Promise.all(documents.map(async (document: any) => {
    const store = document.data as FrameStore
    const display = resolveDisplay(store, clockParts(now))
    return {
      id: document.identifier,
      name: document.name,
      layoutId: display.layout?.id ?? null,
      layoutName: display.layout?.name ?? null,
      layouts: store.layouts.map((layout) => ({ id: layout.id, name: layout.name })),
      resolutionWidth: document.resolutionWidth,
      resolutionHeight: document.resolutionHeight,
      screenWidthMm: document.screenWidthMm,
      screenHeightMm: document.screenHeightMm,
      updatedAt: document.updatedAt,
    }
  })))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || !validId(body.id) || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Frame ID and name are required' }, { status: 400 })
  }
  const db = getDb()
  const now = new Date()
  const identifier = body.id.trim()
  const [existing] = await db.select({ id: frameDocuments.id }).from(frameDocuments).where(eq(frameDocuments.identifier, identifier)).limit(1)
  if (existing) return NextResponse.json({ error: 'Frame ID already exists' }, { status: 409 })
  const homeStore = await readStore()
  if (!homeStore) return NextResponse.json({ error: 'Home frame is not available' }, { status: 503 })
  const data = structuredClone(homeStore)
  data.activeId = null
  data.schedule = { ...data.schedule, enabled: false, rules: [] }
  await db.insert(frameDocuments).values({
    id: nanoid(12), identifier, name: body.name.trim(), data,
    createdAt: now, updatedAt: now, resolutionWidth: Number(body.resolutionWidth) || 1920, resolutionHeight: Number(body.resolutionHeight) || 1080,
    screenWidthMm: Number(body.screenWidthMm) || null, screenHeightMm: Number(body.screenHeightMm) || null,
  })
  return NextResponse.json({ ok: true, id: identifier }, { status: 201 })
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || !validId(body.id)) return NextResponse.json({ error: 'Valid frame ID is required' }, { status: 400 })
  const db = getDb()
  const [document] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, body.id)).limit(1)
  if (!document) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  for (const [key, column] of [['resolutionWidth', 'resolutionWidth'], ['resolutionHeight', 'resolutionHeight'], ['screenWidthMm', 'screenWidthMm'], ['screenHeightMm', 'screenHeightMm']] as const) {
    if (body[key] !== undefined) updates[column] = body[key] === null || body[key] === '' ? null : Math.max(1, Number(body[key]))
  }
  if (body.layoutId !== undefined) {
    if (!document.data) return NextResponse.json({ error: 'Frame data not found' }, { status: 404 })
    const data = structuredClone(document.data as FrameStore)
    data.activeId = typeof body.layoutId === 'string' && data.layouts.some((layout) => layout.id === body.layoutId) ? body.layoutId : null
    updates.data = data
  }
  await db.update(frameDocuments).set(updates).where(eq(frameDocuments.identifier, body.id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !validId(id) || id === 'home') return NextResponse.json({ error: 'The home frame cannot be removed' }, { status: 400 })
  const result = await getDb().delete(frameDocuments).where(eq(frameDocuments.identifier, id))
  return NextResponse.json({ ok: true, deleted: (result as any).changes ?? (result as any).rowCount ?? 0 })
}
