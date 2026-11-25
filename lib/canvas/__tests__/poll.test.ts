import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollDelayMs, startCanvasPoll, stopCanvasPoll, type CanvasPollEnv } from '@/lib/canvas/poll'
import type { SyncConfig } from '@/lib/sync/client'

const config: SyncConfig = { endpoint: 'http://console.test', token: 't', instanceId: 'i1' }
const env: CanvasPollEnv = {}
const steady = () => 0.5

afterEach(() => {
  stopCanvasPoll()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pollDelayMs', () => {
  it('uses 5 s active and 30 s idle with ±10% jitter', () => {
    expect(pollDelayMs(true, env, () => 0)).toBe(4500)
    expect(pollDelayMs(true, env, steady)).toBe(5000)
    expect(pollDelayMs(true, env, () => 1)).toBe(5500)
    expect(pollDelayMs(false, env, steady)).toBe(30_000)
  })

  it('honours env overrides and falls back to the sync interval for zero', () => {
    expect(pollDelayMs(true, { CANVAS_POLL_ACTIVE_SECONDS: '8' }, steady)).toBe(8000)
    expect(pollDelayMs(false, { CANVAS_POLL_IDLE_SECONDS: '10' }, steady)).toBe(10_000)
    expect(pollDelayMs(true, { CANVAS_POLL_ACTIVE_SECONDS: '0', SYNC_INTERVAL_MINUTES: '15' }, steady)).toBe(900_000)
    expect(pollDelayMs(false, { CANVAS_POLL_IDLE_SECONDS: '0' }, steady)).toBe(900_000)
  })
})

describe('startCanvasPoll', () => {
  it('runs immediately, re-evaluates the state and stops cleanly', async () => {
    vi.useFakeTimers()
    let calls = 0
    let active = true
    startCanvasPoll(config, {
      env,
      random: steady,
      isActive: () => active,
      run: async () => { calls++ },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toBe(2)
    active = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toBe(3)
    stopCanvasPoll()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toBe(3)
  })

  it('ignores a second start while a tick is awaiting the sync', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const first = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const second = vi.fn(async () => {})

    startCanvasPoll(config, { env, random: steady, isActive: () => true, run: first })
    await vi.advanceTimersByTimeAsync(0)
    expect(first).toHaveBeenCalledTimes(1)

    startCanvasPoll(config, { env, random: steady, isActive: () => true, run: second })
    expect(second).not.toHaveBeenCalled()

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(second).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(first).toHaveBeenCalledTimes(2)
  })

  it('backs off to 30 s then 60 s and ignores a second start', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    const run = async () => {
      calls++
      throw new Error('console down')
    }
    startCanvasPoll(config, { env, random: steady, isActive: () => true, run })
    startCanvasPoll(config, { env, random: steady, isActive: () => false, run })
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toBe(3)
  })
})
