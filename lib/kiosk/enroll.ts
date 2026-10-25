import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { z } from 'zod'
import { isValidAdminSecret } from '../frame-admin'
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
  timeoutMs?: number
}

export interface EnrollResult {
  ok: boolean
  status?: number
  message?: string
  written?: string
  warning?: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname)
}

function isHttpsOrLoopback(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && isLoopbackHost(url.hostname))
  } catch {
    return false
  }
}

function consoleBase(consoleUrl: string): URL | string {
  let base: URL
  try {
    base = new URL(consoleUrl)
  } catch {
    return 'console URL is not a valid URL'
  }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && isLoopbackHost(base.hostname))) {
    return 'console URL must use https (http is allowed only for localhost)'
  }
  if (base.username || base.password || base.search || base.hash) {
    return 'console URL must not include credentials, a query, or a fragment'
  }
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`
  return base
}

function hasNoControlCharacters(value: string): boolean {
  return !/[\u0000-\u001f\u007f]/.test(value)
}

const bundleSchema = z.object({
  instanceId: z.string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .refine(hasNoControlCharacters, 'instanceId must not contain control characters'),
  deviceToken: z.string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/)
    .refine(hasNoControlCharacters, 'deviceToken must not contain control characters'),
  syncEndpoint: z.string()
    .refine(hasNoControlCharacters, 'syncEndpoint must not contain control characters')
    .url()
    .refine(isHttpsOrLoopback, 'syncEndpoint must use https'),
  frameAdminSecret: z.string().refine(isValidAdminSecret, 'invalid frame admin secret'),
  config: z.object({
    clerkPublishableKey: z.string()
      .regex(/^[A-Za-z0-9_-]*$/)
      .refine(hasNoControlCharacters, 'clerkPublishableKey must not contain control characters')
      .optional(),
  }).optional(),
})

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

export async function enroll(
  consoleUrl: string,
  code: string,
  deps: EnrollDeps,
): Promise<EnrollResult> {
  const base = consoleBase(consoleUrl)
  if (typeof base === 'string') return { ok: false, message: base }

  const endpoint = new URL('api/enroll', base)
  const signal = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let res: Response
  try {
    res = await deps.fetch(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, message: 'console request timed out; the code may be consumed, so issue a fresh one' }
    }
    return { ok: false, message: 'console unreachable; check the URL and network' }
  }

  if (!res.ok) {
    const hint = res.status === 401
      ? 'code invalid, expired, or already used; issue a fresh one from the console (rotate for an existing instance)'
      : res.status === 429
        ? 'rate limited; wait a minute and retry'
        : `enroll failed (HTTP ${res.status})`
    return { ok: false, status: res.status, message: hint }
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, message: 'console response timed out; the code may be consumed, so issue a fresh one' }
    }
    return { ok: false, message: 'console returned a non-JSON response; issue a fresh code' }
  }

  const parsed = bundleSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, message: 'invalid enrollment bundle from console; issue a fresh code' }
  }
  const bundle = parsed.data

  const vars: Record<string, string> = {
    FRAME_MODE: 'instance',
    SYNC_ENABLED: 'true',
    SYNC_ENDPOINT: bundle.syncEndpoint,
    INSTANCE_ID: bundle.instanceId,
    SYNC_TOKEN: bundle.deviceToken,
    FRAME_ADMIN_SECRET: bundle.frameAdminSecret,
  }
  if (bundle.config?.clerkPublishableKey) {
    vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = bundle.config.clerkPublishableKey
  }
  const file = deps.envPath ?? frameEnvPath()
  writeFrameEnv(file, vars)
  const warning = chownToKioskGroup(file)
  return { ok: true, written: file, warning }
}

interface ChownDeps {
  getuid?: () => number
  exec?: (command: string) => string
}

export function chownToKioskGroup(file: string, deps: ChownDeps = {}): string | undefined {
  const getuid = deps.getuid
    ?? (typeof process.getuid === 'function' ? () => process.getuid!() : undefined)
  if (!getuid || getuid() !== 0) return undefined
  try {
    const run = deps.exec ?? ((command: string) => execSync(command, { encoding: 'utf8' }))
    const gid = Number(run('id -g kiosk 2>/dev/null').trim())
    if (!Number.isInteger(gid) || gid <= 0) throw new Error('kiosk group not found')
    fs.chownSync(file, 0, gid)
    fs.chmodSync(file, 0o640)
    return undefined
  } catch {
    return `could not set kiosk group ownership on ${file}; run: sudo chown root:kiosk ${file} && sudo chmod 0640 ${file}`
  }
}
