import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDatabaseMode } from '@/lib/db/mode'
import { requireAdmin } from '@/lib/authz'
import { authenticateInstance } from '@/lib/sync/auth'
import { runSyncCycle } from '@/lib/sync/client'

// Body is intentionally strict: endpoint/token/instanceId come from instance
// env only. A caller that could name an endpoint could exfil the queued
// frame store to their own server (SSRF + data leak).
const bodySchema = z.object({ checkpoint: z.string().optional() }).strict()

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export const dynamic = 'force-dynamic'

/**
 * Host allowlist (SYNC_ALLOWED_HOSTS, comma-separated): when set, only listed
 * hosts may be used. Otherwise https is accepted and plain http only on
 * loopback (LAN kiosks in dev).
 */
function isAllowedEndpoint(raw: string | undefined): raw is string {
  if (!raw) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  const allowlist = (process.env.SYNC_ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allowlist.length) return allowlist.includes(url.hostname)
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname)
  return false
}

export async function POST(request: NextRequest) {
  if (getDatabaseMode() !== 'sqlite') {
    return NextResponse.json({ error: 'instance mode required' }, { status: 400 })
  }

  // Kiosks authenticate with their device bearer token; operators with the admin header.
  const gate = requireAdmin(request)
  const device = await authenticateInstance(request)
  if (!device && !gate.ok) {
    const status = gate.reason === 'misconfigured' ? 500 : 401
    return NextResponse.json({ error: gate.reason }, { status })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid body' }, { status: 400 })

  const endpoint = process.env.SYNC_ENDPOINT
  const token = process.env.SYNC_TOKEN
  const instanceId = process.env.INSTANCE_ID
  if (!token || !instanceId) {
    return NextResponse.json({ error: 'sync env not configured' }, { status: 500 })
  }
  if (!isAllowedEndpoint(endpoint)) {
    return NextResponse.json({ error: 'SYNC_ENDPOINT not allowed (https or loopback http required)' }, { status: 400 })
  }

  try {
    const cursor = await runSyncCycle({ endpoint, token, instanceId }, parsed.data.checkpoint)
    return NextResponse.json({ ok: true, cursor: cursor ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
