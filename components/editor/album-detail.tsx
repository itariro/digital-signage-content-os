'use client'

import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Album, AlbumItem, Slideshow } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH, PRESENTATIONS } from '@/lib/types'
import { PRESENTATION_META, THEME_META, slideAt } from '@/lib/albums'
import { downscaleImage } from '@/lib/frame-utils'
import { useArtworkSearch, type ArtworkResult } from '@/hooks/use-frame-store'
import { useNow } from '@/hooks/use-now'
import { AlbumSlideshow } from '@/components/frame/album-slideshow'
import { ColorField, Section, Segmented, SelectField, SliderField, ToggleField } from './controls'
import { cn } from '@/lib/utils'

export type AlbumUpdater = (id: string, fn: (album: Album) => Album, persist?: boolean) => void

const MAX_ITEMS = 200
const PREVIEW_W = 120

async function cacheImage(body: { url: string } | { dataUrl: string }) {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Upload failed')
  return json.url as string
}

type AlbumDetailProps = {
  album: Album
  onLayout: boolean
  onBack: () => void
  onUpdate: AlbumUpdater
  onDelete: () => void
  onUseOnLayout: (on: boolean) => void
}

export function AlbumDetail({ album, onLayout, onBack, onUpdate, onDelete, onUseOnLayout }: AlbumDetailProps) {
  const meta = THEME_META[album.theme]
  const show = album.slideshow
  const update = (fn: (a: Album) => Album, persist = true) => onUpdate(album.id, fn, persist)
  const setShow = (patch: Partial<Slideshow>, persist = true) => update((a) => ({ ...a, slideshow: { ...a.slideshow, ...patch } }), persist)
  const commit = () => update((a) => a, true)

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to albums"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <NameField key={album.id} value={album.name} onCommit={(name) => update((a) => ({ ...a, name }))} />
        <meta.icon className="size-4 shrink-0 text-muted-foreground" aria-label={meta.label} />
      </div>

      <div className="flex gap-3 border-b border-border p-4">
        <PreviewStage album={album} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{meta.label}</p>
            <p className="text-xs text-muted-foreground">
              {album.items.length} {album.items.length === 1 ? meta.noun : `${meta.noun}s`} · {PRESENTATION_META[show.presentation].label}
            </p>
          </div>
          <ToggleField label="Show on this layout" checked={onLayout} onChange={onUseOnLayout} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Album changes save instantly. Save the layout to publish which album it plays.
          </p>
        </div>
      </div>

      {meta.searchable ? <ArtworkSearch album={album} onUpdate={update} /> : <PhotoUpload album={album} onUpdate={update} />}

      <ItemsGrid album={album} onUpdate={update} />

      <Section title="Slideshow">
        <SelectField
          label="Presentation"
          value={show.presentation}
          onChange={(v) => setShow({ presentation: v as Slideshow['presentation'] })}
          options={PRESENTATIONS.map((p) => ({ value: p, label: PRESENTATION_META[p].label }))}
        />
        <p className="-mt-1 text-xs text-muted-foreground">{PRESENTATION_META[show.presentation].description}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Transition</span>
          <Segmented
            label="Transition"
            value={show.transition}
            onChange={(transition) => setShow({ transition })}
            className="w-48"
            options={[
              { value: 'fade', label: 'Fade' },
              { value: 'slide', label: 'Slide' },
              { value: 'zoom', label: 'Zoom' },
              { value: 'none', label: 'Cut' },
            ]}
          />
        </div>
        <SliderField
          label="Each slide"
          value={show.interval}
          min={5}
          max={300}
          step={5}
          suffix="s"
          onCommit={commit}
          onChange={(interval) => setShow({ interval }, false)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Order</span>
          <Segmented
            label="Slide order"
            value={show.order}
            onChange={(order) => setShow({ order })}
            className="w-40"
            options={[
              { value: 'sequence', label: 'In order' },
              { value: 'shuffle', label: 'Shuffle' },
            ]}
          />
        </div>
        <ToggleField label="Ken Burns drift" checked={show.kenBurns} onChange={(kenBurns) => setShow({ kenBurns })} />
      </Section>

      {show.presentation !== 'fill' && (
        <Section title="Staging">
          <SliderField
            label="Artwork size"
            value={show.artSize}
            min={40}
            max={100}
            suffix="%"
            onCommit={commit}
            onChange={(artSize) => setShow({ artSize }, false)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Position</span>
            <Segmented
              label="Artwork position"
              value={show.artPosition}
              onChange={(artPosition) => setShow({ artPosition })}
              className="w-44"
              options={[
                { value: 'top', label: 'Top' },
                { value: 'center', label: 'Middle' },
                { value: 'bottom', label: 'Bottom' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Backdrop</span>
            <Segmented
              label="Backdrop"
              value={show.backdrop}
              onChange={(backdrop) => setShow({ backdrop })}
              className="w-40"
              options={[
                { value: 'blur', label: 'Blurred' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </div>
          {show.backdrop === 'solid' && (
            <ColorField label="Wall colour" value={show.backdropColor} onChange={(backdropColor) => setShow({ backdropColor })} />
          )}
        </Section>
      )}

      <div className="p-4">
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete album
        </button>
      </div>
    </div>
  )
}

function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  function commit() {
    const name = draft.trim().slice(0, 80)
    if (!name) setDraft(value)
    else if (name !== value) onCommit(name)
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur()
      }}
      aria-label="Album name"
      className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-foreground outline-none hover:border-border focus-visible:border-primary"
    />
  )
}

function PreviewStage({ album }: { album: Album }) {
  const now = useNow()
  const [offset, setOffset] = useState(0)
  const scale = PREVIEW_W / FRAME_WIDTH
  const time = now?.getTime() ?? 0
  const slide = slideAt(album, time, offset)
  const index = slide ? album.items.indexOf(slide.current) + 1 : 0
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className="relative overflow-hidden rounded-md bg-muted ring-1 ring-border"
        style={{ width: PREVIEW_W, height: FRAME_HEIGHT * scale }}
      >
        {now && (
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}>
            <AlbumSlideshow album={album} time={time} offset={offset} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous slide"
          disabled={!slide}
          onClick={() => setOffset((o) => o - 1)}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
          {slide ? `${index}/${album.items.length}` : '0/0'}
        </span>
        <button
          type="button"
          aria-label="Next slide"
          disabled={!slide}
          onClick={() => setOffset((o) => o + 1)}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

function ArtworkSearch({ album, onUpdate }: { album: Album; onUpdate: (fn: (a: Album) => Album) => void }) {
  const meta = THEME_META[album.theme]
  const [query, setQuery] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const { results, hasMore, isLoading, error } = useArtworkSearch(album.theme, query, page)
  const queryIsJson = advanced && query.trim().startsWith('[')
  const bySource = new Map(album.items.map((i) => [i.sourceUrl, i]))

  async function toggle(result: ArtworkResult) {
    const existing = bySource.get(result.image)
    if (existing) {
      onUpdate((a) => ({ ...a, items: a.items.filter((i) => i.id !== existing.id) }))
      return
    }
    if (album.items.length >= MAX_ITEMS) {
      toast.error(`Albums hold up to ${MAX_ITEMS} items`)
      return
    }
    setPending((p) => new Set(p).add(result.id))
    const image = await cacheImage({ url: result.image }).catch(() => result.image)
    setPending((p) => {
      const next = new Set(p)
      next.delete(result.id)
      return next
    })
    const item: AlbumItem = {
      id: nanoid(8),
      image,
      sourceUrl: result.image,
      title: result.title.slice(0, 200),
      subtitle: result.subtitle.slice(0, 200),
      year: result.year.slice(0, 12),
      genre: result.genre?.slice(0, 120),
      description: result.description?.slice(0, 500),
      director: result.director?.slice(0, 160),
      rating: result.rating?.slice(0, 20),
    }
    onUpdate((a) => (a.items.some((i) => i.sourceUrl === item.sourceUrl) ? a : { ...a, items: [...a.items, item] }))
  }

  const aspect = meta.aspect === 1 ? 'aspect-square' : 'aspect-[2/3]'

  return (
    <Section title={`Add ${meta.noun}s`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Search one item or build a batch</span>
        <button type="button" onClick={() => { setAdvanced((value) => !value); setQuery(''); setPage(1) }} aria-pressed={advanced} className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground">
          Advanced search
        </button>
      </div>
      <div className="relative">
        {!advanced && <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />}
        {advanced ? (
          <textarea value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder='[{"artist":"50 Cent","album":"Get Rich or Die Trying"}]' aria-label="Advanced search JSON" rows={4} className="w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary" />
        ) : (
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder={meta.placeholder} aria-label={meta.placeholder} className="h-9 w-full rounded-md border border-border bg-transparent pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary" />
        )}
        {isLoading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      {advanced && <p className="text-[11px] leading-relaxed text-muted-foreground">Use an array of strings or objects. Objects can contain title, artist, album, actor, director, or author.</p>}
      <div className="flex flex-wrap gap-1.5">
        {meta.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuery(s)
              setPage(1)
            }}
            aria-pressed={query === s}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              query === s ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">Search is unavailable right now. Try again in a moment.</p>}
      {query.trim().length >= 2 && !isLoading && !error && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No artwork found for that search.</p>
      )}
      {results.length > 0 && query.trim().length >= 2 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Search results">
          {results.map((r) => {
            const added = bySource.has(r.image)
            const busy = pending.has(r.id)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r)}
                  disabled={busy}
                  aria-pressed={added}
                  title={`${r.title}${r.year ? ` (${r.year})` : ''}`}
                  className={cn(
                    'group relative block w-full overflow-hidden rounded-md bg-secondary ring-1 transition',
                    aspect,
                    added ? 'ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span className="sr-only">
                    {added ? 'Remove' : 'Add'} {r.title}
                    {r.year ? ` (${r.year})` : ''}
                  </span>
                  {(added || busy) && (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {results.length > 0 && query.trim().length >= 2 && !error && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1 || isLoading}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">Page {page}</span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasMore || isLoading}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Artwork via {meta.source}. Tap to add, tap again to remove.</p>
    </Section>
  )
}

function PhotoUpload({ album, onUpdate }: { album: Album; onUpdate: (fn: (a: Album) => Album) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)

  async function onFiles(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (fileRef.current) fileRef.current.value = ''
    if (!list.length) return
    const room = MAX_ITEMS - album.items.length
    if (room <= 0) {
      toast.error(`Albums hold up to ${MAX_ITEMS} items`)
      return
    }
    setBusy(Math.min(room, list.length))
    for (const file of list.slice(0, room)) {
      try {
        const url = await cacheImage({ dataUrl: await downscaleImage(file) })
        const item: AlbumItem = {
          id: nanoid(8),
          image: url,
          sourceUrl: '',
          title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 200),
          subtitle: '',
          year: new Date(file.lastModified).getFullYear().toString(),
        }
        onUpdate((a) => ({ ...a, items: [...a.items, item] }))
      } catch {
        toast.error(`Could not add ${file.name}`)
      } finally {
        setBusy((b) => b - 1)
      }
    }
  }

  return (
    <Section title="Add photos">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy > 0}
        className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
      >
        {busy > 0 ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
        {busy > 0 ? `Uploading ${busy}…` : 'Choose photos'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
    </Section>
  )
}

function ItemsGrid({ album, onUpdate }: { album: Album; onUpdate: (fn: (a: Album) => Album) => void }) {
  const meta = THEME_META[album.theme]
  const [dragId, setDragId] = useState<string | null>(null)
  const aspect = meta.aspect === 1 ? 'aspect-square' : meta.aspect < 0.6 ? 'aspect-[9/16]' : 'aspect-[2/3]'

  function move(fromId: string, toId: string) {
    if (fromId === toId) return
    onUpdate((a) => {
      const items = [...a.items]
      const from = items.findIndex((i) => i.id === fromId)
      const to = items.findIndex((i) => i.id === toId)
      if (from < 0 || to < 0) return a
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
      return { ...a, items }
    })
  }

  return (
    <Section title={`In this album · ${album.items.length}`}>
      {album.items.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">Nothing here yet — add some {meta.noun}s above.</p>
      ) : (
        <>
          <ul className="grid grid-cols-4 gap-1.5">
            {album.items.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId) move(dragId, item.id)
                }}
                className={cn('group relative cursor-grab overflow-hidden rounded bg-secondary', aspect, dragId === item.id && 'opacity-40')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover" draggable={false} />
                <button
                  type="button"
                  onClick={() => onUpdate((a) => ({ ...a, items: a.items.filter((i) => i.id !== item.id) }))}
                  aria-label={`Remove ${item.title}`}
                  className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Drag to reorder.</p>
        </>
      )}
    </Section>
  )
}
