import { runSyncCycle, type SyncConfig } from '@/lib/sync/client'
import { getCanvasState } from './state-store'

export type CanvasPollEnv = {
  [key: string]: string | undefined
  CANVAS_POLL_ACTIVE_SECONDS?: string
  CANVAS_POLL_IDLE_SECONDS?: string
  SYNC_INTERVAL_MINUTES?: string
}

export type CanvasPollOptions = {
  env?: CanvasPollEnv
  random?: () => number
  isActive?: () => boolean | Promise<boolean>
  run?: (config: SyncConfig) => Promise<unknown>
}

const ACTIVE_MS = 5000
const IDLE_MS = 30_000
const BACKOFF_MS = [30_000, 60_000] as const
const JITTER = 0.1

function overrideSeconds(env: CanvasPollEnv, key: 'CANVAS_POLL_ACTIVE_SECONDS' | 'CANVAS_POLL_IDLE_SECONDS'): number | null {
  const raw = env[key]
  if (raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function regularSyncMs(env: CanvasPollEnv): number {
  const raw = env.SYNC_INTERVAL_MINUTES
  const minutes = raw === undefined || raw === '' ? 15 : Number(raw)
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000
}

function withJitter(ms: number, random: () => number): number {
  const factor = 1 + (random() * 2 - 1) * JITTER
  return Math.max(1, Math.round(ms * factor))
}

/** Pure delay calculation; `random` is injected so the jitter is testable. */
export function pollDelayMs(
  active: boolean,
  env: CanvasPollEnv = process.env,
  random: () => number = Math.random,
): number {
  const key = active ? 'CANVAS_POLL_ACTIVE_SECONDS' : 'CANVAS_POLL_IDLE_SECONDS'
  const override = overrideSeconds(env, key)
  if (override === 0) return withJitter(regularSyncMs(env), random)
  if (override !== null) return withJitter(override * 1000, random)
  return withJitter(active ? ACTIVE_MS : IDLE_MS, random)
}

function backoffMs(failures: number, random: () => number): number {
  return withJitter(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1], random)
}

async function stateIsActive(instanceId: string): Promise<boolean> {
  try {
    const row = await getCanvasState(instanceId)
    return Boolean(row?.data?.active || row?.data?.identify)
  } catch {
    return false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let runningToken: number | null = null
let generation = 0
let failures = 0

export function startCanvasPoll(config: SyncConfig, options: CanvasPollOptions = {}): void {
  if (timer !== null || runningToken !== null) return
  const env = options.env ?? process.env
  const random = options.random ?? Math.random
  const isActive = options.isActive ?? (() => stateIsActive(config.instanceId))
  const run = options.run ?? runSyncCycle
  const token = generation

  const finish = () => {
    if (runningToken === token) runningToken = null
  }

  const tick = async () => {
    if (token !== generation) return
    timer = null
    runningToken = token
    let failed = false
    try {
      await run(config)
    } catch (error: unknown) {
      failed = true
      console.error('canvas poll failed:', error)
    }
    if (token !== generation) return finish()
    failures = failed ? failures + 1 : 0
    const active = await isActive()
    if (token !== generation) return finish()
    const delay = failed ? backoffMs(failures, random) : pollDelayMs(active, env, random)
    timer = setTimeout(tick, delay)
    finish()
  }

  timer = setTimeout(tick, 0)
}

export function stopCanvasPoll(): void {
  generation += 1
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  runningToken = null
  failures = 0
}
