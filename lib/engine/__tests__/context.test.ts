import { describe, it, expect } from 'vitest'
import { buildContext } from '../context'
import type { FrameStore, WeatherData } from '../../types'

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

describe('buildContext', () => {
  it('returns morning period at 07:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T07:00:00Z'))
    expect(ctx.period).toBe('morning')
    expect(ctx.weekday).toBe('THU')
  })

  it('returns night period at 02:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T02:00:00Z'))
    expect(ctx.period).toBe('night')
  })

  it('returns wind-down period at 22:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T22:00:00Z'))
    expect(ctx.period).toBe('wind-down')
  })

  it('returns welcome-home period at 17:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T17:00:00Z'))
    expect(ctx.period).toBe('welcome-home')
  })

  it('detects school day on a weekday', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.schoolDay).toBe(true)
  })

  it('detects non-school day on weekend', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-10T10:00:00Z'))
    expect(ctx.schoolDay).toBe(false)
  })

  it('detects non-school day on holiday', () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: ['2026-10-08'] } },
    })
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.schoolDay).toBe(false)
  })

  it('applies the configured timezone', () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'America/New_York' } },
    })
    // 02:00 UTC = 22:00 the previous day in New York (EDT, UTC-4)
    const ctx = buildContext(store, new Date('2026-10-08T02:00:00Z'))
    expect(ctx.period).toBe('wind-down')
    expect(ctx.weekday).toBe('WED')
    expect(ctx.date.iso).toBe('2026-10-07')
  })

  it('derives rain specialTag when rain probability > 60%', () => {
    const weather: WeatherData = {
      sample: false,
      current: { temp: 15, code: 61, isDay: true, uv: 2 },
      today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' },
      daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 75 }],
      hourly: [],
    }
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'), weather)
    expect(ctx.specialTags).toContain('rain')
  })

  it('derives heat and uv specialTags', () => {
    const weather: WeatherData = {
      sample: false,
      current: { temp: 33, code: 0, isDay: true, uv: 8 },
      today: { high: 35, low: 24, uvMax: 9, sunrise: '', sunset: '' },
      daily: [],
      hourly: [],
    }
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'), weather)
    expect(ctx.specialTags).toContain('heat')
    expect(ctx.specialTags).toContain('uv')
  })

  it('derives cold specialTag', () => {
    const weather: WeatherData = {
      sample: false,
      current: { temp: 2, code: 0, isDay: true, uv: 1 },
      today: { high: 4, low: -1, uvMax: 2, sunrise: '', sunset: '' },
      daily: [],
      hourly: [],
    }
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'), weather)
    expect(ctx.specialTags).toContain('cold')
  })

  it('returns no specialTags when weather is absent', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.specialTags).toEqual([])
    expect(ctx.weather).toBeUndefined()
  })

  it('falls back to server UTC on invalid timezone', () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'Invalid/Zone' } },
    })
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.now).toBeDefined()
    // Invalid zone falls back to UTC, so 10:00Z stays day on THU.
    expect(ctx.period).toBe('day')
    expect(ctx.weekday).toBe('THU')
  })
})
