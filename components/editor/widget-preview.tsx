'use client'

import { createContext, useContext } from 'react'
import type { ActiveSlide, LayoutSettings, WeatherData, Widget } from '@/lib/types'
import { surfaceStyle, WidgetBody } from '@/components/frame/frame-scene'
import { cn } from '@/lib/utils'

type LiveData = { now: Date | null; weather: WeatherData | null; settings: LayoutSettings; slide: ActiveSlide | null }

const SAMPLE_SLIDE: ActiveSlide = {
  theme: 'movies',
  albumName: 'Sample',
  item: { id: 'sample', image: '', sourceUrl: '', title: 'Spirited Away', subtitle: 'Hayao Miyazaki', year: '2001' },
}

export const LiveDataContext = createContext<LiveData | null>(null)

export function useLiveData() {
  const ctx = useContext(LiveDataContext)
  if (!ctx) throw new Error('LiveDataContext missing')
  return ctx
}

export function WidgetPreview({
  widgets,
  width,
  height,
  className,
}: {
  widgets: Widget[]
  width: number
  height: number
  className?: string
}) {
  const { now, weather, settings, slide } = useLiveData()
  const minX = Math.min(...widgets.map((w) => w.x))
  const minY = Math.min(...widgets.map((w) => w.y))
  const bw = Math.max(...widgets.map((w) => w.x + w.w)) - minX
  const bh = Math.max(...widgets.map((w) => w.y + w.h)) - minY
  const pad = 0.86
  const scale = Math.min((width * pad) / bw, (height * pad) / bh)

  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden bg-muted bg-cover bg-center', className)}
      style={{
        width,
        height,
        backgroundImage: settings.background
          ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url("${settings.background}")`
          : undefined,
      }}
    >
      <div
        className="absolute origin-top-left"
        style={{
          width: bw,
          height: bh,
          left: (width - bw * scale) / 2,
          top: (height - bh * scale) / 2,
          transform: `scale(${scale})`,
        }}
      >
        {now &&
          widgets.map((w) => (
            <div key={w.id} style={surfaceStyle({ ...w, x: w.x - minX, y: w.y - minY })}>
              <WidgetBody widget={w} ctx={{ now, weather, settings, slide: slide ?? SAMPLE_SLIDE }} />
            </div>
          ))}
      </div>
    </div>
  )
}
