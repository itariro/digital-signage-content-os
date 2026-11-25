'use client'

import type { RefObject } from 'react'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { LayerRender } from '@/lib/canvas/render-model'
import { CanvasFrameScene, type CanvasElementRefs } from './canvas-frame-scene'

export function refsForLayer(
  store: Map<string, CanvasElementRefs>,
  layerId: string,
): CanvasElementRefs {
  const refs: CanvasElementRefs = store.get(layerId) ?? new Map()
  store.set(layerId, refs)
  return refs
}

/** Animated wrapper opacity, including the layer's own configured multiplier. */
export function layerOpacity(layer: LayerRender): number {
  return layer.opacity * (layer.plan?.fade ?? 1)
}

/** Change key for the mounted layer set: ids and scenes, not fade or mask. */
export function layerChangeKey(layers: LayerRender[]): string {
  return layers
    .map((layer) => JSON.stringify([layer.layerId, layer.plan?.scene.id ?? '']))
    .join('|')
}

export function CanvasLayerStack({
  layers,
  geometry,
  slot,
  refsByLayer,
  opacityRefs,
  sceneOpacityRef,
}: {
  layers: LayerRender[]
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refsByLayer: Map<string, CanvasElementRefs>
  opacityRefs?: Map<string, HTMLDivElement | null>
  sceneOpacityRef?: RefObject<HTMLDivElement | null>
}) {
  return (
    <>
      {layers.map((layer, index) => (
        layer.render ? (
          <div
            key={layer.layerId}
            ref={(element) => {
              opacityRefs?.set(layer.layerId, element)
              if (index === 0 && sceneOpacityRef) sceneOpacityRef.current = element
            }}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: layerOpacity(layer),
              clipPath: layer.clipPath,
            }}
          >
            <CanvasFrameScene
              model={layer.render}
              geometry={geometry}
              slot={slot}
              refs={refsForLayer(refsByLayer, layer.layerId)}
            />
          </div>
        ) : null
      ))}
    </>
  )
}
