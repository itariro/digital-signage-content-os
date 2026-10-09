import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store', () => ({ readStore: vi.fn() }))
vi.mock('../../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../../db', () => ({ queryHistory: vi.fn(), recordDecision: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision } from '../state'

describe('preview', () => {
  it('does not append to history', async () => {
    const { recordDecision } = await import('../../db')
    vi.mocked(recordDecision).mockResolvedValue(undefined)

    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test', settings: { lat: 0, lon: 0, units: 'metric' } }],
      schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
      albums: [],
      experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    } as any
    const { readStore } = await import('../../store')
    vi.mocked(readStore).mockResolvedValue(store)
    const { fetchWeather } = await import('../../weather')
    vi.mocked(fetchWeather).mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'), { simulatedTime: new Date('2026-10-08T10:00:00Z'), recordHistory: false })
    expect(recordDecision).not.toHaveBeenCalled()
  })
})
