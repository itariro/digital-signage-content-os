'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdminConflict } from '@/lib/console/admin-types'
import { EditorButton, Section } from '../controls'

type ConflictState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; conflicts: AdminConflict[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function isConflict(value: unknown): value is AdminConflict {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'instanceId',
      'entityType',
      'entityId',
      'localRevision',
      'remoteRevision',
      'status',
      'createdAt',
    ])
  ) return false

  return (
    typeof value.id === 'string' &&
    typeof value.instanceId === 'string' &&
    typeof value.entityType === 'string' &&
    typeof value.entityId === 'string' &&
    typeof value.localRevision === 'number' &&
    Number.isFinite(value.localRevision) &&
    typeof value.remoteRevision === 'number' &&
    Number.isFinite(value.remoteRevision) &&
    (value.status === 'open' || value.status === 'rejected') &&
    (value.createdAt === null || (typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))))
  )
}

function isConflictList(value: unknown): value is { conflicts: AdminConflict[] } {
  return isRecord(value) && hasExactKeys(value, ['conflicts']) &&
    Array.isArray(value.conflicts) && value.conflicts.every(isConflict)
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

export function ConflictsTab() {
  const [state, setState] = useState<ConflictState>({ status: 'loading' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null)

  const loadConflicts = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const response = await fetch('/api/sync/conflicts', {
        cache: 'no-store',
        credentials: 'same-origin',
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
      if (!isConflictList(body)) {
        setState({ status: 'error', message: 'Request error: the server returned an invalid conflict list.' })
        return
      }
      setState({ status: 'loaded', conflicts: body.conflicts })
    } catch {
      setState({ status: 'error', message: 'Request error: could not load conflicts.' })
    }
  }, [])

  useEffect(() => {
    void loadConflicts()
  }, [loadConflicts])

  async function resolveConflict(conflict: AdminConflict, resolution: 'local' | 'remote' | 'discard') {
    setBusyId(conflict.id)
    setActionError(null)
    try {
      const formData = new FormData()
      formData.set('resolution', resolution)
      const response = await fetch(`/api/sync/conflicts/${encodeURIComponent(conflict.id)}/resolve`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      if (response.status === 401 || response.status === 403) {
        setState({ status: 'unauthorized' })
        return
      }
      if (!response.ok) {
        setActionError({ id: conflict.id, message: `Request error (${response.status}) resolving this conflict.` })
        return
      }
      const body: unknown = await response.json()
      if (!isRecord(body) || !hasExactKeys(body, ['ok']) || body.ok !== true) {
        setActionError({ id: conflict.id, message: 'Request error: the server returned an invalid result.' })
        return
      }
      await loadConflicts()
    } catch {
      setActionError({ id: conflict.id, message: 'Request error: could not resolve this conflict.' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section aria-label="Conflicts" className="space-y-3">
      <Section title="Open and rejected conflicts">{null}</Section>
      {state.status === 'loading' && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Loading conflicts…</p>
      )}
      {state.status === 'unauthorized' && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Your session has expired or you are not authorized to view conflicts.
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === 'loaded' && state.conflicts.length === 0 && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          No open or rejected conflicts.
        </p>
      )}
      {state.status === 'loaded' && state.conflicts.length > 0 && (
        <ul className="space-y-3">
          {state.conflicts.map((conflict) => (
            <li key={conflict.id} className="space-y-3 rounded-lg border border-border bg-card p-3">
              <div>
                <p className="mb-1 inline-flex rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {conflict.status}
                </p>
                <h4 className="text-sm font-semibold">{conflict.entityType}</h4>
                <p className="break-all font-mono text-xs">{conflict.entityId}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Frame</dt>
                <dd className="break-all font-mono">{conflict.instanceId}</dd>
                <dt className="text-muted-foreground">Revisions</dt>
                <dd>{conflict.localRevision} local / {conflict.remoteRevision} remote</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(conflict.createdAt)}</dd>
              </dl>
              {state.status === 'loaded' && (
                <div className="flex flex-wrap gap-2">
                  {conflict.status === 'open' ? (
                    <>
                      <EditorButton
                        type="button"
                        onClick={() => void resolveConflict(conflict, 'remote')}
                        disabled={busyId !== null}
                        variant="secondary"
                        className="text-xs"
                      >
                        {busyId === conflict.id ? 'Working…' : 'Use remote'}
                      </EditorButton>
                      <EditorButton
                        type="button"
                        onClick={() => void resolveConflict(conflict, 'local')}
                        disabled={busyId !== null}
                        variant="secondary"
                        className="text-xs"
                      >
                        {busyId === conflict.id ? 'Working…' : 'Use local'}
                      </EditorButton>
                    </>
                  ) : (
                    <EditorButton
                      type="button"
                      onClick={() => void resolveConflict(conflict, 'discard')}
                      disabled={busyId !== null}
                      variant="destructive"
                      className="text-xs"
                    >
                      {busyId === conflict.id ? 'Working…' : 'Discard'}
                    </EditorButton>
                  )}
                  {actionError?.id === conflict.id && (
                    <p role="alert" className="w-full rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      {actionError.message}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
