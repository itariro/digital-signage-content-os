import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { writeFrameEnv, frameEnvPath } from './frame-env'

export interface EnrollResponse {
  instanceId: string
  deviceToken: string
  syncEndpoint: string
  frameAdminSecret: string
  config?: { clerkPublishableKey?: string }
}

export interface EnrollDeps {
  fetch: typeof fetch
  envPath?: string
}

export async function enroll(consoleUrl: string, code: string, deps: EnrollDeps): Promise<{ ok: boolean; status?: number; message?: string; written?: string }> {
  if (!/^https?:\/\//.test(consoleUrl)) return { ok: false, message: 'console URL must be http(s)' }
  let res: Response
  try {
    res = await deps.fetch(`${consoleUrl.replace(/\/$/, '')}/api/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    return { ok: false, message: 'console unreachable; check the URL and network' }
  }
  if (!res.ok) {
    const hint = res.status === 401 ? 'code invalid, expired, or already used; issue a fresh one from the console (rotate for an existing instance)'
      : res.status === 429 ? 'rate limited; wait a minute and retry'
      : `enroll failed (HTTP ${res.status})`
    return { ok: false, status: res.status, message: hint }
  }
  const bundle = (await res.json()) as EnrollResponse
  const vars: Record<string, string> = {
    FRAME_MODE: 'instance',
    SYNC_ENABLED: 'true',
    SYNC_ENDPOINT: bundle.syncEndpoint,
    INSTANCE_ID: bundle.instanceId,
    SYNC_TOKEN: bundle.deviceToken,
    FRAME_ADMIN_SECRET: bundle.frameAdminSecret,
  }
  if (bundle.config?.clerkPublishableKey) vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = bundle.config.clerkPublishableKey
  const file = deps.envPath ?? frameEnvPath()
  writeFrameEnv(file, vars)
  chownToKioskGroup(file)
  return { ok: true, written: file }
}

// Best-effort root:kiosk ownership so the service user can read the file
// while the world cannot. Non-root dev machines (tests) keep it as-is.
function chownToKioskGroup(file: string): void {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) return
  try {
    const gid = Number(execSync('id -g kiosk 2>/dev/null || id -g', { encoding: 'utf8' }).trim()) || 0
    fs.chownSync(file, 0, gid)
    fs.chmodSync(file, 0o640)
  } catch { /* keep the 0640 from writeFrameEnv */ }
}
