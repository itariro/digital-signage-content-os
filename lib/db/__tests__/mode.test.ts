import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDatabaseMode } from '@/lib/db/mode'

describe('getDatabaseMode', () => {
  const prev = { ...process.env }
  afterEach(() => { process.env = { ...prev } })

  it('returns sqlite when FRAME_MODE=instance', () => {
    process.env.FRAME_MODE = 'instance'
    delete process.env.DATABASE_URL
    expect(getDatabaseMode()).toBe('sqlite')
  })
  it('returns postgres when FRAME_MODE=console', () => {
    process.env.FRAME_MODE = 'console'
    process.env.DATABASE_URL = 'postgres://x'
    expect(getDatabaseMode()).toBe('postgres')
  })
  it('defaults to postgres when DATABASE_URL present and no FRAME_MODE', () => {
    delete process.env.FRAME_MODE
    process.env.DATABASE_URL = 'postgres://x'
    expect(getDatabaseMode()).toBe('postgres')
  })
  it('defaults to sqlite when no DATABASE_URL and no FRAME_MODE', () => {
    delete process.env.FRAME_MODE
    delete process.env.DATABASE_URL
    expect(getDatabaseMode()).toBe('sqlite')
  })
})
