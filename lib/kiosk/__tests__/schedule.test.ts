import { describe, it, expect } from 'vitest'
import { isInStandbyWindow, nextTransition, validateSchedule } from '../schedule'

describe('schedule', () => {
  it('defaults 22-6 crosses midnight', () => {
    const sched = { enabled: true, start: '22:00', end: '06:00' }
    expect(isInStandbyWindow(new Date(2026,0,1,23,0), sched)).toBe(true)
    expect(isInStandbyWindow(new Date(2026,0,1,3,0), sched)).toBe(true)
    expect(isInStandbyWindow(new Date(2026,0,1,12,0), sched)).toBe(false)
    expect(isInStandbyWindow(new Date(2026,0,1,21,59), sched)).toBe(false)
  })

  it('disabled never standby', () => {
    expect(isInStandbyWindow(new Date(2026,0,1,23,0), { enabled: false, start: '22:00', end: '06:00' })).toBe(false)
  })

  it('next transition from active evening -> standby start today', () => {
    const sched = { enabled: true, start: '22:00', end: '06:00' }
    const now = new Date(2026,0,1,20,0)
    const t = nextTransition(now, sched)
    expect(t?.type).toBe('standby-start')
    expect(t?.at.getHours()).toBe(22)
  })

  it('next transition from standby night -> end tomorrow-ish', () => {
    const sched = { enabled: true, start: '22:00', end: '06:00' }
    const now = new Date(2026,0,1,23,0)
    const t = nextTransition(now, sched)
    expect(t?.type).toBe('standby-end')
    expect(t?.at.getHours()).toBe(6)
  })

  it('validates schedule', () => {
    expect(validateSchedule({ enabled: true, start: '22:00', end: '06:00' })).toHaveLength(0)
    expect(validateSchedule({ enabled: true, start: '22:00', end: '22:00' }).length).toBeGreaterThan(0)
  })
})
