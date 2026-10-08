import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDecision } from '../state'
import type { FrameStore } from '../../types'

function makeStore(overrides?: Partial<FrameStore>): FrameStore {
  return {
    activeId: 'layout-1',
    layouts: [{ id: 'layout-1', name: 'Test', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
    presets: [],
    customFonts: [],
    schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    ...overrides,
  }
}

const {
  mockReadStore,
  mockFetchWeather,
  mockQueryHistory,
  mockAppendHistory,
  mockPruneHistory,
} = vi.hoisted(() => ({
  mockReadStore: vi.fn(),
  mockFetchWeather: vi.fn(),
  mockQueryHistory: vi.fn(),
  mockAppendHistory: vi.fn(),
  mockPruneHistory: vi.fn(),
}))

vi.mock('../../store', () => ({
  readStore: mockReadStore,
}))
vi.mock('../../weather', () => ({
  fetchWeather: mockFetchWeather,
}))
vi.mock('../../db', () => ({
  queryHistory: mockQueryHistory,
  appendHistory: mockAppendHistory,
  pruneHistory: mockPruneHistory,
}))

describe('getDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue([])
    mockAppendHistory.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
  })

  it('returns a decision with ruleId null when experiences disabled', async () => {
    mockReadStore.mockResolvedValue(makeStore())
    mockFetchWeather.mockResolvedValue(undefined)

    const { decision } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.layoutId).toBe('layout-1')
    expect(decision.state).toBe('ambient')
  })

  it('returns a decision with ruleId when experience matches', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Morning', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'layout-1', state: 'action', bob: { expression: 'planning' }, score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    const { decision } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBe('r1')
    expect(decision.state).toBe('action')
    expect(decision.bob?.expression).toBe('planning')
  })

  it('filters out candidates with non-existent layoutId', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Bad', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'non-existent', state: 'ambient', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    const { decision } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.layoutId).toBe('layout-1')
  })

  it('appends to history after selecting', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Morning', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'layout-1', state: 'action', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockAppendHistory).toHaveBeenCalledWith(
      'home',
      expect.any(String),
      'layout-1',
      expect.any(Date),
      expect.any(Number)
    )
  })

  it('prunes history before appending', async () => {
    mockReadStore.mockResolvedValue(makeStore())
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockPruneHistory).toHaveBeenCalledWith('home')
  })
})
