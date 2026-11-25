'use client'

import useSWR from 'swr'
import {
  STATUS_POLL_MS,
  canvasProblems,
  type CanvasStatusRow,
} from '@/lib/canvas/problems'

type StatusResponse = {
  rows: CanvasStatusRow[]
  serverNow: number
  pollMs: number
}

type CanvasGroup = {
  canvasId: string
  canvasName: string
  rows: CanvasStatusRow[]
}

async function fetchStatus(url: string): Promise<StatusResponse> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (response.status === 401) throw new Error('Sign in as an operator to view canvas status.')
  if (!response.ok) throw new Error(`Status request failed (${response.status}).`)
  return response.json() as Promise<StatusResponse>
}

function formatSeen(reportedAtMs: number | null, nowMs: number): string {
  if (reportedAtMs === null) return 'No report yet'
  const seconds = Math.max(0, Math.round((nowMs - reportedAtMs) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function formatClock(row: CanvasStatusRow): string {
  if (row.clockOffsetMs === null || row.clockUncertaintyMs === null) return 'No sample'
  return `${Math.round(row.clockOffsetMs)} ms / ${Math.round(row.clockUncertaintyMs)} ms / ${row.clockQuality ?? 'unknown'}`
}

function formatNumber(value: number | null): string {
  return value === null ? 'None' : String(value)
}

function formatFps(value: number | null): string {
  return value === null ? 'None' : value.toFixed(1)
}

function groupRows(rows: CanvasStatusRow[]): CanvasGroup[] {
  const groups: CanvasGroup[] = []
  const byCanvas = new Map<string, CanvasGroup>()
  for (const row of rows) {
    let group = byCanvas.get(row.canvasId)
    if (!group) {
      group = { canvasId: row.canvasId, canvasName: row.canvasName, rows: [] }
      byCanvas.set(row.canvasId, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

export function StatusTab({ layoutId }: { layoutId?: string }) {
  const query = layoutId ? `?layoutId=${encodeURIComponent(layoutId)}` : ''
  const { data, error, isLoading } = useSWR<StatusResponse>(
    `/api/canvas/status${query}`,
    fetchStatus,
    { refreshInterval: STATUS_POLL_MS, revalidateOnFocus: true },
  )

  if (error instanceof Error) return <p className="text-sm text-destructive">{error.message}</p>
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading canvas status.</p>

  const now = Date.now()
  const groups = groupRows(data.rows)

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No deployed canvases are reporting yet.</p>
  }

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {groups.map((group) => (
        <section key={group.canvasId} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{group.canvasName}</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-2 py-1">Marker</th>
                  <th scope="col" className="px-2 py-1">Frame</th>
                  <th scope="col" className="px-2 py-1">Last seen</th>
                  <th scope="col" className="px-2 py-1">Delivered</th>
                  <th scope="col" className="px-2 py-1">Rendering</th>
                  <th scope="col" className="px-2 py-1">Clock</th>
                  <th scope="col" className="px-2 py-1">Viewport</th>
                  <th scope="col" className="px-2 py-1">FPS</th>
                  <th scope="col" className="px-2 py-1">Problems</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const problems = canvasProblems(row, now, STATUS_POLL_MS)
                  return (
                    <tr key={`${row.canvasId}:${row.slotId}`} className="border-b border-border/60 align-top">
                      <td className="px-2 py-2 font-semibold">{row.marker || 'Unassigned'}</td>
                      <td className="px-2 py-2">
                        <span className="block">{(row.frameName ?? row.frameId) || 'Unassigned'}</span>
                        {row.frameId ? <span className="block font-mono text-muted-foreground">{row.frameId}</span> : null}
                      </td>
                      <td className="px-2 py-2">{formatSeen(row.reportedAtMs, now)}</td>
                      <td className="px-2 py-2">{formatNumber(row.revision)}</td>
                      <td className="px-2 py-2">{formatNumber(row.reportedRevision)}</td>
                      <td className="px-2 py-2">{formatClock(row)}</td>
                      <td className="px-2 py-2">
                        {row.viewportW === null || row.viewportH === null ? 'None' : `${row.viewportW}x${row.viewportH}`}
                      </td>
                      <td className="px-2 py-2">{formatFps(row.fpsAvg)}</td>
                      <td className="px-2 py-2">{problems.length === 0 ? 'OK' : problems.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
