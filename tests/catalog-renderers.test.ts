import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'

describe('catalog renderers', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} has its own renderer file`, () => {
      const file = path.join(process.cwd(), 'components/frame/canvas/scenes', `${type}.tsx`)
      expect(existsSync(file)).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('CatalogScene')
      expect(source).toContain('export function')
    })
  }
})
