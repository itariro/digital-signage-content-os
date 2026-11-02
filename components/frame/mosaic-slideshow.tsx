'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album, AlbumItem } from '@/lib/types'
import { FRAME_WIDTH } from '@/lib/types'
import { themeMeta } from '@/lib/albums'
import { mosaicAt, mosaicGrid, seedFromString } from '@/lib/mosaic'
import { cn } from '@/lib/utils'

const loggedErrors = new Set<string>()

function Tile({
  item,
  previousItem,
  animating,
  effect,
  transitionMs,
  progress,
  reducedMotion,
}: {
  item: AlbumItem
  previousItem: AlbumItem
  animating: boolean
  effect: 'flip' | 'fade' | 'zoom' | 'none'
  transitionMs: number
  progress: number
  reducedMotion: boolean
}) {
  const [failed, setFailed] = useState(false)
  const eff = reducedMotion ? 'fade' : effect
  const showPrev = animating && item.image !== previousItem.image
  const displayedItem = failed ? previousItem : item

  const elapsed = progress * transitionMs
  const delay = -elapsed

  function onError(url: string) {
    if (!loggedErrors.has(url)) {
      loggedErrors.add(url)
      console.warn('Mosaic image failed to load:', url)
    }
    setFailed(true)
  }

  if (!animating || eff === 'none') {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <img
          src={displayedItem.image}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => onError(displayedItem.image)}
        />
      </div>
    )
  }

  const animClass =
    eff === 'flip' ? 'mosaic-flip' : eff === 'fade' ? 'mosaic-fade' : 'mosaic-zoom'
  const target = eff === 'flip' ? 'container' : 'back'

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ perspective: eff === 'flip' ? 1200 : undefined }}
    >
      <div
        className={cn('absolute inset-0', target === 'container' && animClass)}
        style={
          target === 'container'
            ? ({ '--mosaic-dur': `${transitionMs}ms`, '--mosaic-delay': `${delay}ms`, willChange: 'transform' } as React.CSSProperties)
            : undefined
        }
        onAnimationEnd={(e) => {
          if (e.currentTarget === e.target) (e.currentTarget as HTMLElement).style.willChange = 'auto'
        }}
      >
        {showPrev && (
          <img
            src={previousItem.image}
            alt=""
            decoding="async"
            draggable={false}
            className={cn('mosaic-img mosaic-front', eff !== 'flip' && '')}
            style={{ backfaceVisibility: eff === 'flip' ? 'hidden' : undefined }}
            onError={() => onError(previousItem.image)}
          />
        )}
        <img
          src={displayedItem.image}
          alt=""
          decoding="async"
          draggable={false}
          className={cn('mosaic-img', target === 'back' ? animClass : '', 'mosaic-back')}
          style={
            target === 'back'
              ? ({ backfaceVisibility: eff === 'flip' ? 'hidden' : undefined, transform: eff === 'flip' ? 'rotateY(180deg)' : undefined, '--mosaic-dur': `${transitionMs}ms`, '--mosaic-delay': `${delay}ms`, willChange: 'opacity, transform' } as React.CSSProperties)
              : { backfaceVisibility: eff === 'flip' ? 'hidden' : undefined, transform: eff === 'flip' ? 'rotateY(180deg)' : undefined }
          }
          onError={() => onError(displayedItem.image)}
        />
      </div>
    </div>
  )
}

export function MosaicSlideshow({ album, time, offset = 0 }: { album: Album; time: number; offset?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [now, setNow] = useState<number>(() => (typeof time === 'number' && time > 0 ? time : Date.now()))
  const [reducedMotion, setReducedMotion] = useState(false)

  const mosaicCfg = album.slideshow.mosaic ?? { tilesAcross: 4, gap: 2, effect: 'flip' }
  const tilesAcrossReq = mosaicCfg.tilesAcross
  const gap = mosaicCfg.gap
  const effect = mosaicCfg.effect
  const intervalSec = album.slideshow.interval
  const aspect = themeMeta(album.theme).aspect
  const seed = seedFromString(album.id + '|' + album.items.map((i) => i.id).join(','))

  const grid = useMemo(
    () =>
      mosaicGrid({
        width: size.w || 1080,
        height: size.h || 1920,
        tileAspect: aspect,
        tilesAcross: tilesAcrossReq,
        itemCount: album.items.length,
      }),
    [size.w, size.h, aspect, tilesAcrossReq, album.items.length],
  )

  const state = useMemo(
    () =>
      mosaicAt({
        nowMs: now,
        offset,
        seed,
        itemCount: album.items.length,
        intervalSec,
        cols: grid.cols,
        rows: grid.rows,
      }),
    [now, offset, seed, album.items.length, intervalSec, grid.cols, grid.rows],
  )

  const transitionMs = useMemo(() => Math.min(1200, 0.5 * Math.max(3, intervalSec) * 1000 * (1 - 0.2)), [intervalSec])

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
    // initial
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
    const id = setTimeout(() => setNow(Date.now()), ms)
    return () => clearTimeout(id)
  }, [state.nextEventAtMs])

  // resync on visibility/focus
  useEffect(() => {
    const handler = () => setNow(Date.now())
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('focus', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('focus', handler)
    }
  }, [])

  // preload next event's item
  useEffect(() => {
    if (album.items.length === 0) return
    const delay = Math.max(0, state.nextEventAtMs - Date.now() - 2000)
    const id = setTimeout(() => {
      const next = mosaicAt({
        nowMs: state.nextEventAtMs,
        offset: 0,
        seed,
        itemCount: album.items.length,
        intervalSec,
        cols: grid.cols,
        rows: grid.rows,
      })
      const idx = next.lastChanged?.item
      const url = typeof idx === 'number' ? album.items[idx]?.image : undefined
      if (url) {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        void img.decode().catch(() => {})
      }
    }, delay)
    return () => clearTimeout(id)
  }, [state.nextEventAtMs, album.items.length, seed, intervalSec, grid.cols, grid.rows])

  const N = grid.cols * grid.rows
  const gapPx = gap * ((size.w || 1080) / FRAME_WIDTH)

  if (grid.fallback || album.items.length < 5) {
    return null
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Album artwork mosaic: ${album.name}`}
      className="absolute inset-0 grid"
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
        gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
        gap: `${gapPx}px`,
        background: album.slideshow.backdropColor,
      }}
    >
      {state.tiles.map((ts) => {
        const item = album.items[ts.item]
        const prev = album.items[ts.previousItem]
        if (!item || !prev) return null
        const animating = ts.progress < 1 && ts.item !== ts.previousItem
        return (
          <Tile
            key={ts.tile}
            item={item}
            previousItem={prev}
            animating={animating}
            effect={effect}
            transitionMs={transitionMs}
            progress={ts.progress}
            reducedMotion={reducedMotion}
          />
        )
      })}
    </div>
  )
}