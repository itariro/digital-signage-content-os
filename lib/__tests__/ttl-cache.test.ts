import { describe, it, expect } from 'vitest'
import { createTtlCache } from '../ttl-cache'

describe('createTtlCache', () => {
  it('returns a value within the TTL and expires it after', () => {
    let clock = 1000
    const cache = createTtlCache<string>(5000, () => clock)
    cache.set('a', 'value')
    expect(cache.get('a')).toBe('value')
    clock += 4999
    expect(cache.get('a')).toBe('value')
    clock += 1
    expect(cache.get('a')).toBeUndefined()
  })

  it('tracks size and clears', () => {
    const cache = createTtlCache<number>(1000)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.size()).toBe(2)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    cache.clear()
    expect(cache.size()).toBe(0)
  })
})
