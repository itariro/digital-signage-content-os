# Multi-frame canvas: phase 4, catalog and extras implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 28-scene catalog, content-addressed image delivery, a pure canvas 2D command path, bounded deterministic game replay, bezel modes, physical sizing, rotation, bounce extras, and prove every catalog scene runs on a wall deterministically.

**Architecture:** Foundations land first: assets and pull-only delivery, the canvas command path, bounded replay, one consolidated pass over the Phase 1 config/geometry/render contracts, and the bounce extras. After those foundations, each catalog scene is a new pure state module plus a new renderer plus a new test case. Only registry, metadata, schema, type and renderer-dispatch files are edited to register the catalog; scene implementations themselves are new files only. No scene state function reads the slot, the clock, the DOM, or a per-device value.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, zod 4, drizzle (Postgres and SQLite), Vitest (node), lucide-react, HTML canvas 2D.

**Authority:** `docs/superpowers/plans/2026-11-25-multi-frame-canvas/00-assessment.md` is authoritative for scope and contracts. The addendum replaces the original nine-scene list. The original spec governs everything it does not change.

**Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md`, especially §§7, 8, 10, 11, 13.3, 18, 19 and 21.

**Exact catalog names (28, no others):**

```text
Gallery:    panorama gallery-wall exhibit mosaic-wall tile-reveal
Type:       kinetic-type split-flap multi-lane-marquee wall-clock countdown
Colour:     gradient-flow color-field light-sweep
Motion:     ripples metaballs lissajous flow-lines moire
Particles:  starfield matrix-rain fireworks bouncing-balls
Arcade:     chase-lights breakout snake sprite-parade life calibration
```

`calibration` is the addendum setup scene. Phase 1 `sync-test` stays unchanged and is not renamed.

---

## Contract preflight

- [ ] **Step 1: Confirm the branch and the Phase 1-3 contracts**

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git log --oneline -1 origin/main
rg "computeSceneState|defaultScene|resolveGeometry|canvasRenderModel|CanvasStage" lib/canvas components/frame/canvas components/editor/canvas-admin
rg "deployCanvas|releaseCanvas|identifyCanvas|getCanvasStatus" lib/canvas/service.ts
```

Expected: a worktree path, a branch other than `main`, and all named contracts present. Confirm Phase 1 exports `canvasRenderModel` from `lib/canvas/render-model.ts` and that this phase uses `components/frame/canvas/...` paths throughout. Phase 2 was drafted after this plan was started; if `deployCanvas` is absent, stop and land Phase 2 first. Do not edit another agent's worktree or branch.

- [ ] **Step 2: Read the local Next.js guide**

Run:

```bash
rg --files node_modules/next/dist/docs | rg 'route-handler|route|page|client-component' | head -40
```

Read the guide that matches the route handlers and client components below before writing them. This repository's Next.js version differs from training data.

- [ ] **Step 3: Run the baseline checks**

Run:

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: all three pass. A failure here is a baseline problem, not a Phase 4 fix.

- [ ] **Step 4: Skim open PRs for overlap**

Run:

```bash
gh pr list --state open --json number,title --jq '.[] | "#\(.number) \(.title)"'
for n in $(gh pr list --state open --json number --jq '.[].number'); do gh pr diff "$n" --name-only; done
```

Expected: no open PR touching the files in the file map below. On overlap, stop and ask for direction.

---

## File map for this phase

Create:

```text
lib/canvas/assets.ts
lib/canvas/asset-refs.ts
lib/canvas/draw.ts
lib/canvas/games.ts
lib/canvas/catalog-kit.ts
lib/canvas/catalog-draw.ts
lib/canvas/scenes/catalog/*.ts                  (28 pure state modules)
lib/canvas/__tests__/assets.test.ts
lib/canvas/__tests__/assets-route.test.ts
lib/canvas/__tests__/draw.test.ts
lib/canvas/__tests__/games.test.ts
lib/canvas/__tests__/catalog-continuity.test.ts
lib/canvas/__tests__/catalog-source.test.ts
lib/canvas/__tests__/bezel.test.ts
lib/canvas/__tests__/physical.test.ts
lib/canvas/__tests__/rotation.test.ts
tests/canvas-assets-sync.test.ts
tests/canvas-bezel.test.ts
components/frame/canvas/canvas-2d-layer.tsx
components/frame/canvas/scenes/<type>.tsx      (28 thin renderers)
components/frame/canvas/catalog-scene.tsx
components/frame/canvas/canvas-bezel-overlay.tsx
components/editor/canvas-admin/canvas-extras-panel.tsx
```

Modify:

```text
lib/types.ts
lib/canvas/schema.ts
lib/canvas/geometry.ts
lib/canvas/math.ts
lib/canvas/render-model.ts
lib/canvas/takeover.ts
lib/canvas/scenes/types.ts
lib/canvas/scenes/bounce.ts
lib/canvas/scenes/fields.ts
lib/canvas/scenes/registry.ts
lib/canvas/service.ts
lib/canvas/stage.ts
lib/db/schema.pg.ts
lib/db/schema.sqlite.ts
lib/db/__tests__/schema.sqlite.test.ts
drizzle/sqlite/0000_init.sql
lib/sync/types.ts
lib/sync/server.ts
lib/sync/client.ts
app/api/sync/pull/route.ts
app/api/canvas/state/route.ts
lib/frame-gate.ts
components/frame/canvas/canvas-frame-scene.tsx
components/frame/canvas/canvas-stage.tsx
components/frame/frame-display.tsx
components/editor/canvas-admin/wall-preview.tsx
components/editor/canvas-admin/arrangement-editor.tsx
components/editor/canvas-admin/albums-tab.tsx
```

Postgres migration files under `drizzle/` are generated by `pnpm drizzle-kit generate`; never hand-merge a lockfile or migration journal conflict.

---

## Foundation 1: content-addressed canvas assets

### Task 1: `canvas_assets` table in both dialects

**Files:**
- Modify: `lib/db/schema.pg.ts`
- Modify: `lib/db/schema.sqlite.ts`
- Create: `drizzle/0005_canvas_assets.sql` (generated)
- Modify: `drizzle/sqlite/0000_init.sql`
- Test: `lib/db/__tests__/schema.sqlite.test.ts`

- [ ] **Step 1: Extend the schema test**

Append to `lib/db/__tests__/schema.sqlite.test.ts`:

```ts
  it('exports canvasAssets with the content-addressed columns', () => {
    expect(s.canvasAssets).toBeDefined()
    const columns = Object.keys(s.canvasAssets)
    for (const name of ['hash', 'mime', 'size', 'createdAt']) {
      expect(columns).toContain(name)
    }
  })
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/db/__tests__/schema.sqlite.test.ts`

Expected: FAIL (`canvasAssets` undefined).

- [ ] **Step 3: Add the Postgres table**

Append to `lib/db/schema.pg.ts`:

```ts
export const canvasAssets = pgTable('canvas_assets', {
  hash: text('hash').primaryKey(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
```

- [ ] **Step 4: Add the SQLite table**

Append to `lib/db/schema.sqlite.ts`:

```ts
export const canvasAssets = sqliteTable('canvas_assets', {
  hash: text('hash').primaryKey(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

- [ ] **Step 5: Add the SQLite DDL**

Append to `drizzle/sqlite/0000_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS canvas_assets (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 6: Generate the Postgres migration**

Run:

```bash
pnpm drizzle-kit generate
```

Expected: a new SQL file plus journal entry. Commit the generated files unchanged. If generation reports a journal conflict, regenerate from the current `origin/main` state; do not hand-edit the journal.

- [ ] **Step 7: Run the test and typecheck**

Run:

```bash
pnpm vitest run lib/db/__tests__/schema.sqlite.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.pg.ts lib/db/schema.sqlite.ts lib/db/__tests__/schema.sqlite.test.ts drizzle/sqlite/0000_init.sql drizzle
git commit -m "feat(canvas): add content-addressed canvas asset table"
```

---

### Task 2: `lib/canvas/assets.ts` storage and reference helpers

**Files:**
- Create: `lib/canvas/assets.ts`
- Create: `lib/canvas/asset-refs.ts`
- Test: `lib/canvas/__tests__/assets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/__tests__/assets.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = ['FRAME_DB_PATH', 'DATABASE_URL', 'FRAME_DATA_DIR']
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-test'

beforeEach(() => {
  for (const key of managed) original[key] = env[key]
  env.FRAME_DB_PATH = ':memory:'
  delete env.DATABASE_URL
  env.FRAME_DATA_DIR = dataDir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete env[key]
    else env[key] = original[key]
  }
})

describe('canvas asset references', () => {
  it('hashes bytes with sha256 and round-trips a reference', async () => {
    const { hashCanvasAsset, parseCanvasAssetRef, canvasAssetUrl } = await import('@/lib/canvas/assets')
    const bytes = Buffer.from('canvas-image-bytes')
    const hash = hashCanvasAsset(bytes)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(parseCanvasAssetRef(`canvas-asset:${hash}`)).toBe(hash)
    expect(parseCanvasAssetRef('/api/media/x.png')).toBeNull()
    expect(canvasAssetUrl(hash)).toBe(`/api/canvas/assets/${hash}`)
  })

  it('stores bytes under the local data dir and lists records', async () => {
    const { hashCanvasAsset, putCanvasAsset, getCanvasAsset, listCanvasAssets } = await import('@/lib/canvas/assets')
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const hash = hashCanvasAsset(bytes)
    await putCanvasAsset({ hash, mime: 'image/png', bytes })
    expect(getCanvasAsset(hash)).toEqual(bytes)
    expect(await listCanvasAssets()).toEqual([{ hash, mime: 'image/png', size: bytes.length }])
    expect(fs.existsSync(path.join(dataDir, 'canvas-assets', `${hash}.png`))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/assets.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Create the client-safe reference helpers**

Create `lib/canvas/asset-refs.ts`:

```ts
export const CANVAS_ASSET_PREFIX = 'canvas-asset:'

export function parseCanvasAssetRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(CANVAS_ASSET_PREFIX)) return null
  const hash = ref.slice(CANVAS_ASSET_PREFIX.length)
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null
}

export function canvasAssetUrl(hash: string): string {
  return `/api/canvas/assets/${hash}`
}
```

- [ ] **Step 4: Implement `lib/canvas/assets.ts`**

```ts
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { deliveryType, deriveMime } from '@/lib/assets/storage'

export { CANVAS_ASSET_PREFIX, canvasAssetUrl, parseCanvasAssetRef } from './asset-refs'

export type CanvasAssetRecord = {
  hash: string
  mime: string
  size: number
}

export function hashCanvasAsset(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function dataDir(): string {
  return process.env.FRAME_DATA_DIR || path.join(process.cwd(), '.data')
}

function assetPath(hash: string, mime: string): string {
  const ext = mime.startsWith('image/jpeg') ? 'jpg' : mime.startsWith('image/') ? mime.slice(6) : 'bin'
  return path.join(dataDir(), 'canvas-assets', `${hash}.${ext}`)
}

/** Allowed inline image types only; the mime comes from magic bytes. */
export function canvasAssetMime(bytes: Buffer): string | null {
  const derived = deriveMime(bytes)
  if (!derived || !derived.mime.startsWith('image/')) return null
  if (derived.mime === 'image/svg+xml') return null
  return derived.mime
}

export function deliveryMime(mime: string): string {
  return deliveryType(mime).contentType
}

export async function putCanvasAsset(input: { hash: string; mime: string; bytes: Buffer }): Promise<CanvasAssetRecord> {
  if (!/^[a-f0-9]{64}$/.test(input.hash)) throw new Error('invalid canvas asset hash')
  if (hashCanvasAsset(input.bytes) !== input.hash) throw new Error('canvas asset hash mismatch')
  const db = getDb()
  const { canvasAssets } = getTables()
  const record: CanvasAssetRecord = { hash: input.hash, mime: input.mime, size: input.bytes.length }
  const target = assetPath(input.hash, input.mime)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, input.bytes)
  await db.insert(canvasAssets).values({
    hash: record.hash,
    mime: record.mime,
    size: record.size,
    createdAt: new Date(),
  }).onConflictDoNothing({ target: canvasAssets.hash })
  return record
}

export function getCanvasAsset(hash: string): Buffer | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null
  const dir = path.join(dataDir(), 'canvas-assets')
  if (!fs.existsSync(dir)) return null
  const found = fs.readdirSync(dir).find((name) => name.startsWith(`${hash}.`))
  if (!found) return null
  return fs.readFileSync(path.join(dir, found))
}

export async function listCanvasAssets(): Promise<CanvasAssetRecord[]> {
  const db = getDb()
  const { canvasAssets } = getTables()
  const rows = await db.select().from(canvasAssets)
  return rows.map((row) => ({
    hash: row.hash,
    mime: row.mime,
    size: row.size,
  }))
}

export function collectCanvasAssetRefs(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const hash = parseCanvasAssetRef(value)
    if (hash) into.add(hash)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCanvasAssetRefs(item, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectCanvasAssetRefs(item, into)
  }
  return into
}
```

`getCanvasAsset` is deliberately synchronous file delivery for the kiosk route; the database row is validated by `putCanvasAsset` and `listCanvasAssets`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/assets.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/assets.ts lib/canvas/asset-refs.ts lib/canvas/__tests__/assets.test.ts
git commit -m "feat(canvas): store canvas assets by content hash"
```

---

### Task 3: Console upload route, kiosk delivery route and gate allow-list

**Files:**
- Create: `app/api/canvas/assets/route.ts`
- Create: `app/api/canvas/assets/[hash]/route.ts`
- Modify: `lib/frame-gate.ts`
- Test: `lib/canvas/__tests__/assets-route.test.ts`

- [ ] **Step 1: Write the failing route and gate test**

Create `lib/canvas/__tests__/assets-route.test.ts`:

```ts
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = [
  'FRAME_MODE', 'DATABASE_URL', 'INSTANCE_ID', 'FRAME_DB_PATH', 'FRAME_DATA_DIR',
  'KIOSK_MGMT_PORT', 'PORT',
]
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-route'

beforeEach(() => {
  for (const key of managed) original[key] = env[key]
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = dataDir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete env[key]
    else env[key] = original[key]
  }
})

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function upload(bytes: Buffer) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'wall.png')
  return new Request('http://localhost/api/canvas/assets', { method: 'POST', body: form })
}

describe('canvas asset routes', () => {
  it('accepts a small magic-byte png and returns a canvas ref', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { POST } = await import('@/app/api/canvas/assets/route')
    const response = await POST(upload(png))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ref).toMatch(/^canvas-asset:[a-f0-9]{64}$/)
    expect(body.mime).toBe('image/png')
  })

  it('rejects oversized files', async () => {
    const { POST } = await import('@/app/api/canvas/assets/route')
    const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)])
    const response = await POST(upload(big))
    expect(response.status).toBe(413)
  })

  it('serves an uploaded asset from the kiosk-local route', async () => {
    const { hashCanvasAsset, putCanvasAsset } = await import('@/lib/canvas/assets')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const { GET } = await import('@/app/api/canvas/assets/[hash]/route')
    const response = await GET(new Request(`http://localhost/api/canvas/assets/${hash}`), { params: Promise.resolve({ hash }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
  })

  it('allows the delivery path through the frame gate', async () => {
    const { decideRequest } = await import('@/lib/frame-gate')
    env.KIOSK_MGMT_PORT = '8808'
    env.PORT = '3000'
    expect(decideRequest({ host: '127.0.0.1:3000', method: 'GET', path: '/api/canvas/assets/abc' })).toEqual({ kind: 'allow' })
    expect(decideRequest({ host: '127.0.0.1:3000', method: 'POST', path: '/api/canvas/assets' })).toEqual({ kind: 'not_found' })
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/assets-route.test.ts`

Expected: FAIL (route modules not found).

- [ ] **Step 3: Create the console upload route**

Create `app/api/canvas/assets/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import {
  CANVAS_ASSET_PREFIX,
  canvasAssetMime,
  hashCanvasAsset,
  putCanvasAsset,
} from '@/lib/canvas/assets'
import { requireHostedOperator } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  if (process.env.INSTANCE_ID) {
    return NextResponse.json({ error: 'console only' }, { status: 403 })
  }
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is too large' }, { status: 413 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = canvasAssetMime(bytes)
  if (!mime) return NextResponse.json({ error: 'Use a JPEG, PNG, GIF or WebP image' }, { status: 415 })

  const hash = hashCanvasAsset(bytes)
  const record = await putCanvasAsset({ hash, mime, bytes })
  await audit(
    operator?.ok ? operator.actor : 'operator',
    'canvas_asset.upload',
    'canvas_asset',
    hash,
    { mime: record.mime, size: record.size },
  )

  return NextResponse.json({
    ref: `${CANVAS_ASSET_PREFIX}${record.hash}`,
    hash: record.hash,
    mime: record.mime,
    size: record.size,
  })
}
```

- [ ] **Step 4: Create the kiosk-local delivery route**

Create `app/api/canvas/assets/[hash]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { canvasAssetMime, getCanvasAsset } from '@/lib/canvas/assets'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'invalid hash' }, { status: 400 })
  }
  const bytes = getCanvasAsset(hash)
  if (!bytes) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const mime = canvasAssetMime(bytes)
  if (!mime) return NextResponse.json({ error: 'unsupported media type' }, { status: 415 })
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
```

- [ ] **Step 5: Allow the path in the frame gate**

In `lib/frame-gate.ts`, replace:

```ts
const DISPLAY_GET_ONLY = ['/api/active', '/api/store', '/api/assets', '/api/health', '/api/media', '/api/fonts', '/api/display', '/api/weather', '/api/uploads']
```

with:

```ts
const DISPLAY_GET_ONLY = ['/api/active', '/api/store', '/api/assets', '/api/canvas/assets', '/api/health', '/api/media', '/api/fonts', '/api/display', '/api/weather', '/api/uploads']
```

- [ ] **Step 6: Run the tests**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/assets-route.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/canvas/assets/route.ts 'app/api/canvas/assets/[hash]/route.ts' lib/frame-gate.ts lib/canvas/__tests__/assets-route.test.ts
git commit -m "feat(canvas): upload and serve content-addressed assets"
```

---

### Task 4: Pull only missing referenced assets

**Files:**
- Modify: `lib/sync/types.ts`
- Modify: `lib/sync/server.ts`
- Modify: `lib/sync/client.ts`
- Modify: `app/api/sync/pull/route.ts`
- Test: `tests/canvas-assets-sync.test.ts`

- [ ] **Step 1: Write the failing sync test**

Create `tests/canvas-assets-sync.test.ts`:

```ts
import fs from 'node:fs'
import type { SyncPullOptions } from '@/lib/sync/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = ['FRAME_MODE', 'DATABASE_URL', 'INSTANCE_ID', 'FRAME_DB_PATH', 'FRAME_DATA_DIR']
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-sync'
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9])

beforeEach(() => {
  for (const key of managed) original[key] = env[key]
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = dataDir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete env[key]
    else env[key] = original[key]
  }
})

describe('canvas asset sync', () => {
  it('pulls only missing referenced assets and stores them locally', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { hashCanvasAsset, putCanvasAsset, getCanvasAsset } = await import('@/lib/canvas/assets')
    const { handlePull } = await import('@/lib/sync/server')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const options: SyncPullOptions = {
      caHave: [hash],
      canvasAssetRefs: [`canvas-asset:${hash}`, `canvas-asset:${'a'.repeat(64)}`],
    }
    const outcome = await handlePull('frame-a', undefined, options)
    expect(outcome.canvasAssets).toBeUndefined()

    const missingOnly = await handlePull('frame-a', undefined, { ...options, caHave: [] })
    expect(missingOnly.canvasAssets).toEqual([
      { hash, mime: 'image/png', dataBase64: png.toString('base64') },
    ])

    const { pullRemote } = await import('@/lib/sync/client')
    const storeSpy = vi.spyOn(await import('@/lib/store'), 'mutateStore')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ changes: [], cursor: 'cursor', canvasAssets: missingOnly.canvasAssets }),
    })) as unknown as typeof fetch
    await pullRemote({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' }, undefined, false, {
      caHave: [],
      canvasAssetRefs: [`canvas-asset:${hash}`],
    })
    expect(getCanvasAsset(hash)).toEqual(png)
    expect(storeSpy).not.toHaveBeenCalled()
  })

  it('sends local hashes and active canvas refs from runSyncCycle', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { hashCanvasAsset, putCanvasAsset } = await import('@/lib/canvas/assets')
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const ref = `canvas-asset:${hash}`
    await putCanvasState('frame-a', {
      v: 1,
      active: { config: { scenes: [{ config: { images: [ref] } }] } } as never,
      pending: null,
      identify: null,
    } as never)
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string) => {
      urls.push(input)
      return { ok: true, status: 200, json: async () => ({ changes: [], cursor: 'cursor' }) }
    }) as unknown as typeof fetch
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' })
    const url = new URL(urls[0])
    expect(url.searchParams.get('caHave')?.split(',')).toContain(hash)
    expect(url.searchParams.get('canvasAssetRefs')?.split(',')).toContain(ref)
  })

  it('keeps asset options on the 410 retry', async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string) => {
      urls.push(input)
      if (urls.length === 1) return { ok: false, status: 410, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ changes: [], cursor: 'cursor' }) }
    }) as unknown as typeof fetch
    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' }, undefined, false, {
      caHave: ['a'.repeat(64)],
      canvasAssetRefs: [`canvas-asset:${'b'.repeat(64)}`],
    })
    expect(urls).toHaveLength(2)
    const retry = new URL(urls[1])
    expect(retry.searchParams.get('caHave')).toBe('a'.repeat(64))
    expect(retry.searchParams.get('canvasAssetRefs')).toBe(`canvas-asset:${'b'.repeat(64)}`)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-assets-sync.test.ts`

