'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { ActiveSlide, Album, DisplayDecision, LayoutSettings, NightMode, WeatherData, Widget } from '@/lib/types'
import { clampReveal, revealAt, seedFromString as revealSeedFromString } from '@/lib/reveal'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { fontStack } from '@/lib/fonts'
import { hexToRgba } from '@/lib/frame-utils'
import { slideAt } from '@/lib/albums'
import { mosaicAt, mosaicGrid, seedFromString } from '@/lib/mosaic'
import { WidgetContent, type WidgetContext } from './widget-content'
import { AlbumSlideshow } from './album-slideshow'
import { textEffectCss } from '@/lib/text-effects'

export function surfaceStyle(widget: Widget): CSSProperties {
  const s = widget.style
  return {
    position: 'absolute',
    left: widget.x,
    top: widget.y,
    width: widget.w,
    height: widget.h,
    containerType: 'size',
    color: s.color,
    fontFamily: fontStack(s.fontFamily),
    fontWeight: s.fontWeight,
    letterSpacing: `${s.letterSpacing / 100}em`,
    textAlign: s.align === 'start' ? 'left' : s.align === 'end' ? 'right' : 'center',
    background: s.bgOpacity > 0 ? hexToRgba(s.bg, s.bgOpacity / 100) : 'transparent',
    backdropFilter: s.blur > 0 ? `blur(${s.blur}px) saturate(1.4)` : undefined,
    WebkitBackdropFilter: s.blur > 0 ? `blur(${s.blur}px) saturate(1.4)` : undefined,
    border: s.strokeWidth > 0 ? `${s.strokeWidth}px solid ${s.stroke}` : undefined,
    borderRadius: s.radius,
    opacity: s.opacity / 100,
    // Text/sticker stroke is owned by the text-effect layer (TextStrokeCfg) so
    // it paints under the fill in paint order; leave the surface stroke alone.
    WebkitTextStroke:
      widget.type === 'text' || widget.type === 'sticker'
        ? undefined
        : s.textStroke > 0
          ? `${s.textStroke}px ${s.stroke}`
          : undefined,
    overflow: 'hidden',
  }
}

export function WidgetBody({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const s = widget.style
  const hasSurface = s.bgOpacity > 0 || s.strokeWidth > 0
  const isText = widget.type === 'text'
  const isSticker = widget.type === 'sticker'
  // CSS-native text effects (background-clip:text fill, -webkit-text-stroke
  // with paint-order so the stroke stays under the fill, text-shadow /
  // drop-shadow stacks). Photo-space px; the renderer scales via container
  // queries, so no per-scale math here. Text widgets get the wrapper; sticker
  // layers get the same helpers per layer inside StickerWidget. Every other
  // widget type keeps the legacy boolean-shadow behaviour.
  const effect = isText ? textEffectCss(s) : {}
  return (
    <div
      className="h-full w-full"
      style={{
        padding: isSticker ? 0 : hasSurface ? '7cqmin' : '1.5cqmin',
        filter: isText || isSticker ? undefined : s.shadow ? 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' : undefined,
      }}
    >
      {isText ? (
        <div style={{ ...effect }} className="h-full w-full">
          <WidgetContent widget={widget} ctx={ctx} />
        </div>
      ) : (
        <WidgetContent widget={widget} ctx={ctx} />
      )}
    </div>
  )
}

export function FrameBackground({ settings }: { settings: LayoutSettings }) {
  return (
    <>
      {settings.background ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${settings.dim / 100})` }} />
    </>
  )
}

export function NightOverlay({ night }: { night: NightMode }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${(100 - night.brightness) / 100})` }} />
      {night.warmth > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `rgba(255,128,32,${(night.warmth / 100) * 0.4})`, mixBlendMode: 'multiply' }}
        />
      )}
    </>
  )
}

export function SceneBackground({ settings, album, now }: { settings: LayoutSettings; album?: Album | null; now: Date | null }) {
  if (!album || album.items.length === 0) return <FrameBackground settings={settings} />
  return (
    <>
      {now ? <AlbumSlideshow album={album} time={now.getTime()} /> : <div className="absolute inset-0 bg-muted" />}
      <div className="pointer-events-none absolute inset-0" style={{ background: `rgba(0,0,0,${settings.dim / 100})` }} />
    </>
  )
}

export function activeSlide(album: Album | null | undefined, now: Date | null): ActiveSlide | null {
  if (!album || !now) return null
  if (album.slideshow.presentation === 'reveal' && album.items.length >= 1) {
    const cfg = clampReveal(album.slideshow.reveal)
    const seed = revealSeedFromString(album.id + '|' + album.items.map((i) => i.id).join(','))
    const st = revealAt({
      nowMs: now.getTime(),
      offset: 0,
      seed,
      itemCount: album.items.length,
      intervalSec: album.slideshow.interval,
      cols: cfg.tilesAcross,
      rows: cfg.tilesDown,
      group: cfg.group,
    })
    const item = st.lastChanged ? (st.lastChanged.item >= 0 ? album.items[st.lastChanged.item] : null) : album.items[0]
    return item ? { item, theme: album.theme, albumName: album.name } : null
  }
  if (album.slideshow.presentation === 'mosaic' && album.items.length >= 5) {
    const aspect = (album.theme === 'music' ? 1 : album.theme === 'photos' ? 9 / 16 : 2 / 3)
    const tilesAcross = album.slideshow.mosaic?.tilesAcross ?? 4
    const grid = mosaicGrid({ width: 1080, height: 1920, tileAspect: aspect, tilesAcross, itemCount: album.items.length })
    if (grid.fallback) {
      const slide = slideAt(album, now.getTime())
      return slide ? { item: slide.current, theme: album.theme, albumName: album.name } : null
    }
    const seed = seedFromString(album.id + '|' + album.items.map((i) => i.id).join(','))
    const st = mosaicAt({ nowMs: now.getTime(), offset: 0, seed, itemCount: album.items.length, intervalSec: album.slideshow.interval, cols: grid.cols, rows: grid.rows })
    const idx = st.lastChanged?.item
    const item = typeof idx === 'number' ? album.items[idx] : null
    return item ? { item, theme: album.theme, albumName: album.name } : null
  }
  const slide = slideAt(album, now.getTime())
  return slide ? { item: slide.current, theme: album.theme, albumName: album.name } : null
}

type FrameSceneProps = {
  widgets: Widget[]
  settings: LayoutSettings
  weather: WeatherData | null
  now: Date | null
  scale: number
  album?: Album | null
  night?: NightMode | null
  children?: ReactNode
  renderWidget?: (widget: Widget, body: ReactNode) => ReactNode
  decision?: DisplayDecision | null
}

export function FrameScene({ widgets, settings, weather, now, scale, album, night, children, renderWidget, decision }: FrameSceneProps) {
  const hideSeconds = Boolean(night?.hideSeconds)
  const slide = activeSlide(album, now)
  return (
    <div style={{ width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale, containerType: 'size' }} className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
      >
        <SceneBackground settings={settings} album={album} now={now} />
        {now &&
          widgets.map((widget) => {
            if (widget.hidden && !renderWidget) return null
            const body = <WidgetBody widget={widget} ctx={{ now, weather, settings, hideSeconds, slide, decision }} />
            if (renderWidget) return renderWidget(widget, body)
            return (
              <div key={widget.id} style={surfaceStyle(widget)}>
                {body}
              </div>
            )
          })}
        {night && <NightOverlay night={night} />}
        {children}
      </div>
    </div>
  )
}
