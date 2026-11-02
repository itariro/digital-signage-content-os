# Frame Enrollment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed boundary gaps from the frame-enrollment review without changing module boundaries: one admin-secret invariant, atomic `frame.env` writes, https-only enrollment, trusted proxy identity, bounded rate limiting, best-effort audit, atomic redeem on both dialects, and validated management ports.

**Architecture:** Small validators live in the module that owns the data. `lib/frame-admin.ts` owns the secret rule; `lib/kiosk/frame-env.ts` owns env validation and atomic writes; `lib/request-ip.ts` owns the limiter key; `lib/console/enroll.ts` owns the issue and redeem transactions; `lib/mgmt-port.ts` owns port parsing. Routes and the CLI only orchestrate.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Drizzle with Postgres and better-sqlite3, Vitest, zod, node:crypto, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-25-frame-enrollment-hardening-design.md`

**Repo checks:** `npx tsc --noEmit`, `npm run test`, `npm run build`. This branch has no lint script or ESLint config.

**Working directory:** `~/.local/share/opencode/worktree/68dcae/frame-enrollment-1025a` on branch `agent/frame-enrollment-1025a`. Never commit to `main`. The tree has four uncommitted first-pass fixes. Task 1 commits only those files before any new work.

**Evidence rule:** Every task records the failing test output before the change and the passing output after it. Keep both outputs for the PR body. The final task runs the full gate and the Postgres case when `DATABASE_URL` is set.

---

## File map

| File | Responsibility |
|---|---|
| `lib/request-ip.ts` (new) and `lib/__tests__/request-ip.test.ts` | trusted proxy key or one local bucket for rate limits |
| `lib/rate-limit.ts` | bounded fixed-window map with periodic sweep |
| `lib/frame-admin.ts` | the single valid-admin-secret rule, cookie parsing, signing guard |
| `app/api/admin/login/route.ts` | generic 401, no-store success, `Retry-After` on 429 |
| `tests/frame-admin.test.ts` | invariant, cookie, login-state, and 429 tests |
| `tests/proxy-gate.test.ts` | gate hint when the hash is set but the secret is unusable |
| `lib/kiosk/frame-env.ts` | key/value validation and atomic 0640 writes |
| `lib/kiosk/cli.ts` | `password` writes secret plus hash in one operation; enroll prints chown warnings |
| `lib/kiosk/enroll.ts` | https or loopback only, zod bundle validation, active timeout |
| `lib/audit.ts` | `auditSafe` best-effort writer |
| `app/api/enroll/route.ts` | client key, `auditSafe`, no-store bundle |
| `lib/console/enroll.ts` | TTL guard, stale-code invalidation, `UPDATE ... RETURNING` |
| `tests/enroll-service.test.ts` | sqlite redeem and stale-code behavior |
| `tests/enroll-pg.test.ts` (new) | Postgres redeem path, gated on `DATABASE_URL` |
| `lib/mgmt-port.ts` | port parser, collision checks, connection hardening |
| `tests/mgmt-port.test.ts` | parser, invalid config, bind conflict, dead upstream |
| `.env.example`, `docs/operations.md`, `docs/kiosk-cli.md` | operator-facing behavior changes |

---

### Task 1: Commit the first-pass baseline

**Files:**
- Modify (commit only): `app/api/admin/login/route.ts`
- Modify (commit only): `install-kiosk.sh`
- Modify (commit only): `lib/kiosk/enroll.ts`
- Modify (commit only): `lib/rate-limit.ts`

- [ ] **Step 1: Confirm the baseline diff is exactly the four known files**

Run:

```bash
git status --short
git diff --stat
```

Expected: the four modified files and no other changes. If anything else is modified, stop and ask before committing it.

- [ ] **Step 2: Commit the baseline**

Run:

```bash
git add app/api/admin/login/route.ts install-kiosk.sh lib/kiosk/enroll.ts lib/rate-limit.ts
git commit -m "fix(enroll): land first-pass review fixes"
```

- [ ] **Step 3: Verify the tree is clean**

Run:

```bash
git status --short
```

Expected: no output.

---

### Task 2: Trusted client identity and a bounded limiter

**Files:**
- Create: `lib/request-ip.ts`
- Create: `lib/__tests__/request-ip.test.ts`
- Modify: `lib/rate-limit.ts`
- Modify: `lib/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the failing request-identity test**

Create `lib/__tests__/request-ip.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { clientKey, LOCAL_CLIENT } from '../request-ip'

const env = process.env as Record<string, string | undefined>

afterEach(() => { delete env.TRUST_PROXY })

function request(headers: Record<string, string>): Request {
  return new Request('http://frame.local/api/admin/login', { headers })
}

describe('clientKey', () => {
  it('uses one local bucket when TRUST_PROXY is unset', () => {
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '5.6.7.8' }), env)).toBe(LOCAL_CLIENT)
  })

  it('uses distinct forwarded addresses when TRUST_PROXY=1', () => {
    env.TRUST_PROXY = '1'
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), env)).toBe('1.2.3.4')
    expect(clientKey(request({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }), env)).toBe('5.6.7.8')
  })

  it('accepts TRUST_PROXY=true and falls back to x-real-ip', () => {
    env.TRUST_PROXY = 'true'
    expect(clientKey(request({ 'x-real-ip': '9.8.7.6' }), env)).toBe('9.8.7.6')
  })

  it('falls back to local for invalid or overlong values', () => {
    env.TRUST_PROXY = '1'
    expect(clientKey(request({ 'x-forwarded-for': 'not-an-ip' }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '1'.repeat(65) }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '[::1]' }), env)).toBe(LOCAL_CLIENT)
  })

  it('ignores proxy headers entirely when untrusted', () => {
    expect(clientKey(request({ 'x-real-ip': '9.8.7.6' }), env)).toBe(LOCAL_CLIENT)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run:

```bash
npx vitest run lib/__tests__/request-ip.test.ts
```

Expected: FAIL with `Failed to resolve import "../request-ip"`.

- [ ] **Step 3: Implement `lib/request-ip.ts`**

Create the file:

```ts
import net from 'node:net'

// Rate-limit identity. A frame has no proxy in front of it, so trusting
// x-forwarded-for there only lets a client mint fresh buckets. Operators put a
// proxy that overwrites the header in front of a hosted console and set
// TRUST_PROXY=1.

export const LOCAL_CLIENT = 'local'

function firstHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name)?.split(',')[0]?.trim() || undefined
}

export function clientKey(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const trusted = env.TRUST_PROXY === '1' || env.TRUST_PROXY?.toLowerCase() === 'true'
  if (!trusted) return LOCAL_CLIENT
  const candidate = firstHeader(request.headers, 'x-forwarded-for')
    ?? firstHeader(request.headers, 'x-real-ip')
  if (!candidate || candidate.length > 64 || net.isIP(candidate) === 0) return LOCAL_CLIENT
  return candidate
}
```

- [ ] **Step 4: Run the request-identity test**

Run:

```bash
npx vitest run lib/__tests__/request-ip.test.ts
```

Expected: PASS, five tests.

- [ ] **Step 5: Write the failing bounded-limiter tests**

Replace `lib/__tests__/rate-limit.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkLimit, __limitsSize, __resetLimits, MAX_WINDOWS } from '../rate-limit'

beforeEach(() => { __resetLimits() })

