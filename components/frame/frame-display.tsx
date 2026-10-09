'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import type { DisplayDecision, ExperienceContext, FrameStore } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { clockParts, resolveDisplay } from '@/lib/schedule'
import { googleFontHref } from '@/lib/fonts'
import { useNow } from '@/hooks/use-now'
import { useWeather } from '@/hooks/use-frame-store'
import { FrameScene } from './frame-scene'

function subscribeResize(callback: () => void) {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}

function useViewportScale() {
  return useSyncExternalStore(
    subscribeResize,
    () => Math.min(window.innerWidth / FRAME_WIDTH, window.innerHeight / FRAME_HEIGHT),
    () => 0,
  )
}

export function FrameDisplay({ initialStore, frameId = 'home' }: { initialStore: FrameStore; frameId?: string }) {
  const [decision, setDecision] = useState<DisplayDecision | null>(null)
  const [store, setStore] = useState<FrameStore>(initialStore)
  const [context, setContext] = useState<ExperienceContext | null>(null)
  const now = useNow()
  const scale = useViewportScale()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let sequence = 0
    let applied = -1

    async function poll() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 25_000)
      const seq = ++sequence
      try {
        const res = await fetch(`/api/display/state?frame=${encodeURIComponent(frameId)}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled || seq < applied) return
        applied = seq
        setDecision(prev => (prev?.id === data.decision?.id ? prev : data.decision))
        setStore(data.store)
        setContext(data.context ?? null)
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'AbortError') {
          console.error('[FrameDisplay] Poll failed:', error)
        }
      } finally {
        clearTimeout(timeout)
        if (!cancelled) timer = setTimeout(poll, 30_000)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [frameId])

  const fallback = resolveDisplay(store, clockParts(now ?? new Date()))
  const layoutId = decision?.layoutId || fallback.layout?.id
  const layout = store.layouts.find((l) => l.id === layoutId) || fallback.layout
  const night = fallback.night
  const clientWeather = useWeather(layout?.settings ?? { lat: 0, lon: 0, units: 'metric' })
  const weather = context?.weather ?? clientWeather

  return (
    <main className="flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden bg-background">
      <h1 className="sr-only">{layout ? `Frame showing ${layout.name}` : 'Frame display'}</h1>
      {store.customFonts.map((family) => (
        <link key={family} rel="stylesheet" href={googleFontHref(family)} precedence="default" />
      ))}
      {layout && scale > 0 ? (
        <FrameScene
          widgets={layout.widgets}
          settings={layout.settings}
          weather={weather}
          now={now}
          album={store.albums?.find((a) => a.id === layout.settings.albumId) ?? null}
          scale={scale}
          night={night ? store.schedule.night : null}
          decision={decision}
        />
      ) : (
        !layout && <p className="text-sm text-muted-foreground">No layout has been published to this frame yet.</p>
      )}
    </main>
  )
}
