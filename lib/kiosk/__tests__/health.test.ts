import { describe, it, expect } from 'vitest'
import { evaluateHealth } from '../health'

describe('health', () => {
  it('healthy when all pass', () => {
    const r = evaluateHealth({ processRunning: true, portOpen: true, httpOk: true, configValid: true })
    expect(r.state).toBe('healthy')
  })
  it('failed when http fails', () => {
    const r = evaluateHealth({ processRunning: true, portOpen: true, httpOk: false, configValid: true })
    expect(r.state).toBe('failed')
  })
  it('degraded when cloud fails only', () => {
    const r = evaluateHealth({ processRunning: true, portOpen: true, httpOk: true, configValid: true, cloudOk: false })
    expect(r.state).toBe('degraded')
  })
})
