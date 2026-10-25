import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// /etc/dscos/frame.env: the frame's pulled config. Root owns it, the kiosk
// service user reads it (0640). Values here must never be quoted-escaped
// payloads beyond simple KEY=VALUE tokens; enroll bundles and scrypt hashes
// qualify.

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/

export class FrameEnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrameEnvError'
  }
}

export function validateFrameEnvEntry(key: string, value: string): void {
  if (!KEY_PATTERN.test(key) || CONTROL_PATTERN.test(key)) {
    throw new FrameEnvError(`invalid frame.env key: ${key}`)
  }
  if (CONTROL_PATTERN.test(value)) throw new FrameEnvError(`invalid control character in frame.env value for ${key}`)
  if (value !== value.trim()) throw new FrameEnvError(`frame.env value for ${key} has leading or trailing whitespace`)
}

export function frameEnvLines(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([key, value]) => {
    validateFrameEnvEntry(key, value)
    return `${key}=${value}`
  })
  return lines.length ? `${lines.join('\n')}\n` : ''
}

export function parseFrameEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// Validate first so a bad bundle never touches the filesystem. The unique
// temp name and 'wx' create keep two writers from sharing a temp file; rename
// is the only step that replaces the target.
export function writeFrameEnv(file: string, vars: Record<string, string>): void {
  const text = frameEnvLines(vars)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 })
  const tmp = `${file}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`
  let fd: number | undefined
  let created = false
  try {
    fd = fs.openSync(tmp, 'wx', 0o600)
    created = true
    fs.writeFileSync(fd, text)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.chmodSync(tmp, 0o640)
    fs.renameSync(tmp, file)
    try {
      const dirFd = fs.openSync(dir, 'r')
      try { fs.fsyncSync(dirFd) } finally { fs.closeSync(dirFd) }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EINVAL') throw error
    }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch { /* already closed */ }
    }
    if (created) {
      try { fs.unlinkSync(tmp) } catch { /* nothing to remove */ }
    }
    throw error
  }
}

export function setFrameEnvValue(file: string, key: string, value: string): void {
  const existing = fs.existsSync(file) ? parseFrameEnv(fs.readFileSync(file, 'utf8')) : {}
  existing[key] = value
  writeFrameEnv(file, existing)
}

export function frameEnvPath(): string {
  return process.env.FRAME_ENV_PATH || '/etc/dscos/frame.env'
}