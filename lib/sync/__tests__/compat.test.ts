import { describe, it, expect } from 'vitest'
import { checkCompatibility } from '@/lib/sync/compat'

describe('checkCompatibility', () => {
  it('compatible when equal', () => { expect(checkCompatibility('1.0', '1.0')).toBe(true) })
  it('incompatible when major differs', () => { expect(checkCompatibility('1.0', '2.0')).toBe(false) })
  it('compatible when instance older minor', () => { expect(checkCompatibility('1.0', '1.2')).toBe(true) })
})