describe('checkLimit', () => {
  it('allows up to max per window, then blocks', () => {
    let nowMs = 1_000_000
    const now = () => nowMs
    for (let i = 0; i < 10; i++) expect(checkLimit('ip1', 10, 60_000, now).allowed).toBe(true)
    const blocked = checkLimit('ip1', 10, 60_000, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('does not leak across keys', () => {
    const now = () => 1_000_000
    expect(checkLimit('a', 1, 60_000, now).allowed).toBe(true)
    expect(checkLimit('a', 1, 60_000, now).allowed).toBe(false)
    expect(checkLimit('b', 1, 60_000, now).allowed).toBe(true)
  })

  it('resets when the window rolls over', () => {
    let nowMs = 1_000_000
    const now = () => nowMs
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(true)
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(false)
    nowMs += 600
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(true)
  })

  it('bounds the number of tracked windows', () => {
    const now = () => 2_000_000
    for (let i = 0; i < MAX_WINDOWS + 1; i++) checkLimit(`k${i}`, 1, 60_000, now)
    expect(__limitsSize()).toBeLessThanOrEqual(MAX_WINDOWS)
  })

  it('evicts the oldest window first when the map is full', () => {
    const now = () => 3_000_000
    checkLimit('oldest', 1, 60_000, now)
    for (let i = 0; i < MAX_WINDOWS - 1; i++) checkLimit(`k${i}`, 1, 60_000, now)
    expect(__limitsSize()).toBe(MAX_WINDOWS)
    checkLimit('trigger', 1, 60_000, now)
    expect(checkLimit('oldest', 1, 60_000, now).allowed).toBe(true)
  })
})
```

- [ ] **Step 6: Run the limiter test to verify it fails**

Run:

```bash
npx vitest run lib/__tests__/rate-limit.test.ts
```

Expected: FAIL because `__limitsSize` and `MAX_WINDOWS` are not exported.

- [ ] **Step 7: Implement the bounded limiter**

Replace `lib/rate-limit.ts` with:

```ts
// Fixed-window in-memory limiter for /api/enroll and /api/admin/login.
// Per-process best-effort: a horizontally scaled console counts per instance.
// Enrollment code entropy covers what an imperfect limiter misses (spec §3.2).
type Window = { count: number; resetAt: number }

export const MAX_WINDOWS = 10_000
export const SWEEP_EVERY = 256

const windows = new Map<string, Window>()
let checks = 0

export interface LimitResult { allowed: boolean; retryAfterMs: number }

function dropExpired(t: number): void {
  for (const [k, w] of windows) if (t >= w.resetAt) windows.delete(k)
}

// The key being checked is never evicted, so a full map cannot turn an active
// brute-force bucket into a fresh one. Map iteration follows insertion order,
// which is O(1) amortised instead of sorting the whole map on every request.
function evictOldest(keepKey: string): void {
  for (const k of windows.keys()) {
    if (k !== keepKey) {
      windows.delete(k)
      return
    }
  }
}

export function checkLimit(key: string, max: number, windowMs: number, now: () => number = Date.now): LimitResult {
  const t = now()
  checks += 1
  if (checks % SWEEP_EVERY === 0) dropExpired(t)

  const w = windows.get(key)
  if (!w || t >= w.resetAt) {
    if (windows.size >= MAX_WINDOWS) {
      dropExpired(t)
      if (windows.size >= MAX_WINDOWS) evictOldest(key)
    }
    windows.set(key, { count: 1, resetAt: t + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }
  w.count += 1
  if (w.count > max) return { allowed: false, retryAfterMs: w.resetAt - t }
  return { allowed: true, retryAfterMs: 0 }
}

// Drop stale windows. Exported for tests and manual operational sweeps.
export function sweepLimits(now: () => number = Date.now): void {
  dropExpired(now())
}

export function __resetLimits(): void {
  windows.clear()
  checks = 0
}

export function __limitsSize(): number {
  return windows.size
}
```

- [ ] **Step 8: Run both limiter and identity tests**

Run:

```bash
npx vitest run lib/__tests__/request-ip.test.ts lib/__tests__/rate-limit.test.ts
```

Expected: PASS, ten tests.

- [ ] **Step 9: Commit**

```bash
git add lib/request-ip.ts lib/__tests__/request-ip.test.ts lib/rate-limit.ts lib/__tests__/rate-limit.test.ts
git commit -m "fix(security): trust proxy headers only on request and bound limiter map"
```

---

### Task 3: One admin-secret invariant and a fail-closed login

**Files:**
- Modify: `lib/frame-admin.ts`
- Modify: `app/api/admin/login/route.ts`
- Modify: `tests/frame-admin.test.ts`
- Modify: `tests/proxy-gate.test.ts`

- [ ] **Step 1: Write the failing admin tests**

Replace `tests/frame-admin.test.ts` with:

```ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  ADMIN_COOKIE,
  AdminConfigError,
  adminAuthEnabled,
  hashAdminPassword,
  isValidAdminSecret,
  requestHasAdmin,
  signAdminSession,
  verifyAdminSession,
  verifyAdminPassword,
} from '@/lib/frame-admin'
import { __resetLimits } from '@/lib/rate-limit'

const env = process.env as Record<string, string | undefined>

function loginRequest(password: string) {
  return new NextRequest('http://f:8808/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

async function login(password: string) {
  const { POST } = await import('@/app/api/admin/login/route')
  return POST(loginRequest(password))
}

beforeEach(() => { __resetLimits() })

afterEach(() => {
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
  delete env.TRUST_PROXY
})

describe('frame admin auth', () => {
  it('scrypt hash round-trips and rejects wrong secrets', () => {
    const stored = hashAdminPassword('correct horse battery staple')
    expect(verifyAdminPassword('correct horse battery staple', stored)).toBe(true)
    expect(verifyAdminPassword('wrong', stored)).toBe(false)
    expect(stored).not.toContain('correct horse battery staple')
  })

  it('HMAC session verifies, expires, and rejects foreign signatures', async () => {
    const secret = 'a'.repeat(32)
    const nowMs = 1_700_000_000_000
    const token = await signAdminSession(secret, nowMs)
    expect(await verifyAdminSession(token, secret, nowMs)).toBe(true)
    expect(await verifyAdminSession(token, secret, nowMs + 7 * 24 * 3600_000 - 1000)).toBe(true)
    expect(await verifyAdminSession(token, secret, nowMs + 8 * 24 * 3600_000)).toBe(false)
    expect(await verifyAdminSession(token, 'b'.repeat(32), nowMs)).toBe(false)
    expect(await verifyAdminSession('garbage', secret, nowMs)).toBe(false)
  })

  it('accepts only 32-128 base64url admin secrets', () => {
    expect(isValidAdminSecret('a'.repeat(32))).toBe(true)
    expect(isValidAdminSecret('A_b-9'.repeat(8))).toBe(true)
    expect(isValidAdminSecret('a'.repeat(128))).toBe(true)
    for (const value of [
      undefined,
      '',
      'a'.repeat(31),
      'a'.repeat(129),
      ' '.repeat(32),
      'a'.repeat(31) + '\n',
      'a'.repeat(31) + '=',
      'a'.repeat(31) + '+',
      'a'.repeat(31) + '/',
    ]) {
      expect(isValidAdminSecret(value)).toBe(false)
    }
  })

  it('signAdminSession refuses an invalid secret', async () => {
    for (const value of ['', ' '.repeat(32), 'a'.repeat(31), 'a'.repeat(31) + '=']) {
      await expect(signAdminSession(value)).rejects.toBeInstanceOf(AdminConfigError)
    }
  })

  it('verifyAdminSession rejects an invalid configured secret', async () => {
    const token = await signAdminSession('a'.repeat(32))
    expect(await verifyAdminSession(token, 'short')).toBe(false)
  })

  it('adminAuthEnabled requires both a hash and a valid secret', () => {
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')
    expect(adminAuthEnabled()).toBe(false)
    env.FRAME_ADMIN_SECRET = 'short'
    expect(adminAuthEnabled()).toBe(false)
    env.FRAME_ADMIN_SECRET = 'a'.repeat(32)
    expect(adminAuthEnabled()).toBe(true)
    delete env.FRAME_ADMIN_HASH
    expect(adminAuthEnabled()).toBe(false)
  })

  it('accepts a cookie header without a space after the semicolon', async () => {
    const secret = 'a'.repeat(32)
    env.FRAME_ADMIN_SECRET = secret
    const token = await signAdminSession(secret)
    expect(await requestHasAdmin(new Headers({ cookie: `other=1;${ADMIN_COOKIE}=${token}` }))).toBe(true)
  })

  it('login route sets the cookie and no-store when configured', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('let-me-in')

    const res = await login('let-me-in')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`${ADMIN_COOKIE}=admin.`)
    expect(cookie).toContain('HttpOnly')
    expect(await verifyAdminSession(
      cookie.split(';')[0].slice(ADMIN_COOKIE.length + 1),
      env.FRAME_ADMIN_SECRET,
      Date.now(),
    )).toBe(true)
  })

  it('wrong-password and unset-hash 401s return the same body', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_SECRET = 's'.repeat(40)
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')

    const wrong = await login('wrong')
    delete env.FRAME_ADMIN_HASH
    const unset = await login('right')
    expect(wrong.status).toBe(401)
    expect(unset.status).toBe(401)
    expect(JSON.stringify(await unset.json())).toBe(JSON.stringify(await wrong.json()))
  })

  it('returns one generic 401 with no cookie when the secret is unavailable', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'
    env.FRAME_ADMIN_HASH = hashAdminPassword('right')

    for (const secret of [undefined, '', 'short']) {
      if (secret === undefined) delete env.FRAME_ADMIN_SECRET
      else env.FRAME_ADMIN_SECRET = secret
      __resetLimits()
      const res = await login('right')
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(await res.json()).toEqual({ error: 'unauthorized' })
    }
  })

  it('adds Retry-After to a rate-limited login', async () => {
    env.FRAME_MODE = 'instance'
    delete env.DATABASE_URL
    env.FRAME_DB_PATH = ':memory:'
    env.FRAME_DATA_DIR = '/tmp/scratchpad/fadmin'

    for (let i = 0; i < 10; i++) expect((await login('right')).status).toBe(401)
    const limited = await login('right')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
  })
})
```

- [ ] **Step 2: Add the gate test for an unusable secret**

In `tests/proxy-gate.test.ts`, change the import line to include `afterEach`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
```

Add this cleanup after the `env` declaration:

```ts
afterEach(() => {
  delete env.KIOSK_MGMT_PORT
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
})
```

Add this test after the existing forged-management-port test:

```ts
it('returns the password hint when the hash is set but the secret is unusable', async () => {
  env.KIOSK_MGMT_PORT = '8808'
  env.FRAME_ADMIN_HASH = 'configured'
  env.FRAME_ADMIN_SECRET = 'short'
  const mod = await import('@/proxy')
  const res = await mod.default(makeRequest('/api/frames', 'POST', 'x:8808'), {} as any)
  expect(res).toBeDefined()
  expect(res!.status).toBe(401)
  const body = await res!.json()
  expect(body.error).toBe('admin_password_not_configured')
  expect(body.hint).toContain('kiosk-ctl password')
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/frame-admin.test.ts tests/proxy-gate.test.ts
```

Expected: FAIL. `isValidAdminSecret` and `AdminConfigError` are not exported, and the gate test gets `401 unauthorized` instead of the config hint because the current `adminAuthEnabled` only checks the hash.

- [ ] **Step 4: Implement the invariant in `lib/frame-admin.ts`**

Replace the file with:

```ts
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

export const MIN_ADMIN_SECRET_LENGTH = 32
export const MAX_ADMIN_SECRET_LENGTH = 128
const ADMIN_SECRET_PATTERN = /^[A-Za-z0-9_-]+$/
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/

export class AdminConfigError extends Error {
  constructor(message = 'FRAME_ADMIN_SECRET must be 32-128 base64url characters') {
    super(message)
    this.name = 'AdminConfigError'
  }
}

export function isValidAdminSecret(value: string | undefined): value is string {
  return typeof value === 'string'
    && value.length >= MIN_ADMIN_SECRET_LENGTH
    && value.length <= MAX_ADMIN_SECRET_LENGTH
    && !CONTROL_PATTERN.test(value)
    && ADMIN_SECRET_PATTERN.test(value)
}

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
  if (!isValidAdminSecret(secret)) throw new AdminConfigError()
  const exp = nowMs + SESSION_TTL_MS
  const payload = `admin.${exp}`
  const key = await importHmacKey(secret, ['sign'])
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, textEncoder().encode(payload))
  return `${payload}.${arrayBufferToBase64Url(sig)}`
}

export async function verifyAdminSession(token: string | undefined, secret: string | undefined, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || !isValidAdminSecret(secret)) return false
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

function cookieValue(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1)
  }
  return undefined
}

// True when a management-port mutation may proceed. Cookie must match the
// minted secret; a hash without a usable secret stays read-only (spec §4.3).
export async function requestHasAdmin(headers: Headers): Promise<boolean> {
  const token = cookieValue(headers.get('cookie') ?? '', ADMIN_COOKIE)
  return verifyAdminSession(token, process.env.FRAME_ADMIN_SECRET)
}

export function adminAuthEnabled(): boolean {
  return Boolean(process.env.FRAME_ADMIN_HASH)
    && isValidAdminSecret(process.env.FRAME_ADMIN_SECRET)
}
```

- [ ] **Step 5: Update the login route**

Replace `app/api/admin/login/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, adminAuthEnabled, signAdminSession, verifyAdminPassword } from '@/lib/frame-admin'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const dynamic = 'force-dynamic'

const body = z.object({ password: z.string().min(1).max(256) })

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

// Frame-only: the port gate (proxy.ts) routes POST /api/admin/login here from
// the management port; display-port traffic never sees this route.
export async function POST(request: NextRequest) {
  const ip = clientKey(request)
  const limit = checkLimit(`login:${ip}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  if (!adminAuthEnabled()) return unauthorized()

  const hash = process.env.FRAME_ADMIN_HASH!
  const secret = process.env.FRAME_ADMIN_SECRET!
  if (!verifyAdminPassword(parsed.data.password, hash)) return unauthorized()

  const token = await signAdminSession(secret)
  const res = NextResponse.json({ ok: true })
  res.headers.set('set-cookie', `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
npx vitest run tests/frame-admin.test.ts tests/proxy-gate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/frame-admin.ts app/api/admin/login/route.ts tests/frame-admin.test.ts tests/proxy-gate.test.ts
git commit -m "fix(auth): require a usable admin secret before signing a session"
```

---

### Task 4: Validate `frame.env` and write it atomically

**Files:**
- Modify: `lib/kiosk/frame-env.ts`
- Modify: `lib/kiosk/__tests__/frame-env.test.ts`

- [ ] **Step 1: Update the test setup to use a fresh directory per test**

At the top of `lib/kiosk/__tests__/frame-env.test.ts`, change the vitest import to:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
```

Change the frame-env import to:

```ts
import { FrameEnvError, frameEnvLines, parseFrameEnv, setFrameEnvValue, writeFrameEnv } from '@/lib/kiosk/frame-env'
```

Replace the shared directory block:

```ts
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'))
const target = path.join(dir, 'frame.env')

afterEach(() => { fs.rmSync(target, { force: true }) })
```

with:

```ts
let dir: string
let target: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-env-'))
  target = path.join(dir, 'frame.env')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.FRAME_ENV_PATH
  delete process.env.FRAME_ADMIN_SECRET
})
```

- [ ] **Step 2: Add the failing writer tests**

Add these tests inside `describe('frame.env writer')`, after the existing `setFrameEnvValue` test:

```ts
  it('round-trips a value containing =', () => {
    expect(frameEnvLines({ TOKEN: 'a=b' })).toBe('TOKEN=a=b\n')
    expect(parseFrameEnv(frameEnvLines({ TOKEN: 'a=b' }))).toEqual({ TOKEN: 'a=b' })
  })

  it('rejects invalid keys and values before writing', () => {
    for (const key of ['lower', '1LEADING', 'WITH-DASH', 'WITH SPACE', '', 'OK\n']) {
      expect(() => frameEnvLines({ [key]: 'ok' })).toThrow(FrameEnvError)
    }
    for (const value of ['a\nb', 'a\rb', 'a\0b', 'a\tb', ' leading', 'trailing ', 'a\u007fb']) {
      expect(() => frameEnvLines({ OK: value })).toThrow(FrameEnvError)
    }
    expect(fs.existsSync(target)).toBe(false)
    expect(() => writeFrameEnv(target, { TOKEN: 'a\nb' })).toThrow(FrameEnvError)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('names the bad key but never echoes the value', () => {
    try {
      frameEnvLines({ SYNC_TOKEN: 'secret-value\nB=evil' })
      expect.unreachable('expected a FrameEnvError')
    } catch (error) {
      expect(error).toBeInstanceOf(FrameEnvError)
      const message = (error as Error).message
      expect(message).toContain('SYNC_TOKEN')
      expect(message).not.toContain('secret-value')
    }
  })

  it('leaves no temp file and keeps the old file when the rename fails', () => {
    writeFrameEnv(target, { KEEP: 'old' })
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed')
    })
    try {
      expect(() => writeFrameEnv(target, { KEEP: 'new' })).toThrow('rename failed')
    } finally {
      spy.mockRestore()
    }
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ KEEP: 'old' })
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('frame.env.tmp.'))).toEqual([])
  })

  it('uses a unique temp file for each write', () => {
    const opened: string[] = []
    const realOpen = fs.openSync.bind(fs)
    const spy = vi.spyOn(fs, 'openSync').mockImplementation(((file: any, flags: any, mode?: any) => {
      if (typeof file === 'string' && file.startsWith(`${target}.tmp.`)) opened.push(file)
      return realOpen(file, flags, mode)
    }) as any)
    try {
      writeFrameEnv(target, { A: '1' })
      writeFrameEnv(target, { B: '2' })
    } finally {
      spy.mockRestore()
    }
    expect(opened).toHaveLength(2)
    expect(opened[0]).not.toBe(opened[1])
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ B: '2' })
  })

  it('creates a missing parent directory with mode 0750', () => {
    const nested = path.join(dir, 'etc', 'dscos')
    writeFrameEnv(path.join(nested, 'frame.env'), { A: '1' })
    expect(fs.statSync(nested).mode & 0o777).toBe(0o750)
    expect(fs.statSync(path.join(nested, 'frame.env')).mode & 0o777).toBe(0o640)
  })

  it('leaves the existing file untouched when a merged value is invalid', () => {
    writeFrameEnv(target, { A: '1' })
    expect(() => setFrameEnvValue(target, 'bad-key', 'x')).toThrow(FrameEnvError)
    expect(parseFrameEnv(fs.readFileSync(target, 'utf8'))).toEqual({ A: '1' })
  })