Expected: FAIL (`SyncPullOptions`, `canvasAssets`, the extra `pullRemote` argument and asset options on `runSyncCycle`/the 410 retry are absent).

- [ ] **Step 3: Extend sync types**

Append to `lib/sync/types.ts`:

```ts
export interface CanvasAssetPayload {
  hash: string
  mime: string
  dataBase64: string
}

export interface SyncPullOptions {
  caHave?: string[]
  canvasAssetRefs?: string[]
}
```

- [ ] **Step 4: Extend `handlePull`**

In `lib/sync/server.ts`, add imports:

```ts
import { collectCanvasAssetRefs, getCanvasAsset, listCanvasAssets } from '@/lib/canvas/assets'
import type { SyncPullOptions } from './types'
```

Add to `PullOutcome`:

```ts
  canvasAssets?: Array<{ hash: string; mime: string; dataBase64: string }>
```

Replace the `handlePull` signature with:

```ts
export async function handlePull(
  authedInstanceId: string,
  since?: string,
  options: SyncPullOptions = {},
): Promise<PullOutcome>
```

Inside the final success path, before `return { changes, cursor, resolvedConflicts }`, insert:

```ts
  const have = new Set(options.caHave ?? [])
  const wanted = new Set<string>()
  const refs = options.canvasAssetRefs?.length
    ? options.canvasAssetRefs.map((ref) => ref)
    : Array.from(collectCanvasAssetRefs(changes.map((change) => change.payload)))
  for (const ref of refs) {
    const hash = ref.startsWith('canvas-asset:') ? ref.slice('canvas-asset:'.length) : ref
    if (/^[a-f0-9]{64}$/.test(hash) && !have.has(hash)) wanted.add(hash)
  }
  let canvasAssets: PullOutcome['canvasAssets']
  if (wanted.size > 0) {
    const records = await listCanvasAssets()
    canvasAssets = records
      .filter((record) => wanted.has(record.hash))
      .map((record) => {
        const bytes = getCanvasAsset(record.hash)
        if (!bytes) return null
        return { hash: record.hash, mime: record.mime, dataBase64: bytes.toString('base64') }
      })
      .filter((item): item is { hash: string; mime: string; dataBase64: string } => item !== null)
  }
```

and change the return to:

```ts
  return { changes, cursor, resolvedConflicts, ...(canvasAssets ? { canvasAssets } : {}) }
```

- [ ] **Step 5: Extend the pull route**

In `app/api/sync/pull/route.ts`, replace the query schema with:

```ts
const querySchema = z.object({
  instanceId: z.string().min(1).max(64).optional(),
  since: z.string().optional(),
  apiVersion: z.string().min(1).max(20).default(API_VERSION),
  caHave: z.string().max(8000).optional(),
  canvasAssetRefs: z.string().max(16000).optional(),
})
```

Replace the destructuring, `handlePull` call and response with:

```ts
  const { since, apiVersion, caHave, canvasAssetRefs } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const caHaveValues = caHave ? caHave.split(',').filter(Boolean) : []
  const canvasAssetRefsValues = canvasAssetRefs ? canvasAssetRefs.split(',').filter(Boolean) : []
  const outcome = await handlePull(instanceId, since, {
    caHave: caHaveValues,
    canvasAssetRefs: canvasAssetRefsValues,
  })
  if (outcome.expired) {
    return NextResponse.json({ changes: [], cursor: outcome.cursor, reset: true, resolvedConflicts: [] }, { status: 410 })
  }
  return NextResponse.json({
    changes: outcome.changes,
    cursor: outcome.cursor,
    resolvedConflicts: outcome.resolvedConflicts,
    ...(outcome.canvasAssets ? { canvasAssets: outcome.canvasAssets } : {}),
  })
```

Both comma-separated arrays are split once and handed to `handlePull`. When neither is supplied, `handlePull` still collects refs from the document payloads it already selected, so the route does not scan them twice.

- [ ] **Step 6: Extend `pullRemote`**

In `lib/sync/client.ts`, add imports:

```ts
import type { CanvasAssetPayload, SyncPullOptions } from './types'
```

Replace the `pullRemote` signature with:

```ts
export async function pullRemote(
  config: SyncConfig,
  since?: string,
  retried = false,
  options: SyncPullOptions = {},
): Promise<string>
```

Inside `pullRemote`, after `url.searchParams.set('apiVersion', API_VERSION)`, add:

```ts
  if (options.caHave?.length) url.searchParams.set('caHave', options.caHave.join(','))
  if (options.canvasAssetRefs?.length) {
    url.searchParams.set('canvasAssetRefs', options.canvasAssetRefs.join(','))
  }
```

Both arrays go on every pull, including the retry; replace:

```ts
    return pullRemote(config, undefined, true)
```

with:

```ts
    return pullRemote(config, undefined, true, options)
```

After `const data = await res.json()`, add:

```ts
  for (const asset of (data.canvasAssets ?? []) as CanvasAssetPayload[]) {
    const { putCanvasAsset } = await import('@/lib/canvas/assets')
    await putCanvasAsset({ hash: asset.hash, mime: asset.mime, bytes: Buffer.from(asset.dataBase64, 'base64') })
  }
```

Do not enqueue any canvas asset change for push. The sync queue is untouched by this loop.

- [ ] **Step 7: Supply asset options from `runSyncCycle`**

In `lib/sync/client.ts`, add `import type { SyncPullOptions } from './types'` and this helper above `runSyncCycle`:

```ts
async function canvasPullOptions(instanceId: string): Promise<SyncPullOptions> {
  const { listCanvasAssets, collectCanvasAssetRefs } = await import('@/lib/canvas/assets')
  const { getCanvasState } = await import('@/lib/canvas/state-store')
  const caHave = (await listCanvasAssets()).map((record) => record.hash)
  const state = await getCanvasState(instanceId)
  const activeConfig = state?.data.active?.config
  const canvasAssetRefs = activeConfig
    ? Array.from(collectCanvasAssetRefs(activeConfig)).map((hash) => `canvas-asset:${hash}`)
    : []
  return { caHave, canvasAssetRefs }
}
```

Replace:

```ts
    const cursor = await pullRemote(config, since)
```

with:

```ts
    const cursor = await pullRemote(config, since, false, await canvasPullOptions(config.instanceId))
```

Both arrays are recomputed each cycle from the current local asset inventory and the active canvas config, so a newly pasted `canvas-asset:` ref reaches the console on the next cycle without entering the push queue.

- [ ] **Step 8: Run the tests**

Run:

```bash
pnpm vitest run tests/canvas-assets-sync.test.ts lib/canvas/__tests__/assets.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/sync/types.ts lib/sync/server.ts lib/sync/client.ts app/api/sync/pull/route.ts tests/canvas-assets-sync.test.ts
git commit -m "feat(canvas): pull missing assets without pushing them"
```

---

## Foundation 2: pure canvas 2D path

### Task 5: `DrawCommand`, `drawCommands`, `executeDrawCommands`

**Files:**
- Create: `lib/canvas/draw.ts`
- Create: `components/frame/canvas/canvas-2d-layer.tsx`
- Test: `lib/canvas/__tests__/draw.test.ts`

- [ ] **Step 1: Write the failing command test**

Create `lib/canvas/__tests__/draw.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { drawCommands, executeDrawCommands } from '@/lib/canvas/draw'

describe('drawCommands', () => {
  it('returns the exact command list a scene emitted', () => {
    const rect = { kind: 'rect' as const, x: 1, y: 2, w: 3, h: 4, fill: '#ffffff' }
    expect(drawCommands(rect)).toEqual([rect])
  })
})

function ctxStub(width = 1080, height = 1920) {
  return {
    canvas: { width, height },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  }
}

describe('executeDrawCommands', () => {
  it('translates canvas coordinates into the slot viewport', () => {
    const ctx = ctxStub()
    const { setTransform, fillRect } = ctx
    const commands = drawCommands(
      { kind: 'rect', x: 1100, y: 20, w: 50, h: 50, fill: '#ffffff' },
      { kind: 'text', text: 'WALL', x: 1120, y: 80, fontFamily: 'mono', fontSize: 40, color: '#ffffff' },
    )
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, commands, {
      slot: { x: 1080, y: 0, w: 1080, h: 1920 },
      dpr: 1,
    })
    expect(setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -1080, 0)
    expect(fillRect).toHaveBeenCalledWith(1100, 20, 50, 50)
  })

  it('draws an image after it loads and reuses one Image per src', () => {
    const created: FakeImage[] = []
    class FakeImage {
      complete = false
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      constructor() { created.push(this) }
      set src(_value: string) { /* load is driven manually below */ }
      load() {
        this.complete = true
        this.naturalWidth = 200
        this.naturalHeight = 100
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    try {
      const src = `canvas-asset:${'c'.repeat(64)}`
      const command = { kind: 'image' as const, src, x: 0, y: 0, w: 200, h: 100 }
      const ctx = ctxStub()
      executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [command], {
        slot: { x: 0, y: 0, w: 1080, h: 1920 },
      })
      expect(ctx.drawImage).not.toHaveBeenCalled()
      created[0].load()
      expect(ctx.drawImage).toHaveBeenCalledTimes(1)
      expect(ctx.drawImage).toHaveBeenCalledWith(created[0], 0, 0, 200, 100)

      const second = ctxStub()
      executeDrawCommands(second as unknown as CanvasRenderingContext2D, [command], {
        slot: { x: 0, y: 0, w: 1080, h: 1920 },
      })
      expect(created).toHaveLength(1)
      created[0].load()
      expect(second.drawImage).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
```

Use a fresh `src` in this test: the image cache is module-level and shared across tests in this file.

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/draw.test.ts`

Expected: FAIL (module not found; once the module exists, the image test fails because `drawImage` is never called).

- [ ] **Step 3: Implement `lib/canvas/draw.ts`**

```ts
export type DrawRect = { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number; radius?: number; opacity?: number }
export type DrawCircle = { kind: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string; lineWidth?: number; opacity?: number }
export type DrawLine = { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[]; opacity?: number }
export type DrawText = { kind: 'text'; text: string; x: number; y: number; fontFamily: string; fontSize: number; color: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; rotation?: number; opacity?: number }
export type DrawImage = { kind: 'image'; src: string; x: number; y: number; w: number; h: number; fit?: 'fill' | 'contain' | 'cover'; offsetX?: number; offsetY?: number; opacity?: number }
export type DrawGradient = { kind: 'gradient'; x: number; y: number; w: number; h: number; colors: string[]; angleDeg: number; opacity?: number }

export type DrawCommand = DrawRect | DrawCircle | DrawLine | DrawText | DrawImage | DrawGradient

export type ExecuteOptions = {
  slot: { x: number; y: number; w: number; h: number }
  dpr?: number
  reducedMotion?: boolean
}

export function drawCommands(...commands: DrawCommand[]): DrawCommand[] {
  return commands
}

function withOpacity(ctx: CanvasRenderingContext2D, opacity: number | undefined, paint: () => void): void {
  if (opacity === undefined || opacity >= 1) {
    paint()
    return
  }
  ctx.save()
  ctx.globalAlpha = Math.max(0, opacity)
  paint()
  ctx.restore()
}

function fitted(srcW: number, srcH: number, rect: { x: number; y: number; w: number; h: number }, fit: 'fill' | 'contain' | 'cover'): { x: number; y: number; w: number; h: number } {
  if (fit === 'fill' || !srcW || !srcH) return rect
  const scale = fit === 'contain'
    ? Math.min(rect.w / srcW, rect.h / srcH)
    : Math.max(rect.w / srcW, rect.h / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
}

type PendingDraw = {
  ctx: CanvasRenderingContext2D
  commands: readonly DrawCommand[]
  options: ExecuteOptions
}

/** One Image per src for the whole page, so gallery loads survive scene changes. */
const imageCache = new Map<string, HTMLImageElement>()
const pendingBySrc = new Map<string, Map<CanvasRenderingContext2D, PendingDraw>>()

function cachedImage(src: string): HTMLImageElement {
  const existing = imageCache.get(src)
  if (existing) return existing
  const image = new Image()
  image.onload = () => {
    const pending = pendingBySrc.get(src)
    pendingBySrc.delete(src)
    if (!pending) return
    for (const request of pending.values()) {
      executeDrawCommands(request.ctx, request.commands, request.options)
    }
  }
  image.src = src
  imageCache.set(src, image)
  return image
}

function rememberPending(src: string, ctx: CanvasRenderingContext2D, commands: readonly DrawCommand[], options: ExecuteOptions): void {
  let pending = pendingBySrc.get(src)
  if (!pending) {
    pending = new Map()
    pendingBySrc.set(src, pending)
  }
  pending.set(ctx, { ctx, commands, options })
}

export function executeDrawCommands(
  ctx: CanvasRenderingContext2D,
  commands: readonly DrawCommand[],
  options: ExecuteOptions,
): void {
  const dpr = options.dpr && options.dpr > 0 ? options.dpr : 1
  const width = Math.max(1, Math.round(options.slot.w * dpr))
  const height = Math.max(1, Math.round(options.slot.h * dpr))
  if (ctx.canvas.width !== width) ctx.canvas.width = width
  if (ctx.canvas.height !== height) ctx.canvas.height = height
  ctx.setTransform(dpr, 0, 0, dpr, -options.slot.x * dpr, -options.slot.y * dpr)
  ctx.clearRect(options.slot.x, options.slot.y, options.slot.w, options.slot.h)

  for (const command of commands) {
    switch (command.kind) {
      case 'rect':
        withOpacity(ctx, command.opacity, () => {
          if (command.fill) {
            ctx.fillStyle = command.fill
            ctx.fillRect(command.x, command.y, command.w, command.h)
          }
          if (command.stroke) {
            ctx.strokeStyle = command.stroke
            ctx.lineWidth = command.lineWidth ?? 1
            ctx.strokeRect(command.x, command.y, command.w, command.h)
          }
        })
        break
      case 'circle':
        withOpacity(ctx, command.opacity, () => {
          ctx.beginPath()
          ctx.arc(command.x, command.y, Math.max(0, command.r), 0, Math.PI * 2)
          if (command.fill) {
            ctx.fillStyle = command.fill
            ctx.fill()
          }
          if (command.stroke) {
            ctx.strokeStyle = command.stroke
            ctx.lineWidth = command.lineWidth ?? 1
            ctx.stroke()
          }
        })
        break
      case 'line':
        withOpacity(ctx, command.opacity, () => {
          ctx.beginPath()
          ctx.strokeStyle = command.color
          ctx.lineWidth = command.width
          ctx.setLineDash(command.dash ?? [])
          ctx.moveTo(command.x1, command.y1)
          ctx.lineTo(command.x2, command.y2)
          ctx.stroke()
          ctx.setLineDash([])
        })
        break
      case 'text':
        withOpacity(ctx, command.opacity, () => {
          ctx.save()
          if (command.rotation) {
            ctx.translate(command.x, command.y)
            ctx.rotate((command.rotation * Math.PI) / 180)
            ctx.translate(-command.x, -command.y)
          }
          ctx.fillStyle = command.color
          ctx.font = `${command.fontSize}px ${command.fontFamily}`
          ctx.textAlign = command.align ?? 'left'
          ctx.textBaseline = command.baseline ?? 'alphabetic'
          ctx.fillText(command.text, command.x, command.y)
          ctx.restore()
        })
        break
      case 'gradient': {
        const angle = (command.angleDeg * Math.PI) / 180
        const x2 = command.x + Math.cos(angle) * command.w
        const y2 = command.y + Math.sin(angle) * command.h
        const gradient = ctx.createLinearGradient(command.x, command.y, x2, y2)
        command.colors.forEach((color, index) => {
          gradient.addColorStop(command.colors.length === 1 ? 0 : index / (command.colors.length - 1), color)
        })
        withOpacity(ctx, command.opacity, () => {
          ctx.fillStyle = gradient
          ctx.fillRect(command.x, command.y, command.w, command.h)
        })
        break
      }
      case 'image': {
        const image = cachedImage(command.src)
        if (!image.complete || !image.naturalWidth) {
          rememberPending(command.src, ctx, commands, options)
          break
        }
        const box = fitted(image.naturalWidth, image.naturalHeight, {
          x: command.x + (command.offsetX ?? 0),
          y: command.y + (command.offsetY ?? 0),
          w: command.w,
          h: command.h,
        }, command.fit ?? 'contain')
        withOpacity(ctx, command.opacity, () => ctx.drawImage(image, box.x, box.y, box.w, box.h))
        break
      }
    }
  }
}
```

The cache is module-level: one `Image` per `src`, and the newest pending command list per canvas context is replayed on `onload`. `Canvas2DLayer` therefore does not need to track images itself; a late gallery load repaints the canvas with the latest commands instead of being skipped forever.

- [ ] **Step 4: Create the React canvas layer**

Create `components/frame/canvas/canvas-2d-layer.tsx`:

```tsx
'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { DrawCommand } from '@/lib/canvas/draw'
import { executeDrawCommands } from '@/lib/canvas/draw'

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

export function Canvas2DLayer({
  commands,
  slot,
}: {
  commands: readonly DrawCommand[]
  slot: { x: number; y: number; w: number; h: number }
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    executeDrawCommands(ctx, commands, { slot, dpr: window.devicePixelRatio || 1, reducedMotion: reduced })
  }, [commands, slot.x, slot.y, slot.w, slot.h, reduced])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', left: 0, top: 0, width: slot.w, height: slot.h }}
    />
  )
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/draw.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/draw.ts components/frame/canvas/canvas-2d-layer.tsx lib/canvas/__tests__/draw.test.ts
git commit -m "feat(canvas): add pure 2D draw commands"
```

---

## Foundation 3: bounded deterministic game replay

### Task 6: `GameStep`, `gameStateAt`, `GAME_ROUND_TICKS`

**Files:**
- Create: `lib/canvas/games.ts`
- Test: `lib/canvas/__tests__/games.test.ts`

- [ ] **Step 1: Write the failing replay test**

Create `lib/canvas/__tests__/games.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GAME_ROUND_TICKS, gameStateAt } from '@/lib/canvas/games'

type State = { x: number; rolls: number[] }

function replay(tMs: number, steps: { count: () => void }) {
  return gameStateAt<State>({
    key: 'snake-test',
    seed: 7,
    stepMs: 100,
    tMs,
    initial: (seed) => ({ x: seed % 10, rolls: [] }),
    step: (state, tick, random) => {
      steps.count()
      const r = random()
      return { x: state.x + 1 + (tick % 2), rolls: [...state.rolls, Math.round(r * 1000) / 1000] }
    },
  })
}

