import { hash01, seedFromString } from '@/lib/mosaic'

export const GAME_ROUND_TICKS = 600

export type GameStep<S> = {
  index: number
  atMs: number
  nextAtMs: number
  round: number
  tick: number
  state: S
}

type GameParams<S> = {
  key: string
  seed: number
  stepMs: number
  tMs: number
  initial: (seed: number, round: number) => S
  step: (state: S, tick: number, random: () => number) => S
}

type CacheEntry<S> = { round: number; state: S }

const CACHE_LIMIT = 8
const roundCache = new Map<string, CacheEntry<unknown>>()

function trimCache(): void {
  while (roundCache.size > CACHE_LIMIT) {
    const first = roundCache.keys().next().value
    if (first === undefined) break
    roundCache.delete(first)
  }
}

/**
 * Replay small self-playing games from the start of the current 600-tick
 * round. The round start is a pure function of `(key, seed, round)`, so call
 * history never changes the result and a call never replays more than one
 * round. `step` receives a seeded random source instead of ambient randomness.
 */
export function gameStateAt<S>(params: GameParams<S>): GameStep<S> {
  const stepMs = Math.max(1, params.stepMs)
  const tMs = Math.max(0, params.tMs)
  const index = Math.floor(tMs / stepMs)
  const round = Math.floor(index / GAME_ROUND_TICKS)
  const tick = index % GAME_ROUND_TICKS
  const cacheKey = `${params.key}:${params.seed}:${stepMs}`

  const cached = roundCache.get(cacheKey) as CacheEntry<S> | undefined
  const roundStart = cached?.round === round ? cached.state : params.initial(params.seed, round)
  roundCache.set(cacheKey, { round, state: roundStart })
  trimCache()

  const base = (seedFromString(params.key) ^ params.seed ^ Math.imul(round, 0x9e3779b9)) | 0
  let state = roundStart
  for (let current = 0; current < tick; current += 1) {
    let draws = 0
    const random = () => {
      draws += 1
      return hash01(base, Math.imul(current + 1, 7919) + draws * 104729)
    }
    state = params.step(state, current, random)
  }

  const atMs = index * stepMs
  return { index, atMs, nextAtMs: atMs + stepMs, round, tick, state }
}
