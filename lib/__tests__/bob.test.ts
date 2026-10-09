import { describe, it, expect } from 'vitest'
import { BOB_EXPRESSIONS, BOB_FALLBACK_EXPRESSION, BOB_PLACEHOLDER, bobAsset, isBobExpression } from '../bob'

describe('bob asset resolver', () => {
  it('resolves a known expression to a webp path', () => {
    expect(bobAsset('celebrate')).toBe('/bob/celebrate.webp')
  })

  it('falls back to happy for unknown expressions and non-strings', () => {
    expect(bobAsset('dancing')).toBe(`/bob/${BOB_FALLBACK_EXPRESSION}.webp`)
    expect(bobAsset(undefined)).toBe('/bob/happy.webp')
    expect(bobAsset(42)).toBe('/bob/happy.webp')
  })

  it('guards expression membership', () => {
    expect(isBobExpression('happy')).toBe(true)
    expect(isBobExpression('dancing')).toBe(false)
    expect(isBobExpression(null)).toBe(false)
  })

  it('exposes exactly the 12 spec expressions', () => {
    expect(BOB_EXPRESSIONS).toHaveLength(12)
    expect(new Set(BOB_EXPRESSIONS).size).toBe(12)
  })

  it('provides an inline data-uri placeholder', () => {
    expect(BOB_PLACEHOLDER.startsWith('data:image/svg+xml')).toBe(true)
  })
})
