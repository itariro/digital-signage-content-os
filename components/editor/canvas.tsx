'use client'

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Grid3x3, Lock, MoonStar, Scan } from 'lucide-react'
import type { NightMode, WeatherData, Widget } from '@/lib/types'
import { Segmented } from './controls'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { getDefinition } from '@/lib/widgets'
import type { EditorApi } from '@/hooks/use-editor'
import { FrameScene, surfaceStyle } from '@/components/frame/frame-scene'
import { cn } from '@/lib/utils'

export type DropPayload = { kind: 'widget'; type: Widget['type'] } | { kind: 'preset'; id: string } | { kind: 'combo'; id: string }

export const DRAG_MIME = 'application/x-frame-item'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_POS: Record<Handle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  n: 'left-1/2 top-0 cursor-ns-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  e: 'left-full top-1/2 cursor-ew-resize',
  se: 'left-full top-full cursor-nwse-resize',
  s: 'left-1/2 top-full cursor-ns-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  w: 'left-0 top-1/2 cursor-ew-resize',
}

type Rect = { x: number; y: number; w: number; h: number }
type Gesture = {
  mode: 'move' | 'resize'
  handle?: Handle
  startX: number
  startY: number
  ids: string[]
  origins: Map<string, Rect>
  started: boolean
}

const SNAP_THRESHOLD = 14

