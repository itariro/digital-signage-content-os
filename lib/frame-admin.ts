import crypto from 'node:crypto'

// Frame-local admin auth (spec §4.3): scrypt password hash in frame.env, an
// HMAC-signed stateless session cookie for management-port mutations. No
// server-side session store: local-first means auth survives console and
// internet outages.

export const ADMIN_COOKIE = 'dscos_admin'
const SESSION_TTL_MS = 7 * 24 * 3600_000
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export function hashAdminPassword(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(secret, salt, 32, SCRYPT).toString('hex')
  return `${salt}$${hash}`
}

export function verifyAdminPassword(secret: string, stored: string): boolean {
  const [salt, hex] = stored.split('$')
  if (!salt || !hex) return false
  const candidate = crypto.scryptSync(secret, salt, 32, SCRYPT)
  const expected = Buffer.from(hex, 'hex')
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate)
}

export function signAdminSession(secret: string, nowMs: number = Date.now()): string {
  const exp = nowMs + SESSION_TTL_MS
  const payload = `admin.${exp}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyAdminSession(token: string | undefined, secret: string | undefined, nowMs: number = Date.now()): boolean {
  if (!token || !secret) return false
  const m = token.match(/^admin\.(\d+)\.([A-Za-z0-9_-]+)$/)
  if (!m) return false
  const exp = Number(m[1])
  if (!Number.isFinite(exp) || exp < nowMs) return false
  const expected = crypto.createHmac('sha256', secret).update(`admin.${m[1]}`).digest('base64url')
  const a = Buffer.from(expected), b = Buffer.from(m[2])
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// True when a management-port mutation may proceed. Cookie must match the
// minted secret; FRAME_ADMIN_HASH unset means read-only (spec §4.3).
export function requestHasAdmin(headers: Headers): boolean {
  const cookie = headers.get('cookie') ?? ''
  const token = cookie.split('; ').find((c) => c.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1)
  return verifyAdminSession(token, process.env.FRAME_ADMIN_SECRET)
}

export function adminAuthEnabled(): boolean {
  return Boolean(process.env.FRAME_ADMIN_HASH)
}
