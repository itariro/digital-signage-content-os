import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeather } from '../weather'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWeather', () => {
  it('passes an abort signal so a hung upstream cannot stall the engine', async () => {
    let seenSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      seenSignal = init?.signal ?? undefined
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })

    await fetchWeather(47.3769, 8.5417, 'metric')

    expect(seenSignal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to sample weather when the request aborts', async () => {
    let seenSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      seenSignal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })

    const promise = fetchWeather(47.3769, 8.5417, 'metric')
    // AbortSignal is an EventTarget: firing 'abort' through the captured signal
    // exercises the catch path deterministically without waiting 5 real seconds.
    seenSignal?.dispatchEvent(new Event('abort'))
    const data = await promise

    expect(data.sample).toBe(true)
  })
})
