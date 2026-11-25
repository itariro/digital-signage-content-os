'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EditorButton } from '@/components/editor/controls'
import { useCanvasLibrary } from '@/hooks/use-canvas-library'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import type { Album } from '@/lib/types'
import { AlbumEditor } from './album-editor'

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function AlbumsTab() {
  const { store, createAlbum, updateAlbum, deleteAlbum } = useCanvasLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Album | null>(null)
  const [busy, setBusy] = useState(false)
  const visibleAlbums = useMemo(() => store.albums.filter((album) => album.theme === 'canvas'), [store.albums])
  const geometry = useMemo(() => resolveGeometry(emptyCanvasConfig()), [])

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
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Canvas albums</h2>
        <EditorButton type="button" variant="secondary" onClick={() => void create()} disabled={busy}>New album</EditorButton>
      </div>
      <ul className="flex flex-col gap-2">
        {visibleAlbums.map((album) => (
          <li key={album.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
            <button type="button" onClick={() => setOpenId(album.id)} className="min-w-0 flex-1 truncate text-left text-sm">
              {album.name}
            </button>
            <EditorButton type="button" variant="destructive" aria-label={`Delete ${album.name}`} onClick={() => void remove(album)}>Delete</EditorButton>
          </li>
        ))}
        {visibleAlbums.length === 0 && (
          <li className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No canvas albums yet.</li>
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
          <div className="border-t border-border p-2">
            <EditorButton type="button" variant="secondary" onClick={() => void save()} disabled={!dirty || busy}>Save album</EditorButton>
          </div>
        </div>
      )}
    </div>
  )
}
