'use client'

import { useEffect, useState } from 'react'
import type { CanvasClock } from '@/lib/canvas/clock'
import type { CanvasRenderModel } from '@/lib/canvas/render-model'
import { fontStack } from '@/lib/fonts'

export function IdentifyOverlay({
  model,
  clock,
  frameId,
}: {
  model: CanvasRenderModel
  clock: CanvasClock
  frameId: string
}) {
  const identify = model.identify
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    if (!identify) return
    const id = window.setTimeout(
      () => setVisible(false),
      Math.max(0, identify.until - (Date.now() + clock.offsetMs)),
    )
    return () => window.clearTimeout(id)
  }, [identify?.until, clock.offsetMs])

  if (!identify || !visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/70 text-center">
      <div
        style={{
          fontFamily: fontStack('bebas'),
          fontSize: '55vmin',
          lineHeight: 0.9,
          color: '#ffffff',
          textShadow: '0 12px 48px rgba(0,0,0,0.55)',
        }}
      >
        {identify.marker}
      </div>
      <div style={{ fontFamily: fontStack('grotesk'), fontSize: 44, fontWeight: 600, color: '#e2e8f0' }}>
        {identify.label ?? identify.frameId ?? frameId} · {identify.frameId ?? frameId}
      </div>
      <div style={{ fontFamily: fontStack('grotesk'), fontSize: 32, color: '#f8fafc' }}>
        {identify.canvasName}
      </div>
      <div style={{ fontFamily: fontStack('mono'), fontSize: 26, color: '#cbd5e1' }}>
        {`Frame ${identify.marker} of ${identify.count}`}
      </div>
      <div style={{ fontFamily: fontStack('mono'), fontSize: 22, color: '#94a3b8' }}>
        {model.slotRect ?? 'No slot rectangle'} · Clock {clock.quality}
      </div>
    </div>
  )
}
