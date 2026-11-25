import { fold } from '@/lib/canvas/math'
import type { SyncTestConfig } from '@/lib/types'
import type { SceneStateContext } from './types'

export type SyncTestState = { axis: 'x' | 'y'; bar: number }

export function syncTestState(config: SyncTestConfig, ctx: SceneStateContext): SyncTestState {
  const axis = ctx.bounds.width >= ctx.bounds.height ? 'x' : 'y'
  const length = axis === 'x' ? ctx.bounds.width : ctx.bounds.height
  const periodMs = Math.max(1, config.periodSec * 1000)
  return { axis, bar: fold((ctx.tMs / periodMs) * length * 2, length) }
}
