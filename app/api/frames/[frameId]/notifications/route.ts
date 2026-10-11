import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { mutateStore } from '@/lib/store'
import { BOB_EVENT_KEY_PREFIX, normalizeFrameNotifications } from '@/lib/notifications'
import type { FrameNotification } from '@/lib/types'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function POST(request: Request, { params }: { params: Promise<{ frameId: string }> }) {
  const { frameId } = await params
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  let body: Partial<FrameNotification>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) {
    return NextResponse.json({ error: 'Title is required and must be 160 characters or fewer' }, { status: 400 })
  }
  const variants: FrameNotification['variant'][] = ['info', 'success', 'warning', 'error', 'reminder']
  if (!body.variant || !variants.includes(body.variant)) return NextResponse.json({ error: 'Invalid notification variant' }, { status: 400 })
  if (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 600)) return NextResponse.json({ error: 'Message must be 600 characters or fewer' }, { status: 400 })
  // The Bob bridge owns the `bob:` key space (it replaces its card by eventKey
  // and Bob cards out-rank normal ones). Reject client keys that would collide.
  if (typeof body.eventKey === 'string' && body.eventKey.startsWith(BOB_EVENT_KEY_PREFIX)) {
    return NextResponse.json({ error: `eventKey prefix "${BOB_EVENT_KEY_PREFIX}" is reserved` }, { status: 400 })
  }
  const durationMs = typeof body.durationMs === 'number' && Number.isFinite(body.durationMs) ? Math.max(1000, Math.min(body.durationMs, 120000)) : 6000
  const notification: FrameNotification = {
    id: nanoid(12),
    title: body.title.trim(),
    message: body.message?.trim() || undefined,
    variant: body.variant,
    durationMs,
    createdAt: new Date().toISOString(),
    eventKey: typeof body.eventKey === 'string' ? body.eventKey.slice(0, 120) : undefined,
    actionUrl: typeof body.actionUrl === 'string' ? body.actionUrl.slice(0, 500) : undefined,
  }

  try {
    await mutateStore((store) => ({ ...store, notifications: normalizeFrameNotifications([notification, ...(store.notifications ?? [])]).slice(0, 20) }), frameId)
    return NextResponse.json({ ok: true, notification }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ frameId: string }> }) {
  const { frameId } = await params
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Notification id is required' }, { status: 400 })
  await mutateStore((store) => ({ ...store, notifications: (store.notifications ?? []).filter((item) => item.id !== id) }), frameId)
  return NextResponse.json({ ok: true })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}
