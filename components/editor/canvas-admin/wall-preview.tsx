'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ToggleField } from '@/components/editor/controls'
import type { CanvasConfig, CanvasScene, DeploymentAlbum, Layout } from '@/lib/types'
import { resolveGeometry, type FrameScreenSize } from '@/lib/canvas/geometry'
import { seedFromString } from '@/lib/canvas/prng'
import { sceneAt } from '@/lib/canvas/scheduler'
import { computeSceneState } from '@/lib/canvas/scenes/registry'
import { CanvasFrameScene, paintScene, type CanvasElementRefs } from '@/components/frame/canvas/canvas-frame-scene'

export function WallPreview({ layout, album, frames = [] }: { layout: Layout; album: DeploymentAlbum | null; frames?: FrameScreenSize[] }) {
  const config = layout.canvas as CanvasConfig
  const geometry = useMemo(() => resolveGeometry(config, frames), [config, frames])
  const [showBezels, setShowBezels] = useState(true)
  const [consoleStart, setConsoleStart] = useState<number | null>(null)
  const [localEpoch, setLocalEpoch] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const refsBySlot = useRef(new Map<string, CanvasElementRefs>())

  useEffect(() => {
    let cancelled = false
    setLocalEpoch(performance.now())
    fetch('/api/time', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json: { t: number }) => {
        if (!cancelled) setConsoleStart(json.t)
      })
      .catch(() => {
        if (!cancelled) setConsoleStart(Date.now())
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (consoleStart === null || localEpoch === null) return
    let handle = 0
    const tick = () => {
      setNow(consoleStart + (performance.now() - localEpoch))
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [consoleStart, localEpoch])

  const plan = useMemo(() => {
    if (!album || consoleStart === null) return null
    const seed = seedFromString(album.id)
    return sceneAt(album, seed, Math.max(0, now - consoleStart), album.crossfadeMs)
  }, [album, consoleStart, now])

  const model = useMemo(() => {
    if (!plan) return null
    const scene = plan.scene as CanvasScene
    return computeSceneState(scene, {
      bounds: { width: geometry.width, height: geometry.height },
      geometry,
      tMs: plan.sceneTimeMs,
      seed: plan.seed,
    })
  }, [plan, geometry])

  useEffect(() => {
    if (!model) return
    for (const slot of geometry.slots) {
      let refs = refsBySlot.current.get(slot.slotId)
      if (!refs) {
        refs = new Map()
        refsBySlot.current.set(slot.slotId, refs)
      }
      paintScene(model, geometry, slot, refs)
    }
  }, [model, geometry])

  const scale = Math.min(1, 320 / geometry.width, 180 / geometry.height)

  return (
    <div className="flex flex-col gap-2">
      <ToggleField label="Show bezels" checked={showBezels} onChange={setShowBezels} />
      <div className="relative overflow-hidden rounded border border-border bg-black" style={{ width: geometry.width * scale, height: geometry.height * scale }}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: geometry.width, height: geometry.height, transform: `scale(${scale})` }}
        >
          {geometry.slots.map((slot) => {
            const assigned = config.slots.find((entry) => entry.id === slot.slotId)?.frameId ?? null
            const refs = refsBySlot.current.get(slot.slotId) ?? new Map<string, HTMLElement | null>()
            return (
              <div
                key={slot.slotId}
                className="absolute overflow-hidden"
                style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h, outline: showBezels ? '2px solid rgba(255,255,255,.35)' : 'none' }}
              >
                <div style={{ transform: `scale(${slot.scale})`, transformOrigin: 'top left', width: slot.w / slot.scale, height: slot.h / slot.scale }}>
                  {model && <CanvasFrameScene model={model} geometry={geometry} slot={slot} refs={refs} />}
                </div>
                <span className="absolute bottom-1 left-1 bg-black/60 px-1 text-[24px] leading-tight text-white">
                  {slot.marker} · {assigned ?? 'empty'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {consoleStart === null ? 'Reading console clock…' : `${plan?.scene.name ?? 'No active scene'} · t+${Math.round(Math.max(0, now - consoleStart) / 1000)}s`}
      </p>
    </div>
  )
}
