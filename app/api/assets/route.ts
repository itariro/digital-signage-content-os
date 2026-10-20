import { NextRequest, NextResponse } from 'next/server'
import { ingestAsset, listAssets } from '@/lib/assets/service'
import { resolveActor } from '@/lib/http-auth'

function denied(outcome: { ok: false; reason: string }) {
  return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
}

export async function GET(req: NextRequest) {
  const gate = await resolveActor(req)
  if (!gate.ok) return denied(gate)
  return NextResponse.json({ assets: await listAssets(req.nextUrl.searchParams.get('type')) })
}

export async function POST(req: NextRequest) {
  const gate = await resolveActor(req)
  if (!gate.ok) return denied(gate)
  const body = await req.json().catch(() => null)
  const outcome = await ingestAsset(body)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }
  return NextResponse.json(outcome.value)
}