```

- [ ] **Step 3: Run the writer tests to verify they fail**

Run:

```bash
npx vitest run lib/kiosk/__tests__/frame-env.test.ts
```

Expected: FAIL. `FrameEnvError` is not exported, a newline currently produces a corrupt file, and the temp name is fixed.

- [ ] **Step 4: Implement the validator and atomic writer**

Replace `lib/kiosk/frame-env.ts` with:

```ts
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
```

- [ ] **Step 5: Run the frame.env tests to verify they pass**

Run:

```bash
npx vitest run lib/kiosk/__tests__/frame-env.test.ts
```

Expected: PASS. The existing CLI and password tests still use their old fixtures; they are updated in Tasks 5 and 6.

- [ ] **Step 6: Commit**

```bash
git add lib/kiosk/frame-env.ts lib/kiosk/__tests__/frame-env.test.ts
git commit -m "fix(kiosk): validate frame.env entries and write through a unique temp file"
```

---

### Task 5: Make the password command persist a usable secret in one write

**Files:**
- Modify: `lib/kiosk/cli.ts`
- Modify: `lib/kiosk/__tests__/frame-env.test.ts`

- [ ] **Step 1: Add the failing password-command tests**

In `lib/kiosk/__tests__/frame-env.test.ts`, replace the existing preserve test body's fixture:

```ts
    writeFrameEnv(file, { FRAME_ADMIN_SECRET: 'existing-secret' })
```

with:

```ts
    const existing = 'v'.repeat(43)
    writeFrameEnv(file, { FRAME_ADMIN_SECRET: existing })
```

and change its assertion:

```ts
      expect(env.FRAME_ADMIN_SECRET).toBe('existing-secret')
```

to:

```ts
      expect(env.FRAME_ADMIN_SECRET).toBe(existing)
```

Add these tests inside `describe('kiosk password command')`:

```ts
  it('persists an env-only FRAME_ADMIN_SECRET into frame.env', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-env.env')
    process.env.FRAME_ENV_PATH = file
    process.env.FRAME_ADMIN_SECRET = 'e'.repeat(43)
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toBe('e'.repeat(43))
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(res.stdout).not.toContain('generated FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      delete process.env.FRAME_ADMIN_SECRET
      fs.rmSync(file, { force: true })
    }
  })

  it('replaces an invalid stored secret with a warning', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-invalid.env')
    process.env.FRAME_ENV_PATH = file
    writeFrameEnv(file, { FRAME_ADMIN_SECRET: 'too-short' })
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(env.FRAME_ADMIN_SECRET).not.toBe('too-short')
      expect(res.stderr).toContain('replaced invalid FRAME_ADMIN_SECRET')
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })

  it('writes the secret and hash together with no temp file left behind', async () => {
    const { runCli } = await import('@/lib/kiosk/cli')
    const file = path.join(dir, 'password-once.env')
    process.env.FRAME_ENV_PATH = file
    try {
      const res = await runCli(['password', 'anothersecret'])
      expect(res.exitCode).toBe(0)
      const env = parseFrameEnv(fs.readFileSync(file, 'utf8'))
      expect(env.FRAME_ADMIN_SECRET).toBeTruthy()
      expect(env.FRAME_ADMIN_HASH).toMatch(/^[0-9a-f]{32}\$[0-9a-f]{64}$/)
      expect(fs.readdirSync(dir).filter((name) => name.startsWith('password-once.env.tmp.'))).toEqual([])
    } finally {
      delete process.env.FRAME_ENV_PATH
      fs.rmSync(file, { force: true })
    }
  })
