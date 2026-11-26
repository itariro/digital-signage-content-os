'use client'

import useSWR from 'swr'
import {
  STATUS_POLL_MS,
  canvasProblems,
  type CanvasStatusRow,
} from '@/lib/canvas/problems'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading canvas status…</p>

  const now = data.serverNow
  const groups = groupRows(data.rows)

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No deployed canvases are reporting yet.</p>
  }

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {groups.map((group) => (
        <section key={group.canvasId} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{group.canvasName}</h3>
          <div className="rounded-lg border border-border">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/30 text-muted-foreground hover:bg-muted/30">
                  <TableHead className="px-3 py-2 font-medium">Marker</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Frame</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Last seen</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Delivered</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Rendering</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Clock</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Viewport</TableHead>
                  <TableHead className="px-3 py-2 font-medium">FPS</TableHead>
                  <TableHead className="px-3 py-2 font-medium">Problems</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => {
                  const problems = canvasProblems(row, now, STATUS_POLL_MS)
                  return (
                    <TableRow key={`${row.canvasId}:${row.slotId}`} className="align-top">
                      <TableCell className="px-3 py-2 font-medium text-foreground">{row.marker || 'Unassigned'}</TableCell>
                      <TableCell className="px-3 py-2">
                        <span className="block text-foreground">{(row.frameName ?? row.frameId) || 'Unassigned'}</span>
                        {row.frameId ? <span className="block font-mono text-[11px] text-muted-foreground">{row.frameId}</span> : null}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-muted-foreground">{formatSeen(row.reportedAtMs, now)}</TableCell>
                      <TableCell className="px-3 py-2">{formatNumber(row.revision)}</TableCell>
                      <TableCell className="px-3 py-2">{formatNumber(row.reportedRevision)}</TableCell>
                      <TableCell className="px-3 py-2">{formatClock(row)}</TableCell>
                      <TableCell className="px-3 py-2">{row.viewportW === null || row.viewportH === null ? '—' : `${row.viewportW}×${row.viewportH}`}</TableCell>
                      <TableCell className="px-3 py-2">{formatFps(row.fpsAvg)}</TableCell>
                      <TableCell className="px-3 py-2">{problems.length === 0 ? <span className="text-emerald-600 dark:text-emerald-400">OK</span> : <span className="text-destructive">{problems.join(', ')}</span>}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  )
}
