'use client'

import useSWR from 'swr'
import { ExternalLink, Monitor } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((response) => response.json())

type FrameSummary = {
  id: string
  name: string
  layoutId: string | null
  layoutName: string | null
}

export function FrameSwitcher() {
  const { data: frames = [], isLoading } = useSWR<FrameSummary[]>('/api/frames', fetcher, { refreshInterval: 30_000 })

  return (
    <details className="relative shrink-0">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Monitor className="size-3.5 text-primary" aria-hidden />
        <span className="hidden sm:inline">Frames</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{isLoading ? '…' : frames.length}</span>
      </summary>
      <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
        <div className="border-b border-border px-2 pb-2">
          <p className="text-sm font-semibold">Your frames</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Open a frame to see its published layout.</p>
        </div>
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {!isLoading && frames.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">No frames found yet.</p>}
          {frames.map((frame) => (
            <a
              key={frame.id}
              href={`/frame/${encodeURIComponent(frame.id)}`}
              className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Monitor className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{frame.name}</span>
                  <code className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{frame.id}</code>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {frame.layoutName ? `Showing ${frame.layoutName}` : 'No layout published'}
                </span>
              </span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </a>
          ))}
        </div>
        <div className="mt-2 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">
          Frame IDs are the values used in <code className="text-foreground">/frame/&lt;id&gt;</code>.
        </div>
      </div>
    </details>
  )
}