```

- [ ] **Step 2: Run the password tests to verify they fail**

Run:

```bash
npx vitest run lib/kiosk/__tests__/frame-env.test.ts -t "kiosk password command"
```

Expected: FAIL on the env-only test because the current command only generates when both the file and env are missing, then writes only the hash. The invalid-stored-secret and one-write tests also fail.

- [ ] **Step 3: Replace `cmdPassword` in `lib/kiosk/cli.ts`**

Replace the whole `cmdPassword` function with:

```ts
async function cmdPassword(ctx: Ctx, secret: string | undefined): Promise<number> {
  if (!secret) { err(ctx, 'usage: kiosk password <secret>'); return 2 }
  const { hashAdminPassword, isValidAdminSecret } = await import('../frame-admin')
  const { writeFrameEnv, frameEnvPath, parseFrameEnv } = await import('./frame-env')
  const fs = require('node:fs')
  const crypto = require('node:crypto')
  const file = process.env.FRAME_ENV_PATH || frameEnvPath()
  if (secret.length < 8) { err(ctx, 'password too short (min 8)'); return 1 }

  const existing = fs.existsSync(file) ? parseFrameEnv(fs.readFileSync(file, 'utf8')) : {}
  const storedSecret = existing.FRAME_ADMIN_SECRET
  if (storedSecret && !isValidAdminSecret(storedSecret)) {
    err(ctx, `warning: replaced invalid FRAME_ADMIN_SECRET in ${file}`)
  }

  let adminSecret: string
  if (isValidAdminSecret(storedSecret)) {
    adminSecret = storedSecret
  } else if (isValidAdminSecret(process.env.FRAME_ADMIN_SECRET)) {
    adminSecret = process.env.FRAME_ADMIN_SECRET
  } else {
    adminSecret = crypto.randomBytes(32).toString('base64url')
    out(ctx, `generated FRAME_ADMIN_SECRET in ${file}`)
  }

  // One write: a crash cannot leave a new secret with the old hash.
  writeFrameEnv(file, {
    ...existing,
    FRAME_ADMIN_SECRET: adminSecret,
    FRAME_ADMIN_HASH: hashAdminPassword(secret),
  })
  out(ctx, `admin password set in ${file}; restart the app to apply`)
  if (process.platform === 'linux') {
    execCmd('systemctl', ['restart', APP_SERVICE])
  }
  return 0
}
```

- [ ] **Step 4: Run the password tests to verify they pass**

Run:

```bash
npx vitest run lib/kiosk/__tests__/frame-env.test.ts -t "kiosk password command"
```

Expected: PASS, six tests.

- [ ] **Step 5: Run the whole kiosk frame-env suite**

Run:

```bash
npx vitest run lib/kiosk/__tests__/frame-env.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/kiosk/cli.ts lib/kiosk/__tests__/frame-env.test.ts
git commit -m "fix(kiosk): write admin secret and hash together from the password command"
```

---

### Task 6: Require https, validate the bundle, and warn on chown failure

**Files:**
- Modify: `lib/kiosk/enroll.ts`
- Modify: `lib/kiosk/cli.ts`
- Create: `lib/kiosk/__tests__/enroll.test.ts`
- Modify: `lib/kiosk/__tests__/frame-env.test.ts`

- [ ] **Step 1: Update the existing CLI enroll fixture**

In `lib/kiosk/__tests__/frame-env.test.ts`, replace the mocked response:

```ts
      instanceId: 'c1', deviceToken: 'dt', syncEndpoint: 'https://console.test/api/sync', frameAdminSecret: 'sec',
```

with:

```ts
      instanceId: 'inst1234',
      deviceToken: 'd'.repeat(32),
      syncEndpoint: 'https://console.test/api/sync',
      frameAdminSecret: 's'.repeat(43),
```

Then change the matching assertion:

```ts
      expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe('dt')
```

to:

```ts
      expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe('d'.repeat(32))
