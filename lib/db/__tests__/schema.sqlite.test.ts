import { describe, it, expect } from 'vitest'
import * as s from '@/lib/db/schema.sqlite'

describe('sqlite schema', () => {
  it('exports frameDocuments and contentSources tables', () => {
    expect(s.frameDocuments).toBeDefined()
    expect(s.contentSources).toBeDefined()
    expect(s.displayHistory).toBeDefined()
    expect(s.assets).toBeDefined()
  })
})
