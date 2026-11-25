'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { DrawCommand } from '@/lib/canvas/draw'
import { executeDrawCommands } from '@/lib/canvas/draw'

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

export function Canvas2DLayer({
  commands,
  slot,
}: {
  commands: readonly DrawCommand[]
  slot: { x: number; y: number; w: number; h: number }
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    executeDrawCommands(ctx, commands, { slot, dpr: window.devicePixelRatio || 1, reducedMotion: reduced })
  }, [commands, slot.x, slot.y, slot.w, slot.h, reduced])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', left: 0, top: 0, width: slot.w, height: slot.h }}
    />
  )
}
