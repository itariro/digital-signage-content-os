import { describe, it, expect } from 'vitest'
import { defaultConfig, validateConfig, redactConfig, setConfigValue, configFromJson, DEFAULT_FRAME_URL } from '../config'

describe('config', () => {
  it('defaults to local frame URL', () => {
    const c = defaultConfig()
    expect(c.frameUrl).toBe('http://localhost:3000/frame/home')
    expect(c.appPort).toBe(3000)
    expect(c.standby.start).toBe('22:00')
    expect(c.standby.end).toBe('06:00')
  })

  it('validates default config', () => {
    expect(validateConfig(defaultConfig())).toHaveLength(0)
  })

  it('rejects invalid URL and port', () => {
    const c = defaultConfig()
    c.frameUrl = 'not a url'
    c.appPort = 70000
    const errors = validateConfig(c)
    expect(errors.map(e => e.field)).toContain('frameUrl')
    expect(errors.map(e => e.field)).toContain('appPort')
  })

  it('redacts secrets', () => {
    const c = defaultConfig()
    c.secrets.token = 'supersecret'
    const r = redactConfig(c)
    expect(r.secrets.token).toBe('***REDACTED***')
    expect(c.secrets.token).toBe('supersecret')
  })

  it('setConfigValue updates nested keys', () => {
    const c = defaultConfig()
    const next = setConfigValue(c, 'standby.start', '23:30')
    expect(next.standby.start).toBe('23:30')
    expect(c.standby.start).toBe('22:00')
  })

  it('round trips json', () => {
    const c = defaultConfig()
    c.secrets.x = 's'
    const json = JSON.stringify(c)
    const parsed = configFromJson(json)
    expect(parsed.frameUrl).toBe(DEFAULT_FRAME_URL)
    expect(parsed.secrets.x).toBe('s')
  })
})

describe('config secrets', () => {
  it('can add new secret via setConfigValue', () => {
    const c = defaultConfig()
    const next = setConfigValue(c, 'secrets.token', 'abc')
    expect(next.secrets.token).toBe('abc')
  })
})