```

- [ ] **Step 2: Write the failing enrollment-client test**

Create `lib/kiosk/__tests__/enroll.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chownToKioskGroup, enroll } from '@/lib/kiosk/enroll'
import { parseFrameEnv } from '@/lib/kiosk/frame-env'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-enroll-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const validBundle = {
  instanceId: 'inst1234',
  deviceToken: 'd'.repeat(32),
  syncEndpoint: 'https://console.test/api/sync',
  frameAdminSecret: 's'.repeat(43),
  config: { clerkPublishableKey: 'pk_test_abc123' },
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('kiosk enroll client', () => {
  it('rejects non-loopback http before making a request', async () => {
    const fetchMock = vi.fn()
    const file = path.join(dir, 'http.env')
    const res = await enroll('http://console.example.com', 'code', {
      fetch: fetchMock as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('https')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('accepts loopback http URLs for development', async () => {
    for (const [index, url] of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'].entries()) {
      const file = path.join(dir, `loop-${index}.env`)
      const fetchMock = vi.fn(async () => response(validBundle))
      const res = await enroll(url, 'code', {
        fetch: fetchMock as unknown as typeof fetch,
        envPath: file,
      })
      expect(res.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(parseFrameEnv(fs.readFileSync(file, 'utf8')).SYNC_TOKEN).toBe(validBundle.deviceToken)
    }
  })

  it('rejects credentials, a query, or a fragment in the console URL', async () => {
    for (const url of [
      'https://user:pass@console.test',
      'https://console.test/?tenant=1',
      'https://console.test/#setup',
    ]) {
      const fetchMock = vi.fn()
      const res = await enroll(url, 'code', {
        fetch: fetchMock as unknown as typeof fetch,
        envPath: path.join(dir, 'bad-url.env'),
      })
      expect(res.ok).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(dir, 'bad-url.env'))).toBe(false)
    }
  })

  it('keeps the console path and appends the enroll endpoint', async () => {
    const file = path.join(dir, 'path.env')
    const fetchMock = vi.fn(async () => response(validBundle))
    const res = await enroll('https://console.test/base', 'code', {
      fetch: fetchMock as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://console.test/base/api/enroll')
  })

  it('aborts a stalled request and writes nothing', async () => {
    const file = path.join(dir, 'timeout.env')
    const fetchMock = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      })
    })) as unknown as typeof fetch
    const res = await enroll('https://console.test', 'code', {
      fetch: fetchMock,
      envPath: file,
      timeoutMs: 10,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('timed out')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects a non-JSON response and writes nothing', async () => {
    const file = path.join(dir, 'non-json.env')
    const res = await enroll('https://console.test', 'code', {
      fetch: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('non-JSON')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('rejects malformed bundles and writes nothing', async () => {
    const cases = [
      { ...validBundle, instanceId: '' },
      { ...validBundle, instanceId: 'inst1234\n' },
      { ...validBundle, deviceToken: 'short' },
      { ...validBundle, deviceToken: 'd'.repeat(32) + '\n' },
      { ...validBundle, syncEndpoint: 'http://console.test/api/sync' },
      { ...validBundle, syncEndpoint: 'https://console.test/api/sync\n' },
      { ...validBundle, frameAdminSecret: 'short' },
      { ...validBundle, frameAdminSecret: 's'.repeat(42) + '\n' },
      { ...validBundle, frameAdminSecret: undefined },
    ]
    for (const [index, bundle] of cases.entries()) {
      const file = path.join(dir, `bad-bundle-${index}.env`)
      const res = await enroll('https://console.test', 'code', {
        fetch: (async () => response(bundle)) as unknown as typeof fetch,
        envPath: file,
      })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('invalid enrollment bundle')
      expect(fs.existsSync(file)).toBe(false)
    }
  })

  it('writes every bundle key and a 0640 file for a valid response', async () => {
    const file = path.join(dir, 'valid.env')
    const res = await enroll('https://console.test', 'code', {
      fetch: (async () => response(validBundle)) as unknown as typeof fetch,
      envPath: file,
    })
    expect(res.ok).toBe(true)
    const vars = parseFrameEnv(fs.readFileSync(file, 'utf8'))
    expect(vars).toMatchObject({
      FRAME_MODE: 'instance',
      SYNC_ENABLED: 'true',
      SYNC_ENDPOINT: validBundle.syncEndpoint,
      INSTANCE_ID: validBundle.instanceId,
      SYNC_TOKEN: validBundle.deviceToken,
      FRAME_ADMIN_SECRET: validBundle.frameAdminSecret,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: validBundle.config.clerkPublishableKey,
    })
    expect(fs.statSync(file).mode & 0o777).toBe(0o640)
  })

  it('returns a warning when root cannot resolve the kiosk group', () => {
    const file = path.join(dir, 'chown.env')
    fs.writeFileSync(file, 'A=1\n')
    const warning = chownToKioskGroup(file, { getuid: () => 0, exec: () => '' })
    expect(warning).toContain('could not set kiosk group ownership')
    expect(warning).toContain(`chown root:kiosk ${file}`)
  })
})
```

- [ ] **Step 3: Run the enrollment-client test to verify it fails**

Run:

```bash
npx vitest run lib/kiosk/__tests__/enroll.test.ts
```

Expected: FAIL. The current client accepts non-loopback http, casts JSON without validation, and `chownToKioskGroup` is not exported.

- [ ] **Step 4: Replace `lib/kiosk/enroll.ts`**

Replace the file with:

```ts
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
    .url()
    .refine(hasNoControlCharacters, 'syncEndpoint must not contain control characters')
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

// Best-effort root:kiosk ownership so the service user can read the file
// while the world cannot. Non-root dev machines (tests) keep it as-is.
// A root frame without a kiosk group gets a warning but keeps the bundle.
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
```

- [ ] **Step 5: Print the chown warning from `cmdEnroll`**

In `lib/kiosk/cli.ts`, replace:

```ts
  if (!res.ok) { err(ctx, res.message ?? 'enroll failed'); return 1 }
  out(ctx, `enrolled: wrote ${res.written}`)
```

with:

```ts
  if (!res.ok) { err(ctx, res.message ?? 'enroll failed'); return 1 }
  out(ctx, `enrolled: wrote ${res.written}`)
  if (res.warning) err(ctx, res.warning)
```

- [ ] **Step 6: Run the kiosk suites**

Run:

```bash
npx vitest run lib/kiosk/__tests__/enroll.test.ts lib/kiosk/__tests__/frame-env.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/kiosk/enroll.ts lib/kiosk/cli.ts lib/kiosk/__tests__/enroll.test.ts lib/kiosk/__tests__/frame-env.test.ts
git commit -m "fix(kiosk): require https and validate the enrollment bundle before writing"
```

---

### Task 7: Make enrollment audit writes best-effort and fix the enroll route boundary

**Files:**
- Modify: `lib/audit.ts`
- Modify: `app/api/enroll/route.ts`
- Modify: `lib/__tests__/audit.test.ts`
- Modify: `tests/enroll-api.test.ts`

- [ ] **Step 1: Add the failing `auditSafe` test**

In `lib/__tests__/audit.test.ts`, add `vi` to the vitest import:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
```

Add this test inside the `describe` block:

```ts
  it('swallows a writer error and logs the target without details', async () => {
    const { auditSafe } = await import('@/lib/audit')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const write = vi.fn(async () => { throw new Error('db down') })
    try {
      await auditSafe({
        actor: 'admin',
        action: 'enroll_redeemed',
        targetType: 'instance',
        targetId: 'i1',
        details: { secret: 'do-not-log' },
      }, write)
      expect(write).toHaveBeenCalledOnce()
      expect(spy).toHaveBeenCalledWith(
        'audit write failed',
        expect.objectContaining({ action: 'enroll_redeemed', targetType: 'instance', targetId: 'i1' }),
      )
      expect(JSON.stringify(spy.mock.calls[0][1])).not.toContain('do-not-log')
    } finally {
      spy.mockRestore()
    }
  })
```

- [ ] **Step 2: Add the failing enroll-route tests**

In `tests/enroll-api.test.ts`, change the vitest import to include `vi`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
```

Add a helper after `freshDb`:

```ts
async function dropAuditTable() {
  const { getSqliteRaw } = await import('@/lib/db/sqlite')
  getSqliteRaw().exec('DROP TABLE audit_log')
}
```

In the existing successful-redeem test, add:

```ts
    expect(res.headers.get('cache-control')).toBe('no-store')
```

Replace the existing rate-limit test with:

```ts
  it('does not let changing x-forwarded-for values bypass the limiter', async () => {
    await freshDb()
    const { __resetLimits } = await import('@/lib/rate-limit')
    __resetLimits()
    delete env.TRUST_PROXY
    const { POST } = await import('@/app/api/enroll/route')
    let last = 0
    for (let i = 0; i < 12; i++) {
      const req = jsonReq('http://console.test/api/enroll', { code: `guess-${i}-padding` })
      req.headers.set('x-forwarded-for', `10.0.0.${i}`)
      last = (await POST(req)).status
    }
    expect(last).toBe(429)
  })
```

Add these two tests after it:

```ts
  it('still returns the bundle when the audit insert fails', async () => {
    await freshDb()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    const { code } = await issueEnrollmentCode()
    await dropAuditTable()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { POST } = await import('@/app/api/enroll/route')
      const res = await POST(jsonReq('http://console.test/api/enroll', { code }))
      expect(res.status).toBe(200)
      expect((await res.json()).deviceToken).toBeTruthy()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('still returns 401 when the audit insert fails on rejection', async () => {
    await freshDb()
    await dropAuditTable()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { POST } = await import('@/app/api/enroll/route')
      const res = await POST(jsonReq('http://console.test/api/enroll', { code: 'nope-nope-nope-nope' }))
      expect(res.status).toBe(401)
    } finally {
      errorSpy.mockRestore()
    }
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
npx vitest run lib/__tests__/audit.test.ts tests/enroll-api.test.ts
```

Expected: FAIL because `auditSafe` is not exported; the audit-failure route tests reject after the token is minted instead of returning a bundle.

- [ ] **Step 4: Add `auditSafe` to `lib/audit.ts`**

Replace `lib/audit.ts` with:

```ts
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { nanoid } from 'nanoid'

export interface AuditEntry {
  actor: string
  action: string
  targetType: string
  targetId: string
  details?: unknown
}

export async function audit(actor: string, action: string, targetType: string, targetId: string, details?: unknown) {
  const db = getDb()
  const { auditLog } = getTables()
  await db.insert(auditLog).values({
    id: nanoid(12),
    actor,
    action,
    targetType,
    targetId,
    details: details ?? null,
    createdAt: new Date(),
  })
}

// An audit row is not worth a lost device token. Callers on the enrollment
// path use this so an insert failure cannot turn a successful redeem into a
// 500 after the token was minted and the code burned.
export async function auditSafe(entry: AuditEntry, write: typeof audit = audit): Promise<void> {
  try {
    await write(entry.actor, entry.action, entry.targetType, entry.targetId, entry.details)
  } catch (error) {
    console.error('audit write failed', {
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      error,
    })
  }
}

export async function listAudit(limit = 100) {
  const db = getDb()
  const { auditLog } = getTables()
  const rows = await db.select().from(auditLog)
  return rows.slice(-limit).reverse()
}
```

- [ ] **Step 5: Update `app/api/enroll/route.ts`**

Replace the file with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditSafe } from '@/lib/audit'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { redeemEnrollmentCode } from '@/lib/console/enroll'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ code: z.string().min(10).max(64) })

// Public: a frame redeems its one-time enrollment code and receives its
// bundle. TLS at the edge; nothing here echoes code state (spec §3.2).
export async function POST(request: NextRequest) {
  const ip = clientKey(request)
  const limit = checkLimit(`enroll:${ip}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    )
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const bundle = await redeemEnrollmentCode(parsed.data.code)
  if (!bundle) {
    await auditSafe({
      actor: 'enroll',
      action: 'enroll_rejected',
      targetType: 'instance',
      targetId: 'unknown',
      details: { ip },
    })
    return NextResponse.json({ error: 'invalid or expired code' }, { status: 401 })
  }
  await auditSafe({
    actor: 'enroll',
    action: 'enroll_redeemed',
    targetType: 'instance',
    targetId: bundle.instanceId,
    details: { ip },
  })
  const origin = new URL(request.url).origin
  return NextResponse.json({
    instanceId: bundle.instanceId,
    deviceToken: bundle.deviceToken,
    syncEndpoint: `${origin}/api/sync`,
    frameAdminSecret: bundle.frameAdminSecret,
    config: { clerkPublishableKey: bundle.clerkPublishableKey },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 6: Run the audit and enroll-route tests**

Run:

```bash
npx vitest run lib/__tests__/audit.test.ts tests/enroll-api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/audit.ts app/api/enroll/route.ts lib/__tests__/audit.test.ts tests/enroll-api.test.ts
git commit -m "fix(enroll): treat audit writes as best-effort and use the trusted client key"
```

---

### Task 8: Atomic redeem on Postgres and stale-code invalidation

**Files:**
- Modify: `lib/console/enroll.ts`
- Modify: `tests/enroll-service.test.ts`
- Create: `tests/enroll-pg.test.ts`

- [ ] **Step 1: Add the failing sqlite service tests**

In `tests/enroll-service.test.ts`, add these tests inside the `describe` block, after the expired/double-redemption test:

```ts
  it('rejects a non-positive or non-finite TTL', async () => {
    await freshDb()
    const { issueEnrollmentCode } = await import('@/lib/console/enroll')
    for (const ttl of [0, -1, Number.NaN, Infinity]) {
      await expect(issueEnrollmentCode(undefined, ttl)).rejects.toBeInstanceOf(RangeError)
    }
  })

  it('a newly issued code consumes the previous code for the same instance', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
    const bundle = await redeemEnrollmentCode(second.code)
    expect(bundle).toBeTruthy()
    expect(bundle!.instanceId).toBe(first.instanceId)
  })

  it('the older code stays dead after the newest code redeems', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(second.code)).toBeTruthy()
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
  })

  it('a successful redeem consumes every other outstanding code for the instance', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const first = await issueEnrollmentCode()
    const now = new Date()
    await getDb().insert(getTables().enrollmentCodes).values({
      codeHash: hashToken('manual-code-b'),
      instanceId: first.instanceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    })

    expect(await redeemEnrollmentCode(first.code)).toBeTruthy()
    expect(await redeemEnrollmentCode('manual-code-b')).toBeNull()
  })

  it('stores the token hash and never the token itself', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')
    const { instanceId, code } = await issueEnrollmentCode()
    const bundle = await redeemEnrollmentCode(code)

    const t = getTables()
    const [row] = await getDb().select().from(t.instances).where(eq(t.instances.id, instanceId))
    expect(row.deviceTokenHash).toBe(hashToken(bundle!.deviceToken))
    expect(JSON.stringify(row)).not.toContain(bundle!.deviceToken)
    const codeRows = await getDb().select().from(t.enrollmentCodes)
    expect(JSON.stringify(codeRows)).not.toContain(bundle!.deviceToken)
  })
```

- [ ] **Step 2: Strengthen the revoked-instance test**

Replace the existing test:

```ts
  it('returns null when the instance is revoked before redeem (no bundle, code consumed)', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { eq } = await import('drizzle-orm')
    const { instanceId, code } = await issueEnrollmentCode()
    await getDb().delete(getTables().instances).where(eq(getTables().instances.id, instanceId))
    expect(await redeemEnrollmentCode(code)).toBeNull()
  })
```

with:

```ts
  it('returns null when the instance is revoked before redeem and leaves the code consumed', async () => {
    await freshDb()
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')
    const { instanceId, code } = await issueEnrollmentCode()
    const t = getTables()
    await getDb().delete(t.instances).where(eq(t.instances.id, instanceId))
    expect(await redeemEnrollmentCode(code)).toBeNull()
    const rows = await getDb().select().from(t.enrollmentCodes)
      .where(eq(t.enrollmentCodes.codeHash, hashToken(code)))
    expect(rows[0].consumedAt).not.toBeNull()
  })
```

- [ ] **Step 3: Write the failing Postgres suite**

Create `tests/enroll-pg.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'

// Gated on DATABASE_URL, like lib/__tests__/persist.pg.test.ts. The suite creates
// its own database and applies every drizzle/*.sql migration before importing the
// service, so it never touches the operator's working database.
const env = process.env as Record<string, string | undefined>
const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

suite('enrollment redeem on postgres', () => {
  beforeAll(async () => {
    const fs = await import('node:fs')
    const { Client } = await import('pg')
    const baseUrl = process.env.DATABASE_URL!
    const admin = new Client({ connectionString: baseUrl })
    await admin.connect()
    await admin.query('DROP DATABASE IF EXISTS frame_enroll')
    await admin.query('CREATE DATABASE frame_enroll')
    await admin.end()

    const target = new URL(baseUrl)
    target.pathname = '/frame_enroll'
    const connUrl = target.toString()
    const conn = new Client({ connectionString: connUrl })
    await conn.connect()
    const files = fs.readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()
    for (const file of files) {
      await conn.query(fs.readFileSync(`drizzle/${file}`, 'utf8'))
    }
    await conn.end()

    process.env.DATABASE_URL = connUrl
    env.FRAME_MODE = 'console'
  }, 60_000)

  it('redeems a code and stores only the token hash', async () => {
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')

    const { instanceId, code } = await issueEnrollmentCode()
    const bundle = await redeemEnrollmentCode(code)
    expect(bundle).toBeTruthy()
    expect(bundle!.instanceId).toBe(instanceId)
    expect(bundle!.deviceToken.length).toBeGreaterThanOrEqual(32)

    const t = getTables()
    const [row] = await getDb().select().from(t.instances).where(eq(t.instances.id, instanceId))
    expect(row.deviceTokenHash).toBe(hashToken(bundle!.deviceToken))
    expect(JSON.stringify(row)).not.toContain(bundle!.deviceToken)
  }, 60_000)

  it('consumes older codes when a new code is issued', async () => {
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const first = await issueEnrollmentCode()
    const second = await issueEnrollmentCode(first.instanceId)
    expect(await redeemEnrollmentCode(first.code)).toBeNull()
    expect(await redeemEnrollmentCode(second.code)).toBeTruthy()
  }, 60_000)

  it('returns null and leaves the code consumed when the instance is gone', async () => {
    const { issueEnrollmentCode, redeemEnrollmentCode } = await import('@/lib/console/enroll')
    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const { hashToken } = await import('@/lib/sync/auth')
    const { eq } = await import('drizzle-orm')

    const { instanceId, code } = await issueEnrollmentCode()
    const t = getTables()
    await getDb().delete(t.instances).where(eq(t.instances.id, instanceId))
    expect(await redeemEnrollmentCode(code)).toBeNull()

    const rows = await getDb().select().from(t.enrollmentCodes)
      .where(eq(t.enrollmentCodes.codeHash, hashToken(code)))
    expect(rows[0].consumedAt).not.toBeNull()
  }, 60_000)
})
```

- [ ] **Step 4: Run the sqlite suite to verify it fails**

Run:

```bash
npx vitest run tests/enroll-service.test.ts
```

Expected: FAIL on TTL (no guard), stale-code (old code still redeems), and revoke-consumed assertions. The Postgres suite is skipped without `DATABASE_URL`.

- [ ] **Step 5: Replace `lib/console/enroll.ts`**

Replace the file with:

```ts
import crypto from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
import * as sqliteSchema from '@/lib/db/schema.sqlite'
import { getSqliteDb } from '@/lib/db/sqlite'
import { getTables } from '@/lib/db/tables'
import { hashToken } from '@/lib/sync/auth'

export interface IssuedCode { instanceId: string; code: string; expiresAt: Date }
export interface EnrollBundle {
  instanceId: string
  deviceToken: string
  frameAdminSecret: string
  clerkPublishableKey: string
}

const CODE_TTL_MS = 15 * 60 * 1000

/** Create the instance row (token hash stays NULL until redeem) + seed frame doc. */
export async function issueEnrollmentCode(instanceId?: string, ttlMs: number = CODE_TTL_MS): Promise<IssuedCode> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('enrollment code TTL must be a positive finite number')
  }

  const db = getDb()
  const t = getTables()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  const code = nanoid(20)
  const codeHash = hashToken(code)

  if (!instanceId) {
    const id = nanoid(12)
    await db.insert(t.instances).values({ id, deviceTokenHash: null, createdAt: now })
    const existing = await db.select({ id: t.frameDocuments.id }).from(t.frameDocuments)
      .where(eq(t.frameDocuments.identifier, id))
    if (!existing.length) {
      const { seed } = await import('@/lib/store')
      await db.insert(t.frameDocuments).values({
        id, identifier: id, name: `Frame ${id}`, data: seed(),
        createdAt: now, updatedAt: now, revision: 1, resolutionWidth: 1920, resolutionHeight: 1080,
      })
    }
    await db.insert(t.enrollmentCodes).values({ codeHash, instanceId: id, createdAt: now, expiresAt })
    return { instanceId: id, code, expiresAt }
  }

  // A rotate replaces the old code. Consume every outstanding code for the
  // instance and insert the new one in the same transaction, so a leaked old
  // code cannot overwrite the token after the legitimate frame enrolls.
  if (getDatabaseMode() === 'sqlite') {
    const st = sqliteSchema
    getSqliteDb().transaction((tx) => {
      tx.update(st.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(st.enrollmentCodes.instanceId, instanceId), isNull(st.enrollmentCodes.consumedAt)))
        .run()
      tx.insert(st.enrollmentCodes)
        .values({ codeHash, instanceId, createdAt: now, expiresAt })
        .run()
    })
  } else {
    await db.transaction(async (tx) => {
      await tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.instanceId, instanceId), isNull(t.enrollmentCodes.consumedAt)))
      await tx.insert(t.enrollmentCodes).values({ codeHash, instanceId, createdAt: now, expiresAt })
    })
  }
  return { instanceId, code, expiresAt }
}

/**
 * Atomic single-use redeem. The plaintext device token is minted here and
 * returned; it is never stored. Null covers unknown/expired/consumed codes and
 * deleted instances alike (spec §5: one generic failure).
 */
export async function redeemEnrollmentCode(code: string): Promise<EnrollBundle | null> {
  const codeHash = hashToken(code)
  const now = new Date()
  // Generate before the transaction: a crypto failure must not burn a code.
  const frameAdminSecret = crypto.randomBytes(32).toString('base64url')

  if (getDatabaseMode() === 'sqlite') {
    const t = sqliteSchema
    const sdb = getSqliteDb()
    let bundle: EnrollBundle | null = null
    sdb.transaction((tx) => {
      const claimed = tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.codeHash, codeHash), isNull(t.enrollmentCodes.consumedAt), gt(t.enrollmentCodes.expiresAt, now)))
        .returning({ instanceId: t.enrollmentCodes.instanceId })
        .all()

      const row = claimed[0] as { instanceId: string } | undefined
      if (!row) return

      // UPDATE ... RETURNING closes the select-then-update race: a deleted
      // instance returns no row and the code stays consumed.
      const deviceToken = nanoid(32)
      const updated = tx.update(t.instances)
        .set({ deviceTokenHash: hashToken(deviceToken) })
        .where(eq(t.instances.id, row.instanceId))
        .returning({ id: t.instances.id })
        .all()
      if (!updated.length) return

      tx.update(t.enrollmentCodes)
        .set({ consumedAt: now })
        .where(and(eq(t.enrollmentCodes.instanceId, row.instanceId), isNull(t.enrollmentCodes.consumedAt)))
        .run()

      bundle = {
        instanceId: row.instanceId,
        deviceToken,
        frameAdminSecret,
        clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      }
    })
    return bundle
  }

  const db = getDb()
  const t = getTables()
  return db.transaction(async (tx) => {
    const claimed = await tx.update(t.enrollmentCodes)
      .set({ consumedAt: now })
      .where(and(eq(t.enrollmentCodes.codeHash, codeHash), isNull(t.enrollmentCodes.consumedAt), gt(t.enrollmentCodes.expiresAt, now)))
      .returning({ instanceId: t.enrollmentCodes.instanceId })

    const row = claimed[0] as { instanceId: string } | undefined
    if (!row) return null

    const deviceToken = nanoid(32)
    const updated = await tx.update(t.instances)
      .set({ deviceTokenHash: hashToken(deviceToken) })
      .where(eq(t.instances.id, row.instanceId))
      .returning({ id: t.instances.id })
    if (!updated.length) return null

    await tx.update(t.enrollmentCodes)
      .set({ consumedAt: now })
      .where(and(eq(t.enrollmentCodes.instanceId, row.instanceId), isNull(t.enrollmentCodes.consumedAt)))

    return {
      instanceId: row.instanceId,
      deviceToken,
      frameAdminSecret,
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    }
  })
}
```

- [ ] **Step 6: Run the sqlite suite to verify it passes**

Run:

```bash
npx vitest run tests/enroll-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the Postgres suite when a database is available**

Run:

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/postgres npm run test -- tests/enroll-pg.test.ts
```

Expected: PASS with three tests. The user must be allowed to create a database. If no database is available, record that the suite was skipped and say so in the PR.

- [ ] **Step 8: Commit**

```bash
git add lib/console/enroll.ts tests/enroll-service.test.ts tests/enroll-pg.test.ts
git commit -m "fix(enroll): consume stale codes and resolve the instance with update returning"
```

---

### Task 9: Validate ports and harden the management forwarder

**Files:**
- Modify: `lib/mgmt-port.ts`
- Modify: `tests/mgmt-port.test.ts`

- [ ] **Step 1: Replace the forwarder test file**

Replace `tests/mgmt-port.test.ts` with:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import net from 'node:net'
import { maybeStartMgmtForwarder, parsePort, startMgmtForwarder } from '@/lib/mgmt-port'

function listen(server: net.Server, host = '127.0.0.1'): Promise<number> {
  return new Promise((res) => server.listen(0, host, () => res((server.address() as net.AddressInfo).port)))
}

function close(server: net.Server): Promise<void> {
  return new Promise((res) => server.close(() => res()))
}

function echoServer(): net.Server {
  return net.createServer((sock) => sock.on('data', (d) => sock.write(`echo:${d}`)))
}

afterEach(() => { vi.restoreAllMocks() })

describe('parsePort', () => {
  it('accepts integers from 0 to 65535 and uses the fallback when missing or empty', () => {
    expect(parsePort(undefined, 3000)).toBe(3000)
    expect(parsePort('', 3000)).toBe(3000)
    expect(parsePort(undefined)).toBeNull()
    expect(parsePort('0')).toBe(0)
    expect(parsePort('65535')).toBe(65535)
    for (const value of ['-1', '65536', '1.5', 'abc', '', ' 80', '+80']) {
      expect(parsePort(value)).toBeNull()
    }
  })
})

describe('startMgmtForwarder', () => {
  it('proxies TCP bytes both ways to the app port', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const mgmt = await startMgmtForwarder({ mgmtPort: 0, appPort, bind: '127.0.0.1' })
    expect(mgmt.maxConnections).toBe(256)
    const mgmtPort = mgmt.address() as net.AddressInfo
    expect(mgmtPort.port).toBeGreaterThan(0)

    const reply = await new Promise<string>((res, rej) => {
      const c = net.connect(mgmtPort.port, '127.0.0.1')
      c.on('error', rej)
      c.on('connect', () => c.write('hi'))
      c.once('data', (d) => { res(String(d)); c.destroy() })
    })
    expect(reply).toBe('echo:hi')
    await close(mgmt)
    await close(echo)
  })

  it('throws on invalid explicit ports', () => {
    expect(() => startMgmtForwarder({ mgmtPort: -1, appPort: 3000 })).toThrow(RangeError)
    expect(() => startMgmtForwarder({ mgmtPort: 3000, appPort: 70000 })).toThrow(RangeError)
  })

  it('destroys both sockets when the upstream is dead', async () => {
    const dead = net.createServer()
    const deadPort = await listen(dead)
    await close(dead)
    const mgmt = await startMgmtForwarder({ mgmtPort: 0, appPort: deadPort, bind: '127.0.0.1' })
    const port = (mgmt.address() as net.AddressInfo).port

    await new Promise<void>((resolve, reject) => {
      const client = net.connect(port, '127.0.0.1')
      const timer = setTimeout(() => {
        client.destroy()
        reject(new Error('socket did not close'))
      }, 2_000)
      client.on('error', () => { /* reset is expected */ })
      client.on('close', () => { clearTimeout(timer); resolve() })
      client.on('connect', () => client.write('hi'))
    })
    await close(mgmt)
  })
})

describe('maybeStartMgmtForwarder', () => {
  it('is a no-op when KIOSK_MGMT_PORT is unset', async () => {
    expect(await maybeStartMgmtForwarder({ ...process.env, KIOSK_MGMT_PORT: undefined } as any)).toBeNull()
  })

  it('logs and returns null for a non-numeric management port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: 'abc' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid KIOSK_MGMT_PORT'))
  })

  it('logs and returns null for a non-numeric app port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '0', PORT: 'abc' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid PORT'))
  })

  it('logs and returns null when the management port equals the app port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '8808', PORT: '8808' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('must differ'))
  })

  it('returns null for an out-of-range management port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '70000' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid KIOSK_MGMT_PORT'))
  })

  it('opens the forwarder through the enabled env path and echoes bytes', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const mgmt = await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '0', PORT: String(appPort) } as any)
    expect(mgmt).not.toBeNull()
    const mgmtPort = (mgmt as net.Server).address() as net.AddressInfo
    expect(mgmtPort.port).toBeGreaterThan(0)

    const reply = await new Promise<string>((res, rej) => {
      const c = net.connect(mgmtPort.port, '127.0.0.1')
      c.on('error', rej)
      c.on('connect', () => c.write('hi'))
      c.once('data', (d) => { res(String(d)); c.destroy() })
    })
    expect(reply).toBe('echo:hi')
    await close(mgmt!)
    await close(echo)
  })

  it('returns null and leaves the app unaffected when the port is busy', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const blocker = net.createServer()
    const busyPort = await listen(blocker, '0.0.0.0')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({
      KIOSK_MGMT_PORT: String(busyPort),
      PORT: String(appPort),
    } as any)).toBeNull()
    expect(spy).toHaveBeenCalled()
    await close(blocker)
    await close(echo)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/mgmt-port.test.ts
