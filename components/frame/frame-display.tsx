'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import type { CanvasState, FrameStore } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { clockParts, resolveDisplay } from '@/lib/schedule'
import { googleFontHref } from '@/lib/fonts'
import { SYSTEM_CLOCK, type CanvasClock } from '@/lib/canvas/clock'
import { canvasRenderModel, nextCanvasDeadlineMs } from '@/lib/canvas/render-model'
import { useNow } from '@/hooks/use-now'
import { useWeather } from '@/hooks/use-frame-store'
import { FrameScene } from './frame-scene'
import { CanvasStage } from './canvas/canvas-stage'
import { FrameNoticeLayer } from '@/components/notifications/frame-notice-layer'
import { NotificationProvider } from '@/components/notifications/notification-provider'

const fetcher = async (url: string) => {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })
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

type CanvasSnapshot = {
  revision: number
  state: CanvasState | null
  clock: CanvasClock
  frame?: { screenWidthMm?: number | null; screenHeightMm?: number | null } | null
  frames?: { id: string; screenWidthMm?: number | null; screenHeightMm?: number | null }[] | null
}

export function FrameDisplay({ initialStore, frameId = 'home' }: { initialStore: FrameStore; frameId?: string }) {
  const { data } = useSWR<FrameStore>(`/api/store?frame=${encodeURIComponent(frameId)}`, fetcher, {
    fallbackData: initialStore,
    refreshInterval: 3_000,
    dedupingInterval: 1_000,
    revalidateOnFocus: false,
    refreshWhenHidden: false,
  })
  const store = data ?? initialStore
  const { data: decisionData } = useSWR<{ decision?: { layoutId?: string | null } }>(`/api/display/state?frame=${encodeURIComponent(frameId)}`, fetcher, {
    refreshInterval: 3_000,
    dedupingInterval: 1_000,
    revalidateOnFocus: false,
  })
  const now = useNow()
  const scale = useViewportScale()
  const decisionLayout = decisionData?.decision?.layoutId ? store.layouts.find((l) => l.id === decisionData.decision?.layoutId) : undefined
  const resolved = resolveDisplay(store, clockParts(now ?? new Date()))
  const layout = decisionLayout ?? resolved.layout
  const night = resolved.night
  const weather = useWeather(layout?.settings ?? { lat: 0, lon: 0, units: 'metric' })

  const { data: canvasData } = useSWR<CanvasSnapshot>(`/api/canvas/state?frame=${encodeURIComponent(frameId)}`, fetcher, {
    refreshInterval: 5_000,
    dedupingInterval: 1_000,
    revalidateOnFocus: false,
    refreshWhenHidden: false,
  })

  const clockOffsetMs = canvasData?.clock.offsetMs ?? 0
  const canvasFrames = canvasData?.frames?.length
    ? canvasData.frames
    : canvasData?.frame
      ? [{ id: frameId, screenWidthMm: canvasData.frame.screenWidthMm ?? null, screenHeightMm: canvasData.frame.screenHeightMm ?? null }]
      : [{ id: frameId, screenWidthMm: null, screenHeightMm: null }]
  const canvasModel = canvasData
    ? canvasRenderModel(canvasData.state, Date.now(), clockOffsetMs, canvasFrames)
    : null
  const nextDeadline = nextCanvasDeadlineMs(canvasData?.state ?? null, Date.now() + clockOffsetMs)
  const [, bumpCanvasDeadline] = useState(0)
  const revision = canvasData?.revision ?? null
  const fpsRef = useRef(0)
  const onCanvasFps = useCallback((fpsAvg: number) => { fpsRef.current = fpsAvg }, [])
  const reportWindow = useRef({ at: Date.now() })
  const hasCanvas = Boolean(canvasModel)

  useEffect(() => {
    if (nextDeadline === null) return
    const delay = Math.max(0, nextDeadline - (Date.now() + clockOffsetMs))
    const id = window.setTimeout(() => bumpCanvasDeadline((value) => value + 1), delay)
    return () => window.clearTimeout(id)
  }, [nextDeadline, clockOffsetMs])

  useEffect(() => {
    if (!hasCanvas) return
    const id = window.setInterval(() => {
      const now = Date.now()
      reportWindow.current = { at: now }
      void fetch(`/api/canvas/report?frame=${encodeURIComponent(frameId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appliedRevision: canvasModel ? revision : null,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          fpsAvg: fpsRef.current,
        }),
        keepalive: true,
      }).catch(() => {})
    }, 10_000)
    return () => window.clearInterval(id)
  }, [hasCanvas, revision, frameId])

  const canvasNight = canvasModel?.takeover?.deployment.config.nightMode === 'inherit'
    ? (night ? store.schedule.night : null)
    : null

  return (
    <NotificationProvider notifications={store.notifications}>
      <main className="flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden bg-background">
        <h1 className="sr-only">
          {canvasModel
            ? `Canvas showing ${canvasModel.takeover?.deployment.name ?? canvasModel.identify?.canvasName ?? 'identify'}`
            : layout ? `Frame showing ${layout.name}` : 'Frame display'}
        </h1>
        {store.customFonts.map((family) => (
          <link key={family} rel="stylesheet" href={googleFontHref(family)} precedence="default" />
        ))}
        {canvasModel ? (
          <CanvasStage
            model={canvasModel}
            clock={canvasData?.clock ?? SYSTEM_CLOCK}
            night={canvasNight}
            frameId={frameId}
            onFps={onCanvasFps}
          />
        ) : layout && scale > 0 ? (
          <FrameScene
            widgets={layout.widgets}
            settings={layout.settings}
            weather={weather}
            now={now}
            album={store.albums?.find((a) => a.id === layout.settings.albumId) ?? null}
            scale={scale}
            night={night ? store.schedule.night : null}
          >
            {/* Inside FrameScene so the notice is pinned to the frame's scaled
                coordinate space, exactly like the editor canvas and preview. */}
            <FrameNoticeLayer />
          </FrameScene>
        ) : (
          // No layout means no FrameScene, but a notification posted before the
          // first publish still has to show. Put the fallback and the notice in
          // the same 1080x1920 space FrameScene would have provided.
          <div
            className="relative overflow-hidden"
            style={scale > 0 ? { width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale } : { width: FRAME_WIDTH, height: FRAME_HEIGHT }}
          >
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}>
              {!layout && (
                <div className="flex h-full w-full items-start justify-center p-16">
                  <p className="text-sm text-muted-foreground">No layout has been published to this frame yet.</p>
                </div>
              )}
              <FrameNoticeLayer />
            </div>
          </div>
        )}
      </main>
    </NotificationProvider>
  )
}
