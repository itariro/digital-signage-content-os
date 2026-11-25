import type { CanvasIdentify, CanvasState, DeploymentAlbum } from '@/lib/types'
import { resolveGeometry, type FrameScreenSize, type ResolvedGeometry, type ResolvedSlot } from './geometry'
import { resolveCanvasTakeover, type CanvasTakeover } from './takeover'
import { sceneAt, type ScenePlan } from './scheduler'
import { computeSceneState, type SceneRenderState } from './scenes/registry'
import { seedFromString } from './prng'
import { layerPlanAt } from './composition'
import { resolveSceneColors } from './palettes'
import {
  transitionClipPath,
  transitionMaskAt,
  transitionProgress,
  type TransitionMask,
} from './transitions'

export type LayerRender = {
  layerId: string
  index: number
  name: string
  opacity: number
  plan: ScenePlan | null
  render: SceneRenderState | null
  mask: TransitionMask
  clipPath: string
}

export type CanvasRenderModel = {
  takeover: CanvasTakeover | null
  plan: ScenePlan | null
  render: SceneRenderState | null
  identify: CanvasIdentify | null
  layers: LayerRender[]
  slotRect: string | null
  bezelMode: 'show' | 'hide' | 'collapse'
  gaps: Array<{ x: number; y: number; w: number; h: number }>
}

/**
 * A scheduled deployment still owns its slot before `effectiveAt`, so the
 * render model can show the pre-roll background and marker. Takeover itself
 * stays null until go-live; this only supplies the framing for pre-roll.
 */
function preRollTakeover(state: CanvasState, synced: number, frames: FrameScreenSize[]): CanvasTakeover | null {
  const deployment = state.active
  if (!deployment || synced >= deployment.effectiveAt) return null
  if (deployment.releaseAt !== null && synced >= deployment.releaseAt) return null

  const geometry = resolveGeometry(deployment.config, frames)
  const slot = geometry.slots.find((entry) => entry.slotId === deployment.slotId)
  return slot ? { deployment, geometry, slot } : null
}

/** Next canvas deadline after `syncedMs`, in console time. */
export function nextCanvasDeadlineMs(state: CanvasState | null, syncedMs: number): number | null {
  if (!state || !Number.isFinite(syncedMs)) return null
  const candidates = [
    state.active?.effectiveAt,
    state.active?.releaseAt,
    state.pending?.effectiveAt,
    state.pending?.releaseAt,
    state.identify?.until,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > syncedMs)
  return candidates.length === 0 ? null : Math.min(...candidates)
}

/**
 * One layer stack for one slot at one instant. `tMs` is wall time since
 * deployment, never a scene-local time, so every layer and frame shares the
 * same transition front. Scene state still uses `plan.sceneTimeMs`.
 */
export function layerRendersAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tMs: number,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
): LayerRender[] {
  const kind = album.transition?.kind ?? 'none'
  const direction = album.transition?.direction ?? 'left'
  const progress = transitionProgress(album.transition, tMs)

  return layerPlanAt(album, albumSeed, tMs).map((planned) => {
    const render = planned.plan
      ? computeSceneState(resolveSceneColors(planned.plan.scene, album.palette), {
          bounds: { width: geometry.width, height: geometry.height },
          geometry,
          tMs: planned.plan.sceneTimeMs,
          seed: planned.plan.seed,
        })
      : null
    const mask = transitionMaskAt(kind, progress, slot, geometry, direction)
    return {
      ...planned,
      render,
      mask,
      clipPath: transitionClipPath(kind, mask, direction, slot, geometry),
    }
  })
}

/**
 * Everything one display needs for one instant. `nowMs` is local time;
 * `clockOffsetMs` converts it to console time. Scene state uses no slot data;
 * only the transition mask does. Identify is independent of a deployment, so
 * a live identify yields a model with no takeover or scene. Before
 * `effectiveAt` the model is pre-roll: background and marker only.
 */
export function canvasRenderModel(
  state: CanvasState | null,
  nowMs: number,
  clockOffsetMs = 0,
  frames: FrameScreenSize[] = [],
): CanvasRenderModel | null {
  if (!state) return null
  const synced = nowMs + clockOffsetMs
  const identify = state.identify && state.identify.until > synced ? state.identify : null
  const takeover = resolveCanvasTakeover(state, synced, frames) ?? preRollTakeover(state, synced, frames)
  if (!takeover && !identify) return null

  let plan: ScenePlan | null = null
  let render: SceneRenderState | null = null
  let layers: LayerRender[] = []
  let slotRect: string | null = null

  if (takeover) {
    const { deployment, geometry, slot } = takeover
    slotRect = `${slot.w}×${slot.h} cpx @ ${slot.x},${slot.y}`
    const t = synced - deployment.effectiveAt
    const album = deployment.album
    if (album && t >= 0) {
      const albumSeed = seedFromString(album.id)
      layers = layerRendersAt(album, albumSeed, t, geometry, slot)
      const fallbackPlan = sceneAt(album, albumSeed, t, album.crossfadeMs)
      const first = layers.find((layer) => layer.render) ?? layers[0] ?? null
      plan = first?.plan ?? fallbackPlan
      render = first?.render ?? null
    }
  }

  const bezelMode = takeover?.deployment.config.bezelMode ?? 'show'
  const gaps = bezelMode === 'collapse' ? [] : (takeover?.geometry.gaps ?? [])

  return { takeover, plan, render, identify, layers, slotRect, bezelMode, gaps }
}
