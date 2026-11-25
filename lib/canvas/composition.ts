import type { CanvasAlbum, CanvasLayer, CanvasPalette, CanvasScene, DeploymentAlbum } from '@/lib/types'
import { CANVAS_PALETTE_IDS, CANVAS_TRANSITION_KINDS } from '@/lib/types'
import { hash32 } from './prng'
import { sceneAt, type ScenePlan } from './scheduler'
import { getCanvasPalette } from './palettes'

export const BASE_LAYER_ID = 'base'

export type LayerPlan = {
  layerId: string
  index: number
  name: string
  opacity: number
  plan: ScenePlan | null
}

export function baseLayerFromScenes(
  scenes: CanvasScene[],
  name: string,
  order: 'sequence' | 'shuffle',
  crossfadeMs: number,
): CanvasLayer {
  return {
    id: BASE_LAYER_ID,
    name,
    enabled: true,
    scenes,
    order,
    crossfadeMs,
  }
}

function layersFromDeployment(album: DeploymentAlbum): CanvasLayer[] {
  if (album.layers?.length) return album.layers
  return [baseLayerFromScenes(album.scenes, album.name, album.order, album.crossfadeMs)]
}

/**
 * Keep the phase 1 `scenes` field and layer zero identical. Old albums get one
 * generated layer; invalid new values are clamped instead of rejected so a
 * legacy library document still loads.
 */
export function syncCanvasAlbumLayers(album: CanvasAlbum): CanvasAlbum {
  const base = baseLayerFromScenes(
    album.scenes ?? [],
    album.name,
    album.slideshow.order,
    album.slideshow.canvas?.crossfadeMs ?? 400,
  )
  const raw = album.layers?.length ? album.layers : [base]
  const layers = raw.slice(0, 3).map((item, index): CanvasLayer => {
    const crossfade = Number.isFinite(item.crossfadeMs) ? item.crossfadeMs : 400
    return {
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 40) : `${BASE_LAYER_ID}-${index}`,
      name: typeof item.name === 'string' && item.name ? item.name.slice(0, 60) : `Layer ${index + 1}`,
      enabled: item.enabled !== false,
      scenes: Array.isArray(item.scenes) ? item.scenes : [],
      order: item.order === 'shuffle' ? 'shuffle' : 'sequence',
      crossfadeMs: Math.min(3000, Math.max(0, Math.round(crossfade))),
    }
  })

  const transition = album.transition
    ? {
        kind: (CANVAS_TRANSITION_KINDS as readonly string[]).includes(album.transition.kind) ? album.transition.kind : 'none' as const,
        durationMs: Number.isFinite(album.transition.durationMs)
          ? Math.min(10_000, Math.max(0, Math.round(album.transition.durationMs)))
          : 0,
        direction: (['left', 'right', 'up', 'down'] as const).includes(album.transition.direction)
          ? album.transition.direction
          : 'left' as const,
      }
    : undefined

  const paletteId = album.paletteId && (CANVAS_PALETTE_IDS as readonly string[]).includes(album.paletteId)
    ? album.paletteId
    : undefined

  return {
    ...album,
    layers,
    scenes: layers[0].scenes,
    transition,
    paletteId,
  }
}

/** Build the deployment snapshot album from an authoring album. */
export function deploymentAlbumFrom(album: CanvasAlbum): DeploymentAlbum {
  const synced = syncCanvasAlbumLayers(album)
  const base = synced.layers![0]
  const palette: CanvasPalette = getCanvasPalette(synced.paletteId)
  return {
    id: album.id,
    name: album.name,
    scenes: base.scenes,
    order: base.order,
    crossfadeMs: base.crossfadeMs,
    layers: synced.layers,
    transition: synced.transition ?? { kind: 'none', durationMs: 0, direction: 'left' },
    palette,
  }
}

/**
 * All enabled layers at one instant. Every layer uses the same `tSinceEpochMs`,
 * so a disabled layer or a different scene length cannot shift another layer's
 * scene-local time or fade.
 */
export function layerPlanAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tSinceEpochMs: number,
): LayerPlan[] {
  const layers = layersFromDeployment(album)
  const plans: LayerPlan[] = []
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (!layer.enabled) continue
    const layerAlbum: DeploymentAlbum = {
      id: `${album.id}|${layer.id}`,
      name: layer.name,
      scenes: layer.scenes,
      order: layer.order,
      crossfadeMs: layer.crossfadeMs,
    }
    plans.push({
      layerId: layer.id,
      index,
      name: layer.name,
      opacity: 1,
      plan: sceneAt(layerAlbum, hash32(albumSeed ^ hash32(index + 1)), tSinceEpochMs, layer.crossfadeMs),
    })
  }
  return plans
}
