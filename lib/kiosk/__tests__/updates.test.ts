import { describe, it, expect } from 'vitest'
import { compareVersions, isUpdateAvailable, createUpdateState, beginUpdate, completeUpdate, canRollback, rollbackUpdate } from '../updates'

describe('updates', () => {
  it('compares versions', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })
  it('update available', () => {
    expect(isUpdateAvailable('1.0.0', '1.1.0')).toBe(true)
    expect(isUpdateAvailable('1.1.0', '1.0.0')).toBe(false)
  })
  it('can rollback after complete', () => {
    let st = createUpdateState('1.0.0')
    st = beginUpdate(st, '1.1.0', new Date())
    st = completeUpdate(st, new Date())
    expect(canRollback(st)).toBe(true)
  })
  it('rollback restores previous version', () => {
    let st = createUpdateState('1.0.0')
    st = beginUpdate(st, '1.1.0', new Date())
    st = completeUpdate(st, new Date())
    st = rollbackUpdate(st, new Date())
    expect(st.fromVersion).toBe('1.0.0')
  })
})
