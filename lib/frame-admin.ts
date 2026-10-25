import crypto from 'node:crypto'

// Frame-local admin auth (spec §4.3): scrypt password hash in frame.env, an
// HMAC-signed stateless session cookie for management-port mutations. No
// server-side session store: local-first means auth survives console and
// internet outages.
//
// The HMAC helpers use WebCrypto (globalThis.crypto.subtle) because they are
// consumed by proxy.ts, which runs in Next.js's Edge Runtime and cannot use
// node:crypto. The scrypt helpers are only used by the Node.js login route.

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

function textEncoder(): TextEncoder {
  return new TextEncoder()
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function signAdminSession(secret: string, nowMs: number = Date.now()): Promise<string> {
  const exp = nowMs + SESSION_TTL_MS
  const payload = `admin.${exp}`
  const key = await importHmacKey(secret, ['sign'])
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, textEncoder().encode(payload))
  return `${payload}.${arrayBufferToBase64Url(sig)}`
}

export async function verifyAdminSession(token: string | undefined, secret: string | undefined, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || !secret) return false
  const m = token.match(/^admin\.(\d+)\.([A-Za-z0-9_-]+)$/)
  if (!m) return false
  const exp = Number(m[1])
  if (!Number.isFinite(exp) || exp < nowMs) return false
  const sigBytes = base64UrlToBytes(m[2])
  if (!sigBytes) return false
  const key = await importHmacKey(secret, ['verify'])
  return globalThis.crypto.subtle.verify('HMAC', key, sigBytes, textEncoder().encode(`admin.${m[1]}`))
}

function base64UrlToBytes(str: string): ArrayBuffer | null {
  try {
    const pad = (4 - (str.length % 4)) % 4
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  } catch {
    return null
  }
}

// True when a management-port mutation may proceed. Cookie must match the
// minted secret; FRAME_ADMIN_HASH unset means read-only (spec §4.3).
export async function requestHasAdmin(headers: Headers): Promise<boolean> {
  const cookie = headers.get('cookie') ?? ''
  const token = cookie.split('; ').find((c) => c.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1)
  return verifyAdminSession(token, process.env.FRAME_ADMIN_SECRET)
}

export function adminAuthEnabled(): boolean {
  return Boolean(process.env.FRAME_ADMIN_HASH)
}