```

Expected: FAIL because `parsePort` is not exported, invalid ports start a listener, and the dead-upstream case may not close promptly.

- [ ] **Step 3: Replace `lib/mgmt-port.ts`**

Replace the file with:

```ts
import net from 'node:net'

// Spec §4.2: the only thing listening on the LAN. Raw TCP (no HTTP parsing)
// keeps the client's Host header intact so proxy.ts can gate by port.
// Failures bind-critical: a busy port logs loudly, it must not kill the app.

export interface ForwarderOptions { mgmtPort: number; appPort: number; bind?: string }

const CONNECT_TIMEOUT_MS = 10_000
export const MAX_FORWARDER_CONNECTIONS = 256

export function parsePort(value: string | undefined, fallback?: number): number | null {
  if (value === undefined || value === '') return fallback ?? null
  if (!/^\d+$/.test(value)) return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return port
}

function assertPort(port: number, name: string): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`${name} must be an integer from 0 to 65535`)
  }
}

export function startMgmtForwarder(opts: ForwarderOptions): Promise<net.Server> {
  assertPort(opts.mgmtPort, 'mgmtPort')
  assertPort(opts.appPort, 'appPort')
  return new Promise((resolve, reject) => {
    const server = net.createServer((incoming) => {
      const upstream = net.connect({ port: opts.appPort, host: '127.0.0.1' })
      const drop = () => { incoming.destroy(); upstream.destroy() }

      incoming.on('error', drop)
      incoming.on('close', drop)
      upstream.on('error', drop)
      upstream.on('close', drop)

      // A dead app port must not leave a half-open connection behind. The
      // timeout is for connect only; clear it once the socket is connected.
      upstream.setTimeout(CONNECT_TIMEOUT_MS, drop)
      upstream.once('connect', () => upstream.setTimeout(0))

      incoming.pipe(upstream)
      upstream.pipe(incoming)
    })

    server.maxConnections = MAX_FORWARDER_CONNECTIONS
    const rejectOnError = (error: Error) => reject(error)
    server.once('error', rejectOnError)
    // Keep a permanent handler after listen: an operational error should be
    // logged, not become an unhandled 'error' event that kills the process.
    server.on('error', (error) => console.error('management port forwarder error:', error))
    server.listen(opts.mgmtPort, opts.bind ?? '0.0.0.0', () => {
      server.off('error', rejectOnError)
      resolve(server)
    })
  })
}

