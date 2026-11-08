'use client'

import { useEffect, useState } from 'react'
import type { AdminAuditEntry } from '@/lib/console/admin-types'

type AuditState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; entries: AdminAuditEntry[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function isAuditEntry(value: unknown): value is AdminAuditEntry {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'actor', 'action', 'targetType', 'targetId', 'createdAt'])) return false
  return (
    typeof value.id === 'string' &&
    typeof value.actor === 'string' &&
    typeof value.action === 'string' &&
    typeof value.targetType === 'string' &&
    typeof value.targetId === 'string' &&
    (value.createdAt === null || (typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))))
  )
}

function isAuditList(value: unknown): value is { entries: AdminAuditEntry[] } {
  return isRecord(value) && hasExactKeys(value, ['entries']) &&
    Array.isArray(value.entries) && value.entries.length <= 20 && value.entries.every(isAuditEntry)
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

export function AuditTab() {
  const [state, setState] = useState<AuditState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    async function loadAudit() {
      setState({ status: 'loading' })
      try {
        const response = await fetch('/api/audit', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
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
        if (!isAuditList(body)) {
          setState({ status: 'error', message: 'Request error: the server returned an invalid audit list.' })
          return
        }
        setState({ status: 'loaded', entries: body.entries })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', message: 'Request error: could not load audit records.' })
      }
    }
    void loadAudit()
    return () => controller.abort()
  }, [])

  return (
    <section aria-label="Audit" className="space-y-3">
      <h3 className="text-sm font-semibold">Recent activity</h3>
      {state.status === 'loading' && <p role="status" className="text-sm">Loading audit records…</p>}
      {state.status === 'unauthorized' && (
        <p role="alert" className="text-sm text-destructive">Your session has expired or you are not authorized to view audit records.</p>
      )}
      {state.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      {state.status === 'loaded' && state.entries.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">No audit records yet.</p>
      )}
      {state.status === 'loaded' && state.entries.length > 0 && (
        <ol className="space-y-3">
          {state.entries.map((entry) => (
            <li key={entry.id} className="space-y-1 rounded-md border border-border p-3">
              <p className="text-sm font-semibold">{entry.action}</p>
              <p className="break-all text-xs">
                {entry.actor} · {entry.targetType}: <span className="font-mono">{entry.targetId}</span>
              </p>
              <time dateTime={entry.createdAt ?? undefined} className="block text-xs text-muted-foreground">
                {formatDate(entry.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
