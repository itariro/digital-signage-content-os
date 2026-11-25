import { describe, expect, it } from 'vitest'
import { GAME_ROUND_TICKS, gameStateAt } from '@/lib/canvas/games'

type State = { x: number; rolls: number[] }

function replay(tMs: number, steps: { count: () => void }) {
  return gameStateAt<State>({
    key: 'snake-test',
    seed: 7,
    stepMs: 100,
    tMs,
    initial: (seed) => ({ x: seed % 10, rolls: [] }),
    step: (state, tick, random) => {
      steps.count()
      const r = random()
      return { x: state.x + 1 + (tick % 2), rolls: [...state.rolls, Math.round(r * 1000) / 1000] }
    },
  })
}

describe('gameStateAt', () => {
  it('is independent of call order', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    const late = replay(25_000, counter)
    const early = replay(1_200, counter)
    const lateAgain = replay(25_000, counter)
    expect(late).toEqual(lateAgain)
    expect(late.tick).toBe(250)
    expect(early.tick).toBe(12)
  })

  it('does at most one round of work per call', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    replay(GAME_ROUND_TICKS * 100 * 40 + 599 * 100, counter)
    expect(counter.value).toBeLessThanOrEqual(GAME_ROUND_TICKS)
  })

  it('uses only seeded randomness', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    expect(replay(3_400, counter)).toEqual(replay(3_400, counter))
  })
})
