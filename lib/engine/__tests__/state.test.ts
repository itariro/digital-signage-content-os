import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDecision } from '../state'
import type { FrameStore, LayoutSettings } from '../../types'

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
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set<string>(), latestLayoutId: null })
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
        ruleId: 'r1',
        score: expect.any(Number),
      }),
      expect.any(Date)
    )
    // Pruning happens inside recordDecision on the append path, not separately.
    expect(mockPruneHistory).not.toHaveBeenCalled()
  })

  it('records history at wall-clock time, not the simulated preview time', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Morning', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'layout-1', state: 'action', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    const before = Date.now()
    await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-08T10:00:00Z'),
    })
    const after = Date.now()

    // A simulated preview time must not be persisted as the show time, or it
    // would poison the repetition/duration windows of the live frame.
    const recordedAt = mockRecordDecision.mock.calls[0][2] as Date
    expect(recordedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(recordedAt.getTime()).toBeLessThanOrEqual(after)
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
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set<string>(), latestLayoutId: null })
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

describe('weather honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set<string>(), latestLayoutId: null })
    mockRecordDecision.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
  })

  it('drops sample weather so weather rules never match on fabricated data', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{
          id: 'rain', name: 'Rain', enabled: true, priority: 200,
          when: { weather: { rainProbabilityAbove: 60 } },
          then: { layoutId: 'layout-1', state: 'weather', score: 0, durationMs: 0 },
        }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue({
      sample: true,
      current: { temp: 20, code: 1, isDay: true, uv: 5 },
      today: { high: 25, low: 15, uvMax: 6, sunrise: '', sunset: '' },
      daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 90 }],
      hourly: [],
    })

    const { decision, context } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(context.weather).toBeUndefined()
    expect(decision.ruleId).toBeNull()
  })
})

describe('preview wall time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set(), latestLayoutId: null })
    mockRecordDecision.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
    mockFetchWeather.mockResolvedValue(undefined)
  })

  it('interprets simulatedWallTime in the frame timezone', async () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'Europe/Zurich' } },
    })
    mockReadStore.mockResolvedValue(store)

    const { context } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedWallTime: '2026-10-08T18:15',
      recordHistory: false,
    })
    // 18:15 Zurich is the welcome-home period, and the weekday is Thursday.
    expect(context.period).toBe('welcome-home')
    expect(context.weekday).toBe('THU')
  })

  it('falls back to server UTC when the frame timezone is invalid', async () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'Invalid/Zone' } },
    })
    mockReadStore.mockResolvedValue(store)

    const { context } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedWallTime: '2026-10-08T18:15',
      recordHistory: false,
    })
    // 18:15 interpreted as UTC is still the welcome-home period, Thursday.
    expect(context.period).toBe('welcome-home')
    expect(context.weekday).toBe('THU')
  })

  it('notification mode ignores display-history scoring so the most relevant rule still speaks', async () => {
    const settings: LayoutSettings = { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }
    const weatherRule = {
      id: 'r-rain',
      name: 'Rain',
      enabled: true,
      priority: 200,
      when: { weather: { rainProbabilityAbove: 60 } },
      then: { layoutId: 'layout-weather', state: 'weather' as const, bob: { expression: 'reminder' as const, speech: 'Take an umbrella.' }, score: 0, durationMs: 0, reason: 'Rain' },
    }
    const dayRule = {
      id: 'r-day',
      name: 'Day',
      enabled: true,
      priority: 100,
      when: { time: { from: '00:00', to: '23:59' } },
      then: { layoutId: 'layout-1', state: 'information' as const, bob: { expression: 'talking' as const, speech: 'Nice day.' }, score: 0, durationMs: 0, reason: 'Day' },
    }
    const store = makeStore({
      layouts: [
        { id: 'layout-1', name: 'Test', widgets: [], settings, createdAt: '', updatedAt: '' },
        { id: 'layout-weather', name: 'Weather', widgets: [], settings, createdAt: '', updatedAt: '' },
      ],
      experiences: { enabled: true, rules: [weatherRule, dayRule], settings: { schoolHolidays: [] } },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue({
      sample: false,
      current: { temp: 12, code: 61, isDay: true, uv: 2 },
      today: { high: 14, low: 9, uvMax: 3, sunrise: '2026-10-11T06:48', sunset: '2026-10-11T19:12' },
      daily: [{ date: '2026-10-11', code: 61, max: 14, min: 9, rainProbability: 80 }],
      hourly: [],
    })
    // The rain layout showed 30s ago (recent-repetition territory) but the day
    // layout is the incumbent. Layout mode subtracts 300 from the rain rule and
    // hands the win to the mundane day rule; notification mode must not.
    const now = Date.now()
    mockQueryHistory.mockResolvedValue({
      recent: [
        { layoutId: 'layout-weather', ruleId: 'r-rain', shownAt: new Date(now - 30_000) },
        { layoutId: 'layout-1', ruleId: 'r-day', shownAt: new Date(now - 10_000) },
      ],
      seenLayouts: new Set<string>(['layout-weather', 'layout-1']),
      latestLayoutId: 'layout-1',
    })

    const layoutMode = await getDecision('home', new Date(), { recordHistory: false })
    expect(layoutMode.decision.ruleId).toBe('r-day')

    const notificationMode = await getDecision('home', new Date(), { recordHistory: false, selection: 'notification' })
    expect(notificationMode.decision.ruleId).toBe('r-rain')
    expect(notificationMode.decision.bob?.speech).toBe('Take an umbrella.')
  })
})