// Called from instrumentation.ts on the node runtime. Console deployments
// leave KIOSK_MGMT_PORT unset and get nothing.
export async function maybeStartMgmtForwarder(env: NodeJS.ProcessEnv): Promise<net.Server | null> {
  if (!env.KIOSK_MGMT_PORT) return null
  if (env.NEXT_PHASE && env.NEXT_PHASE.startsWith('phase-production-build')) return null

  const mgmtPort = parsePort(env.KIOSK_MGMT_PORT)
  if (mgmtPort === null) {
    console.error(`invalid KIOSK_MGMT_PORT: ${env.KIOSK_MGMT_PORT}`)
    return null
  }
  const appPort = parsePort(env.PORT, 3000)
  if (appPort === null || appPort === 0) {
    console.error(`invalid PORT: ${env.PORT}`)
    return null
  }
  if (mgmtPort !== 0 && mgmtPort === appPort) {
    console.error(`KIOSK_MGMT_PORT (${mgmtPort}) must differ from PORT (${appPort})`)
    return null
  }

  try {
    return await startMgmtForwarder({ mgmtPort, appPort })
  } catch (e: unknown) {
    console.error('management port forwarder failed to start:', e)
    return null
  }
}
```

- [ ] **Step 4: Run the forwarder tests to verify they pass**

Run:

```bash
npx vitest run tests/mgmt-port.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mgmt-port.ts tests/mgmt-port.test.ts
git commit -m "fix(mgmt): validate ports and close forwarder connections on failure"
```

---

### Task 10: Document the operator-facing behavior

**Files:**
- Modify: `.env.example`
- Modify: `docs/operations.md`
- Modify: `docs/kiosk-cli.md`
- Modify: `docs/superpowers/specs/2026-10-25-frame-enrollment-hardening-design.md`

- [ ] **Step 1: Add `TRUST_PROXY` to `.env.example`**

Add this block after the `SYNC_ALLOWED_HOSTS=` line and before `# Console admin`:

```text
# Trust x-forwarded-for/x-real-ip for rate limiting. Set only behind a proxy
# that overwrites the header. Leave unset on frames.
TRUST_PROXY=
```

- [ ] **Step 2: Add the operations section**

In `docs/operations.md`, insert this section after the installation list and before `## Console admin`:

