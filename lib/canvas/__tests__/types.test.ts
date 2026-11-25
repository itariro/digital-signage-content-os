import { describe, expect, it } from 'vitest'
import {
  CANVAS_PALETTE_IDS,
  CANVAS_PALETTE_TOKENS,
  CANVAS_TEMPLATE_IDS,
  CANVAS_TRANSITION_KINDS,
} from '@/lib/types'

describe('phase 5 constants', () => {
  it('defines six palette ids', () => {
    expect(CANVAS_PALETTE_IDS).toEqual(['aurora', 'sunset', 'mono', 'neon', 'forest', 'candy'])
  })

  it('defines the five shared colour tokens', () => {
    expect(CANVAS_PALETTE_TOKENS).toEqual(['primary', 'secondary', 'accent', 'background', 'text'])
  })

  it('defines the transition kinds', () => {
    expect(CANVAS_TRANSITION_KINDS).toEqual(['none', 'wipe', 'iris', 'chase'])
  })

  it('defines exactly six template ids', () => {
    expect(CANVAS_TEMPLATE_IDS).toEqual([
      'hello-wall',
      'sync-check',
      'colour-study',
      'type-parade',
      'arcade-night',
      'wall-clock',
    ])
  })
})
