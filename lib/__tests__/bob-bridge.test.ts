import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bobVariantFor, createBobBridge, DEFAULT_BOB_THROTTLE_MS } from '../bob-bridge'
import type { DisplayDecision, ExperienceContext, FrameStore } from '../types'

describe('bobVariantFor', () => {
  it('maps celebration to success', () => {
    expect(bobVariantFor('celebration')).toBe('success')
  })

  it('maps the reminder expression to reminder regardless of state', () => {
    expect(bobVariantFor('information', 'reminder')).toBe('reminder')
    expect(bobVariantFor('celebration', 'reminder')).toBe('reminder')
  })

  it('ignores non-reminder expressions', () => {
    expect(bobVariantFor('celebration', 'celebrate')).toBe('success')
    expect(bobVariantFor('action', 'talking')).toBe('warning')
  })

  it('maps action to warning', () => {
    expect(bobVariantFor('action')).toBe('warning')
  })

  it('maps every other display state to info', () => {
    for (const state of ['ambient', 'information', 'activity', 'gallery', 'weather', 'family'] as const) {
      expect(bobVariantFor(state)).toBe('info')
    }
  })
})

function makeDecision(overrides?: Partial<DisplayDecision>): DisplayDecision {
  return {
    id: 'dec-1',
    state: 'celebration',
    layoutId: 'layout-1',
    bob: { expression: 'celebrate', speech: 'Well done!' },
    priority: 10,
    score: 5,
    reason: 'Chores complete',
    ruleId: 'r1',
    durationMs: 30_000,
    generatedAt: '2026-10-11T08:00:00.000Z',
    ...overrides,
  }
}

function makeContext(): ExperienceContext {
  return {
    now: '2026-10-11T08:00:00.000Z',
    date: { iso: '2026-10-11', day: 'Sat', dayNumber: 11, month: 'Oct', year: 2026 },
    weekday: 'SAT',
    period: 'morning',
    schoolDay: false,
    specialTags: [],
  }
}

function makeStore(): FrameStore {
  return {
    activeId: 'layout-1',
    layouts: [],
    presets: [],
    customFonts: [],
    schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
    albums: [],
    experiences: {
      enabled: true,
      rules: [{
        id: 'r1',
        name: 'Chores',
        enabled: true,
        priority: 10,
        when: { days: ['SAT'] },
        then: { layoutId: 'layout-1', state: 'celebration', bob: { expression: 'celebrate', speech: 'Well done!' }, score: 5, durationMs: 30_000 },
      }],
      settings: { schoolHolidays: [] },
    },
    notifications: [],
  }
}

/** Fake deps with an injectable clock and a mutateStore that actually applies the mutator. */
function makeBridge(opts?: { throttleMs?: number; ruleName?: string }) {
  let clock = Date.parse('2026-10-11T08:00:00Z')
  let store = makeStore()
  store.experiences.rules[0].name = opts?.ruleName ?? 'Chores'
  const getDecision = vi.fn(async (_frameId: string) => ({ decision: makeDecision(), context: makeContext(), store }))
  const mutateStore = vi.fn(async (fn: (s: FrameStore) => FrameStore | void, _frameId: string) => {
    store = fn(store) as FrameStore
    return store
  })
  const bridge = createBobBridge({
    getDecision,
    mutateStore,
    now: () => clock,
    throttleMs: opts?.throttleMs,
  })
  return {
    bridge,
    getDecision,
    mutateStore,
    advance: (ms: number) => { clock += ms },
    notifications: () => store.notifications ?? [],
    setDecision: (decision: DisplayDecision) => {
      getDecision.mockImplementation(async () => ({ decision, context: makeContext(), store }))
    },
  }
}