```markdown
## Frame enrollment and admin
- Enrollment requires an https console URL. Plain http is accepted only for loopback development (`localhost`, `127.0.0.1`, `::1`).
- Rotating a code invalidates every older code for that instance. Use the newest code.
- `sudo kiosk-ctl password <secret>` writes `FRAME_ADMIN_SECRET` and `FRAME_ADMIN_HASH` together in one atomic file update. It keeps a valid stored secret, otherwise uses a valid `FRAME_ADMIN_SECRET` from the environment, otherwise generates one. An invalid stored secret is replaced with a warning.
- A valid `FRAME_ADMIN_SECRET` is 32-128 base64url characters. If `FRAME_ADMIN_HASH` is set without a valid secret, the management surface stays read-only, login returns 401, and the display keeps running.
- Set `TRUST_PROXY=1` only behind a proxy that overwrites `x-forwarded-for`. Leave it unset on frames; unset means every client shares one rate-limit bucket.
- Invalid `KIOSK_MGMT_PORT` or `PORT` values are logged. No forwarder starts and the display is unaffected.
- Enrollment audit writes are best-effort: a failed insert logs the action and target but does not fail the request or lose a bundle.
```

- [ ] **Step 3: Update the enroll section in `docs/kiosk-cli.md`**

Replace:

```text
Failures never leave a half-written file. If the console is unreachable or the
code is dead (invalid, expired, or already used), `enroll` exits non-zero and
leaves `frame.env` untouched, with a message that says which it was and how to
issue a fresh one. For an existing instance, click "Reissue code (rotate)" on
the console card and enroll with the new code.
```

with:

```text
Enrollment requires an https console URL. Plain http is accepted only for
loopback development addresses (`localhost`, `127.0.0.1`, `::1`). The response
is schema-checked before anything is written, so a malformed bundle leaves
`frame.env` untouched.

Failures never leave a half-written file. If the console is unreachable or the
code is dead (invalid, expired, or already used), `enroll` exits non-zero and
leaves `frame.env` untouched, with a message that says which it was and how to
issue a fresh one. For an existing instance, click "Reissue code (rotate)" on
the console card and enroll with the new code. Rotating invalidates every older
code for that instance, so use the newest one.

If root cannot resolve or set the kiosk group after a successful write, `enroll`
prints a warning with the `chown` command and exits 0. The bundle is already in
place; fix ownership without issuing another code.
```

- [ ] **Step 4: Update the password section in `docs/kiosk-cli.md`**

Replace:

```text
`kiosk password <secret>` sets the frame-local admin password used for
management-port mutations (see "Two ports on a frame"). It hashes the secret
with scrypt into `FRAME_ADMIN_HASH`, generates `FRAME_ADMIN_SECRET` first if
it is missing, and restarts the app on Linux. Passwords shorter than 8
characters are rejected and nothing is written.
```

with:

```text
`kiosk password <secret>` sets the frame-local admin password used for
management-port mutations (see "Two ports on a frame"). It writes
`FRAME_ADMIN_SECRET` and the scrypt `FRAME_ADMIN_HASH` together in one atomic
file update. It keeps a valid secret already in `frame.env`, otherwise writes a
valid `FRAME_ADMIN_SECRET` from the environment, otherwise generates one. An
invalid stored secret is replaced with a warning. Passwords shorter than 8
characters are rejected and nothing is written. The app restarts on Linux.
```

- [ ] **Step 5: Update the two-port section in `docs/kiosk-cli.md`**

Replace:

```text
The app binds `localhost:3000` only. A TCP forwarder (`lib/mgmt-port.ts`)
listens on `KIOSK_MGMT_PORT`, pipes each connection into the local app, and
preserves the source address, so the proxy layer reads the real client IP. The
proxy gates routes by the `Host` header port:
```

with:

```text
The app binds `localhost:3000` only. A TCP forwarder (`lib/mgmt-port.ts`)
listens on `KIOSK_MGMT_PORT`, pipes each connection into the local app, and
preserves the TCP source address. Rate limiting treats every management-port
client as one local bucket unless `TRUST_PROXY` is enabled (see the operations
guide). The proxy gates routes by the `Host` header port:
```

Then add after the paragraph that ends `leave it unset and run Clerk-protected on one port as before.`:

```text
Invalid `KIOSK_MGMT_PORT` or `PORT` values are logged and start no forwarder;
the display keeps running. If `FRAME_ADMIN_HASH` is set but
`FRAME_ADMIN_SECRET` is missing or invalid, the management surface stays
read-only and login returns 401.
```

- [ ] **Step 6: Mark the spec approved**

In `docs/superpowers/specs/2026-10-25-frame-enrollment-hardening-design.md`, change:

```text
- Status: Approved for spec review
```

to:

```text
- Status: Approved
```

Also correct the gate-test filename in §7 from `tests/frame-gate.test.ts` to `tests/proxy-gate.test.ts`, because that is where the real proxy handler is exercised.

- [ ] **Step 7: Run the repo's unslop workflow over the docs diff**

Run the `/unslop` workflow over `.env.example`, `docs/operations.md`, `docs/kiosk-cli.md`, and the spec status change. Fix any AI tells it flags. Do not change code or contract wording.

- [ ] **Step 8: Commit**

```bash
git add .env.example docs/operations.md docs/kiosk-cli.md docs/superpowers/specs/2026-10-25-frame-enrollment-hardening-design.md
git commit -m "docs(enroll): document admin secret, trusted proxy, and port behavior"
```

---

### Task 11: Full gate and evidence

**Files:**
- Create: `docs/superpowers/reviews/2026-10-25-frame-enrollment-hardening-evidence.md`
- No production code changes expected.

- [ ] **Step 1: Run the typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm run test
```

Expected: all tests pass, including the new suites. If a unrelated suite fails because of shared environment assumptions, confirm it also fails on the Task 1 baseline before changing it; do not widen scope.

- [ ] **Step 3: Run the Postgres suite when a database is available**

Run:

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/postgres npm run test -- tests/enroll-pg.test.ts
```

Expected: three passing tests. If `DATABASE_URL` is unavailable, record `skipped (no DATABASE_URL)` in the evidence file and the PR.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Assemble the before and after evidence**

Create `docs/superpowers/reviews/2026-10-25-frame-enrollment-hardening-evidence.md` with these six sections. Paste the failing output you captured during the task under **Before** and the passing output from Steps 1-3 under **After**:

```markdown
# Frame enrollment hardening evidence

## 1. Admin secret invariant
- Test: `tests/frame-admin.test.ts`
- Before: login minted a cookie with a 5-character secret.
- After: 401 with no Set-Cookie for missing, empty, and short secrets.

## 2. frame.env boundary
- Test: `lib/kiosk/__tests__/frame-env.test.ts`
- Before: `SYNC_TOKEN="a\nB=evil"` wrote a corrupt file.
- After: `FrameEnvError`, no temp file, old file unchanged.

## 3. Management port validation
- Test: `tests/mgmt-port.test.ts`
- Before: `KIOSK_MGMT_PORT=abc` attempted a listener and produced a lower-level failure.
- After: one validation log and no listener.

## 4. Spoofed forwarded address
- Test: `tests/enroll-api.test.ts`
- Before: changing `x-forwarded-for` on every request got a new bucket.
- After: the same local bucket returns 429 on the 11th request.

## 5. Stale enrollment codes
- Test: `tests/enroll-service.test.ts`
- Before: the previous code still redeemed after a rotate.
- After: the previous code returns null and the newest code redeems.

## 6. Postgres redeem race
- Test: `tests/enroll-pg.test.ts`
- Before: a token could be returned for a deleted instance.
- After: null, and the code row stays consumed.
```

The evidence file may include the raw command output under each heading. Do not paste secrets, tokens, or full environment values.

- [ ] **Step 6: Commit the evidence**

```bash
git add docs/superpowers/reviews/2026-10-25-frame-enrollment-hardening-evidence.md
git commit -m "docs(enroll): record hardening verification evidence"
```

- [ ] **Step 7: Rebase onto the latest main and rerun the gate**

Run:

```bash
git fetch origin
git rebase origin/main
npx tsc --noEmit
npm run test
npm run build
```

Expected: all three checks pass after the rebase. Resolve lockfile conflicts by regenerating, never by hand-merging. If a conflict is not obvious, stop and report.

- [ ] **Step 8: Push the branch**

Run:

```bash
git push -u origin agent/frame-enrollment-1025a
```

Expected: the branch is pushed.

- [ ] **Step 9: Open the PR and run the review loop**

Write the PR body to `/tmp/frame-enrollment-hardening-pr.md` with what changed, the commands that were run, the before/after evidence, and the skipped Postgres case if applicable. Run `/unslop` over the title and body, then open the PR:

```bash
gh pr create --base main --head agent/frame-enrollment-1025a \
  --title "fix(enroll): harden enrollment, admin auth, and management ports" \
  --body-file /tmp/frame-enrollment-hardening-pr.md
```

Then run `/greploop` (or `/greploop-apps` when the PR exceeds Greptile's file-count limit) until it reports 5/5 with zero unresolved comments. Do not merge without explicit instruction.

---

## Notes for the implementer

- The order matters. Task 2 creates `clientKey` before Task 3 and Task 7 import it. Task 3 creates `isValidAdminSecret` before Task 5 and Task 6 import it. Task 4 creates the validator before Task 5 writes through it.
- Do not change `hashAdminPassword`'s password minimum. The eight-character rule is for the human password; the 32-128 rule is for the HMAC secret.
- Do not make `TRUST_PROXY` default on. The frame is the common case and has no proxy.
- Do not add a shared-store limiter, a startup fail-fast path, or code-table indexes. Those are out of scope in the spec.
- If a test needs a real Postgres database and none is available, leave the suite gated and say so. Do not weaken the test to a mock and claim the race is proven.
- While each suite is still red, save its failing output, for example `npx vitest run tests/enroll-service.test.ts 2>&1 | tee /tmp/before-enroll-service.log`. Task 11 needs those logs for the evidence file; they cannot be captured after the fix lands.
- Every claim in the PR body needs a command or an output pair behind it.

