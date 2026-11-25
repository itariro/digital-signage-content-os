import type { CanvasScene, DeploymentAlbum } from '@/lib/types'
import { hash32, seededPermutation } from './prng'

export type ScenePlan = {
  scene: CanvasScene
  index: number
  sceneTimeMs: number
  cycle: number
  nextChangeAtMs: number
  fade: number
  seed: number
}

/**
 * Find the scene at an absolute synced time. Pure: the same inputs always give
 * the same plan, on every frame. `tSinceEpochMs` is measured from the
 * deployment's `effectiveAt`.
 */
export function sceneAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tSinceEpochMs: number,
  crossfadeMs: number,
): ScenePlan | null {
  const enabled = album.scenes.filter((scene) => scene.enabled && scene.durationSec > 0)
  if (enabled.length === 0) return null
  if (!Number.isFinite(tSinceEpochMs) || tSinceEpochMs < 0) return null

  const total = enabled.reduce((sum, scene) => sum + scene.durationSec * 1000, 0)
  if (!(total > 0)) return null

  const cycle = Math.floor(tSinceEpochMs / total)
  let elapsed = tSinceEpochMs - cycle * total

  const order =
    album.order === 'shuffle'
      ? seededPermutation(enabled.length, hash32(albumSeed ^ hash32(cycle)), 0)
      : enabled.map((_, index) => index)

  let chosen = order[order.length - 1]
  for (const position of order) {
    const duration = enabled[position].durationSec * 1000
    if (elapsed < duration) {
      chosen = position
      break
    }
    elapsed -= duration
  }

  const scene = enabled[chosen]
  const duration = scene.durationSec * 1000
  const sceneTimeMs = Math.min(duration, Math.max(0, elapsed))
  const fadeWindow = Math.min(Math.max(0, crossfadeMs), duration / 3)
  const fade =
    fadeWindow > 0
      ? Math.max(0, Math.min(1, Math.min(sceneTimeMs / fadeWindow, (duration - sceneTimeMs) / fadeWindow)))
      : 1

  return {
    scene,
    index: chosen,
    sceneTimeMs,
    cycle,
    nextChangeAtMs: tSinceEpochMs + (duration - sceneTimeMs),
    fade,
    seed: album.order === 'shuffle' ? hash32(scene.seed ^ hash32(cycle)) : scene.seed,
  }
}
