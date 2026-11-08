'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { mutate as mutateCache } from 'swr'
import { Bell, CalendarClock, GalleryVerticalEnd, Grid2X2, Layers, LayoutTemplate, SlidersHorizontal, Sparkles, Type, X } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import type { Album, AlbumTheme, DisplayDecision, Experiences, FrameSchedule, FrameStore, Layout, Widget } from '@/lib/types'
import { THEME_META } from '@/lib/albums'
import { activeSlide } from '@/components/frame/frame-scene'
import { formatLocalInputValue } from '@/lib/zoned-time'
import { AlbumsPanel } from './albums-panel'
import { ExperiencesPanel } from './experiences-panel'
import { SchedulePanel } from './schedule-panel'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { googleFontHref } from '@/lib/fonts'
import { BUILTIN_COMBOS, createWidget, getDefinition, instantiateGroup, normalizeGroup } from '@/lib/widgets'
import { BUILTIN_STICKERS, createStickerWidget } from '@/lib/text-stickers'
import { useEditor } from '@/hooks/use-editor'
import { useFrameStore, useWeather } from '@/hooks/use-frame-store'
import { useNow } from '@/hooks/use-now'
import { Canvas, type DropPayload, type Overlay } from './canvas'
import { Inspector } from './inspector'
import { LayersPanel } from './layers-panel'
import { LayoutsPanel } from './layouts-panel'
import { FontsPanel } from './fonts-panel'
import { NotificationsPanel } from './notifications-panel'
import { NotificationProvider } from '@/components/notifications/notification-provider'
import { ThemeToggle, TopBar } from './top-bar'
import { PreviewOverlay } from './preview-overlay'
import { LiveDataContext } from './widget-preview'
import { cn } from '@/lib/utils'
import { LibraryPanel } from './library-panel'

const PANELS = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'layouts', label: 'Layouts', icon: LayoutTemplate },
  { id: 'albums', label: 'Albums', icon: GalleryVerticalEnd },
  { id: 'fonts', label: 'Fonts', icon: Type },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'experiences', label: 'Bob', icon: Sparkles },
] as const

