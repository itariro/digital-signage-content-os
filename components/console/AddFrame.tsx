'use client'

import { useState } from 'react'

interface Issued { instanceId: string; enrollmentCode: string; expiresAt: string }

// The console never displays the device token; the frame pulls it with this
// one-time code (spec §3.1). Expiry is enforced server-side; the countdown is
// advisory.
export default function AddFrame({ rotateBase }: { rotateBase?: string } = {}) {
  const [issued, setIssued] = useState<Issued | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function issue(rotateId?: string) {
    setBusy(true); setError(null)
    try {
      const url = rotateId ? `/api/instances/${rotateId}/rotate` : '/api/instances'
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' })
      if (!res.ok) { setError(`failed (${res.status})`); return }
      const body = await res.json()
      setIssued({ instanceId: body.instanceId, enrollmentCode: body.enrollmentCode, expiresAt: body.expiresAt })
    } catch { setError('network error') } finally { setBusy(false) }
  }

  const command = issued ? `sudo kiosk-ctl enroll ${typeof window !== 'undefined' ? window.location.origin : ''} ${issued.enrollmentCode}` : ''

  return (
    <section className="rounded border p-3 space-y-2">
      <h2 className="text-sm font-semibold">Add a frame</h2>
      {issued ? (
        <div className="space-y-2 text-xs">
          <p className="font-mono break-all">{issued.enrollmentCode}</p>
          <p className="text-muted-foreground">Expires {new Date(issued.expiresAt).toLocaleTimeString()}. One-time use.</p>
          <pre className="rounded bg-muted p-2 overflow-x-auto">{command}</pre>
          <p className="text-muted-foreground">Instance <span className="font-mono">{issued.instanceId}</span></p>
          <button onClick={() => issue(issued.instanceId)} disabled={busy} className="rounded border px-2 py-1 hover:bg-muted">Reissue code (rotate)</button>
        </div>
      ) : (
        <button onClick={() => issue()} disabled={busy} className="rounded border px-2 py-1 hover:bg-muted">{busy ? 'Working…' : 'Issue enrollment code'}</button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  )
}
