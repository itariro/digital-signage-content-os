import fs from 'node:fs'
import path from 'node:path'

// /etc/dscos/frame.env: the frame's pulled config. Root owns it, the kiosk
// service user reads it (0640). Values here must never be quoted-escaped
// payloads beyond simple KEY=VALUE tokens; enroll bundles and scrypt hashes
// qualify.

export function frameEnvLines(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
}

export function parseFrameEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

export function writeFrameEnv(file: string, vars: Record<string, string>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, frameEnvLines(vars), { mode: 0o640 })
  fs.chmodSync(tmp, 0o640)
  fs.renameSync(tmp, file)
}

export function setFrameEnvValue(file: string, key: string, value: string): void {
  const existing = fs.existsSync(file) ? parseFrameEnv(fs.readFileSync(file, 'utf8')) : {}
  existing[key] = value
  writeFrameEnv(file, existing)
}

export function frameEnvPath(): string {
  return process.env.FRAME_ENV_PATH || '/etc/dscos/frame.env'
}
