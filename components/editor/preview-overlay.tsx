'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import type { Album, LayoutSettings, NightMode, WeatherData, Widget } from '@/lib/types'
import { FrameScene } from '@/components/frame/frame-scene'
import { useFitScale } from './canvas'

type PreviewOverlayProps = {
  name: string
  widgets: Widget[]
  settings: LayoutSettings
  weather: WeatherData | null
  now: Date | null
  album: Album | null
  night: NightMode | null
  onClose: () => void
}

export function PreviewOverlay({ name, widgets, settings, weather, now, album, night, onClose }: PreviewOverlayProps) {
  const ref = useRef<HTMLDivElement>(null)
  const scale = useFitScale(ref)
  return (
    <div role="dialog" aria-modal="true" aria-label={`Preview of ${name}`} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">
            Live preview at {settings.resolution.replace('x', ' × ')}
            {weather?.sample ? ' · sample weather' : ' · live weather'}
            {night ? ' · night mode' : ''}
          </p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          <X className="size-4" aria-hidden />
          Close
          <kbd className="ml-1 rounded bg-card px-1.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </button>
      </div>
      <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
        <div className="overflow-hidden rounded-[18px]" style={{ boxShadow: '0 0 0 12px var(--bezel), 0 40px 100px -20px rgba(0,0,0,0.7)' }}>
          <FrameScene widgets={widgets} settings={settings} weather={weather} now={now} album={album} scale={scale} night={night} />
        </div>
      </div>
    </div>
  )
}
