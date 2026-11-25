'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import { useCanvasLibrary } from '@/hooks/use-canvas-library'
import type { Layout } from '@/lib/types'
import { ArrangementEditor } from './arrangement-editor'

const SETTINGS = {
  resolution: '1080x1920' as const,
  background: '',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric' as const,
  snap: true,
  gridSize: 20,
  albumId: null,
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function LayoutsTab() {
  const { store, frames, createLayout, updateLayout, deleteLayout, deploy, release, identify } = useCanvasLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Layout | null>(null)
  const [leadSeconds, setLeadSeconds] = useState(15)
  const [identifySeconds, setIdentifySeconds] = useState(20)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!openId) return
    setDraft(store.layouts.find((layout) => layout.id === openId) ?? null)
  }, [openId, store.layouts])

  const dirty = useMemo(() => {
    if (!draft) return false
    const saved = store.layouts.find((layout) => layout.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(saved)
  }, [draft, store.layouts])

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(message)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    await run(async () => {
      const { id } = await createLayout(`Canvas ${store.layouts.length + 1}`, emptyCanvasConfig())
      setOpenId(id)
    }, 'Canvas layout created')
  }

  async function save() {
    if (!draft) return
    await run(() => updateLayout(draft.id, draft), 'Layout saved to the library')
  }

  async function remove(layout: Layout) {
    if (!window.confirm(`Delete "${layout.name}"? Release it first if it is live.`)) return
    await run(async () => {
      await deleteLayout(layout.id)
      if (openId === layout.id) {
        setOpenId(null)
        setDraft(null)
      }
    }, 'Layout deleted')
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Canvas layouts</h2>
          <p className="text-xs text-muted-foreground">Manage wall layouts and deployments.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void create()} disabled={busy}>
          New layout
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {store.layouts.filter((layout) => layout.kind === 'canvas').map((layout) => {
          const users = frames.filter((frame) => frame.inCanvas?.canvasId === layout.id)
          const scheduled = users.some((frame) => frame.inCanvas?.state === 'scheduled')
          const live = users.some((frame) => frame.inCanvas?.state === 'live')
          return (
            <li key={layout.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(layout.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
                >
                  {layout.name}
                </button>
                <Button type="button" variant="destructive" size="sm" aria-label={`Delete ${layout.name}`} onClick={() => void remove(layout)}>
                  Delete
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {scheduled ? 'Scheduled' : live ? 'Live' : 'Draft'} · {users.length} frame{users.length === 1 ? '' : 's'}
              </p>
              {openId === layout.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>Save</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void run(() => deploy(layout.id, { leadMs: leadSeconds * 1000 }), 'Canvas scheduled')} disabled={dirty || busy}>Deploy</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void run(() => release(layout.id), 'Canvas released')} disabled={dirty || busy}>Release</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void run(() => identify(layout.id, identifySeconds), 'Identification started')} disabled={dirty || busy}>Identify</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void run(() => identify(layout.id, 0), 'Identification cleared')} disabled={dirty || busy}>Clear markers</Button>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Lead
                    <input aria-label="Lead seconds" type="number" min={0} max={600} value={leadSeconds} onChange={(e) => setLeadSeconds(Number(e.target.value))} className="h-8 w-14 rounded-md border border-input bg-background px-2 text-xs" />
                    s
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Identify
                    <input aria-label="Identify seconds" type="number" min={0} max={120} value={identifySeconds} onChange={(e) => setIdentifySeconds(Number(e.target.value))} className="h-8 w-14 rounded-md border border-input bg-background px-2 text-xs" />
                    s
                  </label>
                </div>
              )}
            </li>
          )
        })}
        {store.layouts.filter((layout) => layout.kind === 'canvas').length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No canvas layouts yet. Create one to start a wall.
          </li>
        )}
      </ul>

      {draft && (
        <div className="rounded-lg border border-border bg-card">
          <ArrangementEditor
            layout={draft}
            store={store}
            frames={frames}
            dirty={dirty}
            onChange={setDraft}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        New layouts use the default canvas settings. {SETTINGS.resolution} is the default size.
      </p>
    </div>
  )
}