type PanelId = 'widgets' | (typeof PANELS)[number]['id']
type DrawerId = PanelId | 'properties'

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function Editor({ initialStore, frameId, singleFrame = false }: { initialStore: FrameStore; frameId?: string; singleFrame?: boolean }) {
  const { store, call } = useFrameStore(initialStore, frameId)
  const editor = useEditor(initialStore.layouts.find((l) => l.id === initialStore.activeId) ?? initialStore.layouts[0])
  const { state, dirty } = editor
  const now = useNow()
  const weather = useWeather(state.settings)
  const [activeDrawer, setActiveDrawer] = useState<DrawerId | null>(null)
  const drawerTriggers = useRef(new Map<DrawerId, HTMLButtonElement>())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDecision, setPreviewDecision] = useState<DisplayDecision | null>(null)
  const [saving, setSaving] = useState(false)
  const [nightPreview, setNightPreview] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null)
  const [albumDraft, setAlbumDraft] = useState<Album | null>(null)
  const albumDraftRef = useRef<Album | null>(null)
  const albumQueue = useRef<Promise<unknown>>(Promise.resolve())
  const clipboard = useRef<Widget[]>([])

  function closeDrawer() {
    if (!activeDrawer) return
    const trigger = drawerTriggers.current.get(activeDrawer)
    setActiveDrawer(null)
    requestAnimationFrame(() => trigger?.focus())
  }

  function showDrawer(id: DrawerId) {
    if (activeDrawer === null) {
      const trigger = document.activeElement
      if (trigger instanceof HTMLButtonElement) drawerTriggers.current.set(id, trigger)
    }
    setActiveDrawer(id)
  }

  function toggleDrawer(id: DrawerId, trigger: HTMLButtonElement) {
    if (activeDrawer === id) {
      closeDrawer()
      return
    }
    drawerTriggers.current.set(id, trigger)
    setActiveDrawer(id)
  }

  const liveAlbums = useMemo(
    () => store.albums.map((a) => (albumDraft?.id === a.id ? albumDraft : a)),
    [store.albums, albumDraft],
  )
  const layoutAlbum = liveAlbums.find((a) => a.id === state.settings.albumId) ?? null

  function updateAlbum(id: string, fn: (album: Album) => Album, persist = true) {
    const base = albumDraftRef.current?.id === id ? albumDraftRef.current : store.albums.find((a) => a.id === id)
    if (!base) return
    const next = fn(base)
    albumDraftRef.current = next
    setAlbumDraft(next)
    if (!persist) return
    const { name, theme, items, slideshow } = next
    albumQueue.current = albumQueue.current
      .then(() => call(`/api/albums/${id}`, 'PUT', { name, theme, items, slideshow }))
      .catch((e) => toast.error(errorMessage(e)))
  }

  async function createAlbum(theme: AlbumTheme) {
    try {
      const { id } = await call('/api/albums', 'POST', { name: THEME_META[theme].label, theme })
      if (id) setOpenAlbumId(id)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deleteAlbum(album: Album) {
    if (!window.confirm(`Delete "${album.name}"? Layouts using it will fall back to the photo library.`)) return
    try {
      await albumQueue.current
      await call(`/api/albums/${album.id}`, 'DELETE')
      setOpenAlbumId(null)
      if (state.settings.albumId === album.id) editor.updateSettings({ albumId: null })
      toast.success('Album deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function attachAlbum(id: string | null) {
    editor.updateSettings({ albumId: id })
    if (id) toast.success('Album added to this layout', { description: 'Save the layout to publish it to the frame.' })
  }

  async function saveSchedule(schedule: FrameSchedule) {
    try {
      await call('/api/schedule', 'PUT', schedule)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function saveExperiences(experiences: Experiences) {
    try {
      await call('/api/experiences', 'PUT', experiences)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const selectedWidgets = state.widgets.filter((w) => state.selected.includes(w.id))

  const liveLayouts = useMemo(
    () =>
      store.layouts.map((l) =>
        l.id === state.layoutId ? { ...l, name: state.name, widgets: state.widgets, settings: state.settings } : l,
      ),
    [store.layouts, state.layoutId, state.name, state.widgets, state.settings],
  )

  function payloadFor() {
    return { name: state.name.trim() || 'Untitled layout', widgets: state.widgets, settings: state.settings }
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await call(`/api/layouts/${state.layoutId}`, 'PUT', payloadFor())
      editor.markSaved()
      toast.success('Layout saved')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function confirmDiscard() {
    return !dirty || window.confirm('You have unsaved changes. Discard them?')
  }

  function openLayout(id: string, source = store.layouts) {
    const layout = source.find((l) => l.id === id)
    if (layout) editor.load(layout)
  }

  async function createLayout(input: { name: string; widgets: Widget[]; settings: Layout['settings'] }, message: string) {
    if (!confirmDiscard()) return
    try {
      const { store: next, id } = await call('/api/layouts', 'POST', input)
      await mutateCache('/api/frames')
      if (id) openLayout(id, next.layouts)
      showDrawer('layouts')
      toast.success(message)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deleteLayout(layout: Layout) {
    if (!window.confirm(`Delete "${layout.name}"? This cannot be undone.`)) return
    try {
      const { store: next } = await call(`/api/layouts/${layout.id}`, 'DELETE')
      await mutateCache('/api/frames')
      if (layout.id === state.layoutId && next.layouts[0]) editor.load(next.layouts[0])
      toast.success('Layout deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function activate(id: string) {
    try {
      await call('/api/active', 'PUT', { id })
      const name = liveLayouts.find((l) => l.id === id)?.name
      toast.success(`${name} is now showing on the frame`, {
        description: id === state.layoutId && dirty ? 'Save to push your latest edits to the frame.' : undefined,
      })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function importLayout(file: File) {
    try {
      const json = JSON.parse(await file.text())
      await createLayout(
        { name: String(json.name ?? file.name.replace(/\.json$/, '')), widgets: json.widgets, settings: json.settings },
        'Layout imported',
      )
    } catch {
      toast.error('That file is not a valid layout export')
    }
  }

  function exportLayout() {
    const blob = new Blob([JSON.stringify({ version: 1, ...payloadFor() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(state.name || 'layout').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function savePreset(widgets: Widget[]) {
    const fallback = widgets.length === 1 ? getDefinition(widgets[0].type).label : 'Widget group'
    const name = window.prompt('Name this widget', `My ${fallback.toLowerCase()}`)
    if (!name?.trim()) return
    try {
      await call('/api/presets', 'POST', { name: name.trim(), widgets: normalizeGroup(widgets) })
      showDrawer('layers')
      toast.success(`Saved "${name.trim()}" to My widgets`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function deletePreset(id: string) {
    try {
      await call('/api/presets', 'DELETE', { id })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function addFont(family: string) {
    try {
      await call('/api/fonts', 'POST', { family })
      toast.success(`${family} added to your typefaces`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function removeFont(family: string) {
    try {
      await call('/api/fonts', 'DELETE', { family })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function addItem(payload: DropPayload, point = { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }) {
    const clamp = { x: Math.min(FRAME_WIDTH, Math.max(0, point.x)), y: Math.min(FRAME_HEIGHT, Math.max(0, point.y)) }
    if (payload.kind === 'widget') {
      editor.addWidgets([createWidget(payload.type, clamp)])
      return
    }
    if (payload.kind === 'sticker') {
      const template = BUILTIN_STICKERS.find((s) => s.id === payload.id)
      if (template) editor.addWidgets([createStickerWidget(template, clamp)])
      return
    }
    const source =
      payload.kind === 'combo'
        ? BUILTIN_COMBOS.find((c) => c.id === payload.id)?.build()
        : store.presets.find((p) => p.id === payload.id)?.widgets
    if (source?.length) editor.addWidgets(instantiateGroup(source, clamp))
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (dirty) save()
      return
    }
    if (e.key === 'Escape') {
      if (previewOpen) setPreviewOpen(false)
      else editor.select([])
      return
    }
    if (previewOpen || isTyping(e.target)) return
    const ids = state.selected
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) editor.redo()
      else editor.undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      editor.redo()
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      editor.select(state.widgets.map((w) => w.id))
    } else if (mod && e.key.toLowerCase() === 'c' && ids.length) {
      clipboard.current = structuredClone(selectedWidgets)
      toast(`Copied ${ids.length} widget${ids.length === 1 ? '' : 's'}`, { description: 'Paste into any layout with ⌘V' })
    } else if (mod && e.key.toLowerCase() === 'x' && ids.length) {
      clipboard.current = structuredClone(selectedWidgets)
      editor.removeWidgets(ids)
    } else if (mod && e.key.toLowerCase() === 'v' && clipboard.current.length) {
      e.preventDefault()
      editor.duplicateWidgets(clipboard.current)
      clipboard.current = clipboard.current.map((w) => ({ ...w, x: w.x + 40, y: w.y + 40 }))
    } else if (mod && e.key.toLowerCase() === 'd' && ids.length) {
      e.preventDefault()
      editor.duplicateWidgets(selectedWidgets)
    } else if (mod && e.key.toLowerCase() === 'g' && ids.length > 1) {
      e.preventDefault()
      if (e.shiftKey) editor.ungroup(ids)
      else editor.group(ids)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
      e.preventDefault()
      editor.removeWidgets(ids)
    } else if (e.key.startsWith('Arrow') && ids.length) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      editor.updateWidgets(
        selectedWidgets.filter((w) => !w.locked).map((w) => w.id),
        (w) => ({ ...w, x: w.x + dx, y: w.y + dy }),
      )
    }
  })

  const dismissDrawerOnEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    closeDrawer()
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!activeDrawer) return
    const handler = (e: KeyboardEvent) => dismissDrawerOnEscape(e)
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [activeDrawer])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (!previewOpen) return
    setPreviewDecision(null)
    let cancelled = false
    ;(async () => {
      try {
        // Ask the frame for ITS wall time: the preview endpoint interprets
        // dateTime as frame-local, so the browser's clock would simulate the
        // wrong instant whenever the editor's zone differs from the frame's.
        const nowRes = await fetch('/api/display/preview?frame=home')
        if (!nowRes.ok) return
        const { frameLocalNow } = (await nowRes.json()) as { frameLocalNow?: string }
        const res = await fetch('/api/display/preview?frame=home', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // notification mode is what live frames publish (Bob speech); the
          // overlay should reflect that winner, not the layout-mode one.
          body: JSON.stringify({ dateTime: frameLocalNow ?? formatLocalInputValue(new Date()), selection: 'notification' }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { decision?: DisplayDecision }
        if (!cancelled) setPreviewDecision(data.decision ?? null)
      } catch {
        if (!cancelled) setPreviewDecision(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [previewOpen])

  const liveData = useMemo(
    () => ({ now, weather, settings: state.settings, slide: activeSlide(layoutAlbum, now) }),
    [now, weather, state.settings, layoutAlbum],
  )
  const drawerTitle =
    activeDrawer === 'widgets'
      ? 'Widgets'
      : activeDrawer === 'properties'
        ? 'Properties'
        : PANELS.find((panel) => panel.id === activeDrawer)?.label ?? 'Editor panel'

  return (
    <LiveDataContext value={liveData}>
      <NotificationProvider>
      {store.customFonts.map((family) => (
        <link key={family} rel="stylesheet" href={googleFontHref(family)} precedence="default" />
      ))}
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
        <TopBar
          singleFrame={singleFrame}
          editor={editor}
          isActive={store.activeId === state.layoutId}
          saving={saving}
          nightPreview={nightPreview}
          onSave={save}
          onPreview={() => setPreviewOpen(true)}
          onToggleNight={() => setNightPreview((value) => !value)}
          onExport={exportLayout}
        />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <nav aria-label="Editor sections" className="editor-panel flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border py-2">
            <button
              type="button"
              aria-label="Widgets"
              aria-expanded={activeDrawer === 'widgets'}
              aria-controls="editor-drawer"
              onClick={(event) => toggleDrawer('widgets', event.currentTarget)}
              className={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', activeDrawer === 'widgets' && 'bg-primary/10 text-primary')}
            >
              <Grid2X2 className="size-[18px]" aria-hidden />
            </button>
            {PANELS.map((panel) => {
              const Icon = panel.icon
              const label = panel.id === 'experiences' ? 'Experiences' : panel.label
              return (
                <button
                  key={panel.id}
                  type="button"
                  aria-label={label}
                  aria-expanded={activeDrawer === panel.id}
                  aria-controls="editor-drawer"
                  onClick={(event) => toggleDrawer(panel.id, event.currentTarget)}
                  className={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', activeDrawer === panel.id && 'bg-primary/10 text-primary')}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </button>
              )
            })}
            <button
              type="button"
              aria-label="Properties"
              aria-expanded={activeDrawer === 'properties'}
              aria-controls="editor-drawer"
              onClick={(event) => toggleDrawer('properties', event.currentTarget)}
              className={cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden', activeDrawer === 'properties' && 'bg-primary/10 text-primary')}
            >
              <SlidersHorizontal className="size-[18px]" aria-hidden />
            </button>
            <div className="mt-auto border-t border-border pt-2"><ThemeToggle /></div>
          </nav>

          <main className="canvas-surface editor-canvas relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <h1 className="sr-only">Lockscreen layout editor</h1>
            <Canvas
              editor={editor}
              weather={weather}
              now={now}
              album={layoutAlbum}
              night={store.schedule.night}
              nightPreview={nightPreview}
              overlay={overlay}
              onOverlayChange={setOverlay}
              onDrop={addItem}
            />
            <section
              id="editor-drawer"
              role="dialog"
              aria-modal="false"
              aria-labelledby="editor-drawer-title"
              className={cn(
                'editor-panel absolute inset-y-0 right-0 z-20 max-w-[calc(100%-1rem)] flex-col overflow-hidden border-l border-border shadow-xl',
                activeDrawer === 'widgets' ? 'w-72' : 'w-80',
                activeDrawer ? 'flex' : 'hidden',
              )}
            >
              <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                <h2 id="editor-drawer-title" className="text-base font-semibold tracking-tight">
                  {drawerTitle}
                </h2>
                <button
                  type="button"
                  aria-label={`Close ${drawerTitle} panel`}
                  onClick={closeDrawer}
                  className="editor-icon-button"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {activeDrawer === 'widgets' && (
                  <LibraryPanel
                    presets={store.presets}
                    onAdd={(payload) => {
                      addItem(payload)
                      closeDrawer()
                    }}
                    onDeletePreset={deletePreset}
                    onClose={closeDrawer}
                  />
                )}
                {activeDrawer === 'layers' && <LayersPanel editor={editor} />}
                {activeDrawer === 'layouts' && (
                  <LayoutsPanel layouts={liveLayouts} activeId={store.activeId} editingId={state.layoutId} onOpen={(id) => id !== state.layoutId && confirmDiscard() && openLayout(id)} onCreate={() => createLayout({ name: 'Untitled layout', widgets: [], settings: state.settings }, 'New layout created')} onDuplicate={(l) => createLayout({ name: `${l.name} copy`.slice(0, 80), widgets: l.widgets, settings: l.settings }, 'Layout duplicated')} onDelete={deleteLayout} onActivate={activate} onImport={importLayout} />
                )}
                {activeDrawer === 'albums' && <AlbumsPanel albums={liveAlbums} openId={openAlbumId} layoutAlbumId={state.settings.albumId} onOpen={setOpenAlbumId} onCreate={createAlbum} onUpdate={updateAlbum} onDelete={deleteAlbum} onUseOnLayout={attachAlbum} />}
                {activeDrawer === 'fonts' && <FontsPanel customFonts={store.customFonts} onAdd={addFont} onRemove={removeFont} />}
                {activeDrawer === 'schedule' && <SchedulePanel schedule={store.schedule} layouts={liveLayouts} activeId={store.activeId} now={now} onSave={saveSchedule} />}
                {activeDrawer === 'experiences' && <ExperiencesPanel experiences={store.experiences} layouts={liveLayouts} onSave={saveExperiences} />}
                {activeDrawer === 'notifications' && <NotificationsPanel />}
                {activeDrawer === 'properties' && (
                  <Inspector
                    editor={editor}
                    customFonts={store.customFonts}
                    albums={liveAlbums}
                    onOpenAlbums={() => {
                      setOpenAlbumId(state.settings.albumId)
                      showDrawer('albums')
                    }}
                    onSavePreset={savePreset}
                  />
                )}
              </div>
            </section>
          </main>

          <aside aria-label="Inspector" className="editor-panel hidden min-h-0 flex-col overflow-hidden border-l border-border lg:flex lg:h-full lg:w-72 lg:shrink-0">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <Inspector
                editor={editor}
                customFonts={store.customFonts}
                albums={liveAlbums}
                onOpenAlbums={() => {
                  setOpenAlbumId(state.settings.albumId)
                  showDrawer('albums')
                }}
                onSavePreset={savePreset}
              />
            </div>
          </aside>
        </div>
      </div>
      {previewOpen && (
        <PreviewOverlay
          name={state.name}
          widgets={state.widgets}
          settings={state.settings}
          weather={weather}
          now={now}
          album={layoutAlbum}
          night={nightPreview ? store.schedule.night : null}
          decision={previewDecision}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      <Toaster theme="dark" position="bottom-center" toastOptions={{ className: 'font-sans' }} />
      </NotificationProvider>
    </LiveDataContext>
  )
}
