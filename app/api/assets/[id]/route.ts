import { NextRequest, NextResponse } from 'next/server'
import { deliverAsset, removeAsset } from '@/lib/assets/service'
import { resolveActor } from '@/lib/http-auth'

function failure(outcome: { error: string; status: number }) {
  return NextResponse.json({ error: outcome.error }, { status: outcome.status })
}

// Delivery stays credential-free (frames reference assets in <img>/<video>),
// but the type is sanitized (see lib/assets/service.ts).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const outcome = await deliverAsset(id)
  if (!outcome.ok) return failure(outcome)
  const { buf, contentType, inline, name } = outcome.value
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': inline ? 'inline' : `attachment; filename="${encodeURIComponent(name)}"`,
    },
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await resolveActor(req)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  const outcome = await removeAsset(id)
  if (!outcome.ok) return failure(outcome)
  return NextResponse.json({ ok: true })
}