describe('gameStateAt', () => {
  it('is independent of call order', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    const late = replay(25_000, counter)
    const early = replay(1_200, counter)
    const lateAgain = replay(25_000, counter)
    expect(late).toEqual(lateAgain)
    expect(late.tick).toBe(250)
    expect(early.tick).toBe(12)
  })

  it('does at most one round of work per call', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    replay(GAME_ROUND_TICKS * 100 * 40 + 599 * 100, counter)
    expect(counter.value).toBeLessThanOrEqual(GAME_ROUND_TICKS)
  })

  it('uses only seeded randomness', () => {
    const counter = { value: 0, count() { this.value += 1 } }
    expect(replay(3_400, counter)).toEqual(replay(3_400, counter))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/games.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/games.ts`**

```ts
import { hash01, seedFromString } from '@/lib/mosaic'

export const GAME_ROUND_TICKS = 600

export type GameStep<S> = {
  index: number
  atMs: number
  nextAtMs: number
  round: number
  tick: number
  state: S
}

type GameParams<S> = {
  key: string
  seed: number
  stepMs: number
  tMs: number
  initial: (seed: number, round: number) => S
  step: (state: S, tick: number, random: () => number) => S
}

type CacheEntry<S> = { round: number; state: S }

const CACHE_LIMIT = 8
const roundCache = new Map<string, CacheEntry<unknown>>()

function trimCache(): void {
  while (roundCache.size > CACHE_LIMIT) {
    const first = roundCache.keys().next().value
    if (first === undefined) break
    roundCache.delete(first)
  }
}

/**
 * Replay small self-playing games from the start of the current 600-tick
 * round. The round start is a pure function of `(key, seed, round)`, so call
 * history never changes the result and a call never replays more than one
 * round. `step` receives a seeded random source instead of Math.random.
 */
export function gameStateAt<S>(params: GameParams<S>): GameStep<S> {
  const stepMs = Math.max(1, params.stepMs)
  const tMs = Math.max(0, params.tMs)
  const index = Math.floor(tMs / stepMs)
  const round = Math.floor(index / GAME_ROUND_TICKS)
  const tick = index % GAME_ROUND_TICKS
  const cacheKey = `${params.key}:${params.seed}:${stepMs}`

  const cached = roundCache.get(cacheKey) as CacheEntry<S> | undefined
  const roundStart = cached?.round === round ? cached.state : params.initial(params.seed, round)
  roundCache.set(cacheKey, { round, state: roundStart })
  trimCache()

  const base = (seedFromString(params.key) ^ params.seed ^ Math.imul(round, 0x9e3779b9)) | 0
  let state = roundStart
  for (let current = 0; current < tick; current += 1) {
    let draws = 0
    const random = () => {
      draws += 1
      return hash01(base, Math.imul(current + 1, 7919) + draws * 104729)
    }
    state = params.step(state, current, random)
  }

  const atMs = index * stepMs
  return { index, atMs, nextAtMs: atMs + stepMs, round, tick, state }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/games.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/games.ts lib/canvas/__tests__/games.test.ts
git commit -m "feat(canvas): add bounded deterministic game replay"
```

---

## Foundation 4: shared catalog kit

### Task 7: shared catalog schema, state and helpers

**Files:**
- Create: `lib/canvas/catalog-kit.ts`
- Test: `lib/canvas/__tests__/catalog-kit.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `lib/canvas/__tests__/catalog-kit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogContext } from '@/lib/canvas/catalog-kit'
import { CATALOG_TYPES, catalogConfigSchema, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

describe('catalog kit', () => {
  it('lists exactly the 28 addendum scene names', () => {
    expect(CATALOG_TYPES).toHaveLength(28)
    expect(CATALOG_TYPES[0]).toBe('panorama')
    expect(CATALOG_TYPES[27]).toBe('calibration')
    expect(new Set(CATALOG_TYPES).size).toBe(28)
  })

  it('accepts only canvas asset refs for images', () => {
    const ref = `canvas-asset:${'a'.repeat(64)}`
    expect(catalogConfigSchema.safeParse({ images: [ref] }).success).toBe(true)
    expect(catalogConfigSchema.safeParse({ images: ['/api/media/a.png'] }).success).toBe(false)
  })

  it('clamps numbers and builds bounded deterministic cells', () => {
    expect(configNumber({ speed: 9999 }, 'speed', 100, 0, 4000)).toBe(4000)
    expect(configNumber({}, 'speed', 100, 0, 4000)).toBe(100)
    const ctx = {
      bounds: { width: 1000, height: 500 },
      geometry: { width: 1000, height: 500, slots: [], gaps: [] },
      tMs: 0,
      seed: 4,
    }
    expect(gridCells(ctx as unknown as CatalogContext, 40, 40, 0).length).toBeLessThanOrEqual(32)
    expect(wave01(7, 500, 0)).toBe(wave01(7, 500, 0))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-kit.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/catalog-kit.ts` (types and schema)**

```ts
import { z } from 'zod'
import { clamp } from '@/lib/canvas/math'
import { gameStateAt, type GameStep } from '@/lib/canvas/games'
import { hash01 } from '@/lib/mosaic'

export type CatalogContext = {
  bounds: { width: number; height: number }
  geometry: { width: number; height: number }
  tMs: number
  seed: number
}

export const CATALOG_TYPES = [
  'panorama',
  'gallery-wall',
  'exhibit',
  'mosaic-wall',
  'tile-reveal',
  'kinetic-type',
  'split-flap',
  'multi-lane-marquee',
  'wall-clock',
  'countdown',
  'gradient-flow',
  'color-field',
  'light-sweep',
  'ripples',
  'metaballs',
  'lissajous',
  'flow-lines',
  'moire',
  'starfield',
  'matrix-rain',
  'fireworks',
  'bouncing-balls',
  'chase-lights',
  'breakout',
  'snake',
  'sprite-parade',
  'life',
  'calibration',
] as const

export type CatalogSceneType = (typeof CATALOG_TYPES)[number]

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const assetRef = z.string().regex(/^canvas-asset:[a-f0-9]{64}$/)

export const catalogConfigSchema = z.object({
  text: z.string().max(200).optional(),
  lines: z.array(z.string().max(120)).max(12).optional(),
  images: z.array(assetRef).max(40).optional(),
  colors: z.array(hex).max(12).optional(),
  speed: z.number().min(0).max(4000).optional(),
  density: z.number().min(1).max(400).optional(),
  scale: z.number().min(0.1).max(10).optional(),
  cols: z.number().int().min(1).max(40).optional(),
  rows: z.number().int().min(1).max(40).optional(),
  gap: z.number().min(0).max(2000).optional(),
  size: z.number().min(4).max(600).optional(),
  angle: z.number().min(-360).max(360).optional(),
  periodSec: z.number().min(0.5).max(3600).optional(),
  fontFamily: z.string().max(40).optional(),
  fontSize: z.number().min(8).max(500).optional(),
  epochMs: z.number().min(0).max(8.64e15).optional(),
  remainingMs: z.number().min(0).max(8.64e15).optional(),
  tileMs: z.number().min(100).max(60000).optional(),
  reversed: z.boolean().optional(),
  trail: z.boolean().optional(),
  opacity: z.number().min(0.05).max(1).optional(),
}).strict()

export type CatalogSceneConfig = z.infer<typeof catalogConfigSchema>

export const CATALOG_DEFAULT_COLORS = ['#7cc4ff', '#e879f9', '#facc15', '#22c55e', '#f97316', '#ffffff']

export type CatalogCell = {
  id: string
  x: number
  y: number
  w: number
  h: number
  value: number
  color?: string
  text?: string
  image?: string
}

export type CatalogGameState = {
  x: number
  y: number
  vx: number
  vy: number
  score: number
  stage: number
  cells: number[]
}

export type CatalogState = {
  tMs: number
  cycleMs: number
  phase: number
  values: number[]
  cells: CatalogCell[]
  texts: string[]
  images: string[]
  game?: GameStep<CatalogGameState>
}

export type CatalogSceneRenderState = {
  type: CatalogSceneType
  config: CatalogSceneConfig
  state: CatalogState
}

export function configNumber(
  config: CatalogSceneConfig,
  key: keyof CatalogSceneConfig,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = config[key]
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

export function configText(config: CatalogSceneConfig, key: 'text' | 'fontFamily', fallback: string, max: number): string {
  const value = config[key]
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : fallback
}

export function configLines(config: CatalogSceneConfig, fallback: string[]): string[] {
  return Array.isArray(config.lines) && config.lines.length > 0 ? config.lines.slice(0, 12) : fallback
}

export function configColors(config: CatalogSceneConfig): string[] {
  return Array.isArray(config.colors) && config.colors.length > 0 ? config.colors.slice(0, 12) : CATALOG_DEFAULT_COLORS
}

export function configImages(config: CatalogSceneConfig): string[] {
  return Array.isArray(config.images) ? config.images.slice(0, 40) : []
}

export function baseState(config: CatalogSceneConfig, ctx: CatalogContext, cycleMs: number): CatalogState {
  const safeCycle = Math.max(1, cycleMs)
  return {
    tMs: Math.max(0, ctx.tMs),
    cycleMs: safeCycle,
    phase: (Math.max(0, ctx.tMs) % safeCycle) / safeCycle,
    values: [],
    cells: [],
    texts: [],
    images: configImages(config),
  }
}

export function wave01(seed: number, k: number, index: number): number {
  return hash01(seed | 0, Math.imul(k + 1, 7919) + Math.imul(index + 1, 104729))
}

/**
 * Build at most 32 deterministic cells across the whole wall. Every catalog
 * renderer uses this cap so one frame never creates more than 40 DOM/canvas
 * elements, including its background and labels.
 */
export function gridCells(ctx: CatalogContext, cols: number, rows: number, gap: number): CatalogCell[] {
  const safeCols = Math.min(32, Math.max(1, Math.round(cols)))
  const safeRows = Math.min(32, Math.max(1, Math.round(rows)))
  const count = Math.min(32, safeCols * safeRows)
  const cellW = ctx.bounds.width / safeCols
  const cellH = ctx.bounds.height / safeRows
  const cells: CatalogCell[] = []
  for (let index = 0; index < count; index += 1) {
    const col = index % safeCols
    const row = Math.floor(index / safeCols)
    cells.push({
      id: `${col}:${row}`,
      x: col * cellW + gap / 2,
      y: row * cellH + gap / 2,
      w: Math.max(0, cellW - gap),
      h: Math.max(0, cellH - gap),
      value: wave01(ctx.seed, index, 0),
    })
  }
  return cells
}

export function catalogGame(
  config: CatalogSceneConfig,
  ctx: CatalogContext,
  name: string,
  initial: (seed: number, round: number) => CatalogGameState,
  step: (state: CatalogGameState, tick: number, random: () => number) => CatalogGameState,
): GameStep<CatalogGameState> {
  const fps = configNumber(config, 'speed', 30, 1, 120)
  return gameStateAt<CatalogGameState>({
    key: `${name}:${ctx.seed}`,
    seed: ctx.seed,
    stepMs: Math.round(1000 / fps),
    tMs: ctx.tMs,
    initial,
    step,
  })
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-kit.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/catalog-kit.ts lib/canvas/__tests__/catalog-kit.test.ts
git commit -m "feat(canvas): add deterministic catalog helpers"
```

---

## Foundation 5: config, schema and geometry contracts

### Task 8: Extend the central types and zod schemas

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/canvas/schema.ts`
- Test: `lib/canvas/__tests__/catalog-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `lib/canvas/__tests__/catalog-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { canvasConfigSchema, canvasSceneSchema } from '@/lib/canvas/schema'
import { defaultScene } from '@/lib/canvas/scenes/registry'

const slot = { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }

describe('phase 4 canvas schemas', () => {
  it('accepts bezel mode, physical units, screen size and slot rotation', () => {
    const parsed = canvasConfigSchema.safeParse({
      arrangement: 'row',
      gap: 18,
      slots: [{ ...slot, rotation: 90 }],
      bezelMode: 'collapse',
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects physical units without screen dimensions', () => {
    const parsed = canvasConfigSchema.safeParse({
      arrangement: 'row',
      slots: [slot],
      unitMode: 'physical',
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts every catalog scene type', () => {
    for (const type of CATALOG_TYPES) {
      const parsed = canvasSceneSchema.safeParse({
        id: 'scene',
        name: 'Scene',
        enabled: true,
        durationSec: 30,
        seed: 1,
        type,
        config: { text: 'wall', images: [`canvas-asset:${'a'.repeat(64)}`] },
      })
      expect(parsed.success, type).toBe(true)
    }
  })

  it('still accepts the four phase 1 scene types', () => {
    const geometry = { width: 1920, height: 1080, slots: [], gaps: [] }
    for (const type of ['marquee', 'bounce', 'pong', 'sync-test'] as const) {
      const scene = defaultScene(type, geometry as never)
      expect(canvasSceneSchema.safeParse(scene).success, type).toBe(true)
    }
  })

  it('rejects media URLs in catalog image configs', () => {
    const parsed = canvasSceneSchema.safeParse({
      id: 'scene',
      name: 'Scene',
      enabled: true,
      durationSec: 30,
      seed: 1,
      type: 'gallery-wall',
      config: { images: ['/api/media/a.png'] },
    })
    expect(parsed.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-schema.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extend `lib/types.ts`**

Replace the existing `CanvasSlot` and `CanvasConfig` blocks with:

```ts
export type CanvasSlot = {
  id: string
  frameId: string | null
  label?: string
  offset: { x: number; y: number }
  scale: number
  rotation?: 0 | 90 | 180 | 270
}

export type CanvasConfig = {
  arrangement: CanvasArrangement
  gridColumns?: number
  gap: number
  align: Align
  slots: CanvasSlot[]
  background: string
  markers: 'identify' | 'always' | 'never'
  notifications: 'suppress' | 'show'
  nightMode: 'inherit' | 'ignore'
  maxFps: 15 | 24 | 30 | 60
  bezelMode?: 'show' | 'hide' | 'collapse'
  unitMode?: 'pixels' | 'physical'
  screenWidthMm?: number
  screenHeightMm?: number
}
```

Leave `CanvasSceneType` and `CanvasScene` unchanged in this task. Task 21 extends that union when the registry can handle the new types, so the Phase 1 registry keeps typechecking after each foundation step.

- [ ] **Step 4: Extend `lib/canvas/schema.ts`**

Add this import:

```ts
import { CATALOG_TYPES, catalogConfigSchema } from '@/lib/canvas/catalog-kit'
```

Replace `canvasSlotSchema` with:

```ts
export const canvasSlotSchema = z.object({
  id: z.string().min(1).max(40),
  frameId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).nullable(),
  label: z.string().max(40).optional(),
  offset: z.object({ x: z.number().min(-8000).max(8000), y: z.number().min(-8000).max(8000) }).default({ x: 0, y: 0 }),
  scale: z.number().min(0.25).max(4).default(1),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
})
```

Replace `canvasConfigSchema` with:

```ts
export const canvasConfigSchema = z
  .object({
    arrangement: z.enum(['row', 'column', 'grid']),
    gridColumns: z.number().int().min(1).max(8).optional(),
    gap: z.number().min(0).max(600).default(0),
    align: z.enum(['start', 'center', 'end']).default('center'),
    slots: z.array(canvasSlotSchema).min(1).max(16),
    background: hex.default('#000000'),
    markers: z.enum(['identify', 'always', 'never']).default('identify'),
    notifications: z.enum(['suppress', 'show']).default('suppress'),
    nightMode: z.enum(['inherit', 'ignore']).default('inherit'),
    maxFps: z.union([z.literal(15), z.literal(24), z.literal(30), z.literal(60)]).default(30),
    bezelMode: z.enum(['show', 'hide', 'collapse']).default('show'),
    unitMode: z.enum(['pixels', 'physical']).default('pixels'),
    screenWidthMm: z.number().min(1).max(4000).optional(),
    screenHeightMm: z.number().min(1).max(4000).optional(),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>()
    const frames = new Set<string>()
    config.slots.forEach((slot, index) => {
      if (ids.has(slot.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate slot id', path: ['slots', index, 'id'] })
      ids.add(slot.id)
      if (slot.frameId) {
        if (frames.has(slot.frameId)) ctx.addIssue({ code: 'custom', message: 'Frame appears twice', path: ['slots', index, 'frameId'] })
        frames.add(slot.frameId)
      }
    })
    if (config.unitMode === 'physical' && (!config.screenWidthMm || !config.screenHeightMm)) {
      ctx.addIssue({ code: 'custom', message: 'Physical units require screen dimensions', path: ['screenWidthMm'] })
    }
  })
```

Replace `canvasSceneSchema` with:

```ts
export const canvasSceneSchema = z.discriminatedUnion('type', [
  z.object({ ...sceneBaseShape, type: z.literal('marquee'), config: marqueeConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('bounce'), config: bounceConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('pong'), config: pongConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('sync-test'), config: syncTestConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.enum(CATALOG_TYPES), config: catalogConfigSchema }),
])
```

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-schema.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/canvas/schema.ts lib/canvas/__tests__/catalog-schema.test.ts
git commit -m "feat(canvas): extend scene schemas for the catalog"
```

---

### Task 9: bezel mode, physical units and slot rotation in geometry

**Files:**
- Modify: `lib/canvas/geometry.ts`
- Modify: `lib/canvas/takeover.ts`
- Modify: `lib/canvas/render-model.ts`
- Modify: `app/api/canvas/state/route.ts`
- Modify: `components/frame/frame-display.tsx`
- Modify: `components/editor/canvas-admin/wall-preview.tsx`
- Modify: `components/editor/canvas-admin/arrangement-editor.tsx`
- Test: `lib/canvas/__tests__/geometry-phase-4.test.ts`

- [ ] **Step 1: Write the failing geometry test**

Create `lib/canvas/__tests__/geometry-phase-4.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canvasGapPx, canvasPhysicalIssues, resolveGeometry, type FrameScreenSize } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'

const base: CanvasConfig = {
  arrangement: 'row',
  gap: 120,
  align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

describe('phase 4 geometry', () => {
  it('collapses the gap when bezelMode is collapse', () => {
    expect(resolveGeometry({ ...base, bezelMode: 'collapse' }).slots[1].x).toBe(1080)
    expect(resolveGeometry({ ...base, bezelMode: 'collapse' }).gaps).toEqual([])
    expect(resolveGeometry({ ...base, bezelMode: 'hide' }).slots[1].x).toBe(1200)
    expect(resolveGeometry({ ...base, bezelMode: 'hide' }).gaps).toHaveLength(1)
  })

  it('converts millimetre gaps to canvas pixels', () => {
    const config: CanvasConfig = {
      ...base,
      gap: 172,
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    }
    expect(canvasGapPx(config)).toBe(540)
    expect(resolveGeometry(config).slots[1].x).toBe(1620)
  })

  it('derives each physical slot scale from its frame screen dimensions', () => {
    const config: CanvasConfig = {
      ...base,
      bezelMode: 'collapse',
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    }
    const frames: FrameScreenSize[] = [
      { id: 'fa', screenWidthMm: 344, screenHeightMm: 193 },
      { id: 'fb', screenWidthMm: 688, screenHeightMm: 386 },
    ]
    const geometry = resolveGeometry(config, frames)
    expect(geometry.slots.map((slot) => slot.scale)).toEqual([1, 2])
    expect(geometry.slots[1].w).toBe(2160)
    expect(geometry.slots[1].h).toBe(3840)
    expect(geometry.slots[1].x).toBe(1080)
    expect(resolveGeometry(config, [{ id: 'fa', screenWidthMm: null, screenHeightMm: null }]).slots[0].scale).toBe(1)
  })

  it('swaps slot dimensions for quarter-turn rotations', () => {
    const config: CanvasConfig = {
      ...base,
      slots: [{ ...base.slots[0], rotation: 90 }],
    }
    const slot = resolveGeometry(config).slots[0]
    expect(slot.w).toBe(1920)
    expect(slot.h).toBe(1080)
    expect(slot.rotation).toBe(90)
  })

  it('names frames missing physical screen dimensions', () => {
    const config: CanvasConfig = { ...base, unitMode: 'physical', screenWidthMm: 344, screenHeightMm: 193 }
    expect(canvasPhysicalIssues(config, [
      { id: 'fa', screenWidthMm: 344, screenHeightMm: 193 },
      { id: 'fb', screenWidthMm: null, screenHeightMm: 193 },
    ])).toEqual(['fb'])
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/geometry-phase-4.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extend `lib/canvas/geometry.ts` types**

Replace `ResolvedSlot` with:

```ts
export type ResolvedSlot = {
  slotId: string
  index: number
  marker: number
  x: number
  y: number
  w: number
  h: number
  scale: number
  rotation?: 0 | 90 | 180 | 270
}
```

Add these helpers before `resolveGeometry`:

```ts
export function canvasGapPx(config: CanvasConfig): number {
  if (config.bezelMode === 'collapse') return 0
  if (config.unitMode !== 'physical' || !config.screenWidthMm) return config.gap
  return Math.min(600, Math.max(0, (config.gap / config.screenWidthMm) * FRAME_WIDTH))
}

export type FrameScreenSize = {
  id: string
  screenWidthMm?: number | null
  screenHeightMm?: number | null
}

/** Canvas pixels per millimetre, normalised to the config's reference screen. */
export function canvasSlotScale(
  config: CanvasConfig,
  frames: FrameScreenSize[],
  slot: CanvasConfig['slots'][number],
): number {
  if (config.unitMode !== 'physical') return slot.scale
  const frame = frames.find((item) => item.id === slot.frameId)
  const widthMm = frame?.screenWidthMm
  const heightMm = frame?.screenHeightMm
  if (!widthMm || !heightMm || !config.screenWidthMm || !config.screenHeightMm) return slot.scale
  const ratio = Math.min(widthMm / config.screenWidthMm, heightMm / config.screenHeightMm)
  return slot.scale * Math.min(4, Math.max(0.25, ratio))
}

/** Console-side deploy blocker: every enrolled frame needs both dimensions. */
export function canvasPhysicalIssues(config: CanvasConfig, frames: FrameScreenSize[]): string[] {
  if (config.unitMode !== 'physical') return []
  return frames
    .filter((frame) => !frame.screenWidthMm || !frame.screenHeightMm)
    .map((frame) => frame.id)
}
```

- [ ] **Step 4: Apply frame sizes, gap and rotation in `resolveGeometry`**

Change the signature to:

```ts
export function resolveGeometry(config: CanvasConfig, frames: FrameScreenSize[] = []): ResolvedGeometry {
```

Replace the `sizes` declaration with:

```ts
  const scales = config.slots.map((slot) => canvasSlotScale(config, frames, slot))
  const sizes = config.slots.map((slot, index) => {
    const rotated = slot.rotation === 90 || slot.rotation === 270
    return {
      w: (rotated ? FRAME_HEIGHT : FRAME_WIDTH) * scales[index],
      h: (rotated ? FRAME_WIDTH : FRAME_HEIGHT) * scales[index],
    }
  })
  const gap = canvasGapPx(config)
```

The derived `scales` drive sizing before any arrangement branch runs, so positions and gap rectangles use the physical slot boxes.

Replace all three uses of `config.gap` inside the arrangement branches with `gap`.

Replace the `slots` mapping with:

```ts
  const slots: ResolvedSlot[] = raw.map((rect, index) => ({
    slotId: config.slots[index].id,
    index,
    marker: index + 1,
    x: rect.x - minX,
    y: rect.y - minY,
    w: rect.w,
    h: rect.h,
    scale: scales[index],
    rotation: config.slots[index].rotation ?? 0,
  }))
```

- [ ] **Step 5: Pass frame screen sizes at every render call site**

In `lib/canvas/takeover.ts`, extend `resolveCanvasTakeover(state, nowMs, frames: FrameScreenSize[] = [])` and call `resolveGeometry(candidate.config, frames)`. In `lib/canvas/render-model.ts`, extend `canvasRenderModel(state, nowMs, clockOffsetMs = 0, frames: FrameScreenSize[] = [])` and forward `frames` to `resolveCanvasTakeover`.

In `app/api/canvas/state/route.ts`, read the local frame document's `screenWidthMm`/`screenHeightMm` by `remoteEntityId(frameId)` and add them as a `frame` field in the JSON payload (`null` when the document has no row). In `components/frame/frame-display.tsx`, add that field to `CanvasSnapshot` and pass `[{ id: frameId, screenWidthMm: canvasData.frame?.screenWidthMm ?? null, screenHeightMm: canvasData.frame?.screenHeightMm ?? null }]` as the fourth argument of `canvasRenderModel`.

In `components/editor/canvas-admin/wall-preview.tsx`, accept `frames: FrameScreenSize[]` and call `resolveGeometry(config, frames)`. In `components/editor/canvas-admin/arrangement-editor.tsx`, map its `frames` to `FrameScreenSize` and pass them to `<WallPreview ... />`. Task 12's `frameScreenSizes(enrolled)` uses the same rows, so console preview, frame display and the deploy guard share one source of millimetre values.

- [ ] **Step 6: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/geometry-phase-4.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/canvas/geometry.ts lib/canvas/takeover.ts lib/canvas/render-model.ts app/api/canvas/state/route.ts components/frame/frame-display.tsx components/editor/canvas-admin/wall-preview.tsx components/editor/canvas-admin/arrangement-editor.tsx lib/canvas/__tests__/geometry-phase-4.test.ts
git commit -m "feat(canvas): derive physical slot scales from frame sizes"
```

---

## Foundation 6: bounce extras

### Task 10: finished trails and guaranteed-corner mode

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/canvas/schema.ts`
- Modify: `lib/canvas/scenes/bounce.ts`
- Test: `lib/canvas/__tests__/bounce-extras.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/bounce-extras.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { bounceState } from '@/lib/canvas/scenes/bounce'
import type { BounceConfig } from '@/lib/types'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: BounceConfig = {
  logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style, w: 100, h: 100 },
  speed: 1000,
  angleDeg: 30,
  startMode: 'center',
  tint: { mode: 'none', colors: ['#ff0000'], fixed: '#ffffff' },
  cornerCelebration: true,
  trail: { enabled: true, length: 3, spacingMs: 100 },
  guaranteedCorner: true,
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const ctx = { bounds: { width: 1000, height: 500 }, geometry, seed: 2 }

describe('bounce extras', () => {
  it('reaches a corner at the analytic time in guaranteed-corner mode', () => {
    const seconds = Math.hypot(1000 - 100, 500 - 100) / 1000
    const state = bounceState(config, { ...ctx, tMs: seconds * 1000 })
    expect(state.cornerAgeMs).not.toBeNull()
    expect(state.cornerAgeMs!).toBeLessThan(2)
  })

  it('marks a finished trail without reading history', () => {
    const state = bounceState(config, { ...ctx, tMs: 2000 })
    expect(state.trailFinished).toBe(true)
    expect(state.trail).toHaveLength(3)
  })

  it('keeps the scene slot-independent', () => {
    const a = bounceState(config, { ...ctx, tMs: 900 })
    const b = bounceState(config, { ...ctx, tMs: 900 })
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/bounce-extras.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extend `BounceConfig` and its schema**

In `lib/types.ts`, replace the `trail` line and append `guaranteedCorner` in `BounceConfig`:

```ts
  cornerCelebration: boolean
  trail: { enabled: boolean; length: number; spacingMs: number; finish?: boolean }
  guaranteedCorner?: boolean
```

In `lib/canvas/schema.ts`, replace the bounce `trail` block and add `guaranteedCorner`:

```ts
  trail: z
    .object({ enabled: z.boolean().default(false), length: z.number().int().min(0).max(12).default(0), spacingMs: z.number().int().min(16).max(1000).default(80), finish: z.boolean().default(true) })
    .default({ enabled: false, length: 0, spacingMs: 80, finish: true }),
  guaranteedCorner: z.boolean().default(false),
```

- [ ] **Step 4: Extend `lib/canvas/scenes/bounce.ts`**

In `BounceState`, add:

```ts
  trailFinished: boolean
```

In `bouncePosition`, replace the contiguous block from the original `const angle = ...` declaration through the original `const startY = ...` declaration with this entire block; no other lines in `bouncePosition` change:

```ts
  const cornerMode = config.guaranteedCorner === true
  const angleDeg = cornerMode
    ? (Math.atan2(ry, rx) * 180) / Math.PI
    : (config.angleDeg ?? 20 + hash01(seed, 1) * 50)
  const radians = (angleDeg * Math.PI) / 180
  const sx = cornerMode ? 1 : hash01(seed, 2) < 0.5 ? -1 : 1
  const sy = cornerMode ? 1 : hash01(seed, 3) < 0.5 ? -1 : 1
  const vx = Math.abs(config.speed * Math.cos(radians))
  const vy = Math.abs(config.speed * Math.sin(radians))
  const startX = cornerMode ? 0 : config.startMode === 'center' ? rx / 2 : hash01(seed, 4) * rx
  const startY = cornerMode ? 0 : config.startMode === 'center' ? ry / 2 : hash01(seed, 5) * ry
```

In `bounceState`, replace the original `angle`, `vx` and `vy` declarations with:

```ts
  const cornerMode = config.guaranteedCorner === true
  const angleDeg = cornerMode
    ? (Math.atan2(ry, rx) * 180) / Math.PI
    : (config.angleDeg ?? 20 + hash01(ctx.seed, 1) * 50)
  const radians = (angleDeg * Math.PI) / 180
  const vx = Math.abs(config.speed * Math.cos(radians))
  const vy = Math.abs(config.speed * Math.sin(radians))
```

Replace the final return with:

```ts
  return {
    x: position.x,
    y: position.y,
    w: config.logo.w,
    h: config.logo.h,
    bounces: position.bounces,
    color,
    cornerAgeMs,
    trail,
    trailFinished: config.trail.enabled && config.trail.finish !== false,
  }
```

Keep decorative trail opacity and corner celebration gated on reduced motion in `paintScene`; no state function reads the DOM.

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/bounce-extras.test.ts lib/canvas/__tests__/bounce.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/canvas/schema.ts lib/canvas/scenes/bounce.ts lib/canvas/__tests__/bounce-extras.test.ts
git commit -m "feat(canvas): finish bounce trails and add corner mode"
```

---

## Foundation 7: display bezel and rotation

### Task 11: bezel overlay, render model and rotated 2D viewport

**Files:**
- Modify: `lib/canvas/geometry.ts`
- Modify: `lib/canvas/render-model.ts`
- Modify: `components/frame/canvas/canvas-stage.tsx`
- Create: `components/frame/canvas/canvas-bezel-overlay.tsx`
- Modify: `components/editor/canvas-admin/wall-preview.tsx`
- Test: `tests/canvas-bezel.test.ts`

- [ ] **Step 1: Write the failing bezel test**

Create `tests/canvas-bezel.test.ts`:

```tsx
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CanvasBezelOverlay } from '@/components/frame/canvas/canvas-bezel-overlay'
import { rotatedSlotStyle } from '@/lib/canvas/geometry'

const gap = { x: 1080, y: 0, w: 120, h: 1920 }
const root = process.cwd()
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('CanvasBezelOverlay', () => {
  it('paints gap rectangles in show mode', () => {
    const markup = renderToStaticMarkup(<CanvasBezelOverlay mode="show" gaps={[gap]} />)
    expect(markup).toContain('data-canvas-bezel')
    expect(markup).toContain('120px')
  })

  it('paints nothing for hide and collapse modes', () => {
    for (const mode of ['hide', 'collapse'] as const) {
      expect(renderToStaticMarkup(<CanvasBezelOverlay mode={mode} gaps={[gap]} />)).toBe('')
    }
  })

  it('rotates a slot wrapper once around its centre', () => {
    const slot = { slotId: 'a', index: 0, marker: 1, x: 0, y: 0, w: 1920, h: 1080, scale: 1, rotation: 90 as const }
    const markup = renderToStaticMarkup(
      <div data-slot-rotation="true" style={rotatedSlotStyle(slot)} />,
    )
    expect(markup).toContain('rotate(90deg)')
    expect(markup).toContain('translate(960px, 540px)')
  })

  it('renders the overlay and rotation in both preview and stage', () => {
    for (const file of [
      'components/editor/canvas-admin/wall-preview.tsx',
      'components/frame/canvas/canvas-stage.tsx',
    ]) {
      expect(read(file), file).toContain('rotatedSlotStyle')
    }
    const preview = read('components/editor/canvas-admin/wall-preview.tsx')
    expect(preview).toContain('CanvasBezelOverlay')
    expect(preview).toContain('geometry.gaps')
    expect(preview).toContain('bezelMode')
    expect(read('lib/canvas/draw.ts')).not.toContain('options.rotation')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-bezel.test.ts`

Expected: FAIL (overlay module and `rotatedSlotStyle` are absent; later assertions fail until preview and stage import them).

- [ ] **Step 3: Create `components/frame/canvas/canvas-bezel-overlay.tsx`**

```tsx
type Gap = { x: number; y: number; w: number; h: number }

export function CanvasBezelOverlay({
  mode,
  gaps,
}: {
  mode: 'show' | 'hide' | 'collapse'
  gaps: Gap[]
}) {
  if (mode !== 'show') return null
  return (
    <>
      {gaps.map((gap, index) => (
        <div
          key={`${gap.x}:${gap.y}:${index}`}
          data-canvas-bezel="true"
          style={{
            position: 'absolute',
            left: gap.x,
            top: gap.y,
            width: gap.w,
            height: gap.h,
            background: '#050505',
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Extend `lib/canvas/render-model.ts`**

In `CanvasRenderModel`, add:

```ts
  bezelMode: 'show' | 'hide' | 'collapse'
  gaps: Array<{ x: number; y: number; w: number; h: number }>
```

Before the return, add:

```ts
  const bezelMode = takeover?.deployment.config.bezelMode ?? 'show'
  const gaps = bezelMode === 'collapse' ? [] : (takeover?.geometry.gaps ?? [])
```

Replace the return with:

```ts
  return { takeover, plan, render, identify, slotRect, bezelMode, gaps }
```

- [ ] **Step 5: Add one shared slot-rotation transform**

In `lib/canvas/geometry.ts`, add this helper. It is pure, so stage and preview use the same math:

```ts
export function rotatedSlotStyle(slot: ResolvedSlot): {
  transform: string | undefined
  transformOrigin: string
} {
  const rotation = slot.rotation ?? 0
  // The translate/rotate/translate chain rotates around the slot centre, so the
  // CSS origin must stay at the wrapper's top-left corner.
  if (rotation === 0) return { transform: undefined, transformOrigin: 'top left' }
  return {
    transform: `translate(${slot.w / 2}px, ${slot.h / 2}px) rotate(${rotation}deg) translate(${-slot.w / 2}px, ${-slot.h / 2}px)`,
    transformOrigin: 'top left',
  }
}
```

`resolveGeometry` already swaps `slot.w`/`slot.h` for quarter turns, so the outer viewport is the rotated box and this transform rotates the content inside it once. Do **not** add `rotation` to `ExecuteOptions` and do **not** pass it from `Canvas2DLayer`: the CSS transform on the slot wrapper applies to every renderer, and a second canvas rotation would double-rotate commands.

- [ ] **Step 6: Render the overlay and rotation in `canvas-stage.tsx`**

In `components/frame/canvas/canvas-stage.tsx`, import `rotatedSlotStyle` and `CanvasBezelOverlay`. Add beside `const scale = fitScale(...)`:

```tsx
  const rotationStyle = rotatedSlotStyle(slot)
```

Apply it to the existing inner viewport wrapper (the `absolute left-0 top-0 origin-top-left overflow-hidden` div containing the wall-coordinate div); leave the outer clipping box sized from `slot.w`/`slot.h`:

```tsx
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden"
          style={{
            width: slot.w,
            height: slot.h,
            transform: `${rotationStyle.transform ? `${rotationStyle.transform} ` : ''}scale(${scale})`,
            transformOrigin: rotationStyle.transformOrigin,
          }}
        >
```

The fit scale stays on this wrapper and the rotation runs after it, so every renderer sees one CSS rotation. Render `<CanvasBezelOverlay mode={model.bezelMode} gaps={model.gaps} />` as a sibling after that wrapper and before the marker. Gap bands are wall space and must not rotate with the slot content.

- [ ] **Step 7: Render the overlay and rotation in `wall-preview.tsx`**

In `components/editor/canvas-admin/wall-preview.tsx`, import `CanvasBezelOverlay` and `rotatedSlotStyle`, and read the mode from the edited config:

```tsx
  const bezelMode = config.bezelMode ?? 'show'
  const bezel = { mode: bezelMode, gaps: bezelMode === 'collapse' ? [] : geometry.gaps }
```

Inside `geometry.slots.map((slot) => ...)` add `const rotationStyle = rotatedSlotStyle(slot)` and apply it to that slot's inner content div, keeping the existing preview scale:

```tsx
            style={{
              transform: `${rotationStyle.transform ? `${rotationStyle.transform} ` : ''}scale(${slot.scale})`,
              transformOrigin: rotationStyle.transformOrigin,
              width: slot.w / slot.scale,
              height: slot.h / slot.scale,
            }}
```

The helper's `transformOrigin: 'top left'` matches the preview's existing origin, so the translate/rotate/translate chain rotates once around the slot centre after the content is scaled. Render `<CanvasBezelOverlay mode={bezel.mode} gaps={bezel.gaps} />` once inside the scaled wall container, after the `geometry.slots.map(...)` output: gap rectangles are wall coordinates, so they must not be positioned relative to an individual slot or rotated with it. `showBezels` still controls outlines; `bezelMode` controls gap rectangles. Task 9 already passes `frames` into `resolveGeometry`, so preview and display share the same rotated, physically scaled boxes.

- [ ] **Step 8: Confirm the 2D layer does not rotate twice**

`lib/canvas/draw.ts` must not contain `options.rotation`, and `components/frame/canvas/canvas-2d-layer.tsx` must keep passing only `slot`, `dpr` and `reducedMotion` to `executeDrawCommands`. The canvas inherits the wrapper's CSS transform.

- [ ] **Step 9: Run the tests and typecheck**

Run:

```bash
pnpm vitest run tests/canvas-bezel.test.ts lib/canvas/__tests__/draw.test.ts lib/canvas/__tests__/geometry-phase-4.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/canvas/geometry.ts lib/canvas/render-model.ts components/frame/canvas/canvas-stage.tsx components/frame/canvas/canvas-bezel-overlay.tsx components/editor/canvas-admin/wall-preview.tsx tests/canvas-bezel.test.ts
git commit -m "feat(canvas): render bezel modes and rotated slots in stage and preview"
```

---

### Task 12: operator controls and deploy blocking

**Files:**
- Create: `components/editor/canvas-admin/canvas-extras-panel.tsx`
- Modify: `components/editor/canvas-admin/arrangement-editor.tsx`
- Modify: `components/editor/canvas-admin/albums-tab.tsx`
- Modify: `lib/canvas/service.ts`
- Test: `lib/canvas/__tests__/deploy-guard.test.ts`

- [ ] **Step 1: Write the failing guard and UI test**

Create `lib/canvas/__tests__/deploy-guard.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertCanvasDeployable } from '@/lib/canvas/service'
import type { CanvasConfig } from '@/lib/types'

const root = process.cwd()
const config: CanvasConfig = {
  arrangement: 'row',
  gap: 10,
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1, rotation: 90 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
  bezelMode: 'collapse',
  unitMode: 'physical',
  screenWidthMm: 344,
  screenHeightMm: 193,
}

describe('canvas deploy guard', () => {
  it('blocks deployment when an enrolled frame has no screen dimensions', () => {
    expect(() => assertCanvasDeployable(config, [{ id: 'fa', screenWidthMm: null, screenHeightMm: null }]))
      .toThrow(/missing physical screen dimensions: fa/)
  })

  it('permits a fully measured physical wall', () => {
    expect(() => assertCanvasDeployable(config, [{ id: 'fa', screenWidthMm: 344, screenHeightMm: 193 }]))
      .not.toThrow()
  })

  it('wires the controls into the console', () => {
    const panel = readFileSync(path.join(root, 'components/editor/canvas-admin/canvas-extras-panel.tsx'), 'utf8')
    for (const token of ['bezelMode', 'unitMode', 'screenWidthMm', 'screenHeightMm', 'rotation', 'canvas-asset:']) {
      expect(panel).toContain(token)
    }
    const editor = readFileSync(path.join(root, 'components/editor/canvas-admin/arrangement-editor.tsx'), 'utf8')
    expect(editor).toContain('CanvasExtrasPanel')
    const service = readFileSync(path.join(root, 'lib/canvas/service.ts'), 'utf8')
    expect(service).toContain('assertCanvasDeployable')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/deploy-guard.test.ts`

Expected: FAIL.

- [ ] **Step 3: Create `components/editor/canvas-admin/canvas-extras-panel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { FrameScreenSize } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'

type Props = {
  config: CanvasConfig
  frames: FrameScreenSize[]
  onChange: (config: CanvasConfig) => void
}

export function CanvasExtrasPanel({ config, frames, onChange }: Props) {
  const [assetRef, setAssetRef] = useState('')

  async function upload(file: File) {
    const form = new FormData()
    form.set('file', file)
    const response = await fetch('/api/canvas/assets', { method: 'POST', body: form })
    if (!response.ok) return
    const body = (await response.json()) as { ref: string }
    setAssetRef(body.ref)
  }

  function patch(next: Partial<CanvasConfig>) {
    onChange({ ...config, ...next })
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Canvas extras">
      <label className="flex flex-col gap-1">
        <span>Bezel mode</span>
        <select
          value={config.bezelMode ?? 'show'}
          onChange={(event) => patch({ bezelMode: event.target.value as CanvasConfig['bezelMode'] })}
        >
          <option value="show">Show gap</option>
          <option value="hide">Hide gap</option>
          <option value="collapse">Collapse gap</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Gap units</span>
        <select
          value={config.unitMode ?? 'pixels'}
          onChange={(event) => patch({ unitMode: event.target.value as CanvasConfig['unitMode'] })}
        >
          <option value="pixels">Canvas pixels</option>
          <option value="physical">Millimetres</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span>Screen width (mm)</span>
          <input
            type="number"
            min={1}
            value={config.screenWidthMm ?? ''}
            onChange={(event) => patch({ screenWidthMm: Number(event.target.value) || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Screen height (mm)</span>
          <input
            type="number"
            min={1}
            value={config.screenHeightMm ?? ''}
            onChange={(event) => patch({ screenHeightMm: Number(event.target.value) || undefined })}
          />
        </label>
      </div>

      {frames.map((frame, index) => (
        <label key={frame.id} className="flex flex-col gap-1">
          <span>{`Rotation for slot ${index + 1}`}</span>
          <select
            value={String(config.slots[index]?.rotation ?? 0)}
            onChange={(event) => {
              const rotation = Number(event.target.value) as 0 | 90 | 180 | 270
              const slots = config.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, rotation } : slot)
              patch({ slots })
            }}
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        </label>
      ))}

      <label className="flex flex-col gap-1">
        <span>Upload gallery image</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }} />
      </label>
      <output aria-live="polite">{assetRef || 'Refs start with canvas-asset:'}</output>
    </section>
  )
}
```

In `components/editor/canvas-admin/arrangement-editor.tsx`, add `import { CanvasExtrasPanel } from './canvas-extras-panel'` and render this immediately after the existing Gap `SliderField`. Use the component's existing `config`, `frames` and `updateConfig` names:

```tsx
<CanvasExtrasPanel config={config} frames={frames} onChange={updateConfig} />
```

In `components/editor/canvas-admin/albums-tab.tsx`, add `import { CanvasExtrasPanel } from './canvas-extras-panel'` and render `<CanvasExtrasPanel config={emptyCanvasConfig()} frames={[]} onChange={() => {}} />` once below the album list. That keeps the upload control available while editing albums; the generated ref can be pasted into the `images` field wired in Task 21.

- [ ] **Step 4: Add the deploy guard to `lib/canvas/service.ts`**

Add this import:

```ts
import { canvasPhysicalIssues, type FrameScreenSize } from '@/lib/canvas/geometry'
```

Add these functions before `deployCanvas`; `getDb` and `getTables` are already imported in this file:

```ts
export function assertCanvasDeployable(config: CanvasConfig, frames: FrameScreenSize[]): void {
  const missing = canvasPhysicalIssues(config, frames)
  if (missing.length > 0) {
    throw new Error(`missing physical screen dimensions: ${missing.join(', ')}`)
  }
}

async function frameScreenSizes(ids: Set<string>): Promise<FrameScreenSize[]> {
  const tables = getTables()
  const rows = await getDb()
    .select({
      id: tables.frameDocuments.identifier,
      screenWidthMm: tables.frameDocuments.screenWidthMm,
      screenHeightMm: tables.frameDocuments.screenHeightMm,
    })
    .from(tables.frameDocuments)
  return rows
    .filter((row) => ids.has(row.id))
    .map((row) => ({
      id: row.id,
      screenWidthMm: row.screenWidthMm,
      screenHeightMm: row.screenHeightMm,
    }))
}
```

In `deployCanvas`, immediately after this existing line:

```ts
  const enrolled = await enrolledIds()
```

insert:

```ts
  assertCanvasDeployable(config, await frameScreenSizes(enrolled))
```

This runs after the layout is loaded and before any state rows are written. `releaseCanvas` and `identifyCanvas` do not create a new deployment, so they do not need the guard.

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/deploy-guard.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/editor/canvas-admin/canvas-extras-panel.tsx components/editor/canvas-admin/arrangement-editor.tsx components/editor/canvas-admin/albums-tab.tsx lib/canvas/service.ts lib/canvas/__tests__/deploy-guard.test.ts
git commit -m "feat(canvas): add canvas extras controls and deploy guard"
```

---

## Catalog scene states, group 1: gallery

### Task 13: gallery, exhibit, mosaic and reveal state modules

**Files:**
- Create: `lib/canvas/scenes/catalog/panorama.ts`
- Create: `lib/canvas/scenes/catalog/gallery-wall.ts`
- Create: `lib/canvas/scenes/catalog/exhibit.ts`
- Create: `lib/canvas/scenes/catalog/mosaic-wall.ts`
- Create: `lib/canvas/scenes/catalog/tile-reveal.ts`
- Test: `lib/canvas/__tests__/catalog-gallery.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-gallery.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { exhibitState } from '@/lib/canvas/scenes/catalog/exhibit'
import { galleryWallState } from '@/lib/canvas/scenes/catalog/gallery-wall'
import { mosaicWallState } from '@/lib/canvas/scenes/catalog/mosaic-wall'
import { panoramaState } from '@/lib/canvas/scenes/catalog/panorama'
import { tileRevealState } from '@/lib/canvas/scenes/catalog/tile-reveal'

const ctx: CatalogContext = {
  bounds: { width: 4000, height: 1200 },
  geometry: { width: 4000, height: 1200 },
  tMs: 12_340,
  seed: 9,
}
const config: CatalogSceneConfig = {
  images: Array.from({ length: 6 }, () => `canvas-asset:${'a'.repeat(64)}`),
  lines: ['A', 'B'],
  text: 'WALL',
  periodSec: 4,
}
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['panorama', panoramaState],
  ['gallery-wall', galleryWallState],
  ['exhibit', exhibitState],
  ['mosaic-wall', mosaicWallState],
  ['tile-reveal', tileRevealState],
]

describe('gallery catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('reuses the shared mosaic and reveal engines', () => {
    const root = process.cwd()
    const mosaic = readFileSync(path.join(root, 'lib/canvas/scenes/catalog/mosaic-wall.ts'), 'utf8')
    expect(mosaic).toContain("from '@/lib/mosaic'")
    expect(mosaic).toContain('mosaicAt(')
    const reveal = readFileSync(path.join(root, 'lib/canvas/scenes/catalog/tile-reveal.ts'), 'utf8')
    expect(reveal).toContain("from '@/lib/reveal'")
    expect(reveal).toContain('revealAt(')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-gallery.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create the first three gallery state modules**

`lib/canvas/scenes/catalog/panorama.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configImages, configNumber } from '@/lib/canvas/catalog-kit'

export function panoramaState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 8, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const images = configImages(config)
  const count = Math.max(1, images.length)
  const width = ctx.bounds.width / count
  state.cells = images.length
    ? images.slice(0, 32).map((image, index) => ({
        id: `panorama:${index}`,
        x: index * width,
        y: 0,
        w: width,
        h: ctx.bounds.height,
        value: (state.phase + index / count) % 1,
        image,
      }))
    : [{ id: 'panorama:0', x: 0, y: 0, w: ctx.bounds.width, h: ctx.bounds.height, value: state.phase }]
  return state
}
```

`lib/canvas/scenes/catalog/gallery-wall.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function galleryWallState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 12, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const images = configImages(config)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(1, Math.round(configNumber(config, 'cols', 3, 1, 8))))
  const rows = Math.min(8, Math.max(1, Math.round(configNumber(config, 'rows', 2, 1, 8))))
  const gap = configNumber(config, 'gap', 12, 0, 2000)
  state.cells = gridCells(ctx, cols, rows, gap).map((cell, index) => ({
    ...cell,
    id: `gallery:${cell.id}`,
    value: (cell.value + state.phase) % 1,
    image: images[index % Math.max(1, images.length)],
    color: colors[index % colors.length],
  }))
  return state
}
```

`lib/canvas/scenes/catalog/exhibit.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configImages, configLines, configNumber } from '@/lib/canvas/catalog-kit'

export function exhibitState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 6, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const scale = configNumber(config, 'scale', 0.6, 0.1, 1)
  const w = ctx.bounds.width * scale
  const h = ctx.bounds.height * scale
  state.cells = [{
    id: 'exhibit:main',
    x: (ctx.bounds.width - w) / 2,
    y: (ctx.bounds.height - h) / 2,
    w,
    h,
    value: state.phase,
    image: configImages(config)[0],
  }]
  state.texts = configLines(config, ['Exhibit']).slice(0, 4)
  return state
}
```

- [ ] **Step 4: Create the mosaic and reveal state modules**

`lib/canvas/scenes/catalog/mosaic-wall.ts`:

```ts
import { mosaicAt, mosaicGrid } from '@/lib/mosaic'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function mosaicWallState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const intervalSec = configNumber(config, 'periodSec', 1.5, 0.5, 60)
  const state = baseState(config, ctx, intervalSec * 1000)
  const images = configImages(config)
  const colors = configColors(config)
  const itemCount = Math.max(1, images.length || colors.length)
  const grid = mosaicGrid({
    width: ctx.bounds.width,
    height: ctx.bounds.height,
    tileAspect: 1.4,
    tilesAcross: Math.round(configNumber(config, 'cols', 5, 1, 8)),
    itemCount,
  })
  const cols = Math.min(8, Math.max(1, grid.cols))
  const rows = Math.min(8, Math.max(1, grid.rows))
  const mosaic = mosaicAt({
    nowMs: ctx.tMs,
    offset: 0,
    seed: ctx.seed,
    itemCount,
    intervalSec,
    cols,
    rows,
  })
  state.cells = gridCells(ctx, cols, rows, 0).map((cell, index) => {
    const tile = mosaic.tiles[index]
    const item = tile?.item ?? index
    return {
      ...cell,
      id: `mosaic:${index}`,
      value: tile?.progress ?? 0,
      image: images[item % Math.max(1, images.length)],
      color: colors[item % colors.length],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/tile-reveal.ts`:

```ts
import { clampReveal, revealAt } from '@/lib/reveal'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function tileRevealState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const intervalSec = configNumber(config, 'periodSec', 2, 0.5, 60)
  const state = baseState(config, ctx, intervalSec * 1000)
  const settings = clampReveal({
    tilesAcross: configNumber(config, 'cols', 5, 2, 10),
    tilesDown: configNumber(config, 'rows', 4, 2, 10),
    gap: configNumber(config, 'gap', 2, 0, 12),
    group: 'single',
    effect: 'fade',
  })
  const images = configImages(config)
  const colors = configColors(config)
  const reveal = revealAt({
    nowMs: ctx.tMs,
    offset: 0,
    seed: ctx.seed,
    intervalSec,
    itemCount: Math.max(1, images.length || colors.length),
    cols: settings.tilesAcross,
    rows: settings.tilesDown,
    group: settings.group,
  })
  state.cells = gridCells(ctx, settings.tilesAcross, settings.tilesDown, settings.gap).map((cell, index) => {
    const cellState = reveal.cells[index]
    const item = cellState?.item ?? index
    return {
      ...cell,
      id: `reveal:${index}`,
      value: cellState?.progress ?? 0,
      image: images[item % Math.max(1, images.length)],
      color: colors[item % colors.length],
    }
  })
  return state
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-gallery.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/scenes/catalog/panorama.ts lib/canvas/scenes/catalog/gallery-wall.ts lib/canvas/scenes/catalog/exhibit.ts lib/canvas/scenes/catalog/mosaic-wall.ts lib/canvas/scenes/catalog/tile-reveal.ts lib/canvas/__tests__/catalog-gallery.test.ts
git commit -m "feat(canvas): add gallery catalog scene states"
```

---

## Catalog scene states, group 2: type and time

### Task 14: kinetic type, split-flap, marquee lanes, clock and countdown

**Files:**
- Create: `lib/canvas/scenes/catalog/kinetic-type.ts`
- Create: `lib/canvas/scenes/catalog/split-flap.ts`
- Create: `lib/canvas/scenes/catalog/multi-lane-marquee.ts`
- Create: `lib/canvas/scenes/catalog/wall-clock.ts`
- Create: `lib/canvas/scenes/catalog/countdown.ts`
- Test: `lib/canvas/__tests__/catalog-type-time.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-type-time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { countdownState } from '@/lib/canvas/scenes/catalog/countdown'
import { kineticTypeState } from '@/lib/canvas/scenes/catalog/kinetic-type'
import { multiLaneMarqueeState } from '@/lib/canvas/scenes/catalog/multi-lane-marquee'
import { splitFlapState } from '@/lib/canvas/scenes/catalog/split-flap'
import { wallClockState } from '@/lib/canvas/scenes/catalog/wall-clock'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1000 },
  geometry: { width: 3000, height: 1000 },
  tMs: 3661_000,
  seed: 3,
}
const config: CatalogSceneConfig = {
  text: 'HELLO WALL',
  lines: ['ONE', 'TWO', 'THREE'],
  periodSec: 4,
  speed: 240,
}
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['kinetic-type', kineticTypeState],
  ['split-flap', splitFlapState],
  ['multi-lane-marquee', multiLaneMarqueeState],
  ['wall-clock', wallClockState],
  ['countdown', countdownState],
]

describe('type and time catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('formats an epoch-based wall clock without reading the system clock', () => {
    const state = wallClockState({ ...config, epochMs: 0 }, ctx)
    expect(state.texts[0]).toBe('01:01:01')
  })

  it('clamps a countdown at zero', () => {
    const state = countdownState({ ...config, remainingMs: 60_000 }, ctx)
    expect(state.texts[0]).toBe('00:00:00')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-type-time.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create the type and time state modules**

`lib/canvas/scenes/catalog/kinetic-type.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, configText } from '@/lib/canvas/catalog-kit'

export function kineticTypeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 4, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const text = configText(config, 'text', 'WALL', 200)
  const count = Math.min(8, Math.max(1, text.length))
  const width = ctx.bounds.width / count
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `kinetic:${index}`,
    x: index * width,
    y: Math.sin((state.phase + index / count) * Math.PI * 2) * ctx.bounds.height * 0.12,
    w: width,
    h: ctx.bounds.height,
    value: (state.phase + index / count) % 1,
    text: text[index],
  }))
  return state
}
```

`lib/canvas/scenes/catalog/split-flap.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, configText, gridCells } from '@/lib/canvas/catalog-kit'

export function splitFlapState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const text = configText(config, 'text', 'WALL', 32)
  const chars = text.replace(/\s+/g, ' ').split('')
  const cols = Math.min(16, Math.max(1, chars.length))
  state.cells = gridCells(ctx, cols, 1, 0).map((cell, index) => ({
    ...cell,
    id: `flap:${index}`,
    value: (cell.value + state.phase) % 1,
    text: chars[index] ?? ' ',
  }))
  return state
}
```

`lib/canvas/scenes/catalog/multi-lane-marquee.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configLines, configNumber } from '@/lib/canvas/catalog-kit'

export function multiLaneMarqueeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 240, 0, 4000)
  const lines = configLines(config, ['Hello, wall']).slice(0, 8)
  state.texts = lines
  state.cells = lines.map((text, index) => ({
    id: `lane:${index}`,
    x: fold(ctx.tMs / 1000 * speed + index * 800, ctx.bounds.width),
    y: (index + 0.5) * (ctx.bounds.height / lines.length),
    w: ctx.bounds.width,
    h: ctx.bounds.height / lines.length,
    value: (state.phase + index / lines.length) % 1,
    text,
  }))
  return state
}
```

`lib/canvas/scenes/catalog/wall-clock.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber } from '@/lib/canvas/catalog-kit'

function hms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}

export function wallClockState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const epochMs = configNumber(config, 'epochMs', 0, 0, 8.64e15)
  state.texts = [hms(epochMs + ctx.tMs)]
  return state
}
```

`lib/canvas/scenes/catalog/countdown.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber } from '@/lib/canvas/catalog-kit'

function hms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}

export function countdownState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const remaining = configNumber(config, 'remainingMs', 0, 0, 8.64e15)
  state.texts = [hms(Math.max(0, remaining - ctx.tMs))]
  return state
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-type-time.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/catalog/kinetic-type.ts lib/canvas/scenes/catalog/split-flap.ts lib/canvas/scenes/catalog/multi-lane-marquee.ts lib/canvas/scenes/catalog/wall-clock.ts lib/canvas/scenes/catalog/countdown.ts lib/canvas/__tests__/catalog-type-time.test.ts
git commit -m "feat(canvas): add type and time catalog states"
```

---

## Catalog scene states, group 3: colour

### Task 15: gradient flow, colour field and light sweep

**Files:**
- Create: `lib/canvas/scenes/catalog/gradient-flow.ts`
- Create: `lib/canvas/scenes/catalog/color-field.ts`
- Create: `lib/canvas/scenes/catalog/light-sweep.ts`
- Test: `lib/canvas/__tests__/catalog-color.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-color.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { colorFieldState } from '@/lib/canvas/scenes/catalog/color-field'
import { gradientFlowState } from '@/lib/canvas/scenes/catalog/gradient-flow'
import { lightSweepState } from '@/lib/canvas/scenes/catalog/light-sweep'

const ctx: CatalogContext = {
  bounds: { width: 2400, height: 1200 },
  geometry: { width: 2400, height: 1200 },
  tMs: 4200,
  seed: 12,
}
const config: CatalogSceneConfig = { colors: ['#ff0000', '#00ff00', '#0000ff'], periodSec: 5, speed: 300 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['gradient-flow', gradientFlowState],
  ['color-field', colorFieldState],
  ['light-sweep', lightSweepState],
]

describe('colour catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
      expect(a.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
    })
  }
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-color.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create the colour state modules**

`lib/canvas/scenes/catalog/gradient-flow.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function gradientFlowState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 8, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 12
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `gradient:${index}`,
    x: 0,
    y: (index * ctx.bounds.height) / count,
    w: ctx.bounds.width,
    h: ctx.bounds.height / count,
    value: (Math.sin(state.phase * Math.PI * 2 + index * 0.6) + 1) / 2,
    color: colors[index % colors.length],
  }))
  state.values = state.cells.map((cell) => cell.value)
  return state
}
```

`lib/canvas/scenes/catalog/color-field.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

export function colorFieldState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 10, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(2, Math.round(configNumber(config, 'cols', 6, 2, 8))))
  const rows = Math.min(6, Math.max(2, Math.round(configNumber(config, 'rows', 4, 2, 6))))
  const gap = configNumber(config, 'gap', 4, 0, 2000)
  state.cells = gridCells(ctx, cols, rows, gap).map((cell, index) => {
    const raw = wave01(ctx.seed, index, Math.floor(ctx.tMs / cycleMs))
    const value = (raw + Math.sin(state.phase * Math.PI * 2 + index)) / 2
    return { ...cell, id: `field:${cell.id}`, value: Math.min(1, Math.max(0, value)), color: colors[index % colors.length] }
  })
  state.values = state.cells.map((cell) => cell.value)
  return state
}
```

`lib/canvas/scenes/catalog/light-sweep.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function lightSweepState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 600, 0, 4000)
  const colors = configColors(config)
  const x = fold((ctx.tMs / 1000) * speed + ctx.seed, ctx.bounds.width)
  const band = Math.max(20, ctx.bounds.width * 0.08)
  state.cells = [{
    id: 'sweep:front',
    x,
    y: 0,
    w: band,
    h: ctx.bounds.height,
    value: x / Math.max(1, ctx.bounds.width),
    color: colors[0],
  }]
  state.values = [state.cells[0].value, 1 - state.cells[0].value]
  return state
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-color.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/catalog/gradient-flow.ts lib/canvas/scenes/catalog/color-field.ts lib/canvas/scenes/catalog/light-sweep.ts lib/canvas/__tests__/catalog-color.test.ts
git commit -m "feat(canvas): add colour catalog states"
```

---

## Catalog scene states, group 4: motion geometry

### Task 16: ripples, metaballs, lissajous, flow lines and moiré

**Files:**
- Create: `lib/canvas/scenes/catalog/ripples.ts`
- Create: `lib/canvas/scenes/catalog/metaballs.ts`
- Create: `lib/canvas/scenes/catalog/lissajous.ts`
- Create: `lib/canvas/scenes/catalog/flow-lines.ts`
- Create: `lib/canvas/scenes/catalog/moire.ts`
- Test: `lib/canvas/__tests__/catalog-motion.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { flowLinesState } from '@/lib/canvas/scenes/catalog/flow-lines'
import { lissajousState } from '@/lib/canvas/scenes/catalog/lissajous'
import { metaballsState } from '@/lib/canvas/scenes/catalog/metaballs'
import { moireState } from '@/lib/canvas/scenes/catalog/moire'
import { ripplesState } from '@/lib/canvas/scenes/catalog/ripples'

const ctx: CatalogContext = {
  bounds: { width: 2400, height: 1200 },
  geometry: { width: 2400, height: 1200 },
  tMs: 7333,
  seed: 21,
}
const config: CatalogSceneConfig = { density: 12, speed: 240, periodSec: 4 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['ripples', ripplesState],
  ['metaballs', metaballsState],
  ['lissajous', lissajousState],
  ['flow-lines', flowLinesState],
  ['moire', moireState],
]

describe('motion catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
      expect(a.cells.every((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y))).toBe(true)
    })
  }
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-motion.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create the motion state modules**

`lib/canvas/scenes/catalog/ripples.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber } from '@/lib/canvas/catalog-kit'

export function ripplesState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const count = Math.min(16, Math.max(2, Math.round(configNumber(config, 'density', 8, 2, 16))))
  const maxRadius = Math.min(ctx.bounds.width, ctx.bounds.height) * 0.45
  state.cells = Array.from({ length: count }, (_, index) => {
    const value = (state.phase + index / count) % 1
    const radius = value * maxRadius
    return {
      id: `ripple:${index}`,
      x: ctx.bounds.width / 2,
      y: ctx.bounds.height / 2,
      w: radius * 2,
      h: radius * 2,
      value,
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/metaballs.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function metaballsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 9, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = Math.min(16, Math.max(3, Math.round(configNumber(config, 'density', 9, 3, 16))))
  const radius = Math.min(ctx.bounds.width, ctx.bounds.height) * 0.12
  state.cells = Array.from({ length: count }, (_, index) => {
    const a = wave01(ctx.seed, index, 0) * Math.PI * 2 + state.phase * Math.PI * 2
    const b = wave01(ctx.seed, index, 1) * Math.PI * 2 - state.phase * Math.PI * 2
    return {
      id: `meta:${index}`,
      x: ctx.bounds.width * (0.5 + 0.4 * Math.sin(a)),
      y: ctx.bounds.height * (0.5 + 0.4 * Math.cos(b)),
      w: radius * (1 + Math.sin(state.phase * Math.PI * 2 + index) * 0.3),
      h: radius * (1 + Math.cos(state.phase * Math.PI * 2 + index) * 0.3),
      value: (Math.sin(a + b) + 1) / 2,
      color: colors[index % colors.length],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/lissajous.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function lissajousState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 12, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 24
  state.cells = Array.from({ length: count }, (_, index) => {
    const t = (index / count) * Math.PI * 2 + state.phase * Math.PI * 2
    return {
      id: `lissajous:${index}`,
      x: ctx.bounds.width * (0.5 + 0.42 * Math.sin(3 * t)),
      y: ctx.bounds.height * (0.5 + 0.42 * Math.sin(2 * t)),
      w: 6,
      h: 6,
      value: index / count,
      color: colors[index % colors.length],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/flow-lines.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function flowLinesState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 180, 0, 4000)
  const count = Math.min(16, Math.max(4, Math.round(configNumber(config, 'density', 12, 4, 16))))
  state.cells = Array.from({ length: count }, (_, index) => {
    const y = ((index + 0.5) * ctx.bounds.height) / count
    const x = fold(wave01(ctx.seed, index, 0) * ctx.bounds.width + (ctx.tMs / 1000) * speed, ctx.bounds.width)
    return {
      id: `flow:${index}`,
      x,
      y,
      w: ctx.bounds.width * 0.3,
      h: 2,
      value: wave01(ctx.seed, index, 1),
      color: colors[index % colors.length],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/moire.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function moireState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 16, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 24
  const step = Math.min(ctx.bounds.width, ctx.bounds.height) / 28
  state.cells = Array.from({ length: count }, (_, index) => {
    const radius = step * (index + 1)
    return {
      id: `moire:${index}`,
      x: ctx.bounds.width / 2 + Math.sin(state.phase * Math.PI * 2) * step,
      y: ctx.bounds.height / 2,
      w: radius * 2,
      h: radius * 2,
      value: index / count,
      color: colors[index % colors.length],
    }
  })
  return state
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-motion.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/catalog/ripples.ts lib/canvas/scenes/catalog/metaballs.ts lib/canvas/scenes/catalog/lissajous.ts lib/canvas/scenes/catalog/flow-lines.ts lib/canvas/scenes/catalog/moire.ts lib/canvas/__tests__/catalog-motion.test.ts
git commit -m "feat(canvas): add motion geometry catalog states"
```

---

## Catalog scene states, group 5: particles

### Task 17: starfield, matrix rain, fireworks and bouncing balls

**Files:**
- Create: `lib/canvas/scenes/catalog/starfield.ts`
- Create: `lib/canvas/scenes/catalog/matrix-rain.ts`
- Create: `lib/canvas/scenes/catalog/fireworks.ts`
- Create: `lib/canvas/scenes/catalog/bouncing-balls.ts`
- Test: `lib/canvas/__tests__/catalog-particles.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-particles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { bouncingBallsState } from '@/lib/canvas/scenes/catalog/bouncing-balls'
import { fireworksState } from '@/lib/canvas/scenes/catalog/fireworks'
import { matrixRainState } from '@/lib/canvas/scenes/catalog/matrix-rain'
import { starfieldState } from '@/lib/canvas/scenes/catalog/starfield'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1200 },
  geometry: { width: 3000, height: 1200 },
  tMs: 9100,
  seed: 33,
}
const config: CatalogSceneConfig = { density: 24, speed: 300, periodSec: 3 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['starfield', starfieldState],
  ['matrix-rain', matrixRainState],
  ['fireworks', fireworksState],
  ['bouncing-balls', bouncingBallsState],
]

describe('particle catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('keeps balls inside the wall bounds', () => {
    const state = bouncingBallsState(config, ctx)
    for (const cell of state.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.x + cell.w).toBeLessThanOrEqual(ctx.bounds.width + 1)
      expect(cell.y + cell.h).toBeLessThanOrEqual(ctx.bounds.height + 1)
    }
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-particles.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create the particle state modules**

`lib/canvas/scenes/catalog/starfield.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function starfieldState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 40, 0, 4000)
  const count = Math.min(32, Math.max(8, Math.round(configNumber(config, 'density', 24, 8, 32))))
  state.cells = Array.from({ length: count }, (_, index) => {
    const x0 = wave01(ctx.seed, index, 0) * ctx.bounds.width
    const y0 = wave01(ctx.seed, index, 1) * ctx.bounds.height
    const size = 2 + wave01(ctx.seed, index, 2) * 6
    return {
      id: `star:${index}`,
      x: x0,
      y: fold(y0 + (ctx.tMs / 1000) * speed * (0.4 + wave01(ctx.seed, index, 3)), ctx.bounds.height),
      w: size,
      h: size,
      value: wave01(ctx.seed, index, 4),
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/matrix-rain.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

const GLYPHS = 'アイウエオカキクケコ0123456789'

export function matrixRainState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 320, 0, 4000)
  const count = Math.min(16, Math.max(4, Math.round(configNumber(config, 'density', 12, 4, 16))))
  const columnWidth = ctx.bounds.width / count
  state.cells = Array.from({ length: count }, (_, index) => {
    const drop = fold(wave01(ctx.seed, index, 0) * ctx.bounds.height + (ctx.tMs / 1000) * speed, ctx.bounds.height + 200) - 100
    const glyph = Math.floor(wave01(ctx.seed, index, Math.floor(ctx.tMs / 120)) * GLYPHS.length)
    return {
      id: `rain:${index}`,
      x: index * columnWidth,
      y: drop,
      w: columnWidth,
      h: 40,
      value: wave01(ctx.seed, index, 9),
      color: colors[index % colors.length],
      text: GLYPHS[glyph],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/fireworks.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function fireworksState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 60) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const bursts = 4
  const perBurst = 7
  state.cells = Array.from({ length: bursts * perBurst }, (_, index) => {
    const burst = Math.floor(index / perBurst)
    const particle = index % perBurst
    const angle = (particle / perBurst) * Math.PI * 2 + wave01(ctx.seed, burst, 0) * Math.PI
    const radius = state.phase * Math.min(ctx.bounds.width, ctx.bounds.height) * 0.22
    return {
      id: `firework:${burst}:${particle}`,
      x: ctx.bounds.width * wave01(ctx.seed, burst, 1) + Math.cos(angle) * radius,
      y: ctx.bounds.height * wave01(ctx.seed, burst, 2) + Math.sin(angle) * radius,
      w: 8 * (1 - state.phase * 0.5),
      h: 8 * (1 - state.phase * 0.5),
      value: 1 - state.phase,
      color: colors[burst % colors.length],
    }
  })
  return state
}
```

`lib/canvas/scenes/catalog/bouncing-balls.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function bouncingBallsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const count = Math.min(16, Math.max(2, Math.round(configNumber(config, 'density', 6, 2, 16))))
  const size = configNumber(config, 'size', 28, 4, 600)
  const rx = Math.max(1, ctx.bounds.width - size)
  const ry = Math.max(1, ctx.bounds.height - size)
  state.cells = Array.from({ length: count }, (_, index) => {
    const speed = configNumber(config, 'speed', 300, 0, 4000) * (0.6 + wave01(ctx.seed, index, 0) * 0.8)
    const angle = wave01(ctx.seed, index, 1) * Math.PI * 2
    const x = fold(wave01(ctx.seed, index, 2) * rx + Math.cos(angle) * speed * ctx.tMs / 1000, rx)
    const y = fold(wave01(ctx.seed, index, 3) * ry + Math.sin(angle) * speed * ctx.tMs / 1000, ry)
    return {
      id: `ball:${index}`,
      x,
      y,
      w: size,
      h: size,
      value: wave01(ctx.seed, index, 4),
      color: colors[index % colors.length],
    }
  })
  return state
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-particles.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/catalog/starfield.ts lib/canvas/scenes/catalog/matrix-rain.ts lib/canvas/scenes/catalog/fireworks.ts lib/canvas/scenes/catalog/bouncing-balls.ts lib/canvas/__tests__/catalog-particles.test.ts
git commit -m "feat(canvas): add particle catalog states"
```

---

## Catalog scene states, group 6: arcade and setup

### Task 18: chase lights, deterministic games and calibration

**Files:**
- Create: `lib/canvas/scenes/catalog/chase-lights.ts`
- Create: `lib/canvas/scenes/catalog/breakout.ts`
- Create: `lib/canvas/scenes/catalog/snake.ts`
- Create: `lib/canvas/scenes/catalog/sprite-parade.ts`
- Create: `lib/canvas/scenes/catalog/life.ts`
- Create: `lib/canvas/scenes/catalog/calibration.ts`
- Test: `lib/canvas/__tests__/catalog-arcade.test.ts`

- [ ] **Step 1: Write the failing group test**

Create `lib/canvas/__tests__/catalog-arcade.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { breakoutState } from '@/lib/canvas/scenes/catalog/breakout'
import { calibrationState } from '@/lib/canvas/scenes/catalog/calibration'
import { chaseLightsState } from '@/lib/canvas/scenes/catalog/chase-lights'
import { lifeState } from '@/lib/canvas/scenes/catalog/life'
import { snakeState } from '@/lib/canvas/scenes/catalog/snake'
import { spriteParadeState } from '@/lib/canvas/scenes/catalog/sprite-parade'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1500 },
  geometry: { width: 3000, height: 1500 },
  tMs: 47_000,
  seed: 41,
}
const config: CatalogSceneConfig = { speed: 30, density: 16, cols: 8, rows: 4 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['chase-lights', chaseLightsState],
  ['breakout', breakoutState],
  ['snake', snakeState],
  ['sprite-parade', spriteParadeState],
  ['life', lifeState],
  ['calibration', calibrationState],
]

describe('arcade and setup catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('replays games from round start', () => {
    for (const stateAt of [breakoutState, snakeState, spriteParadeState, lifeState]) {
      const late = stateAt(config, ctx)
      stateAt(config, { ...ctx, tMs: 1000 })
      expect(stateAt(config, ctx)).toEqual(late)
      expect(late.game).toBeDefined()
    }
  })

  it('uses the shared game replay engine', () => {
    for (const name of ['breakout', 'snake', 'sprite-parade', 'life']) {
      const source = readFileSync(path.join(process.cwd(), `lib/canvas/scenes/catalog/${name}.ts`), 'utf8')
      expect(source, name).toContain('catalogGame(')
    }
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-arcade.test.ts`

Expected: FAIL (modules not found).

- [ ] **Step 3: Create chase lights and the game state modules**

`lib/canvas/scenes/catalog/chase-lights.ts`:

```ts
import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function chaseLightsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 500, 0, 4000)
  const count = Math.min(32, Math.max(4, Math.round(configNumber(config, 'density', 16, 4, 32))))
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `chase:${index}`,
    x: fold((ctx.tMs / 1000) * speed + (index * ctx.bounds.width) / count, ctx.bounds.width),
    y: ctx.bounds.height / 2,
    w: Math.max(12, ctx.bounds.width / count / 3),
    h: Math.max(12, ctx.bounds.width / count / 3),
    value: (state.phase + index / count) % 1,
    color: colors[index % colors.length],
  }))
  return state
}
```

`lib/canvas/scenes/catalog/breakout.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function breakoutState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const size = configNumber(config, 'size', 24, 4, 200)
  const { width, height } = ctx.bounds
  const game = catalogGame(config, ctx, 'breakout',
    (seed) => ({
      x: Math.abs(seed) % Math.max(1, width - size),
      y: Math.abs(seed >> 3) % Math.max(1, height / 2),
      vx: 6 + (Math.abs(seed) % 4),
      vy: 5 + (Math.abs(seed >> 5) % 3),
      score: 0,
      stage: 0,
      cells: [],
    }),
    (previous, _tick, random) => {
      let vx = previous.vx
      let vy = previous.vy
      let x = previous.x + vx
      let y = previous.y + vy
      if (x <= 0 || x + size >= width) { vx = -vx; x = Math.max(0, Math.min(width - size, x)) }
      if (y <= 0 || y + size >= height) { vy = -vy; y = Math.max(0, Math.min(height - size, y)) }
      const paddle = Math.floor(random() * Math.max(1, width - size * 4))
      return { x, y, vx, vy, score: previous.score + (y <= 0 ? 1 : 0), stage: previous.stage, cells: [paddle] }
    },
  )
  state.game = game
  const paddleX = game.state.cells[0] ?? 0
  state.cells = [
    { id: 'breakout:ball', x: game.state.x, y: game.state.y, w: size, h: size, value: game.tick / 600, color: colors[0] },
    { id: 'breakout:paddle', x: paddleX, y: height - size * 2, w: size * 4, h: size, value: 0, color: colors[1] },
  ]
  return state
}
```

`lib/canvas/scenes/catalog/snake.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function snakeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const cols = Math.min(24, Math.max(8, Math.round(configNumber(config, 'cols', 16, 8, 24))))
  const rows = Math.min(16, Math.max(6, Math.round(configNumber(config, 'rows', 10, 6, 16))))
  const cellW = ctx.bounds.width / cols
  const cellH = ctx.bounds.height / rows
  const game = catalogGame(config, ctx, 'snake',
    (seed) => ({ x: 4, y: 4, vx: 1, vy: 0, score: 0, stage: 0, cells: [4, 4] }),
    (previous, _tick, random) => {
      let vx = previous.vx
      let vy = previous.vy
      if (random() < 0.2) { vx = -vy; vy = previous.vx }
      const x = (previous.cells[0] + vx + cols) % cols
      const y = (previous.cells[1] + vy + rows) % rows
      return { x, y, vx, vy, score: previous.score + 1, stage: previous.stage, cells: [x, y, ...previous.cells].slice(0, 16) }
    },
  )
  state.game = game
  const flat = game.state.cells
  state.cells = []
  for (let index = 0; index + 1 < flat.length; index += 2) {
    state.cells.push({
      id: `snake:${index / 2}`,
      x: flat[index] * cellW,
      y: flat[index + 1] * cellH,
      w: cellW,
      h: cellH,
      value: index / Math.max(2, flat.length),
      color: colors[(index / 2) % colors.length],
    })
  }
  return state
}
```

`lib/canvas/scenes/catalog/sprite-parade.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configImages, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function spriteParadeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const images = configImages(config)
  const count = Math.min(8, Math.max(2, Math.round(configNumber(config, 'density', 6, 2, 8))))
  const game = catalogGame(config, ctx, 'sprite-parade',
    (seed) => ({
      x: 0, y: 0, vx: 8, vy: 0, score: 0, stage: 0,
      cells: Array.from({ length: count }, (_, index) => Math.floor(wave01(seed, index, 0) * ctx.bounds.height)),
    }),
    (previous) => ({
      ...previous,
      x: previous.x + previous.vx,
      cells: previous.cells.map((y, index) => (y + 2 + index) % Math.max(1, ctx.bounds.height)),
    }),
  )
  state.game = game
  const size = configNumber(config, 'size', 90, 16, 600)
  state.cells = game.state.cells.map((y, index) => ({
    id: `sprite:${index}`,
    x: (game.state.x + index * (ctx.bounds.width / count)) % ctx.bounds.width,
    y,
    w: size,
    h: size,
    value: index / count,
    image: images[index % Math.max(1, images.length)],
  }))
  return state
}
```

`lib/canvas/scenes/catalog/life.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

export function lifeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(2, Math.round(configNumber(config, 'cols', 8, 2, 8))))
  const rows = Math.min(4, Math.max(2, Math.round(configNumber(config, 'rows', 4, 2, 4))))
  const game = catalogGame(config, ctx, 'life',
    (seed) => ({
      x: 0, y: 0, vx: 0, vy: 0, score: 0, stage: 0,
      cells: Array.from({ length: cols * rows }, (_, index) => wave01(seed, index, 0) > 0.5 ? 1 : 0),
    }),
    (previous) => {
      const cells = previous.cells.map((_, index) => {
        const x = index % cols
        const y = Math.floor(index / cols)
        let alive = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = (x + dx + cols) % cols
            const ny = (y + dy + rows) % rows
            alive += previous.cells[ny * cols + nx] ?? 0
          }
        }
        const current = previous.cells[index] ?? 0
        return alive === 3 || (current === 1 && alive === 2) ? 1 : 0
      })
      return { ...previous, cells, score: cells.reduce((sum, value) => sum + value, 0) }
    },
  )
  state.game = game
  state.cells = gridCells(ctx, cols, rows, 0).map((cell, index) => ({
    ...cell,
    id: `life:${cell.id}`,
    value: game.state.cells[index] ?? 0,
    color: colors[index % colors.length],
  }))
  return state
}
```

`lib/canvas/scenes/catalog/calibration.ts`:

```ts
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function calibrationState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  state.cells = gridCells(ctx, 8, 4, 0).map((cell, index) => ({
    ...cell,
    id: `calibration:${cell.id}`,
    value: index === 0 ? 1 : 0,
    color: colors[index % colors.length],
  }))
  state.texts = [`${Math.round(ctx.bounds.width)} × ${Math.round(ctx.bounds.height)} cpx`]
  state.values = [configNumber(config, 'opacity', 1, 0.05, 1)]
  return state
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-arcade.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/catalog/chase-lights.ts lib/canvas/scenes/catalog/breakout.ts lib/canvas/scenes/catalog/snake.ts lib/canvas/scenes/catalog/sprite-parade.ts lib/canvas/scenes/catalog/life.ts lib/canvas/scenes/catalog/calibration.ts lib/canvas/__tests__/catalog-arcade.test.ts
git commit -m "feat(canvas): add arcade and calibration catalog states"
```

---

## Catalog draw commands and renderer registry

### Task 19: pure draw commands for every catalog scene

**Files:**
- Create: `lib/canvas/catalog-draw.ts`
- Test: `lib/canvas/__tests__/catalog-draw.test.ts`

- [ ] **Step 1: Write the failing draw test**

Create `lib/canvas/__tests__/catalog-draw.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES, type CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'

const ref = `canvas-asset:${'a'.repeat(64)}`

function model(type: (typeof CATALOG_TYPES)[number]): CatalogSceneRenderState {
  return {
    type,
    config: { colors: ['#ff0000', '#00ff00'], images: [ref], text: 'WALL', lines: ['A', 'B'] },
    state: {
      tMs: 1000,
      cycleMs: 2000,
      phase: 0.5,
      values: [0.25, 0.75],
      texts: ['12:00:00'],
      images: [ref],
      cells: [{
        id: 'cell', x: 10, y: 20, w: 100, h: 60, value: 0.5,
        color: '#ff0000', text: 'A', image: ref,
      }],
    },
  }
}

describe('catalogDraw', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} emits at most 40 deterministic commands`, () => {
      const commands = catalogDraw(model(type))
      expect(commands.length).toBeGreaterThan(0)
      expect(commands.length).toBeLessThanOrEqual(40)
      expect(catalogDraw(model(type))).toEqual(commands)
    })
  }

  it('never emits a media URL', () => {
    expect(JSON.stringify(catalogDraw(model('panorama')))).not.toContain('/api/media')
    expect(JSON.stringify(catalogDraw(model('panorama')))).toContain('/api/canvas/assets/')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/catalog-draw.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/catalog-draw.ts`**

```ts
import { canvasAssetUrl, parseCanvasAssetRef } from '@/lib/canvas/asset-refs'
import type { DrawCommand } from '@/lib/canvas/draw'
import {
  CATALOG_DEFAULT_COLORS,
  type CatalogCell,
  type CatalogSceneRenderState,
} from '@/lib/canvas/catalog-kit'

function palette(model: CatalogSceneRenderState): string[] {
  return model.config.colors?.length ? model.config.colors : CATALOG_DEFAULT_COLORS
}

function colorFor(model: CatalogSceneRenderState, cell: CatalogCell, index: number): string {
  return cell.color ?? palette(model)[index % palette(model).length]
}

function imageSrc(ref: string | undefined): string | null {
  const hash = parseCanvasAssetRef(ref)
  return hash ? canvasAssetUrl(hash) : null
}

function rectCells(model: CatalogSceneRenderState, cells: CatalogCell[], useImages = false): DrawCommand[] {
  return cells.map((cell, index) => {
    const src = useImages ? imageSrc(cell.image) : null
    if (src) {
      return { kind: 'image', src, x: cell.x, y: cell.y, w: cell.w, h: cell.h, fit: 'cover' }
    }
    return {
      kind: 'rect', x: cell.x, y: cell.y, w: cell.w, h: cell.h,
      fill: colorFor(model, cell, index),
      opacity: 0.35 + cell.value * 0.65,
    }
  })
}

function circleCells(model: CatalogSceneRenderState, cells: CatalogCell[]): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'circle',
    x: cell.x + cell.w / 2,
    y: cell.y + cell.h / 2,
    r: Math.max(0, cell.w / 2),
    stroke: colorFor(model, cell, index),
    lineWidth: Math.max(1, Math.min(8, cell.w / 20)),
    opacity: 0.25 + cell.value * 0.75,
  }))
}

function lineCells(model: CatalogSceneRenderState, cells: CatalogCell[]): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'line',
    x1: cell.x,
    y1: cell.y,
    x2: cell.x + cell.w,
    y2: cell.y + cell.h,
    color: colorFor(model, cell, index),
    width: Math.max(1, cell.h),
    opacity: 0.4 + cell.value * 0.6,
  }))
}

function textCells(model: CatalogSceneRenderState, cells: CatalogCell[]): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'text',
    text: cell.text ?? ' ',
    x: cell.x + cell.w / 2,
    y: cell.y + cell.h / 2,
    fontFamily: model.config.fontFamily ?? 'mono',
    fontSize: model.config.fontSize ?? Math.max(16, Math.min(180, cell.h * 0.7)),
    color: colorFor(model, cell, index),
    align: 'center',
    baseline: 'middle',
    opacity: 0.5 + cell.value * 0.5,
  }))
}