export function useFitScale(ref: React.RefObject<HTMLDivElement | null>, reservedHeight = 48) {
  const [scale, setScale] = useState(0.3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      const s = Math.min((width - 48) / FRAME_WIDTH, (height - reservedHeight) / FRAME_HEIGHT)
      setScale(Math.max(0.12, Math.min(1, s)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, reservedHeight])
  return scale
}

type CanvasProps = {
  editor: EditorApi
  weather: WeatherData | null
  now: Date | null
  night: NightMode
  nightPreview: boolean
  onToggleNight: () => void
  onDrop: (payload: DropPayload, point: { x: number; y: number }) => void
}

type Overlay = 'none' | 'thirds' | 'safe'
const SAFE_MARGIN = 72

export function Canvas({ editor, weather, now, night, nightPreview, onToggleNight, onDrop }: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const scale = useFitScale(wrapRef, 140)
  const [overlay, setOverlay] = useState<Overlay>('none')
  const gesture = useRef<Gesture | null>(null)
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false })
  const [dragging, setDragging] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  const { widgets, selected, settings } = editor.state
  const selectedSet = new Set(selected)
  const single = selected.length === 1 ? widgets.find((w) => w.id === selected[0]) : undefined

  function groupIds(widget: Widget) {
    if (!widget.groupId) return [widget.id]
    return widgets.filter((w) => w.groupId === widget.groupId).map((w) => w.id)
  }

  function beginGesture(e: ReactPointerEvent, mode: Gesture['mode'], ids: string[], handle?: Handle) {
    const origins = new Map<string, Rect>()
    widgets.forEach((w) => {
      if (ids.includes(w.id) && !w.locked) origins.set(w.id, { x: w.x, y: w.y, w: w.w, h: w.h })
    })
    if (origins.size === 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    gesture.current = { mode, handle, startX: e.clientX, startY: e.clientY, ids: [...origins.keys()], origins, started: false }
  }

  function onWidgetPointerDown(e: ReactPointerEvent, widget: Widget) {
    if (e.button !== 0) return
    e.stopPropagation()
    const ids = groupIds(widget)
    let next: string[]
    if (e.shiftKey || e.metaKey) {
      const allSelected = ids.every((id) => selectedSet.has(id))
      next = allSelected ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]
    } else {
      next = selectedSet.has(widget.id) ? selected : ids
    }
    editor.select(next)
    if (next.includes(widget.id)) beginGesture(e, 'move', next)
  }

  function onHandlePointerDown(e: ReactPointerEvent, handle: Handle) {
    if (!single) return
    e.stopPropagation()
    beginGesture(e, 'resize', [single.id], handle)
  }

  function snapValue(v: number) {
    return settings.snap ? Math.round(v / settings.gridSize) * settings.gridSize : Math.round(v)
  }

  function onPointerMove(e: ReactPointerEvent) {
    const g = gesture.current
    if (!g) return
    const dx = (e.clientX - g.startX) / scale
    const dy = (e.clientY - g.startY) / scale
    if (!g.started) {
      if (Math.hypot(dx, dy) * scale < 3) return
      g.started = true
      editor.checkpoint()
      setDragging(true)
    }

    if (g.mode === 'move') {
      const rects = [...g.origins.values()]
      const minX = Math.min(...rects.map((r) => r.x))
      const minY = Math.min(...rects.map((r) => r.y))
      const bw = Math.max(...rects.map((r) => r.x + r.w)) - minX
      const bh = Math.max(...rects.map((r) => r.y + r.h)) - minY
      let nx = e.altKey ? minX + dx : snapValue(minX + dx)
      let ny = e.altKey ? minY + dy : snapValue(minY + dy)
      const centerV = Math.abs(nx + bw / 2 - FRAME_WIDTH / 2) < SNAP_THRESHOLD
      const centerH = Math.abs(ny + bh / 2 - FRAME_HEIGHT / 2) < SNAP_THRESHOLD
      if (centerV) nx = Math.round(FRAME_WIDTH / 2 - bw / 2)
      if (centerH) ny = Math.round(FRAME_HEIGHT / 2 - bh / 2)
      setGuides({ v: centerV, h: centerH })
      const ox = nx - minX
      const oy = ny - minY
      editor.updateWidgets(
        g.ids,
        (w) => {
          const o = g.origins.get(w.id)
          return o ? { ...w, x: Math.round(o.x + ox), y: Math.round(o.y + oy) } : w
        },
        false,
      )
      return
    }

    const id = g.ids[0]
    const o = g.origins.get(id)
    const widget = widgets.find((w) => w.id === id)
    if (!o || !widget || !g.handle) return
    const def = getDefinition(widget.type)
    const h = g.handle
    let { x, y, w, h: height } = o
    if (h.includes('e')) w = o.w + dx
    if (h.includes('w')) w = o.w - dx
    if (h.includes('s')) height = o.h + dy
    if (h.includes('n')) height = o.h - dy
    const keepRatio = def.lockAspect || e.shiftKey
    if (keepRatio) {
      const ratio = o.w / o.h
      if (h === 'n' || h === 's') w = height * ratio
      else if (h === 'e' || h === 'w') height = w / ratio
      else if (Math.abs(w - o.w) / o.w > Math.abs(height - o.h) / o.h) height = w / ratio
      else w = height * ratio
    }
    if (!keepRatio) {
      w = snapValue(w)
      height = snapValue(height)
    }
    w = Math.max(def.minSize.w, Math.round(w))
    height = Math.max(def.minSize.h, Math.round(height))
    if (h.includes('w')) x = o.x + o.w - w
    if (h.includes('n')) y = o.y + o.h - height
    if (keepRatio && (h === 'n' || h === 's')) x = Math.round(o.x + (o.w - w) / 2)
    if (keepRatio && (h === 'e' || h === 'w')) y = Math.round(o.y + (o.h - height) / 2)
    editor.updateWidgets([id], (wd) => ({ ...wd, x, y, w, h: height }), false)
  }

  function onPointerUp() {
    gesture.current = null
    setDragging(false)
    setGuides({ v: false, h: false })
  }

  function pointFromEvent(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  const selectionBox = (() => {
    const list = widgets.filter((w) => selectedSet.has(w.id))
    if (list.length < 2) return null
    const minX = Math.min(...list.map((w) => w.x))
    const minY = Math.min(...list.map((w) => w.y))
    return {
      x: minX,
      y: minY,
      w: Math.max(...list.map((w) => w.x + w.w)) - minX,
      h: Math.max(...list.map((w) => w.y + w.h)) - minY,
    }
  })()

  const line = 2 / scale
  const handleSize = 12 / scale
  const [resW, resH] = settings.resolution.split('x')

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative flex h-full min-h-[560px] w-full items-center justify-center overflow-hidden transition-colors',
        dropActive && 'bg-primary/5',
      )}
      onPointerDown={() => editor.select([])}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropActive(true)
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        setDropActive(false)
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (!raw) return
        e.preventDefault()
        try {
          onDrop(JSON.parse(raw) as DropPayload, pointFromEvent(e.clientX, e.clientY))
        } catch {
          // ignore malformed drag payloads from outside the editor
        }
      }}
    >
      <div className="relative">
        <div
          ref={frameRef}
          className="relative overflow-hidden rounded-[18px] shadow-2xl ring-1 ring-border"
          style={{ boxShadow: '0 0 0 10px var(--bezel), 0 30px 80px -20px rgba(0,0,0,0.6)' }}
        >
          <FrameScene
            widgets={widgets}
            settings={settings}
            weather={weather}
            now={now}
            scale={scale}
            night={nightPreview ? night : null}
            renderWidget={(widget, body) => {
              const isSelected = selectedSet.has(widget.id)
              return (
                <div
                  key={widget.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${getDefinition(widget.type).label} widget`}
                  aria-pressed={isSelected}
                  className={cn('group/widget touch-none select-none', widget.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
                  style={{ ...surfaceStyle(widget), overflow: 'visible', opacity: widget.hidden ? 0.25 : widget.style.opacity / 100 }}
                  onPointerDown={(e) => onWidgetPointerDown(e, widget)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <div className="h-full w-full overflow-hidden" style={{ borderRadius: widget.style.radius }}>
                    {body}
                  </div>
                  <div
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-0 transition-opacity',
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover/widget:opacity-100',
                    )}
                    style={{
                      outline: `${line}px ${isSelected ? 'solid' : 'dashed'} var(--primary)`,
                      outlineOffset: line * 2,
                      borderRadius: Math.min(widget.style.radius, 40),
                    }}
                  />
                  {widget.locked && isSelected && (
                    <span className="pointer-events-none absolute right-0 top-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground" style={{ width: 36 / scale * 0.6, height: 36 / scale * 0.6, transform: 'translate(40%, -40%)' }}>
                      <Lock style={{ width: '50%', height: '50%' }} aria-hidden />
                    </span>
                  )}
                </div>
              )
            }}
          >
            {selectionBox && (
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: selectionBox.x,
                  top: selectionBox.y,
                  width: selectionBox.w,
                  height: selectionBox.h,
                  outline: `${line}px dashed var(--primary)`,
                  outlineOffset: line * 6,
                }}
              />
            )}
            {single && !single.locked && (
              <div className="pointer-events-none absolute" style={{ left: single.x, top: single.y, width: single.w, height: single.h }}>
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    aria-hidden
                    className={cn('pointer-events-auto absolute touch-none rounded-full border-primary bg-background', HANDLE_POS[h])}
                    style={{
                      width: handleSize,
                      height: handleSize,
                      borderWidth: line,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onPointerDown={(e) => onHandlePointerDown(e, h)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                ))}
              </div>
            )}
            {dragging && settings.snap && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage: `linear-gradient(var(--primary) ${1 / scale}px, transparent 0), linear-gradient(90deg, var(--primary) ${1 / scale}px, transparent 0)`,
                  backgroundSize: `${settings.gridSize * 3}px ${settings.gridSize * 3}px`,
                }}
              />
            )}
            {overlay === 'thirds' && (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {[1, 2].map((i) => (
                  <div key={`v${i}`} className="absolute top-0 h-full bg-foreground/50" style={{ left: (FRAME_WIDTH / 3) * i, width: line / 2 }} />
                ))}
                {[1, 2].map((i) => (
                  <div key={`h${i}`} className="absolute left-0 w-full bg-foreground/50" style={{ top: (FRAME_HEIGHT / 3) * i, height: line / 2 }} />
                ))}
              </div>
            )}
            {overlay === 'safe' && (
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  inset: SAFE_MARGIN,
                  outline: `${line}px dashed color-mix(in srgb, var(--accent) 80%, transparent)`,
                  boxShadow: `0 0 0 ${SAFE_MARGIN}px color-mix(in srgb, var(--accent) 12%, transparent)`,
                }}
              />
            )}
            {guides.v && <div aria-hidden className="pointer-events-none absolute top-0 h-full bg-primary" style={{ left: FRAME_WIDTH / 2 - line / 2, width: line }} />}
            {guides.h && <div aria-hidden className="pointer-events-none absolute left-0 w-full bg-primary" style={{ top: FRAME_HEIGHT / 2 - line / 2, height: line }} />}
          </FrameScene>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Segmented
              label="Composition guides"
              value={overlay}
              onChange={setOverlay}
              options={[
                { value: 'none', label: 'No guides' },
                { value: 'thirds', label: <><Grid3x3 className="size-3.5" aria-hidden />Thirds</> },
                { value: 'safe', label: <><Scan className="size-3.5" aria-hidden />Safe area</> },
              ]}
            />
            <button
              type="button"
              aria-pressed={nightPreview}
              onClick={onToggleNight}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                nightPreview ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              <MoonStar className="size-3.5" aria-hidden />
              Night
            </button>
          </div>
          <p className="text-center font-mono text-xs text-muted-foreground">
            {resW} × {resH} portrait · {Math.round(scale * 100)}% · {widgets.length} widget{widgets.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </div>
  )
}
