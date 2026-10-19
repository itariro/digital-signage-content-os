import { describe, it, expect } from 'vitest'
import { rotateBackups } from '@/lib/backup'

describe('rotateBackups', () => {
  it('keeps only maxN newest', () => {
    const files = ['a.db','b.db','c.db','d.db'].map((n,i)=>({ name:n, mtime: i, path: n }))
    const keep = rotateBackups(files as any, 2)
    expect(keep.map((f:any)=>f.name)).toEqual(['c.db','d.db'])
  })
})
