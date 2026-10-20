import { describe, it, expect } from 'vitest'
import { frameIdParam } from '@/lib/frames/request'

describe('frameIdParam', () => {
  it('returns the frame query param', () => {
    expect(frameIdParam('http://x/api/albums?frame=kitchen')).toBe('kitchen')
  })

  it('returns undefined when absent or blank', () => {
    expect(frameIdParam('http://x/api/albums')).toBeUndefined()
    expect(frameIdParam('http://x/api/albums?frame=')).toBeUndefined()
    expect(frameIdParam('http://x/api/albums?frame=%20')).toBeUndefined()
  })

  it('accepts a URL-like object with searchParams (NextRequest.nextUrl)', () => {
    const u = new URL('http://x/api/active?frame=lobby')
    expect(frameIdParam({ searchParams: u.searchParams })).toBe('lobby')
  })
})
