import type { CanvasIdentify, CanvasState } from '@/lib/types'
import { resolveGeometry } from './geometry'
import { resolveCanvasTakeover, type CanvasTakeover } from './takeover'
import { sceneAt, type ScenePlan } from './scheduler'
import { computeSceneState, type SceneRenderState } from './scenes/registry'
import { seedFromString } from './prng'

export type CanvasRenderModel = {
  takeover: CanvasTakeover | null
  plan: ScenePlan | null
  render: SceneRenderState | null
  identify: CanvasIdentify | null
  slotRect: string | null
}

/**
 * A scheduled deployment still owns its slot before `effectiveAt`, so the
 * render model can show the pre-roll background and marker. Takeover itself
 * stays null until go-live; this only supplies the framing for pre-roll.
 */
function preRollTakeover(state: CanvasState, synced: number): CanvasTakeover | null {
  const deployment = state.active
  if (!deployment || synced >= deployment.effectiveAt) return null
  if (deployment.releaseAt !== null && synced >= deployment.releaseAt) return null

  const geometry = resolveGeometry(deployment.config)
  const slot = geometry.slots.find((entry) => entry.slotId === deployment.slotId)
  return slot ? { deployment, geometry, slot } : null
}

/**
 * Everything one display needs for one instant. `nowMs` is local time;
 * `clockOffsetMs` converts it to console time, which is the time the
 * deployment and identify deadlines are written in. Identify is independent
 * of a deployment, so a live identify yields a model with no takeover or scene.
 * Before `effectiveAt` the model is pre-roll: background and marker only.
 */
export function canvasRenderModel(
  state: CanvasState | null,
  nowMs: number,
  clockOffsetMs = 0,
): CanvasRenderModel | null {
  if (!state) return null
  const synced = nowMs + clockOffsetMs
  const identify = state.identify && state.identify.until > synced ? state.identify : null
  const takeover = resolveCanvasTakeover(state, synced) ?? preRollTakeover(state, synced)
  if (!takeover && !identify) return null

  let plan: ScenePlan | null = null
  let render: SceneRenderState | null = null
  let slotRect: string | null = null

  if (takeover) {
    const { deployment, geometry, slot } = takeover
    slotRect = `${slot.w}×${slot.h} cpx @ ${slot.x},${slot.y}`
    const t = synced - deployment.effectiveAt
    const album = deployment.album
    if (album && t >= 0) {
      plan = sceneAt(album, seedFromString(album.id), t, album.crossfadeMs)
      render = plan
        ? computeSceneState(plan.scene, {
            bounds: { width: geometry.width, height: geometry.height },
            geometry,
            tMs: plan.sceneTimeMs,
            seed: plan.seed,
          })
        : null
    }
  }

  return { takeover, plan, render, identify, slotRect }
}
