'use client'

import { useCallback, useEffect, useState } from 'react'

type FrameSummary = {
  identifier: string
  name: string
  updatedAt: string | null
  revision: number | null
}

type InstanceCard = {
  id: string
  createdAt: string | null
  lastSeenAt: string | null
  frame: FrameSummary | null
}

type EnrollmentResult = {
  instanceId: string
  enrollmentCode: string
  expiresAt: string
}

type InstanceState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; instances: InstanceCard[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function isFrameSummary(value: unknown): value is FrameSummary {
  if (!isRecord(value) || !hasExactKeys(value, ['identifier', 'name', 'updatedAt', 'revision'])) return false
  return (
    typeof value.identifier === 'string' &&
    typeof value.name === 'string' &&
    isNullableDate(value.updatedAt) &&
    (value.revision === null || (typeof value.revision === 'number' && Number.isFinite(value.revision)))
  )
}

function isInstanceCard(value: unknown): value is InstanceCard {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'createdAt', 'lastSeenAt', 'frame'])) return false
  return (
    typeof value.id === 'string' &&
    isNullableDate(value.createdAt) &&
    isNullableDate(value.lastSeenAt) &&
    (value.frame === null || isFrameSummary(value.frame))
  )
}

function isInstanceList(value: unknown): value is { instances: InstanceCard[] } {
  return isRecord(value) && hasExactKeys(value, ['instances']) &&
    Array.isArray(value.instances) && value.instances.every(isInstanceCard)
}

function isEnrollmentResult(value: unknown): value is EnrollmentResult {
  return isRecord(value) &&
    hasExactKeys(value, ['instanceId', 'enrollmentCode', 'expiresAt']) &&
    typeof value.instanceId === 'string' && value.instanceId.length > 0 &&
    typeof value.enrollmentCode === 'string' && value.enrollmentCode.length > 0 &&
    typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt))
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

export function FramesTab() {
  const [state, setState] = useState<InstanceState>({ status: 'loading' })
  const [issued, setIssued] = useState<EnrollmentResult | null>(null)
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<{ status: 'unauthorized' | 'error'; message: string } | null>(null)

  const loadInstances = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' })
    try {
      const response = await fetch('/api/instances', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      if (response.status === 401 || response.status === 403) {
        setState({ status: 'unauthorized' })
        return
      }
      if (!response.ok) {
        setState({ status: 'error', message: `Request error (${response.status}).` })
        return
      }
      const body: unknown = await response.json()
      if (!isInstanceList(body)) {
        setState({ status: 'error', message: 'Request error: the server returned an invalid frame list.' })
        return
      }
      setState({ status: 'loaded', instances: body.instances })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'error', message: 'Request error: could not load frames.' })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadInstances(controller.signal)
    return () => controller.abort()
  }, [loadInstances])

  useEffect(() => {
    if (!issued) return
    const delay = Math.max(0, Date.parse(issued.expiresAt) - Date.now())
    const timeout = window.setTimeout(() => {
      setIssued(null)
      setExpired(true)
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [issued])

  async function issueCode(instanceId?: string) {
    setBusy(true)
    setActionError(null)
    setIssued(null)
    setExpired(false)
    try {
      const url = instanceId
        ? `/api/instances/${encodeURIComponent(instanceId)}/rotate`
        : '/api/instances'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      })
      if (response.status === 401 || response.status === 403) {
        setState({ status: 'unauthorized' })
        setActionError({ status: 'unauthorized', message: 'Your session has expired or you are not authorized.' })
        return
      }
      if (!response.ok) {
        setActionError({ status: 'error', message: `Request error (${response.status}) issuing the enrollment code.` })
        return
      }
      const body: unknown = await response.json()
      if (!isEnrollmentResult(body)) {
        setActionError({ status: 'error', message: 'Request error: the server returned an invalid enrollment result.' })
        return
      }
      if (Date.parse(body.expiresAt) <= Date.now()) {
        setExpired(true)
      } else {
        setIssued(body)
      }
      await loadInstances()
    } catch {
      setActionError({ status: 'error', message: 'Request error: could not issue the enrollment code.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Frames" className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Registered frames</h3>
        {state.status !== 'unauthorized' && (
          <button
            type="button"
            onClick={() => void issueCode()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Issue enrollment code'}
          </button>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError.message}
          </p>
        )}
        {issued && (
          <div className="space-y-2 rounded-md border border-border bg-secondary/40 p-3">
            <h4 className="text-sm font-semibold">One-time enrollment code</h4>
            <p className="break-all font-mono text-sm">{issued.enrollmentCode}</p>
            <p className="text-xs text-muted-foreground">Expires {formatDate(issued.expiresAt)}. This code can be used once.</p>
            <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
              sudo kiosk-ctl enroll {typeof window === 'undefined' ? '' : window.location.origin} {issued.enrollmentCode}
            </pre>
            <p className="text-xs">
              Instance <span className="font-mono">{issued.instanceId}</span>
            </p>
          </div>
        )}
        {expired && (
          <p role="status" className="text-sm text-muted-foreground">
            This enrollment code has expired. Issue a new code to continue.
          </p>
        )}
      </div>

      {state.status === 'loading' && <p role="status" className="text-sm">Loading frames…</p>}
      {state.status === 'unauthorized' && (
        <p role="alert" className="text-sm text-destructive">Your session has expired or you are not authorized to manage frames.</p>
      )}
      {state.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      {state.status === 'loaded' && state.instances.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">No frames have been registered yet.</p>
      )}
      {state.status === 'loaded' && state.instances.length > 0 && (
        <ul className="space-y-3">
          {state.instances.map((instance) => (
            <li key={instance.id} className="space-y-2 rounded-md border border-border p-3">
              <div>
                <h4 className="break-all text-sm font-semibold">{instance.frame?.name || 'Unnamed frame'}</h4>
                <p className="break-all font-mono text-xs text-muted-foreground">{instance.id}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Revision</dt>
                <dd>{instance.frame?.revision ?? 'Not available'}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(instance.createdAt)}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{formatDate(instance.frame?.updatedAt ?? null)}</dd>
                <dt className="text-muted-foreground">Last seen</dt>
                <dd>{formatDate(instance.lastSeenAt)}</dd>
              </dl>
              <button
                type="button"
                onClick={() => void issueCode(instance.id)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Rotate code'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
