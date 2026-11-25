import { pollDelayMs } from '@/lib/canvas/poll'

export const MAX_LEAD_MS = 10 * 60 * 1000
export const DEFAULT_LEAD_MS = 15_000

// Lead times are returned to operators and must be stable. The live poll keeps
// its jitter; the lead calculation uses the nominal delay.
const NOMINAL_POLL = () => 0.5

/** Spec §13.1: 2 * max member poll + 5 s. */
export function minLeadMs(hasCanvasState: boolean[], env: NodeJS.ProcessEnv = process.env): number {
  const maxPollMs = hasCanvasState.reduce(
    (max, hasState) => Math.max(max, pollDelayMs(hasState, env, NOMINAL_POLL)),
    0,
  )
  return 2 * maxPollMs + 5_000
}

export function leadMs(
  requested: number | undefined,
  hasCanvasState: boolean[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  const floor = minLeadMs(hasCanvasState, env)
  const wanted = typeof requested === 'number' && Number.isFinite(requested) ? requested : DEFAULT_LEAD_MS
  return Math.min(MAX_LEAD_MS, Math.max(floor, wanted))
}
