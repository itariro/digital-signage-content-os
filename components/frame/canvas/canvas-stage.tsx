'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { NightMode } from '@/lib/types'
import type { CanvasClock } from '@/lib/canvas/clock'
import type { CanvasRenderModel } from '@/lib/canvas/render-model'
import { layerRendersAt } from '@/lib/canvas/render-model'
import { canvasLoopKey, fitScale } from '@/lib/canvas/stage'
import { rotatedSlotStyle } from '@/lib/canvas/geometry'
import { sceneAt } from '@/lib/canvas/scheduler'
import { seedFromString } from '@/lib/canvas/prng'
import { fontStack } from '@/lib/fonts'
import { NightOverlay } from '@/components/frame/frame-scene'
import { FrameNoticeLayer } from '@/components/notifications/frame-notice-layer'
import { paintScene, type CanvasElementRefs } from './canvas-frame-scene'
import { CanvasLayerStack, layerChangeKey, layerOpacity, refsForLayer } from './canvas-layer-stack'
import { IdentifyOverlay } from './identify-overlay'

function subscribeViewport(callback: () => void) {
  window.addEventListener('resize', callback)
  window.addEventListener('focus', callback)
  document.addEventListener('visibilitychange', callback)
  return () => {
    window.removeEventListener('resize', callback)
    window.removeEventListener('focus', callback)
    document.removeEventListener('visibilitychange', callback)
  }
}

function useViewport() {
  const width = useSyncExternalStore(subscribeViewport, () => window.innerWidth, () => 0)
  const height = useSyncExternalStore(subscribeViewport, () => window.innerHeight, () => 0)
  return { width, height }
}

export function CanvasStage({
  model,
  clock,
  night,
  frameId,
  onFps,
}: {
  model: CanvasRenderModel
  clock: CanvasClock
  night: NightMode | null
  frameId: string
  onFps?: (fpsAvg: number) => void
}) {
  const viewport = useViewport()
  const refsByLayer = useRef(new Map<string, CanvasElementRefs>())
  const layerOpacityRefs = useRef(new Map<string, HTMLDivElement | null>())
  const sceneOpacityRef = useRef<HTMLDivElement | null>(null)
  const [scene, setScene] = useState(() => model.plan?.scene ?? null)
  const [layers, setLayers] = useState(() => model.layers)
  const layerKeyRef = useRef(layerChangeKey(model.layers))
  const takeover = model.takeover
  const takeoverRef = useRef(takeover)
  takeoverRef.current = takeover
  const clockRef = useRef(clock.offsetMs)
  clockRef.current = clock.offsetMs
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const loopKey = canvasLoopKey(takeover, clock.offsetMs)

  useEffect(() => {
    const current = takeoverRef.current
    if (!current || loopKey === 'none') return
    const { deployment, geometry, slot } = current
    const album = deployment.album
    const seed = album ? seedFromString(album.id) : 0
    let handle = 0
    let last = 0
    let frames = 0
    let windowStart = Date.now()
    const interval = 1000 / Math.max(1, deployment.config.maxFps)

    const tick = (timestamp: number) => {
      handle = requestAnimationFrame(tick)
      if (timestamp - last < interval) return
      last = timestamp
      frames += 1

      const t = Date.now() + clockRef.current - deployment.effectiveAt
      const plan = album && t >= 0 ? sceneAt(album, seed, t, album.crossfadeMs) : null
      const plans = album && t >= 0 ? layerRendersAt(album, seed, Math.max(0, t), geometry, slot) : []
      const key = layerChangeKey(plans)

      if (plan && plan.scene.id !== sceneRef.current?.id) {
        sceneRef.current = plan.scene
        setScene(plan.scene)
      }
      if (key !== layerKeyRef.current) {
        layerKeyRef.current = key
        setLayers(plans)
      }

      // Layer wrappers are restyled every frame so fades and masks animate.
      if (plan && sceneOpacityRef.current) sceneOpacityRef.current.style.opacity = String(plan.fade)
      for (const layer of plans) {
        if (!layer.render) continue
        paintScene(layer.render, geometry, slot, refsForLayer(refsByLayer.current, layer.layerId))
        const wrapper = layerOpacityRefs.current.get(layer.layerId)
        if (!wrapper) continue
        wrapper.style.clipPath = layer.clipPath
        wrapper.style.opacity = String(layerOpacity(layer))
      }

      const wall = Date.now()
      if (wall - windowStart >= 10_000) {
        const fpsAvg = Math.round(((frames * 1000) / (wall - windowStart)) * 10) / 10
        onFps?.(Math.min(240, fpsAvg))
        frames = 0
        windowStart = wall
      }
    }

    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [loopKey, onFps])

  if (!takeover) {
    return (
      <div className="relative h-dvh w-screen overflow-hidden bg-black" data-canvas-frame={frameId}>
        <IdentifyOverlay model={model} clock={clock} frameId={frameId} />
        {night && <NightOverlay night={night} />}
      </div>
    )
  }

  const { deployment, geometry, slot } = takeover
  const scale = fitScale(slot.w, slot.h, viewport.width, viewport.height)
  const rotationStyle = rotatedSlotStyle(slot, scale)
  if (scale <= 0) return null

  const config = deployment.config
  const showMarker = !model.identify && (config.markers === 'always' || (!scene && config.markers !== 'never'))

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ width: slot.w * scale, height: slot.h * scale }}
      data-canvas-frame={frameId}
    >
      <div
        className="absolute left-0 top-0 origin-top-left overflow-hidden"
        style={{
          width: slot.w,
          height: slot.h,
          transform: `${rotationStyle.transform ? `${rotationStyle.transform} ` : ''}scale(${scale})`,
          transformOrigin: rotationStyle.transformOrigin,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -slot.x,
            top: -slot.y,
            width: geometry.width,
            height: geometry.height,
            background: deployment.config.background,
          }}
        >
          {layers.length > 0 && (
            <CanvasLayerStack
              layers={layers}
              geometry={geometry}
              slot={slot}
              refsByLayer={refsByLayer.current}
              opacityRefs={layerOpacityRefs.current}
              sceneOpacityRef={sceneOpacityRef}
            />
          )}
        </div>

        {showMarker && (
          <div
            style={{
              position: 'absolute',
              left: 24,
              top: 24,
              minWidth: 64,
              height: 64,
              padding: '0 16px',
              borderRadius: 12,
              background: 'rgba(0,0,0,0.55)',
              color: '#ffffff',
              fontFamily: fontStack('mono'),
              fontSize: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {slot.marker}
          </div>
        )}

        <IdentifyOverlay model={model} clock={clock} frameId={frameId} />
        {night && <NightOverlay night={night} />}
        {config.notifications === 'show' && <FrameNoticeLayer />}
      </div>
    </div>
  )
}
