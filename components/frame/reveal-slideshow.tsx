'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '@/lib/types'
import { FRAME_WIDTH } from '@/lib/types'
import { seedFromString, revealAt, clampReveal, REVEAL_TILE_MAX } from '@/lib/reveal'
import { cn } from '@/lib/utils'

const loggedErrors = new Set<string>()

function logError(url: string) {
  if (!loggedErrors.has(url)) {
    loggedErrors.add(url)
    console.warn('Reveal image failed to load:', url)
  }
}

const OBJECT_POSITION = { top: 'center top', center: 'center center', bottom: 'center bottom' } as const

export function RevealSlideshow({ album, time, offset = 0 }: { album: Album; time: number; offset?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [tick, setTick] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  const cfg = useMemo(() => clampReveal(album.slideshow.reveal), [album.slideshow.reveal])
  const intervalSec = album.slideshow.interval
  const seed = seedFromString(album.id + '|' + album.items.map((i) => i.id).join(','))
  const portrait = album.subject?.image
  const portraitPosition = album.subject?.imagePosition ?? 'center'

  const state = useMemo(
    () =>
      revealAt({
        nowMs: Date.now(),
        offset,
        seed,
        itemCount: album.items.length,
        intervalSec,
        cols: Math.min(REVEAL_TILE_MAX, cfg.tilesAcross),
        rows: Math.min(REVEAL_TILE_MAX, cfg.tilesDown),
        group: cfg.group,
      }),
    [tick, offset, seed, album.items.length, intervalSec, cfg.tilesAcross, cfg.tilesDown, cfg.group],
  )

  // resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const e = entries[0]
      if (e) {
        const { width, height } = e.contentRect
        setSize({ w: width, h: height })
      }
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // reduced motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // scheduling
  useEffect(() => {
    const ms = Math.min(Math.max(state.nextEventAtMs - Date.now(), 0), 2147483647)
    const id = setTimeout(() => setTick((t) => t + 1), ms)
    return () => clearTimeout(id)
  }, [state.nextEventAtMs])

  // resync on visibility/focus
  useEffect(() => {
    const handler = () => setTick((t) => t + 1)
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
    }
  }, [])

  // preload the next event's artwork shortly before it opens
  useEffect(() => {
    if (album.items.length === 0) return
    const delay = Math.max(0, state.nextEventAtMs - Date.now() - 2000)
    const id = setTimeout(() => {
      const next = revealAt({
        nowMs: state.nextEventAtMs,
        offset: 0,
        seed,
        itemCount: album.items.length,
        intervalSec,
        cols: cfg.tilesAcross,
        rows: cfg.tilesDown,
        group: cfg.group,
      })
      for (const cell of next.newlyOpened?.cells ?? []) {
        const st = next.cells[cell]
        const url = typeof st?.item === 'number' && st.item >= 0 ? album.items[st.item]?.image : undefined
        if (!url) continue
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        void img.decode().catch(() => {})
      }
    }, delay)
    return () => clearTimeout(id)
  }, [state.nextEventAtMs, album.items.length, seed, intervalSec, cfg.tilesAcross, cfg.tilesDown, cfg.group])

  const scalePx = (size.w || 1080) / FRAME_WIDTH
  const gapPx = cfg.gap * scalePx

  if (album.items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ background: album.slideshow.backdropColor }}
      >
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait}
            alt=""
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover"
            style={{ objectPosition: OBJECT_POSITION[portraitPosition], filter: 'grayscale(1) brightness(0.92)' }}
            onError={() => logError(portrait)}
          />
        ) : (
          <div className="h-full w-full" style={{ background: album.slideshow.backdropColor }} />
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ background: album.slideshow.backdropColor }}>
      {portrait && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait}
          alt={`Portrait of ${album.subject?.name || 'subject'}`}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: OBJECT_POSITION[portraitPosition], filter: 'grayscale(1) brightness(0.92)' }}
          onError={(e) => {
            logError(portrait)
            ;(e.currentTarget as HTMLElement).style.display = 'none'
          }}
        />
      )}
      <div
        role="img"
        aria-label={`Reveal grid for ${album.name}`}
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${cfg.tilesAcross}, 1fr)`,
          gridTemplateRows: `repeat(${cfg.tilesDown}, 1fr)`,
          gap: `${gapPx}px`,
        }}
      >
        {state.cells.map((cs) => {
          const item = cs.item >= 0 ? album.items[cs.item] : undefined
          const opened = cs.openedAtMs !== null
          const inMotion = opened && cs.progress < 1
          const animate = cfg.effect === 'fade' && !reducedMotion
          return (
            <div key={cs.cell} className="relative overflow-hidden">
              {item && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt=""
                  decoding="async"
                  draggable={false}
                  className={cn('absolute inset-0 h-full w-full object-cover')}
                  style={{
                    opacity: opened ? 0 : 1,
                    transition: animate ? `opacity ${state.transitionMs}ms linear` : undefined,
                    transitionDelay: inMotion && animate ? `${-Math.round(cs.progress * state.transitionMs)}ms` : undefined,
                  }}
                  onError={() => logError(item.image)}
                />
              )}
              {!item && cfg.gap > 0 && <div className="absolute inset-0" style={{ background: album.slideshow.backdropColor }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
