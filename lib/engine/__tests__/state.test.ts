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
  mockRecordDecision,
  mockPruneHistory,
} = vi.hoisted(() => ({
  mockReadStore: vi.fn(),
  mockFetchWeather: vi.fn(),
  mockQueryHistory: vi.fn(),
  mockRecordDecision: vi.fn(),
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
  recordDecision: mockRecordDecision,
  pruneHistory: mockPruneHistory,
}))

describe('getDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue([])
    mockRecordDecision.mockResolvedValue(undefined)
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

  it('records the decision (prune + append atomically) after selecting', async () => {
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
    expect(mockRecordDecision).toHaveBeenCalledWith(
      'home',
      expect.objectContaining({
        id: expect.any(String),
        layoutId: 'layout-1',
        score: expect.any(Number),
      }),
      expect.any(Date)
    )
    // Pruning happens inside recordDecision on the append path, not separately.
    expect(mockPruneHistory).not.toHaveBeenCalled()
  })

  it('prunes history on the fallback path (experiences disabled)', async () => {
    mockReadStore.mockResolvedValue(makeStore())
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockPruneHistory).toHaveBeenCalledWith('home')
    expect(mockRecordDecision).not.toHaveBeenCalled()
  })

  it('prunes history when no experience rule wins', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Bad', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'non-existent', state: 'ambient', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockPruneHistory).toHaveBeenCalledWith('home')
    expect(mockRecordDecision).not.toHaveBeenCalled()
  })
})

describe('schedule fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue([])
    mockRecordDecision.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
    mockFetchWeather.mockResolvedValue(undefined)
  })

  function scheduledStore(rule: FrameStore['schedule']['rules'][number], timezone = 'UTC'): FrameStore {
    return makeStore({
      activeId: 'layout-1',
      layouts: [
        { id: 'layout-1', name: 'Default', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' },
        { id: 'layout-2', name: 'Scheduled', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' },
      ],
      schedule: { enabled: true, rules: [rule], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
      experiences: { enabled: false, rules: [], settings: { schoolHolidays: [], timezone } },
    })
  }

  it('honors simulatedTime instead of wall-clock time', async () => {
    // Monday 09:30 UTC.
    mockReadStore.mockResolvedValue(
      scheduledStore({ id: 's1', layoutId: 'layout-2', days: [1], start: '09:00', end: '10:00' })
    )

    const { decision } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-05T09:30:00Z'),
    })
    expect(decision.layoutId).toBe('layout-2')
  })

  it('matches the post-midnight portion of an overnight rule', async () => {
    // Saturday 02:00 UTC, rule Friday 22:00–06:00.
    mockReadStore.mockResolvedValue(
      scheduledStore({ id: 's1', layoutId: 'layout-2', days: [5], start: '22:00', end: '06:00' })
    )

    const { decision } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-10T02:00:00Z'),
    })
    expect(decision.layoutId).toBe('layout-2')
  })

  it('falls back to the active layout when the schedule rule references a deleted layout', async () => {
    mockReadStore.mockResolvedValue(
      scheduledStore({ id: 's1', layoutId: 'ghost', days: [1], start: '09:00', end: '10:00' })
    )

    const { decision } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-05T09:30:00Z'),
    })
    expect(decision.layoutId).toBe('layout-1')
  })

  it('resolves the schedule in the configured timezone', async () => {
    // Thursday 23:30 UTC is Friday 13:30 in UTC+14 (Pacific/Kiritimati).
    mockReadStore.mockResolvedValue(
      scheduledStore(
        { id: 's1', layoutId: 'layout-2', days: [5], start: '13:00', end: '14:00' },
        'Pacific/Kiritimati'
      )
    )

    const { decision } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-08T23:30:00Z'),
    })
    expect(decision.layoutId).toBe('layout-2')
  })
})
