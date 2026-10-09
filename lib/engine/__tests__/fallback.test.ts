import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store', () => ({ readStore: vi.fn() }))
vi.mock('../../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../../db', () => ({ queryHistory: vi.fn(), recordDecision: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision } from '../state'

describe('fallback', () => {
  it('returns ruleId null when experiences disabled', async () => {
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
    vi.mocked(fetchWeather).mockResolvedValue(undefined as any)

    const { decision } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.bob).toBeNull()
  })
})
