'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Album, AlbumTheme } from '@/lib/types'
import { ALBUM_THEMES } from '@/lib/types'
import { THEME_META } from '@/lib/albums'
import { AlbumDetail, type AlbumUpdater } from './album-detail'
import { cn } from '@/lib/utils'

type AlbumsPanelProps = {
  albums: Album[]
  openId: string | null
  layoutAlbumId: string | null
  onOpen: (id: string | null) => void
  onCreate: (theme: AlbumTheme) => void
  onUpdate: AlbumUpdater
  onDelete: (album: Album) => void
  onUseOnLayout: (id: string | null) => void
}

function Mosaic({ album }: { album: Album }) {
  const Icon = THEME_META[album.theme].icon
  const thumbs = album.items.slice(0, 4)
  if (thumbs.length === 0) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
    )
  }
  return (
    <div className="grid size-14 shrink-0 grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-md bg-border">
      {Array.from({ length: 4 }, (_, i) => thumbs[i % thumbs.length]).map((item, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
      ))}
    </div>
  )
}

export function AlbumsPanel({ albums, openId, layoutAlbumId, onOpen, onCreate, onUpdate, onDelete, onUseOnLayout }: AlbumsPanelProps) {
  const [choosing, setChoosing] = useState(false)
  const open = albums.find((a) => a.id === openId)

  if (open) {
    return (
      <AlbumDetail
        album={open}
        onLayout={layoutAlbumId === open.id}
        onBack={() => onOpen(null)}
        onUpdate={onUpdate}
        onDelete={() => onDelete(open)}
        onUseOnLayout={(on) => onUseOnLayout(on ? open.id : null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Albums</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">Themed slideshows that play behind a layout.</p>
        </div>
        <button
          type="button"
          onClick={() => setChoosing((v) => !v)}
          aria-expanded={choosing}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {choosing ? <X className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          {choosing ? 'Cancel' : 'New album'}
        </button>
      </div>

      {choosing && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Choose a theme</legend>
          <div className="grid grid-cols-2 gap-2">
            {ALBUM_THEMES.map((theme) => {
              const meta = THEME_META[theme]
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => {
                    setChoosing(false)
                    onCreate(theme)
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-md bg-secondary p-2.5 text-left transition-colors hover:bg-secondary/70"
                >
                  <meta.icon className="size-4 text-primary" aria-hidden />
                  <span className="text-sm font-medium text-foreground">{meta.label}</span>
                  <span className="text-[11px] text-muted-foreground">{meta.source}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {albums.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
          No albums yet. Create one to turn the frame into a rotating poster wall, bookshelf or record crate.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {albums.map((album) => {
            const meta = THEME_META[album.theme]
            const live = layoutAlbumId === album.id
            return (
              <li key={album.id}>
                <button
                  type="button"
                  onClick={() => onOpen(album.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-secondary',
                    live ? 'border-primary/60 bg-primary/5' : 'border-border',
                  )}
                >
                  <Mosaic album={album} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{album.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <meta.icon className="size-3.5" aria-hidden />
                      {meta.label} · {album.items.length}
                    </span>
                    {live && <span className="text-[11px] font-medium text-primary">On this layout</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
