import { describe, it, expect } from 'vitest'
import { planSync, nextRetryDelay } from '../sync'

describe('sync', () => {
  it('noop when identical', () => {
    const p = planSync({ localUpdatedAt: '2026-01-01T00:00:00Z', remoteUpdatedAt: '2026-01-01T00:00:00Z', localHash: 'a', remoteHash: 'a', hasLocalChanges: false, hasRemoteChanges: false })
    expect(p.action).toBe('noop')
  })
  it('conflict when both changed', () => {
    const p = planSync({ localUpdatedAt: '2026-01-01T00:00:00Z', remoteUpdatedAt: '2026-01-02T00:00:00Z', localHash: 'a', remoteHash: 'b', hasLocalChanges: true, hasRemoteChanges: true })
    expect(p.action).toBe('conflict')
  })
  it('pull when remote newer', () => {
    const p = planSync({ localUpdatedAt: '2026-01-01T00:00:00Z', remoteUpdatedAt: '2026-01-02T00:00:00Z', localHash: 'a', remoteHash: 'b', hasLocalChanges: false, hasRemoteChanges: true })
    expect(p.action).toBe('pull')
  })
  it('retry delay bounded', () => {
    const d = nextRetryDelay(10, 1000, 5000)
    expect(d).toBeLessThanOrEqual(5000)
    expect(d).toBeGreaterThan(0)
  })
})
