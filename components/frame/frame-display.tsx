'use client'

import { useSyncExternalStore } from 'react'
import useSWR from 'swr'
import type { FrameStore } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { clockParts, resolveDisplay } from '@/lib/schedule'
import { googleFontHref } from '@/lib/fonts'
import { useNow } from '@/hooks/use-now'
import { useWeather } from '@/hooks/use-frame-store'
import { FrameScene } from './frame-scene'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

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

export function FrameDisplay({ initialStore }: { initialStore: FrameStore }) {
  const { data } = useSWR<FrameStore>('/api/store', fetcher, {
    fallbackData: initialStore,
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })
  const store = data ?? initialStore
  const now = useNow()
  const scale = useViewportScale()
  const { layout, night } = resolveDisplay(store, clockParts(now ?? new Date()))
  const weather = useWeather(layout?.settings ?? { lat: 0, lon: 0, units: 'metric' })

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
          scale={scale}
          night={night ? store.schedule.night : null}
        />
      ) : (
        !layout && <p className="text-sm text-muted-foreground">No layout has been published to this frame yet.</p>
      )}
    </main>
  )
}
