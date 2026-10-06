'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { LayoutSettings, NightMode, WeatherData, Widget } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { fontStack } from '@/lib/fonts'
import { hexToRgba } from '@/lib/frame-utils'
import { WidgetContent, type WidgetContext } from './widget-content'

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
    WebkitTextStroke: s.textStroke > 0 ? `${s.textStroke}px ${s.stroke}` : undefined,
    overflow: 'hidden',
  }
}

export function WidgetBody({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const s = widget.style
  const hasSurface = s.bgOpacity > 0 || s.strokeWidth > 0
  return (
    <div
      className="h-full w-full"
      style={{
        padding: hasSurface ? '7cqmin' : '1.5cqmin',
        filter: s.shadow ? 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' : undefined,
      }}
    >
      <WidgetContent widget={widget} ctx={ctx} />
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

type FrameSceneProps = {
  widgets: Widget[]
  settings: LayoutSettings
  weather: WeatherData | null
  now: Date | null
  scale: number
  night?: NightMode | null
  children?: ReactNode
  renderWidget?: (widget: Widget, body: ReactNode) => ReactNode
}

export function FrameScene({ widgets, settings, weather, now, scale, night, children, renderWidget }: FrameSceneProps) {
  const hideSeconds = Boolean(night?.hideSeconds)
  return (
    <div style={{ width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale }} className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
      >
        <FrameBackground settings={settings} />
        {now &&
          widgets.map((widget) => {
            if (widget.hidden && !renderWidget) return null
            const body = <WidgetBody widget={widget} ctx={{ now, weather, settings, hideSeconds }} />
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
