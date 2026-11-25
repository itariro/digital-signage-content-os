import { describe, it, expect } from 'vitest'
import * as s from '@/lib/db/schema.sqlite'

describe('sqlite schema', () => {
  it('exports frameDocuments and contentSources tables', () => {
    expect(s.frameDocuments).toBeDefined()
    expect(s.contentSources).toBeDefined()
    expect(s.displayHistory).toBeDefined()
    expect(s.assets).toBeDefined()
  })

  it('exports canvasState with the report columns', () => {
    expect(s.canvasState).toBeDefined()
    const columns = Object.keys(s.canvasState)
    for (const name of ['instanceId', 'revision', 'data', 'updatedAt', 'reportedRevision', 'clockOffsetMs', 'clockUncertaintyMs', 'viewportW', 'viewportH', 'fpsAvg', 'reportedAt']) {
      expect(columns).toContain(name)
    }
  })

  it('exports canvasAssets with the content-addressed columns', () => {
    expect(s.canvasAssets).toBeDefined()
    const columns = Object.keys(s.canvasAssets)
    for (const name of ['hash', 'mime', 'size', 'createdAt']) {
      expect(columns).toContain(name)
    }
  })
})
