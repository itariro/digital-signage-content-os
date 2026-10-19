import { describe, it, expect } from 'vitest'
import { safeAssetPath, hashBuffer } from '@/lib/assets/storage'

describe('safeAssetPath', () => {
  it('resolves inside assets dir', () => {
    const p = safeAssetPath('/data', 'abc.jpg')
    expect(p).toBe('/data/assets/abc.jpg')
  })
  it('rejects traversal', () => {
    expect(() => safeAssetPath('/data', '../etc/passwd')).toThrow()
    expect(() => safeAssetPath('/data', '/abs/path')).toThrow()
  })
})

describe('hashBuffer', () => {
  it('returns sha256 hex', () => {
    expect(hashBuffer(Buffer.from('hi'))).toMatch(/^[a-f0-9]{64}$/)
  })
})
