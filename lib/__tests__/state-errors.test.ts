import { describe, it, expect, vi } from 'vitest'

vi.mock('../store', () => ({ readStore: vi.fn() }))
vi.mock('../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../db', () => ({ queryHistory: vi.fn(), recordDecision: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision, FrameNotFoundError } from '../engine/state'

describe('getDecision missing frame', () => {
  it('throws FrameNotFoundError when the store is absent', async () => {
    const { readStore } = await import('../store')
    vi.mocked(readStore).mockResolvedValue(null)
    await expect(getDecision('ghost')).rejects.toBeInstanceOf(FrameNotFoundError)
  })
})
