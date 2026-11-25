import { NextResponse } from 'next/server'
import { canvasActor } from '@/lib/canvas/http'
import { ensureCanvasLibrary } from '@/lib/canvas/library'
import { listInstanceCards } from '@/lib/console/service'
import { listCanvasStates } from '@/lib/canvas/state-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response

  const store = await ensureCanvasLibrary()
  const [cards, rows] = await Promise.all([listInstanceCards(), listCanvasStates()])
  const now = Date.now()
  const canvasNames = new Map(store.layouts.map((layout) => [layout.id, layout.name]))

  const frames = cards.map((card) => {
    const row = rows.find((entry) => entry.instanceId === card.id)
    const pending = row?.data.pending
    const active = row?.data.active
    const owner = pending ?? (active && (active.releaseAt === null || active.releaseAt > now) ? active : null)
    return {
      id: card.id,
      name: card.frame?.name ?? card.id,
      lastSeenAt: card.lastSeenAt ? new Date(card.lastSeenAt).toISOString() : null,
      screenWidthMm: card.frame?.screenWidthMm ?? null,
      screenHeightMm: card.frame?.screenHeightMm ?? null,
      inCanvas: owner ? {
        canvasId: owner.canvasId,
        name: canvasNames.get(owner.canvasId) ?? owner.canvasId,
        state: pending ? 'scheduled' as const : 'live' as const,
      } : null,
    }
  })

  return NextResponse.json({ store, frames }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
