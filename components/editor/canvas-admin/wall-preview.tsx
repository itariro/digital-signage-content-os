'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ToggleField } from '@/components/editor/controls'
import type { CanvasConfig, DeploymentAlbum, Layout } from '@/lib/types'
import { resolveGeometry, rotatedSlotStyle, type FrameScreenSize } from '@/lib/canvas/geometry'
import { seedFromString } from '@/lib/canvas/prng'
import { sceneAt } from '@/lib/canvas/scheduler'
import { layerRendersAt } from '@/lib/canvas/render-model'
import { paintScene, type CanvasElementRefs } from '@/components/frame/canvas/canvas-frame-scene'
import { CanvasLayerStack, refsForLayer } from '@/components/frame/canvas/canvas-layer-stack'
import { CanvasBezelOverlay } from '@/components/frame/canvas/canvas-bezel-overlay'

export function WallPreview({ layout, album, frames = [] }: { layout: Layout; album: DeploymentAlbum | null; frames?: FrameScreenSize[] }) {
  const config = layout.canvas as CanvasConfig
  const geometry = useMemo(() => resolveGeometry(config, frames), [config, frames])
  const bezelMode = config.bezelMode ?? 'show'
  const bezel = { mode: bezelMode, gaps: bezelMode === 'collapse' ? [] : geometry.gaps }
  const [showBezels, setShowBezels] = useState(true)
  const [consoleStart, setConsoleStart] = useState<number | null>(null)
  const [localEpoch, setLocalEpoch] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const refsBySlot = useRef(new Map<string, Map<string, CanvasElementRefs>>())

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

  useEffect(() => {
    if (!album || consoleStart === null) return
    const seed = seedFromString(album.id)
    const t = Math.max(0, now - consoleStart)
    for (const slot of geometry.slots) {
      let slotRefs = refsBySlot.current.get(slot.slotId)
      if (!slotRefs) {
        slotRefs = new Map<string, CanvasElementRefs>()
        refsBySlot.current.set(slot.slotId, slotRefs)
      }
      for (const layer of layerRendersAt(album, seed, t, geometry, slot)) {
        if (!layer.render) continue
        paintScene(layer.render, geometry, slot, refsForLayer(slotRefs, layer.layerId))
      }
    }
  }, [album, consoleStart, now, geometry])

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
            let slotRefs = refsBySlot.current.get(slot.slotId)
            if (!slotRefs) {
              slotRefs = new Map<string, CanvasElementRefs>()
              refsBySlot.current.set(slot.slotId, slotRefs)
            }
            const layers = album && consoleStart !== null
              ? layerRendersAt(
                  album,
                  seedFromString(album.id),
                  Math.max(0, now - consoleStart),
                  geometry,
                  slot,
                )
              : []
            const rotationStyle = rotatedSlotStyle(slot, scale)
            return (
              <div
                key={slot.slotId}
                className="absolute overflow-hidden"
                style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h, outline: showBezels ? '2px solid rgba(255,255,255,.35)' : 'none' }}
              >
                <div
                  style={{
                    transform: `${rotationStyle.transform ? `${rotationStyle.transform} ` : ''}scale(${slot.scale})`,
                    transformOrigin: rotationStyle.transformOrigin,
                    width: slot.w / slot.scale,
                    height: slot.h / slot.scale,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -slot.x,
                      top: -slot.y,
                      width: geometry.width,
                      height: geometry.height,
                      background: config.background,
                    }}
                  >
                    {/* CanvasLayerStack renders CanvasFrameScene once per enabled layer. */}
                    {layers.length > 0 && (
                      <CanvasLayerStack
                        layers={layers}
                        geometry={geometry}
                        slot={slot}
                        refsByLayer={slotRefs}
                      />
                    )}
                  </div>
                </div>
                <span className="absolute bottom-1 left-1 bg-black/60 px-1 text-[24px] leading-tight text-white">
                  {slot.marker} · {assigned ?? 'empty'}
                </span>
              </div>
            )
          })}
          <CanvasBezelOverlay mode={bezel.mode} gaps={bezel.gaps} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {consoleStart === null ? 'Reading console clock…' : `${plan?.scene.name ?? 'No active scene'} · t+${Math.round(Math.max(0, now - consoleStart) / 1000)}s`}
      </p>
    </div>
  )
}
