export type Rotate = 'normal' | 'left' | 'right' | 'inverted'
export type StandbyMode = 'display' | 'app' | 'shutdown'
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface StandbySchedule {
  enabled: boolean
  start: string
  end: string
  mode: StandbyMode
}

export interface KioskConfig {
  frameUrl: string
  appPort: number
  mgmtPort: number
  rotate: Rotate
  output: string
  mode: string
  scale: string
  touch: boolean
  restartHours: number
  timezone: string
  standby: StandbySchedule
  updateChannel: string
  cloudEndpoint: string
  syncEnabled: boolean
  syncIntervalMinutes: number
  logLevel: LogLevel
  netWait: number
  displayWait: number
  extraFlags: string
  secrets: Record<string, string>
}

export const DEFAULT_FRAME_URL = 'http://localhost:3000/frame/home'
export const DEFAULT_APP_PORT = 3000
export const DEFAULT_MGMT_PORT = 8808
export const DEFAULT_STANDBY_START = '22:00'
export const DEFAULT_STANDBY_END = '06:00'

export const defaultConfig = (): KioskConfig => ({
  frameUrl: DEFAULT_FRAME_URL,
  appPort: DEFAULT_APP_PORT,
  mgmtPort: DEFAULT_MGMT_PORT,
  rotate: 'left',
  output: '',
  mode: '',
  scale: '',
  touch: false,
  restartHours: 24,
  timezone: '',
  standby: { enabled: true, start: DEFAULT_STANDBY_START, end: DEFAULT_STANDBY_END, mode: 'display' },
  updateChannel: 'stable',
  cloudEndpoint: '',
  syncEnabled: false,
  syncIntervalMinutes: 15,
  logLevel: 'info',
  netWait: 60,
  displayWait: 30,
  extraFlags: '',
  secrets: {},
})

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const ROTATES: readonly string[] = ['normal', 'left', 'right', 'inverted']
const MODES: readonly string[] = ['display', 'app', 'shutdown']
const LOG_LEVELS: readonly string[] = ['error', 'warn', 'info', 'debug']

export interface ValidationError { field: string; message: string }

export function validateTime(value: string): boolean { return TIME_RE.test(value) }
export function validateRotate(value: string): boolean { return ROTATES.includes(value) }
export function validateStandbyMode(value: string): boolean { return MODES.includes(value) }
export function validateLogLevel(value: string): boolean { return LOG_LEVELS.includes(value) }
export function validatePort(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 65535 }
export function validateUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:' } catch { return false }
}
export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

export function validateConfig(config: KioskConfig): ValidationError[] {
  const errors: ValidationError[] = []
  if (!validateUrl(config.frameUrl)) errors.push({ field: 'frameUrl', message: 'must be a valid http(s)/file URL' })
  if (!validatePort(config.appPort)) errors.push({ field: 'appPort', message: 'must be an integer between 1 and 65535' })
  if (!validatePort(config.mgmtPort)) errors.push({ field: 'mgmtPort', message: 'must be an integer between 1 and 65535' })
  if (!validateRotate(config.rotate)) errors.push({ field: 'rotate', message: 'must be normal, left, right or inverted' })
  if (!validateTime(config.standby.start)) errors.push({ field: 'standby.start', message: 'must be HH:MM (24h)' })
  if (!validateTime(config.standby.end)) errors.push({ field: 'standby.end', message: 'must be HH:MM (24h)' })
  if (!validateStandbyMode(config.standby.mode)) errors.push({ field: 'standby.mode', message: 'must be display, app or shutdown' })
  if (!validateLogLevel(config.logLevel)) errors.push({ field: 'logLevel', message: 'must be error, warn, info or debug' })
  if (config.restartHours < 0 || !Number.isInteger(config.restartHours)) errors.push({ field: 'restartHours', message: 'must be a non-negative integer' })
  if (config.syncIntervalMinutes < 1 || !Number.isInteger(config.syncIntervalMinutes)) errors.push({ field: 'syncIntervalMinutes', message: 'must be a positive integer' })
  if (config.timezone && !isValidTimezone(config.timezone)) errors.push({ field: 'timezone', message: 'must be a valid IANA timezone' })
  return errors
}

export function redactConfig(config: KioskConfig): KioskConfig {
  const copy: KioskConfig = JSON.parse(JSON.stringify(config))
  for (const key of Object.keys(copy.secrets)) copy.secrets[key] = '***REDACTED***'
  return copy
}

export function setConfigValue(config: KioskConfig, key: string, rawValue: string): KioskConfig {
  const next = JSON.parse(JSON.stringify(config)) as KioskConfig
  const parts = key.split('.')
  let cursor: any = next
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] === undefined) throw new Error(`unknown config key: ${key}`)
    cursor = cursor[parts[i]]
  }
  if (parts[0] === 'secrets') {
    next.secrets[parts.slice(1).join('.')] = rawValue
    return next
  }
  const leaf = parts[parts.length - 1]
  if (!(leaf in cursor)) throw new Error(`unknown config key: ${key}`)
  const current = cursor[leaf]
  if (typeof current === 'boolean') {
    cursor[leaf] = rawValue === 'true' || rawValue === '1' || rawValue === 'yes'
  } else if (typeof current === 'number') {
    const n = Number(rawValue)
    if (Number.isNaN(n)) throw new Error(`invalid number for ${key}: ${rawValue}`)
    cursor[leaf] = n
  } else if (typeof current === 'object' && current !== null && parts[0] !== 'secrets') {
    throw new Error(`cannot set object key directly: ${key}`)
  } else {
    cursor[leaf] = rawValue
  }
  return next
}

export function configToJson(config: KioskConfig): string {
  return JSON.stringify(redactConfig(config), null, 2)
}

export function configFromJson(text: string): KioskConfig {
  const parsed = JSON.parse(text) as Partial<KioskConfig>
  const base = defaultConfig()
  return normalizeConfig({ ...base, ...parsed, standby: { ...base.standby, ...(parsed.standby ?? {}) }, secrets: { ...base.secrets, ...(parsed.secrets ?? {}) } })
}

export function normalizeConfig(config: KioskConfig): KioskConfig {
  return {
    ...defaultConfig(),
    ...config,
    standby: { ...defaultConfig().standby, ...config.standby },
    secrets: { ...(config.secrets ?? {}) },
  }
}