describe('createBobBridge.tick', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Keep error-path tests quiet; the bridge logs structured JSON on failures.
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('publishes a notification built from the winning decision', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(1)
    const [note] = b.notifications()
    expect(note.title).toBe('Chores')                 // rule name, not decision.reason
    expect(note.message).toBe('Well done!')
    expect(note.variant).toBe('success')               // celebration → success
    expect(note.eventKey).toBe('bob:r1')
    expect(note.durationMs).toBe(30_000)               // normalize clamps to ≤60s; 30s passes through
    expect(note.createdAt).toBe('2026-10-11T08:00:00.000Z')
    expect(note.id.length).toBeGreaterThan(0)
  })

  it('re-publishes via replace-by-key once the card has expired while the same decision persists', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    // Both cards share the eventKey; the client provider merges them into one.
    expect(b.notifications().map((n) => n.eventKey)).toEqual(['bob:r1', 'bob:r1'])
    expect(b.notifications()).toHaveLength(2)
  })

  it('publishes again when the decision id changes, newest first', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.setDecision(makeDecision({ id: 'dec-2', bob: { expression: 'talking', speech: 'Rain later' }, state: 'weather', reason: 'Weather watch' }))
    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    const notes = b.notifications()
    expect(notes).toHaveLength(2)
    expect(notes[0].message).toBe('Rain later')
    expect(notes[0].variant).toBe('info')
    expect(notes[0].eventKey).toBe('bob:r1')
    expect(notes[1].message).toBe('Well done!')
  })

  it('floors durationMs 0 to the variant default so a new rule is never a flash', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ durationMs: 0 }))
    await b.bridge.tick('home')

    // celebration → success variant, default 4500ms
    expect(b.notifications()[0].durationMs).toBe(4_500)
  })

  it('clamps over-long durations to the 60s card maximum', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ durationMs: 300_000 }))
    await b.bridge.tick('home')

    expect(b.notifications()[0].durationMs).toBe(60_000)
  })

  it('falls back to decision.reason when the rule name is whitespace', async () => {
    const b = makeBridge({ ruleName: '   ' })
    await b.bridge.tick('home')

    const [note] = b.notifications()
    expect(note).toBeDefined()
    expect(note.title).toBe('Chores complete')
    expect(note.eventKey).toBe('bob:r1')
  })

  it('falls back to decision.reason as title when the rule is unknown', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ ruleId: 'ghost' }))
    await b.bridge.tick('home')

    expect(b.notifications()[0].title).toBe('Chores complete')
    expect(b.notifications()[0].eventKey).toBe('bob:ghost')
  })

  it('publishes nothing when the decision has no bob', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ bob: null }))
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(1)
    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('publishes nothing when speech is blank', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ bob: { expression: 'thinking', speech: '   ' } }))
    await b.bridge.tick('home')

    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('throttles: skips evaluation within the throttle window', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.advance(DEFAULT_BOB_THROTTLE_MS - 1)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(1)
  })

  it('single-flight: overlapping ticks evaluate once', async () => {
    let release!: (value: { decision: DisplayDecision; context: ExperienceContext; store: FrameStore }) => void
    const pending = new Promise<{ decision: DisplayDecision; context: ExperienceContext; store: FrameStore }>((resolve) => { release = resolve })
    const getDecision = vi.fn((_frameId: string) => pending)
    let store = makeStore()
    const mutateStore = vi.fn(async (fn: (s: FrameStore) => FrameStore | void, _frameId: string) => {
      store = fn(store) as FrameStore
      return store
    })
    const bridge = createBobBridge({ getDecision, mutateStore })

    const first = bridge.tick('home')
    const second = bridge.tick('home')
    release({ decision: makeDecision(), context: makeContext(), store })
    await Promise.all([first, second])

    expect(getDecision).toHaveBeenCalledTimes(1)
    expect(mutateStore).toHaveBeenCalledTimes(1)
  })

  it('tracks frames independently', async () => {
    const b = makeBridge()
    await b.bridge.tick('kitchen')
    await b.bridge.tick('hallway')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
    expect(b.getDecision).toHaveBeenCalledWith('kitchen')
    expect(b.getDecision).toHaveBeenCalledWith('hallway')
    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    // Second arg of mutateStore is the frameId
    expect(b.mutateStore.mock.calls[0][1]).toBe('kitchen')
    expect(b.mutateStore.mock.calls[1][1]).toBe('hallway')
  })

  it('swallows getDecision failures and never rejects', async () => {
    const b = makeBridge()
    b.getDecision.mockRejectedValueOnce(new Error('db down'))

    await expect(b.bridge.tick('home')).resolves.toBeUndefined()
    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('retries publishing on the next tick after a mutateStore failure', async () => {
    const b = makeBridge()
    b.mutateStore.mockRejectedValueOnce(new Error('write failed'))

    await expect(b.bridge.tick('home')).resolves.toBeUndefined()
    expect(b.notifications()).toHaveLength(0)

    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    expect(b.notifications()).toHaveLength(1)
  })

  it('honours a custom throttleMs', async () => {
    const b = makeBridge({ throttleMs: 1_000 })
    await b.bridge.tick('home')
    b.advance(1_001)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
  })
})