function labels(model: CatalogSceneRenderState): DrawCommand[] {
  const color = palette(model)[0]
  const size = model.config.fontSize ?? 96
  return model.state.texts.slice(0, 4).map((text, index) => ({
    kind: 'text' as const,
    text,
    x: 100,
    y: 120 + index * (size + 20),
    fontFamily: model.config.fontFamily ?? 'mono',
    fontSize: size,
    color,
  }))
}

function background(model: CatalogSceneRenderState): DrawCommand {
  const colors = palette(model)
  return {
    kind: 'gradient',
    x: 0,
    y: 0,
    w: 100000,
    h: 100000,
    colors: [colors[colors.length - 1] ?? '#000000', '#000000'],
    angleDeg: model.config.angle ?? 0,
  }
}

export function catalogDraw(model: CatalogSceneRenderState): DrawCommand[] {
  const cells = model.state.cells.slice(0, 38)
  let body: DrawCommand[] = []

  switch (model.type) {
    case 'panorama':
    case 'gallery-wall':
      body = rectCells(model, cells, true)
      break
    case 'exhibit':
      body = [...rectCells(model, cells, true), ...labels(model)]
      break
    case 'mosaic-wall':
    case 'tile-reveal':
      body = rectCells(model, cells, true)
      break
    case 'kinetic-type':
    case 'split-flap':
    case 'multi-lane-marquee':
    case 'matrix-rain':
      body = textCells(model, cells)
      break
    case 'wall-clock':
    case 'countdown':
      body = labels(model)
      break
    case 'gradient-flow':
      body = [
        { kind: 'gradient', x: 0, y: 0, w: 100000, h: 100000, colors: palette(model), angleDeg: model.config.angle ?? 0 },
        ...rectCells(model, cells),
      ]
      break
    case 'color-field':
      body = rectCells(model, cells)
      break
    case 'light-sweep':
      body = [
        { kind: 'gradient', x: 0, y: 0, w: 100000, h: 100000, colors: palette(model), angleDeg: 0 },
        ...rectCells(model, cells),
      ]
      break
    case 'ripples':
    case 'metaballs':
    case 'moire':
    case 'starfield':
    case 'fireworks':
    case 'bouncing-balls':
    case 'chase-lights':
      body = circleCells(model, cells)
      break
    case 'lissajous':
    case 'flow-lines':
      body = lineCells(model, cells)
      break
    case 'breakout':
    case 'snake':
    case 'sprite-parade':
    case 'life':
      body = rectCells(model, cells, model.type === 'sprite-parade')
      break
    case 'calibration':
      body = [...rectCells(model, cells), ...labels(model)]
      break
  }

  return [background(model), ...body].slice(0, 40)
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-draw.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/catalog-draw.ts lib/canvas/__tests__/catalog-draw.test.ts
git commit -m "feat(canvas): draw all catalog scenes as pure commands"
```

---

### Task 20: one renderer file per catalog scene

**Files:**
- Create: `components/frame/canvas/catalog-scene.tsx`
- Create: `components/frame/canvas/scenes/panorama.tsx`
- Create: `components/frame/canvas/scenes/gallery-wall.tsx`
- Create: `components/frame/canvas/scenes/exhibit.tsx`
- Create: `components/frame/canvas/scenes/mosaic-wall.tsx`
- Create: `components/frame/canvas/scenes/tile-reveal.tsx`
- Create: `components/frame/canvas/scenes/kinetic-type.tsx`
- Create: `components/frame/canvas/scenes/split-flap.tsx`
- Create: `components/frame/canvas/scenes/multi-lane-marquee.tsx`
- Create: `components/frame/canvas/scenes/wall-clock.tsx`
- Create: `components/frame/canvas/scenes/countdown.tsx`
- Create: `components/frame/canvas/scenes/gradient-flow.tsx`
- Create: `components/frame/canvas/scenes/color-field.tsx`
- Create: `components/frame/canvas/scenes/light-sweep.tsx`
- Create: `components/frame/canvas/scenes/ripples.tsx`
- Create: `components/frame/canvas/scenes/metaballs.tsx`
- Create: `components/frame/canvas/scenes/lissajous.tsx`
- Create: `components/frame/canvas/scenes/flow-lines.tsx`
- Create: `components/frame/canvas/scenes/moire.tsx`
- Create: `components/frame/canvas/scenes/starfield.tsx`
- Create: `components/frame/canvas/scenes/matrix-rain.tsx`
- Create: `components/frame/canvas/scenes/fireworks.tsx`
- Create: `components/frame/canvas/scenes/bouncing-balls.tsx`
- Create: `components/frame/canvas/scenes/chase-lights.tsx`
- Create: `components/frame/canvas/scenes/breakout.tsx`
- Create: `components/frame/canvas/scenes/snake.tsx`
- Create: `components/frame/canvas/scenes/sprite-parade.tsx`
- Create: `components/frame/canvas/scenes/life.tsx`
- Create: `components/frame/canvas/scenes/calibration.tsx`
- Test: `tests/catalog-renderers.test.ts`

- [ ] **Step 1: Write the failing renderer test**

Create `tests/catalog-renderers.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'

describe('catalog renderers', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} has its own renderer file`, () => {
      const file = path.join(process.cwd(), 'components/frame/canvas/scenes', `${type}.tsx`)
      expect(existsSync(file)).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('CatalogScene')
      expect(source).toContain('export function')
    })
  }
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/catalog-renderers.test.ts`

Expected: FAIL (files not found).

- [ ] **Step 3: Create the shared catalog renderer**

`components/frame/canvas/catalog-scene.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { Canvas2DLayer } from '@/components/frame/canvas/canvas-2d-layer'
import type { CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'

export type CatalogSlot = { x: number; y: number; w: number; h: number; rotation?: 0 | 90 | 180 | 270 }

export type CatalogRendererProps = {
  model: CatalogSceneRenderState
  slot: CatalogSlot
}

export function CatalogScene({ model, slot }: CatalogRendererProps) {
  const commands = useMemo(() => catalogDraw(model), [model])
  return <Canvas2DLayer commands={commands} slot={slot} />
}
```

- [ ] **Step 4: Create the gallery and type renderer files**

For each file below, create the exact shown content.

`components/frame/canvas/scenes/panorama.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function PanoramaRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/gallery-wall.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function GalleryWallRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/exhibit.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function ExhibitRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/mosaic-wall.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function MosaicWallRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/tile-reveal.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function TileRevealRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/kinetic-type.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function KineticTypeRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/split-flap.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function SplitFlapRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/multi-lane-marquee.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function MultiLaneMarqueeRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/wall-clock.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function WallClockRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/countdown.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function CountdownRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/gradient-flow.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function GradientFlowRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/color-field.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function ColorFieldRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/light-sweep.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function LightSweepRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

- [ ] **Step 5: Create the motion, particle, arcade and setup renderer files**

`components/frame/canvas/scenes/ripples.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function RipplesRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/metaballs.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function MetaballsRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/lissajous.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function LissajousRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/flow-lines.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function FlowLinesRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/moire.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function MoireRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/starfield.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function StarfieldRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/matrix-rain.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function MatrixRainRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/fireworks.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function FireworksRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/bouncing-balls.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function BouncingBallsRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/chase-lights.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function ChaseLightsRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/breakout.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function BreakoutRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/snake.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function SnakeRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/sprite-parade.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function SpriteParadeRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/life.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function LifeRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

`components/frame/canvas/scenes/calibration.tsx`:

```tsx
import { CatalogScene, type CatalogRendererProps } from '@/components/frame/canvas/catalog-scene'
export function CalibrationRenderer(props: CatalogRendererProps) { return <CatalogScene {...props} /> }
```

- [ ] **Step 6: Run the tests and typecheck**

Run:

```bash
pnpm vitest run tests/catalog-renderers.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/frame/canvas/catalog-scene.tsx components/frame/canvas/scenes tests/catalog-renderers.test.ts
git commit -m "feat(canvas): add one renderer per catalog scene"
```

---

### Task 21: register the full catalog and dispatch per-scene renderers

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/canvas/scenes/fields.ts`
- Modify: `lib/canvas/scenes/registry.ts`
- Modify: `components/frame/canvas/canvas-frame-scene.tsx`
- Test: `lib/canvas/__tests__/registry-catalog.test.ts`

- [ ] **Step 1: Write the failing registry test**

Create `lib/canvas/__tests__/registry-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { SCENE_FIELDS } from '@/lib/canvas/scenes/fields'
import { computeSceneState, defaultScene, SCENE_META } from '@/lib/canvas/scenes/registry'
import type { CanvasConfig } from '@/lib/types'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}
const geometry = resolveGeometry(config)
const ctx = {
  bounds: { width: geometry.width, height: geometry.height },
  geometry,
  tMs: 1234,
  seed: 5,
}

