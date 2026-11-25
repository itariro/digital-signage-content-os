import { NextResponse } from 'next/server'
import type { CanvasConfig, CanvasDeployment, CanvasState } from '@/lib/types'
import { canvasStateSchema } from '@/lib/canvas/schema'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { defaultScene } from '@/lib/canvas/scenes/registry'
import { deleteCanvasState, putCanvasState } from '@/lib/canvas/state-store'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

function demoConfig(): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 120,
    align: 'center',
    slots: [
      { id: 'a', frameId: 'demo-left', label: 'Left', offset: { x: 0, y: 0 }, scale: 1 },
      { id: 'b', frameId: 'demo-right', label: 'Right', offset: { x: 0, y: 0 }, scale: 1 },
    ],
    background: '#05070d',
    markers: 'always',
    notifications: 'suppress',
    nightMode: 'ignore',
    maxFps: 30,
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.CANVAS_DEMO !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const frameId = frameIdParam(url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const config = demoConfig()
  const geometry = resolveGeometry(config)
  const slotId = url.searchParams.get('slot') === 'b' ? 'b' : 'a'
  const marker = geometry.slots.find((slot) => slot.slotId === slotId)?.marker ?? 1
  const now = Date.now()

  const deployment: CanvasDeployment = {
    canvasId: 'demo-wall',
    name: 'Demo wall',
    revision: 1,
    effectiveAt: now - 1_000,
    releaseAt: null,
    slotId,
    config,
    album: {
      id: 'demo-album',
      name: 'Demo album',
      scenes: [
        defaultScene('marquee', geometry),
        defaultScene('bounce', geometry),
        defaultScene('pong', geometry),
        defaultScene('sync-test', geometry),
      ],
      order: 'sequence',
      crossfadeMs: 800,
    },
  }

  const state: CanvasState = {
    v: 1,
    active: deployment,
    pending: null,
    identify: url.searchParams.get('identify') === '1'
      ? {
          until: now + 60_000,
          canvasName: deployment.name,
          frameId,
          label: config.slots.find((slot) => slot.id === slotId)?.label ?? null,
          marker,
          count: geometry.slots.length,
        }
      : null,
  }

  const parsed = canvasStateSchema.safeParse(state)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid demo state' }, { status: 500 })
  }

  const revision = await putCanvasState(remoteEntityId(frameId), parsed.data)
  return NextResponse.json({ ok: true, revision })
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.CANVAS_DEMO !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  await deleteCanvasState(remoteEntityId(frameId))
  return new NextResponse(null, { status: 204 })
}
