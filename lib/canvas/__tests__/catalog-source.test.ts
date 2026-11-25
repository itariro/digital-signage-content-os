import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sources = [
  'lib/canvas/catalog-kit.ts',
  'lib/canvas/catalog-draw.ts',
  'lib/canvas/games.ts',
  'lib/canvas/scenes/bounce.ts',
  ...readdirSync(path.join(root, 'lib/canvas/scenes/catalog'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `lib/canvas/scenes/catalog/${name}`),
]
const forbidden = ['Date.now', 'Math.random', 'document.', 'window.', 'localStorage', 'fetch(', 'FRAME_DATA_DIR']

describe('catalog state purity', () => {
  for (const source of sources) {
    it(`${source} has no clock, randomness or DOM reads`, () => {
      const text = readFileSync(path.join(root, source), 'utf8')
      for (const token of forbidden) expect(text).not.toContain(token)
    })
  }
})