describe('catalog registry', () => {
  it('has metadata, defaults and state for all 28 catalog scenes', () => {
    for (const type of CATALOG_TYPES) {
      expect(SCENE_META[type], type).toBeDefined()
      expect(SCENE_FIELDS[type], type).toBeDefined()
      expect(SCENE_FIELDS[type].some((field) => field.key === 'images'), type).toBe(true)
      const scene = defaultScene(type, geometry)
      expect(scene.type).toBe(type)
      const state = computeSceneState(scene, ctx)
      expect(state.type).toBe(type)
      expect(computeSceneState(scene, ctx)).toEqual(state)
    }
  })

  it('keeps the phase 1 sync-test scene intact', () => {
    const scene = defaultScene('sync-test', geometry)
    expect(scene.type).toBe('sync-test')
    expect(computeSceneState(scene, ctx).type).toBe('sync-test')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/registry-catalog.test.ts`

Expected: FAIL (catalog types absent from the registry).

- [ ] **Step 3: Extend the central scene union in `lib/types.ts`**

Add this import at the top:

```ts
import type { CatalogSceneConfig, CatalogSceneType } from '@/lib/canvas/catalog-kit'
```

Replace the existing `CanvasSceneType` line with:

```ts
export type CanvasSceneType = 'marquee' | 'bounce' | 'pong' | 'sync-test' | CatalogSceneType
```

Replace the existing `CanvasScene` union with:

```ts
export type CanvasScene =
  | (CanvasSceneBase & { type: 'marquee'; config: MarqueeConfig })
  | (CanvasSceneBase & { type: 'bounce'; config: BounceConfig })
  | (CanvasSceneBase & { type: 'pong'; config: PongConfig })
  | (CanvasSceneBase & { type: 'sync-test'; config: SyncTestConfig })
  | (CanvasSceneBase & { type: CatalogSceneType; config: CatalogSceneConfig })
```

- [ ] **Step 4: Extend `lib/canvas/scenes/fields.ts` for the catalog**

Add this constant before `SCENE_FIELDS`:

```ts
const CATALOG_FIELDS: SceneField[] = [
  { key: 'text', label: 'Text', kind: 'text', maxLength: 200, placeholder: 'Hello, wall' },
  { key: 'lines', label: 'Text lines', kind: 'lines', maxLines: 12, maxLength: 120 },
  { key: 'images', label: 'Canvas asset refs', kind: 'lines', maxLines: 40, maxLength: 100, help: 'One canvas-asset:<sha256> ref per line. Upload images from Canvas extras.' },
  { key: 'colors', label: 'Colours', kind: 'lines', maxLines: 12, maxLength: 7 },
  { key: 'speed', label: 'Speed', kind: 'number', min: 0, max: 4000, step: 10 },
  { key: 'density', label: 'Density', kind: 'number', min: 1, max: 400, step: 1 },
  { key: 'scale', label: 'Scale', kind: 'number', min: 0.1, max: 10, step: 0.1 },
  { key: 'cols', label: 'Columns', kind: 'number', min: 1, max: 40, step: 1 },
  { key: 'rows', label: 'Rows', kind: 'number', min: 1, max: 40, step: 1 },
  { key: 'gap', label: 'Gap', kind: 'number', min: 0, max: 2000, step: 2 },
  { key: 'size', label: 'Element size', kind: 'number', min: 4, max: 600, step: 4 },
  { key: 'angle', label: 'Angle', kind: 'number', min: -360, max: 360, step: 5 },
  { key: 'periodSec', label: 'Period (seconds)', kind: 'number', min: 0.5, max: 3600, step: 0.5 },
  { key: 'tileMs', label: 'Tile interval (ms)', kind: 'number', min: 100, max: 60000, step: 100 },
  { key: 'epochMs', label: 'Clock epoch (ms)', kind: 'number', min: 0, max: 8640000000000000, step: 1000 },
  { key: 'remainingMs', label: 'Countdown (ms)', kind: 'number', min: 0, max: 8640000000000000, step: 1000 },
  { key: 'fontFamily', label: 'Font', kind: 'text', maxLength: 40 },
  { key: 'fontSize', label: 'Font size', kind: 'number', min: 8, max: 500, step: 4 },
  { key: 'opacity', label: 'Opacity', kind: 'number', min: 0.05, max: 1, step: 0.05 },
  { key: 'reversed', label: 'Reversed', kind: 'toggle' },
  { key: 'trail', label: 'Trails', kind: 'toggle' },
]
```

Replace the final `}` of `SCENE_FIELDS` with one entry per catalog type, each pointing at `CATALOG_FIELDS`:

```ts
  panorama: CATALOG_FIELDS,
  'gallery-wall': CATALOG_FIELDS,
  exhibit: CATALOG_FIELDS,
  'mosaic-wall': CATALOG_FIELDS,
  'tile-reveal': CATALOG_FIELDS,
  'kinetic-type': CATALOG_FIELDS,
  'split-flap': CATALOG_FIELDS,
  'multi-lane-marquee': CATALOG_FIELDS,
  'wall-clock': CATALOG_FIELDS,
  countdown: CATALOG_FIELDS,
  'gradient-flow': CATALOG_FIELDS,
  'color-field': CATALOG_FIELDS,
  'light-sweep': CATALOG_FIELDS,
  ripples: CATALOG_FIELDS,
  metaballs: CATALOG_FIELDS,
  lissajous: CATALOG_FIELDS,
  'flow-lines': CATALOG_FIELDS,
  moire: CATALOG_FIELDS,
  starfield: CATALOG_FIELDS,
  'matrix-rain': CATALOG_FIELDS,
  fireworks: CATALOG_FIELDS,
  'bouncing-balls': CATALOG_FIELDS,
  'chase-lights': CATALOG_FIELDS,
  breakout: CATALOG_FIELDS,
  snake: CATALOG_FIELDS,
  'sprite-parade': CATALOG_FIELDS,
  life: CATALOG_FIELDS,
  calibration: CATALOG_FIELDS,
}
```

The `images` field accepts only `canvas-asset:` strings; it never uses the `image` field kind because that writes inline data URIs.

- [ ] **Step 5: Extend `lib/canvas/scenes/registry.ts` imports and metadata**

Replace the lucide import with:

```ts
import {
  Atom,
  Bug,
  CircleDot,
  Columns3,
  Crosshair,
  Gamepad2,
  Grid2X2Check,
  Grid3X3,
  Images,
  Orbit,
  Palette,
  ScanLine,
  Sparkles,
  Spline,
  Target,
  Timer,
  Type,
  Waves,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react'
```

Add these imports:

```ts
import { CATALOG_TYPES, type CatalogSceneConfig, type CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { panoramaState } from './catalog/panorama'
import { galleryWallState } from './catalog/gallery-wall'
import { exhibitState } from './catalog/exhibit'
import { mosaicWallState } from './catalog/mosaic-wall'
import { tileRevealState } from './catalog/tile-reveal'
import { kineticTypeState } from './catalog/kinetic-type'
import { splitFlapState } from './catalog/split-flap'
import { multiLaneMarqueeState } from './catalog/multi-lane-marquee'
import { wallClockState } from './catalog/wall-clock'
import { countdownState } from './catalog/countdown'
import { gradientFlowState } from './catalog/gradient-flow'
import { colorFieldState } from './catalog/color-field'
import { lightSweepState } from './catalog/light-sweep'
import { ripplesState } from './catalog/ripples'
import { metaballsState } from './catalog/metaballs'
import { lissajousState } from './catalog/lissajous'
import { flowLinesState } from './catalog/flow-lines'
import { moireState } from './catalog/moire'
import { starfieldState } from './catalog/starfield'
import { matrixRainState } from './catalog/matrix-rain'
import { fireworksState } from './catalog/fireworks'
import { bouncingBallsState } from './catalog/bouncing-balls'
import { chaseLightsState } from './catalog/chase-lights'
import { breakoutState } from './catalog/breakout'
import { snakeState } from './catalog/snake'
import { spriteParadeState } from './catalog/sprite-parade'
import { lifeState } from './catalog/life'
import { calibrationState } from './catalog/calibration'
```

Replace `SCENE_META` with the full record:

```ts
export const SCENE_META: Record<CanvasSceneType, SceneMeta> = {
  marquee: { label: 'Marquee', description: 'Scrolling text that crosses every bezel', icon: Type },
  bounce: { label: 'Bounce', description: 'A logo that bounces around the whole wall', icon: CircleDot },
  pong: { label: 'Pong', description: 'A scripted rally that spans the wall', icon: Gamepad2 },
  'sync-test': { label: 'Sync test', description: 'Sweep bar, grid and slot labels for calibration', icon: Crosshair },
  panorama: { label: 'Panorama', description: 'Images stretched across the whole wall', icon: Images },
  'gallery-wall': { label: 'Gallery wall', description: 'A deterministic grid of gallery images', icon: Grid3X3 },
  exhibit: { label: 'Exhibit', description: 'A single centred image with a caption', icon: Images },
  'mosaic-wall': { label: 'Mosaic wall', description: 'Shuffled tiles from the shared mosaic engine', icon: Grid2X2Check },
  'tile-reveal': { label: 'Tile reveal', description: 'Tiles open in seeded groups', icon: Sparkles },
  'kinetic-type': { label: 'Kinetic type', description: 'Large letters that drift in waves', icon: Type },
  'split-flap': { label: 'Split flap', description: 'Flap-board letters that flip in place', icon: Columns3 },
  'multi-lane-marquee': { label: 'Multi-lane marquee', description: 'Several independent marquee lanes', icon: Columns3 },
  'wall-clock': { label: 'Wall clock', description: 'A deterministic wall clock from a configured epoch', icon: Timer },
  countdown: { label: 'Countdown', description: 'A seeded countdown to zero', icon: Timer },
  'gradient-flow': { label: 'Gradient flow', description: 'Flowing colour bands across the wall', icon: Palette },
  'color-field': { label: 'Colour field', description: 'A slowly changing colour grid', icon: Grid3X3 },
  'light-sweep': { label: 'Light sweep', description: 'A bright band sweeping the wall', icon: ScanLine },
  ripples: { label: 'Ripples', description: 'Concentric rings from the wall centre', icon: CircleDot },
  metaballs: { label: 'Metaballs', description: 'Soft circles moving on seeded orbits', icon: Atom },
  lissajous: { label: 'Lissajous', description: 'Parametric curves across the wall', icon: Spline },
  'flow-lines': { label: 'Flow lines', description: 'Streamlines drifting across the wall', icon: Waypoints },
  moire: { label: 'Moiré', description: 'Overlapping rings that create interference', icon: Orbit },
  starfield: { label: 'Starfield', description: 'A slow star field', icon: Sparkles },
  'matrix-rain': { label: 'Matrix rain', description: 'Columns of seeded glyphs', icon: Waves },
  fireworks: { label: 'Fireworks', description: 'Seeded bursts of particles', icon: Zap },
  'bouncing-balls': { label: 'Bouncing balls', description: 'Analytic bouncing circles', icon: CircleDot },
  'chase-lights': { label: 'Chase lights', description: 'A running chain of lights', icon: Zap },
  breakout: { label: 'Breakout', description: 'A bounded deterministic breakout replay', icon: Gamepad2 },
  snake: { label: 'Snake', description: 'A bounded deterministic snake replay', icon: Bug },
  'sprite-parade': { label: 'Sprite parade', description: 'Sprites crossing the wall in a loop', icon: Gamepad2 },
  life: { label: 'Life', description: 'A bounded cellular automata replay', icon: Grid3X3 },
  calibration: { label: 'Calibration', description: 'Setup grid, crosshair and wall dimensions', icon: Target },
}
```

- [ ] **Step 6: Add catalog state dispatch to the registry**

Add to `SceneRenderState`:

```ts
  | CatalogSceneRenderState
```

Add this state map after `TEXT_STYLE`:

```ts
const catalogStateAt: Record<
  (typeof CATALOG_TYPES)[number],
  (config: CatalogSceneConfig, ctx: SceneStateContext) => CatalogSceneRenderState['state']
> = {
  panorama: panoramaState,
  'gallery-wall': galleryWallState,
  exhibit: exhibitState,
  'mosaic-wall': mosaicWallState,
  'tile-reveal': tileRevealState,
  'kinetic-type': kineticTypeState,
  'split-flap': splitFlapState,
  'multi-lane-marquee': multiLaneMarqueeState,
  'wall-clock': wallClockState,
  countdown: countdownState,
  'gradient-flow': gradientFlowState,
  'color-field': colorFieldState,
  'light-sweep': lightSweepState,
  ripples: ripplesState,
  metaballs: metaballsState,
  lissajous: lissajousState,
  'flow-lines': flowLinesState,
  moire: moireState,
  starfield: starfieldState,
  'matrix-rain': matrixRainState,
  fireworks: fireworksState,
  'bouncing-balls': bouncingBallsState,
  'chase-lights': chaseLightsState,
  breakout: breakoutState,
  snake: snakeState,
  'sprite-parade': spriteParadeState,
  life: lifeState,
  calibration: calibrationState,
}

const CATALOG_DEFAULT_CONFIG: CatalogSceneConfig = {
  text: 'Hello, wall',
  lines: ['Hello, wall', 'Synced across every frame'],
  colors: ['#7cc4ff', '#e879f9', '#facc15', '#22c55e'],
  speed: 240,
  density: 12,
  scale: 0.7,
  cols: 6,
  rows: 4,
  gap: 8,
  size: 48,
  angle: 0,
  periodSec: 4,
  fontFamily: 'mono',
  fontSize: 96,
  epochMs: 0,
  remainingMs: 300000,
  tileMs: 1000,
  reversed: false,
  trail: true,
  opacity: 1,
}
```

In `defaultScene`, insert before the final sync-test config:

```ts
  if ((CATALOG_TYPES as readonly string[]).includes(type)) {
    const config: CatalogSceneConfig = { ...CATALOG_DEFAULT_CONFIG }
    return { ...base, type: type as CatalogSceneType, durationSec: 60, config }
  }
```

Replace `computeSceneState` with:

```ts
export function computeSceneState(scene: CanvasScene, ctx: SceneStateContext): SceneRenderState {
  switch (scene.type) {
    case 'marquee':
      return { type: 'marquee', config: scene.config, state: marqueeState(scene.config, ctx) }
    case 'bounce':
      return { type: 'bounce', config: scene.config, state: bounceState(scene.config, ctx) }
    case 'pong':
      return { type: 'pong', config: scene.config, state: pongState(scene.config, ctx) }
    case 'sync-test':
      return { type: 'sync-test', config: scene.config, state: syncTestState(scene.config, ctx) }
    case 'panorama':
    case 'gallery-wall':
    case 'exhibit':
    case 'mosaic-wall':
    case 'tile-reveal':
    case 'kinetic-type':
    case 'split-flap':
    case 'multi-lane-marquee':
    case 'wall-clock':
    case 'countdown':
    case 'gradient-flow':
    case 'color-field':
    case 'light-sweep':
    case 'ripples':
    case 'metaballs':
    case 'lissajous':
    case 'flow-lines':
    case 'moire':
    case 'starfield':
    case 'matrix-rain':
    case 'fireworks':
    case 'bouncing-balls':
    case 'chase-lights':
    case 'breakout':
    case 'snake':
    case 'sprite-parade':
    case 'life':
    case 'calibration':
      return { type: scene.type, config: scene.config, state: catalogStateAt[scene.type](scene.config, ctx) }
    default: {
      const exhaustive: never = scene
      return exhaustive
    }
  }
}
```

- [ ] **Step 7: Dispatch catalog scenes in `components/frame/canvas/canvas-frame-scene.tsx`**

Add these imports:

```tsx
import { CATALOG_TYPES, type CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { PanoramaRenderer } from '@/components/frame/canvas/scenes/panorama'
import { GalleryWallRenderer } from '@/components/frame/canvas/scenes/gallery-wall'
import { ExhibitRenderer } from '@/components/frame/canvas/scenes/exhibit'
import { MosaicWallRenderer } from '@/components/frame/canvas/scenes/mosaic-wall'
import { TileRevealRenderer } from '@/components/frame/canvas/scenes/tile-reveal'
import { KineticTypeRenderer } from '@/components/frame/canvas/scenes/kinetic-type'
import { SplitFlapRenderer } from '@/components/frame/canvas/scenes/split-flap'
import { MultiLaneMarqueeRenderer } from '@/components/frame/canvas/scenes/multi-lane-marquee'
import { WallClockRenderer } from '@/components/frame/canvas/scenes/wall-clock'
import { CountdownRenderer } from '@/components/frame/canvas/scenes/countdown'
import { GradientFlowRenderer } from '@/components/frame/canvas/scenes/gradient-flow'
import { ColorFieldRenderer } from '@/components/frame/canvas/scenes/color-field'
import { LightSweepRenderer } from '@/components/frame/canvas/scenes/light-sweep'
import { RipplesRenderer } from '@/components/frame/canvas/scenes/ripples'
import { MetaballsRenderer } from '@/components/frame/canvas/scenes/metaballs'
import { LissajousRenderer } from '@/components/frame/canvas/scenes/lissajous'
import { FlowLinesRenderer } from '@/components/frame/canvas/scenes/flow-lines'
import { MoireRenderer } from '@/components/frame/canvas/scenes/moire'
import { StarfieldRenderer } from '@/components/frame/canvas/scenes/starfield'
import { MatrixRainRenderer } from '@/components/frame/canvas/scenes/matrix-rain'
import { FireworksRenderer } from '@/components/frame/canvas/scenes/fireworks'
import { BouncingBallsRenderer } from '@/components/frame/canvas/scenes/bouncing-balls'
import { ChaseLightsRenderer } from '@/components/frame/canvas/scenes/chase-lights'
import { BreakoutRenderer } from '@/components/frame/canvas/scenes/breakout'
import { SnakeRenderer } from '@/components/frame/canvas/scenes/snake'
import { SpriteParadeRenderer } from '@/components/frame/canvas/scenes/sprite-parade'
import { LifeRenderer } from '@/components/frame/canvas/scenes/life'
import { CalibrationRenderer } from '@/components/frame/canvas/scenes/calibration'
```

Add this helper before `CanvasFrameScene`:

```tsx
function catalogRenderer(model: CatalogSceneRenderState, slot: ResolvedSlot): ReactNode {
  const props = { model, slot: { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: slot.rotation } }
  switch (model.type) {
    case 'panorama': return <PanoramaRenderer {...props} />
    case 'gallery-wall': return <GalleryWallRenderer {...props} />
    case 'exhibit': return <ExhibitRenderer {...props} />
    case 'mosaic-wall': return <MosaicWallRenderer {...props} />
    case 'tile-reveal': return <TileRevealRenderer {...props} />
    case 'kinetic-type': return <KineticTypeRenderer {...props} />
    case 'split-flap': return <SplitFlapRenderer {...props} />
    case 'multi-lane-marquee': return <MultiLaneMarqueeRenderer {...props} />
    case 'wall-clock': return <WallClockRenderer {...props} />
    case 'countdown': return <CountdownRenderer {...props} />
    case 'gradient-flow': return <GradientFlowRenderer {...props} />
    case 'color-field': return <ColorFieldRenderer {...props} />
    case 'light-sweep': return <LightSweepRenderer {...props} />
    case 'ripples': return <RipplesRenderer {...props} />
    case 'metaballs': return <MetaballsRenderer {...props} />
    case 'lissajous': return <LissajousRenderer {...props} />
    case 'flow-lines': return <FlowLinesRenderer {...props} />
    case 'moire': return <MoireRenderer {...props} />
    case 'starfield': return <StarfieldRenderer {...props} />
    case 'matrix-rain': return <MatrixRainRenderer {...props} />
    case 'fireworks': return <FireworksRenderer {...props} />
    case 'bouncing-balls': return <BouncingBallsRenderer {...props} />
    case 'chase-lights': return <ChaseLightsRenderer {...props} />
    case 'breakout': return <BreakoutRenderer {...props} />
    case 'snake': return <SnakeRenderer {...props} />
    case 'sprite-parade': return <SpriteParadeRenderer {...props} />
    case 'life': return <LifeRenderer {...props} />
    case 'calibration': return <CalibrationRenderer {...props} />
  }
}
```

In `CanvasFrameScene`, add before the existing switch:

```tsx
  if ((CATALOG_TYPES as readonly string[]).includes(model.type)) {
    return catalogRenderer(model as CatalogSceneRenderState, slot)
  }
```

In `paintScene`, add as the first statement:

```ts
  if ((CATALOG_TYPES as readonly string[]).includes(model.type)) return
```

Catalog scenes are painted by `Canvas2DLayer`; they do not use the Phase 1 DOM element pools.

- [ ] **Step 8: Run the tests and typecheck**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/registry-catalog.test.ts tests/catalog-renderers.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/canvas/scenes/fields.ts lib/canvas/scenes/registry.ts components/frame/canvas/canvas-frame-scene.tsx lib/canvas/__tests__/registry-catalog.test.ts
git commit -m "feat(canvas): register all 28 catalog scenes"
```

---

## Final proof

### Task 22: continuity, purity and phase evidence

**Files:**
- Test: `lib/canvas/__tests__/catalog-continuity.test.ts`
- Test: `lib/canvas/__tests__/catalog-source.test.ts`

- [ ] **Step 1: Write the continuity test**

Create `lib/canvas/__tests__/catalog-continuity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { computeSceneState, defaultScene } from '@/lib/canvas/scenes/registry'
import type { CanvasConfig } from '@/lib/types'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 120,
  align: 'center',
  bezelMode: 'show',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}
const geometry = resolveGeometry(config)
const ctx = (tMs: number) => ({
  bounds: { width: geometry.width, height: geometry.height },
  geometry,
  tMs,
  seed: 77,
})

describe('catalog wall continuity', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} draws the same commands at the same wall time`, () => {
      const scene = defaultScene(type, geometry)
      const first = computeSceneState(scene, ctx(19_240))
      computeSceneState(scene, ctx(2_000))
      computeSceneState(scene, ctx(86_400_000))
      const again = computeSceneState(scene, ctx(19_240))
      expect(again).toEqual(first)
      const commands = catalogDraw(first as Parameters<typeof catalogDraw>[0])
      expect(commands.length).toBeLessThanOrEqual(40)
      expect(catalogDraw(again as Parameters<typeof catalogDraw>[0])).toEqual(commands)
    })
  }
})
```

- [ ] **Step 2: Write the source purity test**

Create `lib/canvas/__tests__/catalog-source.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sources = [
  'lib/canvas/catalog-kit.ts',
  'lib/canvas/catalog-draw.ts',
  'lib/canvas/games.ts',
  'lib/canvas/scenes/bounce.ts',
  ...readdirSync(path.join(root, 'lib/canvas/scenes/catalog'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `lib/canvas/scenes/catalog/${name}`),
]
const forbidden = ['Date.now', 'Math.random', 'document.', 'window.', 'localStorage', 'fetch(', 'FRAME_DATA_DIR']

describe('catalog state purity', () => {
  for (const source of sources) {
    it(`${source} has no clock, randomness or DOM reads`, () => {
      const text = readFileSync(path.join(root, source), 'utf8')
      for (const token of forbidden) expect(text).not.toContain(token)
    })
  }
})
```

- [ ] **Step 3: Run the tests**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/catalog-continuity.test.ts lib/canvas/__tests__/catalog-source.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full phase checks**

Run:

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: all three pass. If a check fails, fix it before committing; do not weaken these tests.

- [ ] **Step 5: Capture before/after evidence**

Before evidence already exists in the Phase 1 sync-test and the previous four scene types. Capture one after screenshot or short video with `calibration`, `gallery-wall`, `mosaic-wall`, `breakout` and `life` deployed across at least two frames. Use the console wall preview if physical frames are unavailable. Keep the capture path in the PR body.

- [ ] **Step 6: Commit and verify the worktree**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended Phase 4 files. If `next-env.d.ts` was regenerated by `next build`, commit it only if the repository expects that generated file to be tracked; otherwise leave it untouched and report it.

- [ ] **Step 7: Rebase and rerun**

Run:

```bash
git fetch origin
git rebase origin/main
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: clean rebase and all checks pass.

---

## Phase 4 exit criteria

- [ ] `CanvasSceneType` contains exactly the 28 addendum names in addition to the four Phase 1 names.
- [ ] Every catalog scene has one new pure state module and one new renderer file.
- [ ] `mosaic-wall` calls `lib/mosaic.ts` and `tile-reveal` calls `lib/reveal.ts`; neither copies those engines.
- [ ] `stateAt` functions use only config, bounds, wall geometry, seed and `tMs`; no `Date.now`, `Math.random`, DOM reads or per-device values.
- [ ] Every frame draws at most 40 commands/elements.
- [ ] `breakout`, `snake`, `sprite-parade` and `life` replay through `gameStateAt` with a 600-tick round and bounded cache.
- [ ] Gallery images are `canvas-asset:<sha256>` refs only; no canvas scene references `/api/media`.
- [ ] Assets are uploaded from the console, delivered from the kiosk's own origin, pulled only when missing, and never pushed through the sync queue; `caHave` and `canvasAssetRefs` reach `/api/sync/pull` from `runSyncCycle`, survive the 410 retry, and are covered by tests.
- [ ] Catalog images redraw from the module-level image cache after `onload`; a test proves `drawImage` runs after load.
- [ ] Bezel modes `show`, `hide` and `collapse` are covered by tests and visible in wall preview and frame display; the preview renders `CanvasBezelOverlay` from `bezelMode` and `geometry.gaps`.
- [ ] Physical units derive each slot's `ResolvedSlot.scale` from its frame document's `screenWidthMm`/`screenHeightMm` before sizing and positioning, and block deploy when any enrolled frame lacks those dimensions.
- [ ] Per-slot rotation is stored, parsed, projected and rendered once on the slot wrapper in both stage and preview, with rendering tests and no second rotation in the 2D layer.
- [ ] Bounce trails finish and guaranteed-corner mode are slot-independent; decorative effects respect reduced motion.
- [ ] `pnpm test`, `npx tsc --noEmit` and `pnpm build` all pass from the rebased branch.
