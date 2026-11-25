'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { mutate as revalidateAll } from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCanvasLibrary } from '@/hooks/use-canvas-library'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import type { Album, CanvasTemplateId } from '@/lib/types'
import { consoleTemplateWriteClient, createCanvasTemplate } from '@/lib/canvas/template-service'
import { AlbumEditor } from './album-editor'
import { TemplatePicker } from './template-picker'

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function AlbumsTab() {
  const { store, createAlbum, updateAlbum, deleteAlbum } = useCanvasLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Album | null>(null)
  const [busy, setBusy] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)
  const templateBusyRef = useRef(false)
  const visibleAlbums = useMemo(() => store.albums.filter((album) => album.theme === 'canvas'), [store.albums])
  const geometry = useMemo(() => resolveGeometry(emptyCanvasConfig()), [])

  const pickTemplate = async (id: CanvasTemplateId) => {
    if (templateBusyRef.current) return
    templateBusyRef.current = true
    setTemplateBusy(true)
    setTemplateError(null)
    try {
      await createCanvasTemplate(id, consoleTemplateWriteClient())
      setTemplateOpen(false)
      await revalidateAll(() => true)
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Could not create the starter show')
    } finally {
      templateBusyRef.current = false
      setTemplateBusy(false)
    }
  }

  useEffect(() => {
    if (!openId) return
    setDraft(visibleAlbums.find((album) => album.id === openId) ?? null)
  }, [openId, visibleAlbums])

  const dirty = useMemo(() => {
    if (!draft) return false
    const saved = store.albums.find((album) => album.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(saved)
  }, [draft, store.albums])

  async function create() {
    setBusy(true)
    try {
      const { id } = await createAlbum(`Canvas scenes ${visibleAlbums.length + 1}`)
      setOpenId(id)
      toast.success('Canvas album created with a sync test scene')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    try {
      await updateAlbum(draft.id, draft)
      toast.success('Album saved to the library')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(album: Album) {
    if (!window.confirm(`Delete "${album.name}"?`)) return
    setBusy(true)
    try {
      await deleteAlbum(album.id)
      if (openId === album.id) {
        setOpenId(null)
        setDraft(null)
      }
      toast.success('Album deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Canvas albums</h2>
          <p className="text-xs text-muted-foreground">Create scenes and shows for canvas layouts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setTemplateOpen(true)}>
            New from template
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void create()} disabled={busy}>
            New album
          </Button>
        </div>
      </div>
      {templateOpen && (
        <TemplatePicker disabled={templateBusy} onPick={(id) => void pickTemplate(id)} onClose={() => setTemplateOpen(false)} />
      )}
      {templateError && <p className="text-xs text-destructive">{templateError}</p>}
      <ul className="flex flex-col gap-2">
        {visibleAlbums.map((album) => (
          <li key={album.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => setOpenId(album.id)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
            >
              {album.name}
            </button>
            <Button type="button" variant="destructive" size="sm" aria-label={`Delete ${album.name}`} onClick={() => void remove(album)}>
              Delete
            </Button>
          </li>
        ))}
        {visibleAlbums.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No canvas albums yet.</li>
        )}
      </ul>
      {draft && (
        <div className="rounded-lg border border-border bg-card">
          <AlbumEditor
            album={draft}
            geometry={geometry}
            dirty={dirty}
            onChange={setDraft}
            onDelete={() => void remove(draft)}
          />
          <div className="border-t border-border p-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>Save album</Button>
          </div>
        </div>
      )}
    </div>
  )
}
