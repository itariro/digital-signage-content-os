# Multi-frame canvas: phase 2, authoring and deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a console operator build canvas albums and layouts in the reserved library, add enrolled frames, identify them, take a canvas live, update it live, and release it, with route guards and tests for every failure case.

**Architecture:** Authoring documents stay in the `canvas-library` frame document and reuse the existing layout/album CRUD routes behind server guards. A service layer validates a layout plus album, computes a lead, and writes one `canvas_state` row per member; the console UI only calls that service through four zod-validated routes. The kiosk display and engine from Phase 1 are unchanged.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before route/page code), React 19, TypeScript, zod 4, drizzle (Postgres transaction, sequential SQLite writes), SWR, lucide-react, Vitest (node, no jsdom).

**Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md` (§§5, 7.5, 12, 13, 16, 20, 21).

**Shared contract:** `docs/superpowers/plans/2026-11-25-multi-frame-canvas/00-assessment.md`. Phase 1 (`01-phase-1-engine-and-display.md`) must be merged first. Use its exported names verbatim: `resolveGeometry`, `validateGeometry`, `sceneAt`, `DEFAULT_SCHEDULE`, `getCanvasState`, `putCanvasState`, `listCanvasStates`, `pruneCanvasState`, `canvasSceneSchema`, `SCENE_META`, `defaultScene`, `coerceScene`, `computeSceneState`, `SceneField`, `pollDelayMs`.

**Contract gaps resolved here (record in the PR):**

1. The spec says `GET/PATCH/DELETE /api/frames`, but the repo has one `/api/frames` route: `GET` has no body, `PATCH` takes `body.id`, and `DELETE` takes `?id=`. All three guards land in that one file.
2. The user scope overrides spec §§12.2/12.8: Phase 2 has Layouts and Albums tabs only. `GET /api/canvas/status` and the Status tab are Phase 3. `getCanvasStatus` is implemented and unit-tested here so Phase 3 only adds presentation.
3. The console has no kiosk clock samples. `WallPreview` uses `/api/time` and a local epoch captured when the preview opens; it does not call `/api/canvas/state`.
4. Two counters share the word "revision" in the spec. Internals here use `deploymentRevision` (per canvas) and `rowRevision` (per `canvas_state` row). The deployment object still carries `revision` as its own field.
5. Canvas route guards compare the stored document kind and the frame id, not only the request body, so a frame layout cannot be mutated into a canvas layout through `PUT`.
6. Canvas logos are embedded data URIs. No scene config may contain `/api/uploads/...`, `/api/media/...`, or an SVG data URI.
7. The four management routes are operator-authenticated, so they do not add `checkLimit`; the public `/api/time` route added in Phase 1 keeps its existing rate limit. The library GET route is also authenticated.

---

## Preflight

Do this once, before Task 1.

- [ ] **Step 1: Read the required background**

Read `00-assessment.md`, spec §§5, 7.5, 12, 13, 16, 20, 21, and the Phase 1 file map, Task 1 types, Task 3 schemas, Task 9 geometry, Task 13 `SceneField`, and Task 17 registry. Before writing route or page code, read:

```bash
sed -n '1,160p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,120p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
sed -n '1,90p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
sed -n '1,80p' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
```

- [ ] **Step 2: Start from a clean branch**

```bash
git status --short
git fetch origin
git switch -c feature/canvas-phase-2-authoring origin/main
```

Stop if `git status --short` shows unrelated work. Do not reuse the plan-writing branch or another agent’s worktree.

- [ ] **Step 3: Record the baseline**

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

All three must pass before implementation. A failure here is a baseline problem, not part of this phase.

---

### Task 1: Canvas library helpers and empty document

**Files:**
- Create: `lib/canvas/ids.ts`
- Create: `lib/canvas/library.ts`
- Create: `lib/canvas/defaults.ts`
- Test: `lib/canvas/__tests__/library.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/library.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-library'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('canvas library helpers', () => {
  it('recognises only the reserved id', async () => {
    const { CANVAS_LIBRARY_ID, isLibraryFrame } = await import('@/lib/canvas/library')
    expect(CANVAS_LIBRARY_ID).toBe('canvas-library')
    expect(isLibraryFrame('canvas-library')).toBe(true)
    expect(isLibraryFrame('canvas-library ')).toBe(false)
    expect(isLibraryFrame('home')).toBe(false)
    expect(isLibraryFrame(undefined)).toBe(false)
  })

  it('creates an empty console-only library document once', async () => {
    await freshDb()
    const { CANVAS_LIBRARY_ID, ensureCanvasLibrary } = await import('@/lib/canvas/library')
    const first = await ensureCanvasLibrary()
    expect(first.layouts).toEqual([])
    expect(first.albums).toEqual([])
    expect(first.activeId).toBeNull()
    expect(first.schedule.enabled).toBe(false)
    expect(first.schedule.rules).toEqual([])
    expect(first.experiences.enabled).toBe(false)
    expect(first.experiences.rules).toEqual([])

    const second = await ensureCanvasLibrary()
    expect(second).toEqual(first)

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const rows = await getDb().select().from(getTables().frameDocuments).where(
      eq(getTables().frameDocuments.identifier, CANVAS_LIBRARY_ID),
    )
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run lib/canvas/__tests__/library.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create `lib/canvas/defaults.ts`**

```ts
import type { CanvasConfig, CanvasScene, LayoutSettings } from '@/lib/types'

export const EMPTY_CANVAS_SETTINGS: LayoutSettings = {
  resolution: '1080x1920',
  background: '#000000',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

export function emptyCanvasConfig(): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 0,
    align: 'center',
    slots: [],
    background: '#000000',
    markers: 'identify',
    notifications: 'suppress',
    nightMode: 'inherit',
    maxFps: 30,
  }
}

export function emptySyncTestScene(id: string): CanvasScene {
  return {
    id,
    name: 'Sync test',
    enabled: true,
    durationSec: 30,
    seed: 1,
    type: 'sync-test',
    config: { periodSec: 4, showGrid: true, showBezels: true },
  }
}
```

- [ ] **Step 4: Create `lib/canvas/ids.ts` and `lib/canvas/library.ts`**

Create `lib/canvas/ids.ts` first. It is browser-safe so client hooks never import the database-backed library module just to read the constant.

```ts
export const CANVAS_LIBRARY_ID = 'canvas-library'

export function isLibraryFrame(frameId: string | null | undefined): boolean {
  return frameId === CANVAS_LIBRARY_ID
}
```

Create `lib/canvas/library.ts`:

```ts
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { readStore } from '@/lib/store'
import { DEFAULT_SCHEDULE } from '@/lib/schedule'
import type { FrameStore } from '@/lib/types'
import { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

export { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

/** The library document is console-only. Callers return 403 when this is true. */
export function libraryOnKiosk(frameId: string | null | undefined): boolean {
  return isLibraryFrame(frameId) && Boolean(process.env.INSTANCE_ID)
}

export async function ensureCanvasLibrary(): Promise<FrameStore> {
  const existing = await readStore(CANVAS_LIBRARY_ID)
  if (existing) return existing

  const now = new Date()
  const data: FrameStore = {
    activeId: null,
    layouts: [],
    presets: [],
    customFonts: [],
    schedule: structuredClone(DEFAULT_SCHEDULE),
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
  }
  const tables = getTables()
  await getDb().insert(tables.frameDocuments).values({
    id: nanoid(12),
    identifier: CANVAS_LIBRARY_ID,
    name: 'Canvas library',
    data,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: tables.frameDocuments.identifier })
  return (await readStore(CANVAS_LIBRARY_ID)) ?? data
}
```

The library store has empty layouts, empty albums, the default schedule, and disabled experiences.

- [ ] **Step 5: Run the test**

```bash
pnpm vitest run lib/canvas/__tests__/library.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/ids.ts lib/canvas/library.ts lib/canvas/defaults.ts lib/canvas/__tests__/library.test.ts
git commit -m "feat(canvas): add the reserved canvas library document"
```

---

### Task 2: Library guards on generic and display routes

**Files:**
- Modify: `app/api/layouts/route.ts`
- Modify: `app/api/layouts/[id]/route.ts`
- Modify: `app/api/albums/route.ts`
- Modify: `app/api/albums/[id]/route.ts`
- Modify: `app/api/frames/route.ts`
- Modify: `app/api/store/route.ts`
- Modify: `app/frame/[frameId]/page.tsx`
- Test: `tests/canvas-library-guards.test.ts`

Before editing these files, re-read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `.../03-api-reference/03-file-conventions/route.md`, `.../03-api-reference/03-file-conventions/page.md`, and `.../03-api-reference/04-functions/after.md`. These routes already exist; preserve their auth behavior and add only the guards below.

- [ ] **Step 1: Write the failing route and source test**

Create `tests/canvas-library-guards.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

const env = process.env as Record<string, string | undefined>
const root = path.resolve(__dirname, '..')

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-guards'
  env.NODE_ENV = 'production'
  env.CONSOLE_ADMIN_TOKEN = 'canvas-admin'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

function request(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'canvas-admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function docFor(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const rows = await getDb().select().from(getTables().frameDocuments).where(
    eq(getTables().frameDocuments.identifier, id),
  )
  return rows[0]
}

const settings = {
  resolution: '1080x1920',
  background: '#000000',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

const canvas = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'a', frameId: null, offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

describe('canvas library route guards', () => {
  it('accepts a canvas layout only in the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const payload = { name: 'Wall', kind: 'canvas', canvas, widgets: [], settings }

    const rejected = await POST(request('http://localhost/api/layouts', 'POST', payload))
    expect(rejected.status).toBe(400)

    const accepted = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', payload))
    expect(accepted.status).toBe(200)
    const json = await accepted.json()
    expect(json.store.layouts[0].kind).toBe('canvas')
    expect(json.store.activeId).toBeNull()
  })

  it('refuses a frame layout in the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const res = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', {
      name: 'Frame', kind: 'frame', widgets: [], settings,
    }))
    expect(res.status).toBe(400)
  })

  it('allows deleting the last library layout but not a live canvas layout', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const { DELETE } = await import('@/app/api/layouts/[id]/route')
    const created = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', {
      name: 'Wall', kind: 'canvas', canvas, widgets: [], settings,
    }))
    const { id } = await created.json()
    const res = await DELETE(
      request(`http://localhost/api/layouts/${id}?frame=canvas-library`, 'DELETE'),
      { params: Promise.resolve({ id }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.store.layouts).toEqual([])
    expect(json.store.activeId).toBeNull()
  })

  it('creates one enabled sync-test scene for a canvas album', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/albums/route')
    const res = await POST(request('http://localhost/api/albums?frame=canvas-library', 'POST', {
      name: 'Canvas album', theme: 'canvas',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    const album = json.store.albums[0]
    expect(album.theme).toBe('canvas')
    expect(album.slideshow.presentation).toBe('canvas')
    expect(album.scenes).toHaveLength(1)
    expect(album.scenes[0].type).toBe('sync-test')
    expect(album.scenes[0].enabled).toBe(true)
    expect(album.scenes[0].durationSec).toBe(30)
  })

  it('rejects a canvas album outside the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/albums/route')
    const res = await POST(request('http://localhost/api/albums', 'POST', {
      name: 'Canvas album', theme: 'canvas',
    }))
    expect(res.status).toBe(400)
  })

  it('hides and protects the library in /api/frames', async () => {
    await freshDb()
    const { ensureCanvasLibrary, CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
    await ensureCanvasLibrary()
    const framesModule = await import('@/app/api/frames/route')
    const list = await framesModule.GET()
    const ids = (await list.json()).map((row: { id: string }) => row.id)
    expect(ids).not.toContain(CANVAS_LIBRARY_ID)

    const patch = await framesModule.PATCH(request('http://localhost/api/frames', 'PATCH', {
      id: CANVAS_LIBRARY_ID, name: 'Hacked',
    }))
    expect(patch.status).toBe(400)
    const del = await framesModule.DELETE(request(`http://localhost/api/frames?id=${CANVAS_LIBRARY_ID}`, 'DELETE'))
    expect(del.status).toBe(400)
  })

  it('returns 404 for /frame/canvas-library at source level', () => {
    const source = readFileSync(path.join(root, 'app/frame/[frameId]/page.tsx'), 'utf8')
    expect(source).toMatch(/isLibraryFrame\(frameId\).*notFound\(\)/)
  })

  it('skips the Bob tick for the library at source level', () => {
    const source = readFileSync(path.join(root, 'app/api/store/route.ts'), 'utf8')
    expect(source).toMatch(/if \(!isLibraryFrame\(frameId\)\) \{\s*after\(async \(\) => \{\s*await tickBobEngine\(frameId\)/)
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-library-guards.test.ts
```

Expected: FAIL on the first layout assertion (or on missing `scenes`).

- [ ] **Step 3: Extend `lib/canvas/library.ts` with liveness**

Replace the whole file with the following. The liveness helper is used by the layout delete guard and reused by the service status code.

```ts
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { readStore } from '@/lib/store'
import { DEFAULT_SCHEDULE } from '@/lib/schedule'
import { listCanvasStates, pruneCanvasState, type CanvasStateRow } from '@/lib/canvas/state-store'
import type { FrameStore } from '@/lib/types'
import { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

export { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/ids'

/** The library document is console-only. Callers return 403 when this is true. */
export function libraryOnKiosk(frameId: string | null | undefined): boolean {
  return isLibraryFrame(frameId) && Boolean(process.env.INSTANCE_ID)
}

export async function ensureCanvasLibrary(): Promise<FrameStore> {
  const existing = await readStore(CANVAS_LIBRARY_ID)
  if (existing) return existing

  const now = new Date()
  const data: FrameStore = {
    activeId: null,
    layouts: [],
    presets: [],
    customFonts: [],
    schedule: structuredClone(DEFAULT_SCHEDULE),
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
  }
  const tables = getTables()
  await getDb().insert(tables.frameDocuments).values({
    id: nanoid(12),
    identifier: CANVAS_LIBRARY_ID,
    name: 'Canvas library',
    data,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: tables.frameDocuments.identifier })
  return (await readStore(CANVAS_LIBRARY_ID)) ?? data
}

export type CanvasLayoutPhase = 'draft' | 'scheduled' | 'live' | 'released'

export function canvasLayoutPhaseFromRows(
  layoutId: string,
  rows: CanvasStateRow[],
  nowMs = Date.now(),
): CanvasLayoutPhase {
  let scheduled = false
  let live = false
  let released = false
  for (const row of rows) {
    if (row.data.pending?.canvasId === layoutId) scheduled = true
    const active = row.data.active
    if (active?.canvasId !== layoutId) continue
    if (active.releaseAt === null || active.releaseAt > nowMs) live = true
    else released = true
  }
  if (scheduled) return 'scheduled'
  if (live) return 'live'
  if (released) return 'released'
  return 'draft'
}

export async function getCanvasLayoutPhase(layoutId: string): Promise<CanvasLayoutPhase> {
  await pruneCanvasState()
  return canvasLayoutPhaseFromRows(layoutId, await listCanvasStates())
}
```

- [ ] **Step 4: Replace `app/api/layouts/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { ensureCanvasLibrary, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid layout')
  }
  const isCanvas = parsed.data.kind === 'canvas'
  if (library !== isCanvas) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }
  if (library) await ensureCanvasLibrary()

  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.layouts.length >= 50) throw new Error('Layout limit reached')
    s.layouts.push({ id, ...parsed.data, createdAt: now, updatedAt: now })
    // The library has no active frame layout, so it must never gain an activeId.
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return invalid(store.message)
  return NextResponse.json({ store, id })
}
```

The removed `if (!s.activeId) s.activeId = id` line is deliberate: spec §12.1 skips that rule for the library. The comment records why the blank line exists.

- [ ] **Step 5: Replace `app/api/layouts/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { layoutInputSchema } from '@/lib/schema'
import { mutateStore, readStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { ensureCanvasLibrary, getCanvasLayoutPhase, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = layoutInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid layout')
  }
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.layouts.find((layout) => layout.id === id)
  if (!existing) return invalid('Layout not found', 404)
  const isCanvas = parsed.data.kind === 'canvas'
  if (library !== isCanvas || library !== (existing.kind === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }

  let found = false
  const store = await mutateStore((s) => {
    const layout = s.layouts.find((entry) => entry.id === id)
    if (!layout) return
    found = true
    Object.assign(layout, parsed.data, { updatedAt: new Date().toISOString() })
  }, frameId)
  if (!found) return invalid('Layout not found', 404)
  return NextResponse.json({ store, id })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.layouts.find((layout) => layout.id === id)
  if (!existing) return invalid('Layout not found', 404)
  if (library !== (existing.kind === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas layouts' : 'Canvas layouts belong in the canvas library')
  }
  if (library) {
    const phase = await getCanvasLayoutPhase(id)
    if (phase === 'scheduled' || phase === 'live') {
      return NextResponse.json({ error: 'Release this canvas before deleting it', code: 'E_LIVE' }, { status: 409 })
    }
  }

  let blocked = false
  const store = await mutateStore((s) => {
    if (!library && s.layouts.length <= 1) {
      blocked = true
      return
    }
    s.layouts = s.layouts.filter((layout) => layout.id !== id)
    if (!library && s.activeId === id) s.activeId = s.layouts[0]?.id ?? null
  }, frameId)
  if (blocked) return invalid('Keep at least one layout')
  return NextResponse.json({ store })
}
```

- [ ] **Step 6: Replace `app/api/albums/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { albumCreateSchema } from '@/lib/schema'
import { mutateStore } from '@/lib/store'
import { defaultSlideshow } from '@/lib/albums'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { emptySyncTestScene } from '@/lib/canvas/defaults'
import { ensureCanvasLibrary, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = albumCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid album')
  }
  const isCanvas = parsed.data.theme === 'canvas'
  if (library !== isCanvas) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }
  if (library) await ensureCanvasLibrary()

  const id = nanoid(10)
  const now = new Date().toISOString()
  const store = await mutateStore((s) => {
    if (s.albums.length >= 40) throw new Error('Album limit reached')
    if (isCanvas) {
      s.albums.push({
        id,
        ...parsed.data,
        items: [],
        scenes: [emptySyncTestScene(nanoid(8))],
        slideshow: defaultSlideshow('canvas'),
        createdAt: now,
        updatedAt: now,
      })
      return
    }
    s.albums.push({
      id,
      ...parsed.data,
      items: [],
      slideshow: defaultSlideshow(parsed.data.theme),
      createdAt: now,
      updatedAt: now,
    })
  }, frameId).catch((e: Error) => e)
  if (store instanceof Error) return invalid(store.message)
  return NextResponse.json({ store, id })
}
```

- [ ] **Step 7: Replace `app/api/albums/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { albumItemSchema, albumUpdateSchema } from '@/lib/schema'
import { mutateStore, readStore } from '@/lib/store'
import { frameIdParam } from '@/lib/frames/request'
import { requireHostedOperator } from '@/lib/http-auth'
import { ensureCanvasLibrary, isLibraryFrame, libraryOnKiosk } from '@/lib/canvas/library'

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const existing = (isLibraryFrame(frameId) ? await ensureCanvasLibrary() : await readStore(frameId))
    ?.albums.find((album) => album.id === id)
  if (existing?.theme === 'canvas') return invalid('Canvas albums have scenes, not artwork items')

  const body = await request.json().catch(() => null) as { item?: unknown } | null
  const parsed = albumItemSchema.safeParse(body?.item)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid album item')

  let found = false
  const store = await mutateStore((current) => {
    const album = current.albums.find((entry) => entry.id === id)
    if (!album) return
    found = true
    if (album.items.length >= 200) throw new Error('Album item limit reached')
    album.items.push(parsed.data)
    album.updatedAt = new Date().toISOString()
  }, frameId).catch((error: Error) => error)
  if (store instanceof Error) return invalid(store.message)
  if (!found) return invalid('Album not found', 404)
  return NextResponse.json({ store, id })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const parsed = albumUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Invalid album')
  }
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.albums.find((album) => album.id === id)
  if (!existing) return invalid('Album not found', 404)
  const isCanvas = parsed.data.theme === 'canvas'
  if (library !== isCanvas || library !== (existing.theme === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }

  let found = false
  const store = await mutateStore((s) => {
    const album = s.albums.find((entry) => entry.id === id)
    if (!album) return
    found = true
    Object.assign(album, parsed.data, { updatedAt: new Date().toISOString() })
  }, frameId)
  if (!found) return invalid('Album not found', 404)
  return NextResponse.json({ store, id })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const { id } = await params
  const frameId = frameIdParam(request.url)
  const library = isLibraryFrame(frameId)
  if (libraryOnKiosk(frameId)) return invalid('Canvas authoring is console only', 403)
  const existingStore = library ? await ensureCanvasLibrary() : await readStore(frameId)
  const existing = existingStore?.albums.find((album) => album.id === id)
  if (!existing) return invalid('Album not found', 404)
  if (library !== (existing.theme === 'canvas')) {
    return invalid(library ? 'The canvas library accepts only canvas albums' : 'Canvas albums belong in the canvas library')
  }

  const store = await mutateStore((s) => {
    s.albums = s.albums.filter((album) => album.id !== id)
    for (const layout of s.layouts) {
      if (layout.settings.albumId === id) layout.settings.albumId = null
    }
  }, frameId)
  return NextResponse.json({ store })
}
```

- [ ] **Step 8: Replace `app/api/frames/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { desc, eq, ne } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import { readStore } from '@/lib/store'
import type { FrameStore } from '@/lib/types'
import { resolveDisplay, clockParts } from '@/lib/schedule'
import { requireHostedOperator } from '@/lib/http-auth'
import { CANVAS_LIBRARY_ID, isLibraryFrame } from '@/lib/canvas/library'

export const dynamic = 'force-dynamic'

function validId(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

// A provisioned kiosk (INSTANCE_ID set) manages EXACTLY ONE frame: 'home'
// (user design resolution). Multi-frame lives on the console.
function singleFrameViolation(): NextResponse | null {
  if (!process.env.INSTANCE_ID) return null
  return NextResponse.json(
    { error: 'A provisioned instance manages only the home frame; onboard another screen as its own instance' },
    { status: 400 },
  )
}

export async function GET() {
  const frameDocuments = getTables().frameDocuments
  const documents = await getDb().select().from(frameDocuments)
    .where(ne(frameDocuments.identifier, CANVAS_LIBRARY_ID))
    .orderBy(desc(frameDocuments.updatedAt))
  const now = new Date()
  return NextResponse.json(await Promise.all(documents.map(async (document) => {
    const store = document.data as FrameStore
    const display = resolveDisplay(store, clockParts(now))
    return {
      id: document.identifier,
      name: document.name,
      layoutId: display.layout?.id ?? null,
      layoutName: display.layout?.name ?? null,
      layouts: store.layouts.map((layout) => ({ id: layout.id, name: layout.name })),
      resolutionWidth: document.resolutionWidth,
      resolutionHeight: document.resolutionHeight,
      screenWidthMm: document.screenWidthMm,
      screenHeightMm: document.screenHeightMm,
      updatedAt: document.updatedAt,
    }
  })))
}

export async function POST(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !validId(body.id) || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Frame ID and name are required' }, { status: 400 })
  }
  const db = getDb()
  const frameDocuments = getTables().frameDocuments
  const now = new Date()
  const identifier = body.id.trim()
  if (isLibraryFrame(identifier)) return NextResponse.json({ error: 'That frame id is reserved' }, { status: 400 })
  const violation = singleFrameViolation()
  if (violation && identifier !== 'home') return violation
  const [existing] = await db.select({ id: frameDocuments.id }).from(frameDocuments).where(eq(frameDocuments.identifier, identifier)).limit(1)
  if (existing) return NextResponse.json({ error: 'Frame ID already exists' }, { status: 409 })
  const homeStore = await readStore()
  if (!homeStore) return NextResponse.json({ error: 'Home frame is not available' }, { status: 503 })
  const data = structuredClone(homeStore)
  data.activeId = null
  data.schedule = { ...data.schedule, enabled: false, rules: [] }
  await db.insert(frameDocuments).values({
    id: nanoid(12), identifier, name: body.name.trim(), data,
    createdAt: now, updatedAt: now, resolutionWidth: Number(body.resolutionWidth) || 1920, resolutionHeight: Number(body.resolutionHeight) || 1080,
    screenWidthMm: Number(body.screenWidthMm) || null, screenHeightMm: Number(body.screenHeightMm) || null,
  })
  return NextResponse.json({ ok: true, id: identifier }, { status: 201 })
}

export async function PATCH(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !validId(body.id)) return NextResponse.json({ error: 'Valid frame ID is required' }, { status: 400 })
  if (isLibraryFrame(body.id)) return NextResponse.json({ error: 'The canvas library is not a frame' }, { status: 400 })
  const patchViolation = singleFrameViolation()
  if (patchViolation && body.id !== 'home') return patchViolation
  const db = getDb()
  const frameDocuments = getTables().frameDocuments
  const [document] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, body.id)).limit(1)
  if (!document) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  for (const [key, column] of [['resolutionWidth', 'resolutionWidth'], ['resolutionHeight', 'resolutionHeight'], ['screenWidthMm', 'screenWidthMm'], ['screenHeightMm', 'screenHeightMm']] as const) {
    if (body[key] !== undefined) updates[column] = body[key] === null || body[key] === '' ? null : Math.max(1, Number(body[key]))
  }
  if (body.layoutId !== undefined) {
    if (!document.data) return NextResponse.json({ error: 'Frame data not found' }, { status: 404 })
    const data = structuredClone(document.data as FrameStore)
    data.activeId = typeof body.layoutId === 'string' && data.layouts.some((layout) => layout.id === body.layoutId) ? body.layoutId : null
    updates.data = data
  }
  await db.update(frameDocuments).set(updates).where(eq(frameDocuments.identifier, body.id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const operator = await requireHostedOperator(request)
  if (operator && !operator.ok) {
    return NextResponse.json({ error: operator.reason }, { status: operator.reason === 'misconfigured' ? 500 : 401 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id || !validId(id) || id === 'home' || isLibraryFrame(id)) {
    return NextResponse.json({ error: 'That frame cannot be removed' }, { status: 400 })
  }
  const deleteViolation = singleFrameViolation()
  if (deleteViolation) return deleteViolation
  const frameDocuments = getTables().frameDocuments
  const result = await getDb().delete(frameDocuments).where(eq(frameDocuments.identifier, id))
  const r = result as unknown as { changes?: number; rowCount?: number }
  return NextResponse.json({ ok: true, deleted: r.changes ?? r.rowCount ?? 0 })
}
```

- [ ] **Step 9: Replace `app/api/store/route.ts`**

```ts
import { NextResponse, after } from 'next/server'
import { readStore } from '@/lib/store'
import { tickBobEngine } from '@/lib/bob-bridge'
import { frameIdParam } from '@/lib/frames/request'
import { isLibraryFrame } from '@/lib/canvas/library'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  }
  const store = await readStore(frameId)
  if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  // The library is an authoring document, not a display. Driving Bob would
  // publish a notification the library can never show.
  if (!isLibraryFrame(frameId)) {
    after(async () => {
      await tickBobEngine(frameId)
    })
  }
  return NextResponse.json(store, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
```

- [ ] **Step 10: Replace `app/frame/[frameId]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { readStore } from '@/lib/store'
import { FrameDisplay } from '@/components/frame/frame-display'
import { isLibraryFrame } from '@/lib/canvas/library'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Frame display',
  robots: { index: false, follow: false },
}

export default async function FramePage({ params }: { params: Promise<{ frameId: string }> }) {
  const { frameId } = await params
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId) || isLibraryFrame(frameId)) notFound()
  const store = await readStore(frameId)
  if (!store) notFound()
  return <FrameDisplay initialStore={store} frameId={frameId} />
}
```

- [ ] **Step 11: Run the guard test and the full suite**

```bash
pnpm vitest run tests/canvas-library-guards.test.ts
pnpm test
```

Expected: both PASS.

- [ ] **Step 12: Commit**

```bash
git add app/api/layouts/route.ts app/api/layouts/'[id]'/route.ts app/api/albums/route.ts app/api/albums/'[id]'/route.ts app/api/frames/route.ts app/api/store/route.ts app/frame/'[frameId]'/page.tsx lib/canvas/library.ts tests/canvas-library-guards.test.ts
git commit -m "feat(canvas): protect the reserved canvas library"
```

---

### Task 3: Lead calculation

**Files:**
- Create: `lib/canvas/lead.ts`
- Test: `lib/canvas/__tests__/lead.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/lead.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { leadMs, minLeadMs } from '@/lib/canvas/lead'

const env = { ...process.env }

describe('canvas lead', () => {
  it('uses a 15 s floor for frames that already have canvas state', () => {
    expect(minLeadMs([true, true], env)).toBe(15_000)
  })

  it('uses a 65 s floor when any frame is newly enrolled to canvas state', () => {
    expect(minLeadMs([true, false], env)).toBe(65_000)
    expect(minLeadMs([false], env)).toBe(65_000)
  })

  it('raises a short request to the floor and caps long requests at ten minutes', () => {
    expect(leadMs(1_000, [true], env)).toBe(15_000)
    expect(leadMs(undefined, [false], env)).toBe(65_000)
    expect(leadMs(999_999, [true], env)).toBe(600_000)
  })

  it('respects the phase 1 poll overrides', () => {
    const custom = { ...env, CANVAS_POLL_ACTIVE_SECONDS: '2', CANVAS_POLL_IDLE_SECONDS: '4' }
    expect(minLeadMs([true], custom)).toBe(9_000)
    expect(minLeadMs([false], custom)).toBe(13_000)
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run lib/canvas/__tests__/lead.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create `lib/canvas/lead.ts`**

```ts
import { pollDelayMs } from '@/lib/canvas/poll'

export const MAX_LEAD_MS = 10 * 60 * 1000
export const DEFAULT_LEAD_MS = 15_000

/** Spec §13.1: 2 * max member poll + 5 s. */
export function minLeadMs(hasCanvasState: boolean[], env: NodeJS.ProcessEnv = process.env): number {
  const maxPollMs = hasCanvasState.reduce(
    (max, hasState) => Math.max(max, pollDelayMs(hasState, env)),
    0,
  )
  return 2 * maxPollMs + 5_000
}

export function leadMs(
  requested: number | undefined,
  hasCanvasState: boolean[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  const floor = minLeadMs(hasCanvasState, env)
  const wanted = typeof requested === 'number' && Number.isFinite(requested) ? requested : DEFAULT_LEAD_MS
  return Math.min(MAX_LEAD_MS, Math.max(floor, wanted))
}
```

`pollDelayMs(true, env)` is the 5 s active poll and `pollDelayMs(false, env)` is the 30 s idle poll from Phase 1, each honouring `CANVAS_POLL_ACTIVE_SECONDS` and `CANVAS_POLL_IDLE_SECONDS`.

- [ ] **Step 4: Run the test and commit**

```bash
pnpm vitest run lib/canvas/__tests__/lead.test.ts
git add lib/canvas/lead.ts lib/canvas/__tests__/lead.test.ts
git commit -m "feat(canvas): compute go-live lead from member poll rate"
```

Expected: PASS before the commit.

---

### Task 4: Canvas service layer

**Files:**
- Create: `lib/canvas/service.ts`
- Test: `lib/canvas/__tests__/service.test.ts`

This task owns the mechanics. Route handlers only validate input, call these functions, audit through the service result, and map result codes to status codes. Keep the two counters distinct: `deploymentRevision` is the canvas-wide revision stored on each `CanvasDeployment`; `rowRevision` is incremented by the state store on every member row write.

- [ ] **Step 1: Write the failing service test**

Create `lib/canvas/__tests__/service.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { deployCanvas, getCanvasStatus, identifyCanvas, releaseCanvas } from '@/lib/canvas/service'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-service'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seed() {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { ensureCanvasLibrary } = await import('@/lib/canvas/library')
  const { defaultSlideshow } = await import('@/lib/albums')
  const { emptySyncTestScene } = await import('@/lib/canvas/defaults')
  const store = await ensureCanvasLibrary()
  const now = new Date().toISOString()
  const albumId = nanoid(8)
  const layoutId = nanoid(8)
  const db = getDb()
  const tables = getTables()

  for (const id of ['fa', 'fb', 'fc']) {
    await db.insert(tables.instances).values({ id, createdAt: new Date(), lastSeenAt: new Date() })
    await db.insert(tables.frameDocuments).values({
      id: nanoid(10), identifier: id, name: `Frame ${id}`,
      data: { activeId: null, layouts: [], presets: [], customFonts: [], schedule: { enabled: false, rules: [], night: { enabled: false } }, albums: [], experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } } },
      createdAt: new Date(), updatedAt: new Date(),
    })
  }

  store.albums.push({
    id: albumId, name: 'Canvas album', theme: 'canvas', items: [],
    scenes: [emptySyncTestScene(nanoid(8))], slideshow: defaultSlideshow('canvas'),
    createdAt: now, updatedAt: now,
  })
  store.layouts.push({
    id: layoutId, name: 'Three frame wall', kind: 'canvas', widgets: [],
    settings: { ...store.layouts[0]?.settings ?? {
      resolution: '1080x1920', background: '#000000', dim: 0, locationName: '', lat: 0, lon: 0,
      units: 'metric', snap: true, gridSize: 20, albumId,
    }, albumId },
    canvas: {
      arrangement: 'row', gap: 0, align: 'center',
      slots: [
        { id: 's1', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 's2', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 's3', frameId: 'fc', offset: { x: 0, y: 0 }, scale: 1 },
      ],
      background: '#000000', markers: 'identify', notifications: 'suppress',
      nightMode: 'inherit', maxFps: 30,
    },
    createdAt: now, updatedAt: now,
  })
  await db.update(tables.frameDocuments).set({ data: store }).where(eq(tables.frameDocuments.identifier, 'canvas-library'))
  return { store, layoutId, albumId }
}

describe('deployCanvas', () => {
  beforeEach(freshDb)

  it('writes pending state to every member and audits the deployment', async () => {
    const { layoutId } = await seed()
    const result = await deployCanvas({ layoutId, actor: 'operator', leadMs: 15_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.revision).toBe(1)
    expect(result.leadMs).toBe(65_000)
    expect(result.members.map((m) => m.marker)).toEqual([1, 2, 3])

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('fa')
    expect(row?.revision).toBe(1)
    expect(row?.data.pending?.canvasId).toBe(layoutId)
    expect(row?.data.active).toBeNull()

    const { getDb } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const logs = await getDb().select().from(getTables().auditLog)
    expect(logs.some((log) => log.action === 'canvas_deploy')).toBe(true)
  })

  it('keeps active state on update and releases removed members', async () => {
    const { layoutId } = await seed()
    const first = await deployCanvas({ layoutId, actor: 'operator' })
    if (!first.ok) throw new Error(first.error)
    // Simulate the kiosk acknowledgement: the console never promotes pending
    // to active by itself, so the test writes the active deployment directly.
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    for (const id of ['fa', 'fb', 'fc']) {
      const row = await getCanvasState(id)
      if (!row?.data.pending) continue
      await putCanvasState(id, { ...row.data, active: row.data.pending, pending: null })
    }
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => {
      const layout = s.layouts.find((l) => l.id === layoutId)
      if (layout?.canvas) layout.canvas.slots = layout.canvas.slots.filter((slot) => slot.frameId !== 'fc')
    }, 'canvas-library')
    const result = await deployCanvas({ layoutId, actor: 'operator' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const kept = await getCanvasState('fa')
    const removed = await getCanvasState('fc')
    expect(kept?.data.active?.canvasId).toBe(layoutId)
    expect(kept?.data.pending?.revision).toBe(2)
    expect(removed?.data.active?.releaseAt).toBe(result.effectiveAt)
    expect(removed?.data.pending).toBeNull()
  })

  it('returns every documented validation code', async () => {
    const { layoutId } = await seed()
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((s) => { s.layouts.find((l) => l.id === layoutId)!.canvas!.slots = [] }, 'canvas-library')
    expect((await deployCanvas({ layoutId, actor: 'op' })).ok).toBe(false)

    await freshDb()
    const second = await seed()
    await mutateStore((s) => {
      s.layouts.find((l) => l.id === second.layoutId)!.canvas!.slots[0].frameId = null
    }, 'canvas-library')
    const unassigned = await deployCanvas({ layoutId: second.layoutId, actor: 'op' })
    expect(unassigned.ok).toBe(false)
    if (!unassigned.ok) expect(unassigned.code).toBe('E_UNASSIGNED_SLOT')

    await freshDb()
    const third = await seed()
    await mutateStore((s) => {
      s.layouts.find((l) => l.id === third.layoutId)!.canvas!.slots[0].frameId = 'ghost'
    }, 'canvas-library')
    const unknown = await deployCanvas({ layoutId: third.layoutId, actor: 'op' })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.code).toBe('E_UNKNOWN_FRAME')
  })

  it('refuses a frame already on another scheduled canvas', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    const { mutateStore } = await import('@/lib/store')
    const otherId = nanoid(8)
    await mutateStore((s) => {
      const base = s.layouts.find((l) => l.id === layoutId)!
      s.layouts.push({ ...structuredClone(base), id: otherId, name: 'Other', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      s.layouts.find((l) => l.id === layoutId)!.settings.albumId = null
    }, 'canvas-library')
    const conflict = await deployCanvas({ layoutId: otherId, actor: 'op' })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.code).toBe('E_FRAME_IN_USE')
      expect(conflict.details?.frameId).toBe('fa')
    }
  })
})

describe('releaseCanvas and identifyCanvas', () => {
  beforeEach(freshDb)

  it('releases every active member and clears pending', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    // Simulate the kiosk acknowledgement: releaseCanvas only stamps an existing
    // active deployment, so promote each pending row before releasing.
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    for (const id of ['fa', 'fb', 'fc']) {
      const row = await getCanvasState(id)
      if (!row?.data.pending) continue
      await putCanvasState(id, { ...row.data, active: row.data.pending, pending: null })
    }
    const released = await releaseCanvas({ layoutId, actor: 'op' })
    expect(released.ok).toBe(true)
    const row = await getCanvasState('fa')
    expect(row?.data.active?.releaseAt).toBe(released.releaseAt)
    expect(row?.data.pending).toBeNull()
  })

  it('identifies a draft canvas and clears identification with zero seconds', async () => {
    const { layoutId } = await seed()
    const started = await identifyCanvas({ layoutId, seconds: 10, actor: 'op' })
    expect(started.ok).toBe(true)
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    expect((await getCanvasState('fa'))?.data.identify?.marker).toBe(1)
    const cleared = await identifyCanvas({ layoutId, seconds: 0, actor: 'op' })
    expect(cleared.ok).toBe(true)
    expect((await getCanvasState('fa'))?.data.identify).toBeNull()
  })
})

describe('getCanvasStatus', () => {
  beforeEach(freshDb)

  it('reports flat status rows with per-slot problems', async () => {
    const { layoutId } = await seed()
    await deployCanvas({ layoutId, actor: 'op' })
    const status = await getCanvasStatus({ layoutId })
    expect(status).toHaveLength(3)
    expect(status[0]).toMatchObject({
      canvasId: layoutId,
      slotId: 's1',
      frameId: 'fa',
      state: 'scheduled',
      reportedAtMs: null,
      revision: 1,
      deploymentRevision: 1,
    })
    const { canvasProblems, STATUS_POLL_MS } = await import('@/lib/canvas/problems')
    expect(canvasProblems(status[0], Date.now(), STATUS_POLL_MS)).toContain('No report yet')
  })
})
```

The service tests above cover the paths whose wiring is easy to get wrong. Task 7 adds a route-level table that reaches the remaining codes (`E_NO_SLOTS`, `E_NO_ALBUM`, `E_NO_SCENES`, `E_OVERLAP`, `E_TOO_LARGE`, `E_SCENE_INVALID`, `E_LIVE`, console-only 403) through HTTP.

- [ ] **Step 2: Run it**

```bash
pnpm vitest run lib/canvas/__tests__/service.test.ts
```

Expected: FAIL because `lib/canvas/service.ts` does not exist.

- [ ] **Step 3: Create `lib/canvas/service.ts`**

```ts
import { eq } from 'drizzle-orm'
import { audit } from '@/lib/audit'
import { getDb } from '@/lib/db'
import { getDatabaseMode } from '@/lib/db/mode'
import { getTables } from '@/lib/db/tables'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import type {
  Album,
  CanvasConfig,
  CanvasDeployment,
  CanvasIdentify,
  CanvasScene,
  CanvasState,
  DeploymentAlbum,
  FrameStore,
  Layout,
} from '@/lib/types'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { canvasLayoutPhaseFromRows, ensureCanvasLibrary, type CanvasLayoutPhase } from '@/lib/canvas/library'
import { leadMs } from '@/lib/canvas/lead'
import { pollDelayMs } from '@/lib/canvas/poll'
import {
  listCanvasStates,
  pruneCanvasState,
  putCanvasState,
} from '@/lib/canvas/state-store'
import type { CanvasStateRow } from '@/lib/canvas/state-store'

export type CanvasErrorCode =
  | 'E_NO_SLOTS'
  | 'E_UNASSIGNED_SLOT'
  | 'E_UNKNOWN_FRAME'
  | 'E_FRAME_IN_USE'
  | 'E_NO_ALBUM'
  | 'E_NO_SCENES'
  | 'E_OVERLAP'
  | 'E_TOO_LARGE'
  | 'E_SCENE_INVALID'
  | 'E_NOT_FOUND'
  | 'E_RELEASE_AT'
  | 'E_IDENTIFY_SECONDS'

export type CanvasFailure = {
  ok: false
  code: CanvasErrorCode
  error: string
  details?: Record<string, unknown>
}

function fail(code: CanvasErrorCode, error: string, details?: Record<string, unknown>): CanvasFailure {
  return details ? { ok: false, code, error, details } : { ok: false, code, error }
}

export type DeployMember = { slotId: string; frameId: string; marker: number }
export type SkippedMember = { frameId: string; reason: string }
export type DeployResult = CanvasFailure | {
  ok: true
  revision: number
  effectiveAt: number
  leadMs: number
  members: DeployMember[]
  skipped: SkippedMember[]
}

export type ReleaseResult = CanvasFailure | {
  ok: true
  revision: number
  releaseAt: number
  leadMs: number
  members: DeployMember[]
  skipped: SkippedMember[]
}

export type IdentifyResult = CanvasFailure | {
  ok: true
  until: number | null
  members: DeployMember[]
  skipped: SkippedMember[]
}

export type CanvasStatusMember = {
  slotId: string
  frameId: string
  name: string
  marker: number
  deliveredRevision: number
  reportedRevision: number | null
  reportedAt: string | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  clockQuality: 'good' | 'fair' | 'poor'
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
  problems: string[]
}

export type CanvasStatus = {
  layoutId: string
  name: string
  phase: CanvasLayoutPhase
  revision: number
  members: CanvasStatusMember[]
  skipped: SkippedMember[]
}

type Loaded = {
  store: FrameStore
  layout: Layout
  config: CanvasConfig
}

async function loadLayout(layoutId: string): Promise<Loaded | CanvasFailure> {
  const store = await ensureCanvasLibrary()
  const layout = store.layouts.find((entry) => entry.id === layoutId && entry.kind === 'canvas')
  if (!layout?.canvas) return fail('E_NOT_FOUND', 'Canvas layout not found')
  return { store, layout, config: layout.canvas }
}

async function enrolledIds(): Promise<Set<string>> {
  const tables = getTables()
  const rows = await getDb().select({ id: tables.instances.id }).from(tables.instances)
  return new Set(rows.map((row) => row.id))
}

async function frameNames(): Promise<Map<string, string>> {
  const tables = getTables()
  const rows = await getDb().select({ id: tables.frameDocuments.identifier, name: tables.frameDocuments.name }).from(tables.frameDocuments)
  return new Map(rows.map((row) => [row.id, row.name]))
}

async function writeStates(updates: { instanceId: string; state: CanvasState }[]): Promise<void> {
  if (updates.length === 0) return
  if (getDatabaseMode() === 'postgres') {
    await getDb().transaction(async (tx) => {
      const table = getTables().canvasState
      for (const update of updates) {
        const [existing] = await tx.select({ revision: table.revision }).from(table)
          .where(eq(table.instanceId, update.instanceId)).limit(1)
        const rowRevision = Number(existing?.revision ?? 0) + 1
        const updatedAt = new Date()
        await tx.insert(table).values({
          instanceId: update.instanceId,
          revision: rowRevision,
          data: update.state,
          updatedAt,
        }).onConflictDoUpdate({
          target: table.instanceId,
          set: { revision: rowRevision, data: update.state, updatedAt },
        })
      }
    })
    return
  }
  // better-sqlite3 transactions are synchronous only; each write commits on its
  // own in the dev console, in the same order as the postgres loop above.
  for (const update of updates) await putCanvasState(update.instanceId, update.state)
}

function deploymentRevisionOf(rows: CanvasStateRow[], layoutId: string): number {
  let max = 0
  for (const row of rows) {
    if (row.data.active?.canvasId === layoutId) max = Math.max(max, row.data.active.revision)
    if (row.data.pending?.canvasId === layoutId) max = Math.max(max, row.data.pending.revision)
  }
  return max
}

function isActiveOwnership(deployment: CanvasDeployment | null, nowMs: number): boolean {
  if (!deployment) return false
  return deployment.releaseAt === null || deployment.releaseAt > nowMs
}

function stateForRow(row: CanvasStateRow | undefined): CanvasState {
  return row?.data ?? { v: 1, active: null, pending: null, identify: null }
}

export async function deployCanvas(input: {
  layoutId: string
  leadMs?: number
  releaseAt?: number | null
  actor: string
}): Promise<DeployResult> {
  const loaded = await loadLayout(input.layoutId)
  if ('ok' in loaded && !loaded.ok) return loaded
  const { store, layout, config } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()

  if (config.slots.length === 0) return fail('E_NO_SLOTS', 'Add at least one frame to the canvas')
  if (config.slots.some((slot) => slot.frameId === null)) {
    return fail('E_UNASSIGNED_SLOT', 'Every slot needs a frame before going live')
  }
  const enrolled = await enrolledIds()
  for (const slot of config.slots) {
    if (slot.frameId && !enrolled.has(slot.frameId)) {
      return fail('E_UNKNOWN_FRAME', 'A slot names a frame that is not enrolled', { frameId: slot.frameId })
    }
  }

  const canvasNames = new Map(store.layouts.map((entry) => [entry.id, entry.name]))
  for (const row of rows) {
    const other = row.data.pending ?? (isActiveOwnership(row.data.active, now) ? row.data.active : null)
    if (!other || other.canvasId === input.layoutId) continue
    for (const slot of config.slots) {
      if (slot.frameId !== row.instanceId) continue
      return fail('E_FRAME_IN_USE', 'That frame is on another scheduled or live canvas', {
        frameId: row.instanceId,
        canvasId: other.canvasId,
        canvasName: canvasNames.get(other.canvasId) ?? other.canvasId,
      })
    }
  }

  const geometry = resolveGeometry(config)
  const issues = validateGeometry(geometry)
  const blocking = issues.find((issue) => issue.code === 'E_OVERLAP' || issue.code === 'E_TOO_LARGE' || issue.code === 'E_NO_SLOTS')
  if (blocking) return fail(blocking.code, blocking.message, { slotIds: blocking.slotIds })

  const albumId = layout.settings.albumId
  const album: Album | undefined = albumId ? store.albums.find((entry) => entry.id === albumId && entry.theme === 'canvas') : undefined
  if (!album) return fail('E_NO_ALBUM', 'Choose a canvas album before going live')
  const scenes = (album.scenes ?? []).filter((scene) => scene.enabled)
  if (scenes.length === 0) return fail('E_NO_SCENES', 'Enable at least one scene in the canvas album')
  for (const scene of scenes) {
    const parsed = canvasSceneSchema.safeParse(scene)
    if (!parsed.success) {
      return fail('E_SCENE_INVALID', 'A scene is invalid', {
        sceneId: scene.id,
        message: parsed.error.issues[0]?.message ?? 'Invalid scene',
      })
    }
  }

  const hasCanvasState = config.slots.map((slot) => rows.some((row) => row.instanceId === slot.frameId && Boolean(row.data.active || row.data.pending || row.data.identify)))
  const chosenLead = leadMs(input.leadMs, hasCanvasState)
  const effectiveAt = now + chosenLead
  const releaseAt = input.releaseAt ?? null
  if (releaseAt !== null && releaseAt <= effectiveAt) {
    return fail('E_RELEASE_AT', 'Release time must be after the canvas goes live')
  }
  const deploymentRevision = deploymentRevisionOf(rows, input.layoutId) + 1
  const deploymentAlbum: DeploymentAlbum = {
    id: album.id,
    name: album.name,
    scenes: scenes as CanvasScene[],
    order: album.slideshow.order,
    crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? 400,
  }

  const members: DeployMember[] = []
  const updates: { instanceId: string; state: CanvasState }[] = []
  for (const slot of config.slots) {
    if (!slot.frameId) continue
    const marker = geometry.slots.find((resolved) => resolved.slotId === slot.id)?.marker ?? members.length + 1
    const deployment: CanvasDeployment = {
      canvasId: layout.id,
      name: layout.name,
      revision: deploymentRevision,
      effectiveAt,
      releaseAt,
      slotId: slot.id,
      config,
      album: deploymentAlbum,
    }
    const state = stateForRow(rows.find((row) => row.instanceId === slot.frameId))
    updates.push({ instanceId: slot.frameId, state: { ...state, pending: deployment } })
    members.push({ slotId: slot.id, frameId: slot.frameId, marker })
  }

  const present = new Set(config.slots.map((slot) => slot.frameId))
  const skipped: SkippedMember[] = []
  for (const row of rows) {
    const owner = row.data.pending ?? row.data.active
    if (!owner || owner.canvasId !== input.layoutId || present.has(row.instanceId)) continue
    if (!enrolled.has(row.instanceId)) {
      skipped.push({ frameId: row.instanceId, reason: 'revoked' })
      continue
    }
    const state = stateForRow(row)
    const active = state.active?.canvasId === input.layoutId
      ? { ...state.active, releaseAt: effectiveAt }
      : state.active
    updates.push({
      instanceId: row.instanceId,
      state: { ...state, active, pending: null },
    })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_deploy', 'canvas', layout.id, {
    revision: deploymentRevision,
    effectiveAt,
    members: members.map((member) => member.frameId),
  })
  return {
    ok: true,
    revision: deploymentRevision,
    effectiveAt,
    leadMs: chosenLead,
    members,
    skipped,
  }
}

export async function releaseCanvas(input: {
  layoutId: string
  leadMs?: number
  actor: string
}): Promise<ReleaseResult> {
  const loaded = await loadLayout(input.layoutId)
  if ('ok' in loaded && !loaded.ok) return loaded
  const { layout } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()
  const enrolled = await enrolledIds()
  const affected = rows.filter((row) =>
    row.data.active?.canvasId === layout.id || row.data.pending?.canvasId === layout.id,
  )
  const chosenLead = leadMs(input.leadMs, affected.map(() => true))
  const releaseAt = now + chosenLead
  const revision = deploymentRevisionOf(rows, layout.id)
  const updates: { instanceId: string; state: CanvasState }[] = []
  const members: DeployMember[] = []
  const skipped: SkippedMember[] = []

  for (const row of affected) {
    if (!enrolled.has(row.instanceId)) {
      skipped.push({ frameId: row.instanceId, reason: 'revoked' })
      continue
    }
    const state = stateForRow(row)
    const active = state.active?.canvasId === layout.id
      ? { ...state.active, releaseAt }
      : state.active
    updates.push({ instanceId: row.instanceId, state: { ...state, active, pending: null } })
    const slot = loaded.config.slots.find((entry) => entry.frameId === row.instanceId)
    members.push({
      slotId: slot?.id ?? state.active?.slotId ?? '',
      frameId: row.instanceId,
      marker: 0,
    })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_release', 'canvas', layout.id, {
    revision,
    releaseAt,
    members: members.map((member) => member.frameId),
  })
  return { ok: true, revision, releaseAt, leadMs: chosenLead, members, skipped }
}

export async function identifyCanvas(input: {
  layoutId: string
  seconds: number
  actor: string
}): Promise<IdentifyResult> {
  if (!Number.isInteger(input.seconds) || input.seconds < 0 || input.seconds > 120) {
    return fail('E_IDENTIFY_SECONDS', 'Identify seconds must be 0 or between 1 and 120')
  }
  const loaded = await loadLayout(input.layoutId)
  if ('ok' in loaded && !loaded.ok) return loaded
  const { layout, config } = loaded
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()
  const enrolled = await enrolledIds()
  const geometry = resolveGeometry(config)
  const until = input.seconds === 0 ? null : now + input.seconds * 1000
  const updates: { instanceId: string; state: CanvasState }[] = []
  const members: DeployMember[] = []
  const skipped: SkippedMember[] = []

  for (const slot of config.slots) {
    if (!slot.frameId) {
      skipped.push({ frameId: slot.id, reason: 'unassigned' })
      continue
    }
    if (!enrolled.has(slot.frameId)) {
      skipped.push({ frameId: slot.frameId, reason: 'revoked' })
      continue
    }
    const row = rows.find((entry) => entry.instanceId === slot.frameId)
    const state = stateForRow(row)
    const marker = geometry.slots.find((resolved) => resolved.slotId === slot.id)?.marker ?? members.length + 1
    const identify: CanvasIdentify | null = until === null ? null : {
      until,
      canvasName: layout.name,
      frameId: slot.frameId,
      label: slot.label ?? null,
      marker,
      count: config.slots.filter((entry) => entry.frameId !== null).length,
    }
    updates.push({ instanceId: slot.frameId, state: { ...state, identify } })
    members.push({ slotId: slot.id, frameId: slot.frameId, marker })
  }

  await writeStates(updates)
  await audit(input.actor, 'canvas_identify', 'canvas', layout.id, {
    seconds: input.seconds,
    members: members.map((member) => member.frameId),
  })
  return { ok: true, until, members, skipped }
}

export async function getCanvasStatus(input: { layoutId?: string } = {}): Promise<CanvasStatus[]> {
  const store = await ensureCanvasLibrary()
  const now = Date.now()
  await pruneCanvasState(now)
  const rows = await listCanvasStates()
  const names = await frameNames()
  const layouts = input.layoutId
    ? store.layouts.filter((layout) => layout.id === input.layoutId && layout.kind === 'canvas')
    : store.layouts.filter((layout) => layout.kind === 'canvas')

  return layouts.map((layout): CanvasStatus => {
    const config = layout.canvas ?? { arrangement: 'row', gap: 0, align: 'center', slots: [], background: '#000000', markers: 'never', notifications: 'suppress', nightMode: 'inherit', maxFps: 30 }
    const geometry = resolveGeometry(config)
    const revision = deploymentRevisionOf(rows, layout.id)
    const skipped: SkippedMember[] = []
    const members = config.slots.map((slot, index): CanvasStatusMember => {
      const row = rows.find((entry) => entry.instanceId === slot.frameId)
      const marker = geometry.slots.find((resolved) => resolved.slotId === slot.id)?.marker ?? index + 1
      const uncertainty = row?.clockUncertaintyMs ?? null
      const clockQuality = uncertainty === null ? 'poor' : uncertainty < 20 ? 'good' : uncertainty < 50 ? 'fair' : 'poor'
      const problems: string[] = []
      if (!row?.reportedAt) problems.push('No report yet')
      else if (now - row.reportedAt.getTime() > 3 * pollDelayMs(Boolean(row.data.active || row.data.pending))) problems.push('Offline')
      const effectiveAt = row?.data.pending?.effectiveAt ?? row?.data.active?.effectiveAt ?? 0
      if (row && row.reportedRevision !== null && row.revision > row.reportedRevision && now >= effectiveAt) {
        problems.push('Out of date')
      }
      if (clockQuality === 'poor' || (uncertainty ?? 0) > 50) problems.push('Clock drift risk')
      if (row?.viewportW && row.viewportH) {
        const ratio = row.viewportW / row.viewportH
        const expected = FRAME_WIDTH / FRAME_HEIGHT
        if (Math.abs(ratio - expected) / expected > 0.01) problems.push('Wrong aspect ratio')
      }
      if (!slot.frameId) {
        skipped.push({ frameId: slot.id, reason: 'unassigned' })
      }
      return {
        slotId: slot.id,
        frameId: slot.frameId ?? '',
        name: slot.frameId ? names.get(slot.frameId) ?? slot.frameId : 'Empty slot',
        marker,
        deliveredRevision: row?.revision ?? 0,
        reportedRevision: row?.reportedRevision ?? null,
        reportedAt: row?.reportedAt ? row.reportedAt.toISOString() : null,
        clockOffsetMs: row?.clockOffsetMs ?? null,
        clockUncertaintyMs: uncertainty,
        clockQuality,
        viewportW: row?.viewportW ?? null,
        viewportH: row?.viewportH ?? null,
        fpsAvg: row?.fpsAvg ?? null,
        problems,
      }
    })
    return {
      layoutId: layout.id,
      name: layout.name,
      phase: canvasLayoutPhaseFromRows(layout.id, rows, now),
      revision,
      members,
      skipped,
    }
  })
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm vitest run lib/canvas/__tests__/service.test.ts
```

Expected: PASS. If the exclusivity test fails with `E_NO_ALBUM`, confirm the cloned layout keeps the `albumId` from the base layout and that only the original layout clears it.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/service.ts lib/canvas/__tests__/service.test.ts
git commit -m "feat(canvas): add deploy release identify and status service"
```

---

### Task 5: Canvas API routes

**Files:**
- Create: `lib/canvas/http.ts`
- Create: `app/api/canvas/library/route.ts`
- Create: `app/api/canvas/deploy/route.ts`
- Create: `app/api/canvas/release/route.ts`
- Create: `app/api/canvas/identify/route.ts`
- Test: `tests/canvas-routes.test.ts`

Before writing these files, re-read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `.../03-api-reference/03-file-conventions/route.md`. These routes use `resolveActor`, not `requireHostedOperator`, because automation uses `x-admin-token` and humans use a Clerk session.

- [ ] **Step 1: Create `lib/canvas/http.ts`**

```ts
import { NextResponse } from 'next/server'
import { resolveActor } from '@/lib/http-auth'
import type { CanvasFailure } from '@/lib/canvas/service'

export function consoleOnlyViolation(): NextResponse | null {
  if (!process.env.INSTANCE_ID) return null
  return NextResponse.json(
    { error: 'Canvas management is console only', code: 'E_CONSOLE_ONLY' },
    { status: 403 },
  )
}

export async function canvasActor(request: Request): Promise<
  { ok: true; actor: string } | { ok: false; response: NextResponse }
> {
  const violation = consoleOnlyViolation()
  if (violation) return { ok: false, response: violation }
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: outcome.reason },
        { status: outcome.reason === 'misconfigured' ? 500 : 401 },
      ),
    }
  }
  return { ok: true, actor: outcome.actor }
}

export function canvasErrorResponse(failure: CanvasFailure): NextResponse {
  const status = failure.code === 'E_FRAME_IN_USE'
    ? 409
    : failure.code === 'E_NOT_FOUND'
      ? 404
      : 422
  return NextResponse.json(
    { error: failure.error, code: failure.code, details: failure.details ?? null },
    { status },
  )
}
```

- [ ] **Step 2: Create `app/api/canvas/library/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { canvasActor } from '@/lib/canvas/http'
import { ensureCanvasLibrary } from '@/lib/canvas/library'
import { listInstanceCards } from '@/lib/console/service'
import { listCanvasStates } from '@/lib/canvas/state-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response

  const store = await ensureCanvasLibrary()
  const [cards, rows] = await Promise.all([listInstanceCards(), listCanvasStates()])
  const now = Date.now()
  const canvasNames = new Map(store.layouts.map((layout) => [layout.id, layout.name]))

  const frames = cards.map((card) => {
    const row = rows.find((entry) => entry.instanceId === card.id)
    const pending = row?.data.pending
    const active = row?.data.active
    const owner = pending ?? (active && (active.releaseAt === null || active.releaseAt > now) ? active : null)
    return {
      id: card.id,
      name: card.frame?.name ?? card.id,
      lastSeenAt: card.lastSeenAt ? new Date(card.lastSeenAt).toISOString() : null,
      inCanvas: owner ? {
        canvasId: owner.canvasId,
        name: canvasNames.get(owner.canvasId) ?? owner.canvasId,
        state: pending ? 'scheduled' as const : 'live' as const,
      } : null,
    }
  })

  return NextResponse.json({ store, frames }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
```

- [ ] **Step 3: Create `app/api/canvas/deploy/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canvasActor, canvasErrorResponse } from '@/lib/canvas/http'
import { deployCanvas } from '@/lib/canvas/service'

export const dynamic = 'force-dynamic'

const deploySchema = z.object({
  layoutId: z.string().min(1).max(40),
  leadMs: z.number().int().min(0).max(600_000).optional(),
  releaseAt: z.number().int().nullable().optional(),
}).strict()

export async function POST(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response
  const parsed = deploySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid deploy request' },
      { status: 400 },
    )
  }

  const result = await deployCanvas({ ...parsed.data, actor: gate.actor })
  if (!result.ok) return canvasErrorResponse(result)
  return NextResponse.json(result)
}
```

- [ ] **Step 4: Create `app/api/canvas/release/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canvasActor, canvasErrorResponse } from '@/lib/canvas/http'
import { releaseCanvas } from '@/lib/canvas/service'

export const dynamic = 'force-dynamic'

const releaseSchema = z.object({
  layoutId: z.string().min(1).max(40),
  leadMs: z.number().int().min(0).max(600_000).optional(),
}).strict()

export async function POST(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response
  const parsed = releaseSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid release request' },
      { status: 400 },
    )
  }

  const result = await releaseCanvas({ ...parsed.data, actor: gate.actor })
  if (!result.ok) return canvasErrorResponse(result)
  return NextResponse.json(result)
}
```

- [ ] **Step 5: Create `app/api/canvas/identify/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { canvasActor, canvasErrorResponse } from '@/lib/canvas/http'
import { identifyCanvas } from '@/lib/canvas/service'

export const dynamic = 'force-dynamic'

const identifySchema = z.object({
  layoutId: z.string().min(1).max(40),
  seconds: z.number().int().min(0).max(120),
}).strict()

export async function POST(request: Request) {
  const gate = await canvasActor(request)
  if (!gate.ok) return gate.response
  const parsed = identifySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid identify request' },
      { status: 400 },
    )
  }

  const result = await identifyCanvas({ ...parsed.data, actor: gate.actor })
  if (!result.ok) return canvasErrorResponse(result)
  return NextResponse.json(result)
}
```

No `GET /api/canvas/status` route is added in this phase. `getCanvasStatus` is already implemented and covered by the service unit test; Phase 3 adds the route and tab.

- [ ] **Step 6: Write the failing route test**

Create `tests/canvas-routes.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { nanoid } from 'nanoid'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-api'
  env.NODE_ENV = 'production'
  env.CONSOLE_ADMIN_TOKEN = 'canvas-api-admin'
})

afterEach(() => {
  delete env.INSTANCE_ID
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seed() {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { ensureCanvasLibrary, CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
  const { defaultSlideshow } = await import('@/lib/albums')
  const { emptySyncTestScene } = await import('@/lib/canvas/defaults')
  const store = await ensureCanvasLibrary()
  const now = new Date().toISOString()
  const albumId = nanoid(8)
  const layoutId = nanoid(8)
  const db = getDb()
  const tables = getTables()
  const ids = Array.from({ length: 16 }, (_, index) => `f${index}`)

  for (const id of ids) {
    await db.insert(tables.instances).values({ id, createdAt: new Date(), lastSeenAt: new Date() })
    await db.insert(tables.frameDocuments).values({
      id: nanoid(10), identifier: id, name: `Frame ${id}`,
      data: { activeId: null, layouts: [], presets: [], customFonts: [], schedule: { enabled: false, rules: [], night: { enabled: false } }, albums: [], experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } } },
      createdAt: new Date(), updatedAt: new Date(),
    })
  }

  store.albums.push({
    id: albumId, name: 'Canvas album', theme: 'canvas', items: [],
    scenes: [emptySyncTestScene(nanoid(8))], slideshow: defaultSlideshow('canvas'),
    createdAt: now, updatedAt: now,
  })
  store.layouts.push({
    id: layoutId, name: 'Wall', kind: 'canvas', widgets: [],
    settings: {
      resolution: '1080x1920', background: '#000000', dim: 0, locationName: '', lat: 0, lon: 0,
      units: 'metric', snap: true, gridSize: 20, albumId,
    },
    canvas: {
      arrangement: 'row', gap: 0, align: 'center',
      slots: [
        { id: 's1', frameId: 'f0', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 's2', frameId: 'f1', offset: { x: 0, y: 0 }, scale: 1 },
      ],
      background: '#000000', markers: 'identify', notifications: 'suppress',
      nightMode: 'inherit', maxFps: 30,
    },
    createdAt: now, updatedAt: now,
  })
  await db.update(tables.frameDocuments).set({ data: store })
    .where(eq(tables.frameDocuments.identifier, CANVAS_LIBRARY_ID))
  return { layoutId, albumId, ids }
}

async function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'canvas-api-admin' },
    body: JSON.stringify(body),
  })
}

async function mutateLibrary(fn: (store: any) => void) {
  const { mutateStore } = await import('@/lib/store')
  await mutateStore(fn, 'canvas-library')
}

describe('canvas API routes', () => {
  beforeEach(freshDb)

  it('deploys a canvas and reports the palette with inCanvas state', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    const response = await POST(await post('/api/canvas/deploy', { layoutId, leadMs: 1000 }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.leadMs).toBe(65_000)
    expect(json.members).toHaveLength(2)

    const { GET } = await import('@/app/api/canvas/library/route')
    const library = await GET(new NextRequest('http://localhost/api/canvas/library', {
      headers: { 'x-admin-token': 'canvas-api-admin' },
    }))
    expect(library.status).toBe(200)
    const payload = await library.json()
    expect(payload.frames).toHaveLength(16)
    expect(payload.frames.find((frame: { id: string }) => frame.id === 'f0').inCanvas).toEqual({
      canvasId: layoutId,
      name: 'Wall',
      state: 'scheduled',
    })
  })

  it('rejects unknown request keys with 400', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    const response = await POST(await post('/api/canvas/deploy', { layoutId, evil: true }))
    expect(response.status).toBe(400)
  })

  it('returns 403 from every management route on a kiosk', async () => {
    const { layoutId } = await seed()
    env.INSTANCE_ID = 'kiosk-1'
    const modules = await Promise.all([
      import('@/app/api/canvas/deploy/route'),
      import('@/app/api/canvas/release/route'),
      import('@/app/api/canvas/identify/route'),
    ])
    for (const module of modules) {
      const response = await module.POST(await post('/api/canvas/manage', { layoutId, seconds: 5 }))
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('E_CONSOLE_ONLY')
    }
  })

  it('reaches every deployment validation code', async () => {
    const { layoutId, albumId, ids } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')

    await mutateLibrary((s) => { s.layouts[0].canvas.slots = [] })
    expect((await POST(await post('/api/canvas/deploy', { layoutId }))).status).toBe(422)
    expect((await (await POST(await post('/api/canvas/deploy', { layoutId }))).json()).code).toBe('E_NO_SLOTS')

    await freshDb()
    const next = await seed()
    await mutateLibrary((s) => { s.layouts[0].canvas.slots[0].frameId = null })
    let res = await POST(await post('/api/canvas/deploy', { layoutId: next.layoutId }))
    expect((await res.json()).code).toBe('E_UNASSIGNED_SLOT')

    await freshDb()
    const unknown = await seed()
    await mutateLibrary((s) => { s.layouts[0].canvas.slots[0].frameId = 'ghost' })
    res = await POST(await post('/api/canvas/deploy', { layoutId: unknown.layoutId }))
    expect((await res.json()).code).toBe('E_UNKNOWN_FRAME')

    await freshDb()
    const noAlbum = await seed()
    await mutateLibrary((s) => { s.layouts[0].settings.albumId = null })
    res = await POST(await post('/api/canvas/deploy', { layoutId: noAlbum.layoutId }))
    expect((await res.json()).code).toBe('E_NO_ALBUM')

    await freshDb()
    const noScenes = await seed()
    await mutateLibrary((s) => { s.albums[0].scenes = [] })
    res = await POST(await post('/api/canvas/deploy', { layoutId: noScenes.layoutId }))
    expect((await res.json()).code).toBe('E_NO_SCENES')

    await freshDb()
    const overlap = await seed()
    await mutateLibrary((s) => {
      s.layouts[0].canvas.slots[1].offset.x = -1000
    })
    res = await POST(await post('/api/canvas/deploy', { layoutId: overlap.layoutId }))
    expect((await res.json()).code).toBe('E_OVERLAP')

    await freshDb()
    const tooLarge = await seed()
    await mutateLibrary((s) => {
      s.layouts[0].canvas.slots = ids.map((frameId, index) => ({
        id: `s${index}`, frameId, offset: { x: 0, y: 0 }, scale: 2,
      }))
    })
    res = await POST(await post('/api/canvas/deploy', { layoutId: tooLarge.layoutId }))
    expect((await res.json()).code).toBe('E_TOO_LARGE')

    await freshDb()
    const invalidScene = await seed()
    await mutateLibrary((s) => { s.albums[0].scenes[0].durationSec = 1 })
    res = await POST(await post('/api/canvas/deploy', { layoutId: invalidScene.layoutId }))
    expect((await res.json()).code).toBe('E_SCENE_INVALID')
    expect(albumId).toBeTruthy()
  })

  it('returns 409 for a frame on another scheduled canvas', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    await POST(await post('/api/canvas/deploy', { layoutId }))
    await mutateLibrary((s) => {
      s.layouts.push({ ...structuredClone(s.layouts[0]), id: 'other-wall', name: 'Other wall' })
    })
    const res = await POST(await post('/api/canvas/deploy', { layoutId: 'other-wall' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('E_FRAME_IN_USE')
  })

  it('refuses to delete a scheduled or live canvas layout with E_LIVE', async () => {
    const { layoutId } = await seed()
    const { POST } = await import('@/app/api/canvas/deploy/route')
    await POST(await post('/api/canvas/deploy', { layoutId }))
    const { DELETE } = await import('@/app/api/layouts/[id]/route')
    const res = await DELETE(new Request(`http://localhost/api/layouts/${layoutId}?frame=canvas-library`, {
      method: 'DELETE',
      headers: { 'x-admin-token': 'canvas-api-admin' },
    }), { params: Promise.resolve({ id: layoutId }) })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('E_LIVE')
  })

  it('releases a live canvas and clears draft identification', async () => {
    const { layoutId } = await seed()
    const deploy = await import('@/app/api/canvas/deploy/route')
    const release = await import('@/app/api/canvas/release/route')
    const identify = await import('@/app/api/canvas/identify/route')

    await deploy.POST(await post('/api/canvas/deploy', { layoutId }))
    const released = await release.POST(await post('/api/canvas/release', { layoutId }))
    expect(released.status).toBe(200)
    const releaseJson = await released.json()
    expect(releaseJson.releaseAt).toBeGreaterThan(Date.now())

    const identified = await identify.POST(await post('/api/canvas/identify', { layoutId, seconds: 20 }))
    expect(identified.status).toBe(200)
    const cleared = await identify.POST(await post('/api/canvas/identify', { layoutId, seconds: 0 }))
    expect((await cleared.json()).until).toBeNull()
  })
})
```

- [ ] **Step 7: Run the route test and commit**

```bash
pnpm vitest run tests/canvas-routes.test.ts
pnpm test
git add lib/canvas/http.ts app/api/canvas tests/canvas-routes.test.ts
git commit -m "feat(canvas): add console canvas management routes"
```

Expected: both test commands PASS before the commit.

---

### Task 6: Browser helpers and the library hook

**Files:**
- Modify: `lib/frame-utils.ts`
- Create: `lib/canvas/measure-client.ts`
- Create: `hooks/use-canvas-library.ts`
- Test: `tests/canvas-client-helpers.test.ts`

- [ ] **Step 1: Write the failing source test**

Create `tests/canvas-client-helpers.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const frameUtils = readFileSync(path.join(root, 'lib/frame-utils.ts'), 'utf8')
const measureClient = readFileSync(path.join(root, 'lib/canvas/measure-client.ts'), 'utf8')
const hook = readFileSync(path.join(root, 'hooks/use-canvas-library.ts'), 'utf8')

describe('canvas browser helpers', () => {
  it('downscales to the long side and keeps alpha', () => {
    expect(frameUtils).toContain('export async function downscaleToDataUri(file: File, maxDim = 512, mime: LogoMime =')
    expect(frameUtils).toContain("const scale = Math.min(1, maxDim / Math.max(img.width, img.height))")
    expect(frameUtils).toContain("canvas.toDataURL(mime")
    expect(frameUtils).toContain('MAX_LOGO_DATA_URI_BYTES')
    expect(frameUtils).not.toContain("toDataURL('image/jpeg', 0.82)\n}")
  })

  it('measures marquee strips in the browser only', () => {
    expect(measureClient).toContain("'use client'")
    expect(measureClient).toContain('export function measureMarquee(config: MarqueeConfig): MarqueeStrip')
    expect(measureClient).toContain('ctx.measureText')
    expect(measureClient).toContain("config.layout === 'block'")
  })

  it('routes library mutations to the reserved frame id', () => {
    expect(hook).toContain("useFrameStore(EMPTY_CANVAS_LIBRARY_STORE, CANVAS_LIBRARY_ID)")
    expect(hook).toContain("from '@/lib/canvas/ids'")
    expect(hook).toContain("path.startsWith('/api/layouts') || path.startsWith('/api/albums')")
    expect(hook).toContain("frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}")
    expect(hook).toContain("'/api/canvas/deploy'")
    expect(hook).toContain("'/api/canvas/release'")
    expect(hook).toContain("'/api/canvas/identify'")
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-client-helpers.test.ts
```

Expected: FAIL because the new files and helper do not exist.

- [ ] **Step 3: Extend `lib/frame-utils.ts`**

Append to the end of the file:

```ts
export type LogoMime = 'image/png' | 'image/webp' | 'image/jpeg'

export const MAX_LOGO_DATA_URI_BYTES = 200 * 1024

const LOGO_MIMES: LogoMime[] = ['image/png', 'image/webp', 'image/jpeg']

/**
 * Browser-only: re-encode an uploaded canvas logo on its long side while
 * preserving alpha. Unlike downscaleImage, this never forces JPEG.
 */
export async function downscaleToDataUri(file: File, maxDim = 512, mime: LogoMime = 'image/png'): Promise<string> {
  if (!LOGO_MIMES.includes(mime)) throw new Error('Use PNG, WebP or JPEG')
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0, width, height)
    const dataUri = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.82 : 0.92)
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
    const bytes = Math.floor((base64.replace(/\s+/g, '').length * 3) / 4)
    if (bytes > MAX_LOGO_DATA_URI_BYTES) throw new Error('Logo is too large after downscale')
    return dataUri
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

- [ ] **Step 4: Create `lib/canvas/measure-client.ts`**

```ts
'use client'

import { fontStack } from '@/lib/fonts'
import type { MarqueeConfig, MarqueeStrip } from '@/lib/types'

const MAX_SEGMENTS = 400

export function measureMarquee(config: MarqueeConfig): MarqueeStrip {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.font = `${config.style.fontWeight} ${config.fontSize}px ${fontStack(config.style.fontFamily)}`

  const segments: MarqueeStrip['segments'] = []
  let at = 0
  for (let index = 0; index < config.lines.length; index += 1) {
    const text = config.lines[index] ?? ''
    const width = Math.max(1, ctx.measureText(text).width)
    if (segments.length >= MAX_SEGMENTS) break
    segments.push({ text, at, w: width })
    at += width
    if (index < config.lines.length - 1) {
      const separatorWidth = Math.max(1, ctx.measureText(config.separator).width)
      if (segments.length < MAX_SEGMENTS) segments.push({ text: config.separator, at, w: separatorWidth })
      at += separatorWidth
    }
  }

  return {
    lengthPx: Math.max(1, at),
    crossPx: Math.max(1, config.lineHeight, config.fontSize * 1.2),
    segments,
  }
}

/** Measure on save in the console. Block layout stores no strip; the server estimates it. */
export function withMeasuredStrip(config: MarqueeConfig): MarqueeConfig {
  if (config.layout === 'block') {
    const { strip: _ignored, ...rest } = config
    return rest
  }
  return { ...config, strip: measureMarquee(config) }
}
```

- [ ] **Step 5: Create `hooks/use-canvas-library.ts`**

```ts
'use client'

import { useCallback } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { useFrameStore } from '@/hooks/use-frame-store'
import { CANVAS_LIBRARY_ID } from '@/lib/canvas/ids'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import type { Album, CanvasConfig, FrameStore, Slideshow } from '@/lib/types'

export const EMPTY_CANVAS_LIBRARY_STORE: FrameStore = {
  activeId: null,
  layouts: [],
  presets: [],
  customFonts: [],
  schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:30', end: '06:30', brightness: 35, warmth: 40, hideSeconds: true } },
  albums: [],
  experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
}

export type CanvasFrame = {
  id: string
  name: string
  lastSeenAt: string | null
  inCanvas: { canvasId: string; name: string; state: 'scheduled' | 'live' } | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error('Request failed')
  return response.json()
}

async function call(path: string, method: string, body?: unknown): Promise<any> {
  const framed = path.startsWith('/api/layouts') || path.startsWith('/api/albums')
    ? `${path}${path.includes('?') ? '&' : '?'}frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}`
    : path
  const response = await fetch(framed, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'Something went wrong')
  await Promise.all([
    mutateCache(`/api/store?frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}`),
    mutateCache('/api/canvas/library'),
  ])
  return json
}

export function useCanvasLibrary() {
  const { store } = useFrameStore(EMPTY_CANVAS_LIBRARY_STORE, CANVAS_LIBRARY_ID)
  const { data } = useSWR<{ store: FrameStore; frames: CanvasFrame[] }>('/api/canvas/library', fetcher, {
    revalidateOnFocus: false,
    fallbackData: { store: EMPTY_CANVAS_LIBRARY_STORE, frames: [] },
  })

  const createLayout = useCallback((name: string, canvas: CanvasConfig = emptyCanvasConfig()) =>
    call('/api/layouts', 'POST', {
      name, kind: 'canvas', canvas, widgets: [],
      settings: { ...EMPTY_CANVAS_LIBRARY_STORE.layouts[0]?.settings ?? {
        resolution: '1080x1920', background: '#000000', dim: 0, locationName: '', lat: 0, lon: 0,
        units: 'metric', snap: true, gridSize: 20, albumId: null,
      } },
    }), [])

  const updateLayout = useCallback((id: string, layout: any) => call(`/api/layouts/${id}`, 'PUT', {
    name: layout.name,
    kind: 'canvas',
    canvas: layout.canvas,
    widgets: [],
    settings: layout.settings,
  }), [])

  const deleteLayout = useCallback((id: string) => call(`/api/layouts/${id}`, 'DELETE'), [])

  const createAlbum = useCallback((name: string) => call('/api/albums', 'POST', {
    name, theme: 'canvas',
  }), [])

  const updateAlbum = useCallback((id: string, album: Album) => call(`/api/albums/${id}`, 'PUT', {
    name: album.name,
    theme: 'canvas',
    items: [],
    slideshow: album.slideshow,
    scenes: album.scenes ?? [],
  }), [])

  const deleteAlbum = useCallback((id: string) => call(`/api/albums/${id}`, 'DELETE'), [])

  const deploy = useCallback((layoutId: string, options: { leadMs?: number; releaseAt?: number | null } = {}) =>
    call('/api/canvas/deploy', 'POST', { layoutId, ...options }), [])

  const release = useCallback((layoutId: string, leadMs?: number) =>
    call('/api/canvas/release', 'POST', { layoutId, leadMs }), [])

  const identify = useCallback((layoutId: string, seconds: number) =>
    call('/api/canvas/identify', 'POST', { layoutId, seconds }), [])

  return {
    store,
    frames: data?.frames ?? [],
    createLayout,
    updateLayout,
    deleteLayout,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    deploy,
    release,
    identify,
  }
}

export function canvasSlideshow(overrides: Partial<Slideshow> = {}): Slideshow {
  return {
    presentation: 'canvas',
    transition: 'none',
    kenBurns: false,
    interval: 30,
    order: 'sequence',
    artSize: 74,
    artPosition: 'center',
    backdrop: 'blur',
    backdropColor: '#14161b',
    canvas: { crossfadeMs: 400 },
    ...overrides,
  }
}
```

- [ ] **Step 6: Run the source test and commit**

```bash
pnpm vitest run tests/canvas-client-helpers.test.ts
git add lib/frame-utils.ts lib/canvas/measure-client.ts hooks/use-canvas-library.ts tests/canvas-client-helpers.test.ts
git commit -m "feat(canvas): add browser helpers and library hook"
```

Expected: PASS before the commit.

---

### Task 7: Scene field metadata and authoring forms

**Files:**
- Create: `lib/canvas/scenes/fields.ts`
- Create: `components/editor/canvas-admin/scene-fields.tsx`
- Create: `components/editor/canvas-admin/marquee-lines-editor.tsx`
- Create: `components/editor/canvas-admin/logo-upload.tsx`
- Create: `components/editor/canvas-admin/album-editor.tsx`
- Test: `tests/canvas-scene-forms.test.ts`

Phase 1 defines `SceneField` (a dot path into scene config) and `SCENE_META` (label, description, icon). This task supplies the field lists and the generic renderer. Only the four Phase 1 scene types are used.

- [ ] **Step 1: Write the failing source test**

Create `tests/canvas-scene-forms.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas scene authoring forms', () => {
  it('declares fields for every phase 1 scene type', () => {
    const source = read('lib/canvas/scenes/fields.ts')
    for (const type of ['marquee', 'bounce', 'pong', 'sync-test']) {
      expect(source).toContain(`  ${type}: [`)
    }
    expect(source).toContain("key: 'lines'")
    expect(source).toContain("key: 'style.fontFamily'")
    expect(source).toContain("key: 'rallyHits.0'")
  })

  it('renders every SceneField kind and writes dot paths', () => {
    const source = read('components/editor/canvas-admin/scene-fields.tsx')
    for (const kind of ['number', 'slider', 'text', 'textarea', 'lines', 'select', 'color', 'toggle', 'font', 'style', 'image']) {
      expect(source).toContain(`case '${kind}'`)
    }
    expect(source).toContain('function setPath(')
    expect(source).toContain('function getPath(')
  })

  it('keeps marquee lines and logo data URIs local', () => {
    const lines = read('components/editor/canvas-admin/marquee-lines-editor.tsx')
    const logo = read('components/editor/canvas-admin/logo-upload.tsx')
    const album = read('components/editor/canvas-admin/album-editor.tsx')
    expect(lines).toContain('withMeasuredStrip')
    expect(lines).toContain('config.layout === \\'block\\'')
    expect(logo).toContain('downscaleToDataUri')
    expect(logo).toContain('startsWith(\\'data:image/\\')')
    expect(album).toContain('Unpublished changes')
    expect(album).toContain('canvasSceneSchema.safeParse')
    expect(album).toContain('SCENE_META[scene.type]')
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-scene-forms.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Create `lib/canvas/scenes/fields.ts`**

```ts
import type { CanvasSceneType } from '@/lib/types'
import type { SceneField } from '@/lib/canvas/scenes/types'

const ALIGN = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
]

export const SCENE_FIELDS: Record<CanvasSceneType, SceneField[]> = {
  marquee: [
    { key: 'lines', label: 'Text lines', kind: 'lines', maxLines: 40, maxLength: 400, help: 'One line per row. Block layout keeps line breaks.' },
    { key: 'layout', label: 'Line layout', kind: 'select', options: [{ value: 'line', label: 'Single line' }, { value: 'block', label: 'Block' }] },
    { key: 'separator', label: 'Separator', kind: 'text', maxLength: 40, placeholder: '   •   ' },
    { key: 'direction', label: 'Direction', kind: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }] },
    { key: 'orientation', label: 'Text rotation', kind: 'select', options: [{ value: 'upright', label: 'Upright' }, { value: 'rotated', label: 'Rotated' }] },
    { key: 'speed', label: 'Speed', kind: 'number', min: 20, max: 1200, step: 10 },
    { key: 'repeat', label: 'Repeat', kind: 'toggle' },
    { key: 'gap', label: 'Gap between copies', kind: 'number', min: 0, max: 4000, step: 20 },
    { key: 'lineHeight', label: 'Line height', kind: 'number', min: 20, max: 800, step: 10 },
    { key: 'fontSize', label: 'Font size', kind: 'number', min: 20, max: 400, step: 10 },
    { key: 'align', label: 'Cross-axis align', kind: 'select', options: ALIGN },
    { key: 'crossOffset', label: 'Cross-axis offset', kind: 'number', min: -2000, max: 2000, step: 10 },
    { key: 'style.fontFamily', label: 'Font', kind: 'font' },
    { key: 'style.fontWeight', label: 'Font weight', kind: 'number', min: 100, max: 900, step: 100 },
    { key: 'style.color', label: 'Text colour', kind: 'color' },
    { key: 'style.accent', label: 'Accent', kind: 'color' },
    { key: 'style.shadow', label: 'Text shadow', kind: 'toggle' },
  ],
  bounce: [
    { key: 'logo.kind', label: 'Logo type', kind: 'select', options: [{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }] },
    { key: 'logo.text', label: 'Logo text', kind: 'text', maxLength: 40 },
    { key: 'logo.src', label: 'Logo image', kind: 'image', accept: ['image/png', 'image/webp', 'image/jpeg'], maxBytes: 200 * 1024 },
    { key: 'logo.shape', label: 'Shape', kind: 'select', options: [{ value: 'none', label: 'None' }, { value: 'ellipse', label: 'Ellipse' }, { value: 'pill', label: 'Pill' }, { value: 'rounded', label: 'Rounded' }] },
    { key: 'logo.w', label: 'Width', kind: 'number', min: 40, max: 2000, step: 10 },
    { key: 'logo.h', label: 'Height', kind: 'number', min: 40, max: 2000, step: 10 },
    { key: 'speed', label: 'Speed', kind: 'number', min: 20, max: 1200, step: 10 },
    { key: 'angleDeg', label: 'Start angle', kind: 'number', min: -360, max: 360, step: 5 },
    { key: 'startMode', label: 'Start position', kind: 'select', options: [{ value: 'seed', label: 'Random' }, { value: 'center', label: 'Centre' }] },
    { key: 'tint.mode', label: 'Tint', kind: 'select', options: [{ value: 'none', label: 'None' }, { value: 'cycle', label: 'Cycle' }, { value: 'fixed', label: 'Fixed' }] },
    { key: 'tint.fixed', label: 'Fixed tint', kind: 'color' },
    { key: 'tint.colors', label: 'Cycle colours', kind: 'lines', maxLines: 8, maxLength: 20 },
    { key: 'cornerCelebration', label: 'Corner effects', kind: 'toggle' },
    { key: 'trail.enabled', label: 'Trail', kind: 'toggle' },
    { key: 'trail.length', label: 'Trail length', kind: 'number', min: 0, max: 40, step: 1 },
    { key: 'trail.spacingMs', label: 'Trail spacing', kind: 'number', min: 16, max: 500, step: 16 },
  ],
  pong: [
    { key: 'axis', label: 'Axis', kind: 'select', options: [{ value: 'auto', label: 'Auto' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
    { key: 'paddle.w', label: 'Paddle width', kind: 'number', min: 10, max: 400, step: 10 },
    { key: 'paddle.h', label: 'Paddle height', kind: 'number', min: 20, max: 800, step: 10 },
    { key: 'paddle.inset', label: 'Paddle inset', kind: 'number', min: 0, max: 1000, step: 10 },
    { key: 'ballSize', label: 'Ball size', kind: 'number', min: 10, max: 400, step: 10 },
    { key: 'baseSpeed', label: 'Ball speed', kind: 'number', min: 100, max: 2000, step: 20 },
    { key: 'rallyHits.0', label: 'Minimum rally', kind: 'number', min: 1, max: 40, step: 1 },
    { key: 'rallyHits.1', label: 'Maximum rally', kind: 'number', min: 1, max: 40, step: 1 },
    { key: 'pointsPerMatch', label: 'Points per match', kind: 'number', min: 1, max: 20, step: 1 },
    { key: 'serveDelayMs', label: 'Serve delay', kind: 'number', min: 0, max: 5000, step: 100 },
    { key: 'pointPauseMs', label: 'Point pause', kind: 'number', min: 0, max: 5000, step: 100 },
    { key: 'showScore', label: 'Show score', kind: 'toggle' },
    { key: 'colors.ball', label: 'Ball colour', kind: 'color' },
    { key: 'colors.paddles', label: 'Paddle colour', kind: 'color' },
    { key: 'colors.net', label: 'Net colour', kind: 'color' },
    { key: 'colors.text', label: 'Score colour', kind: 'color' },
    { key: 'scoreStyle.fontFamily', label: 'Score font', kind: 'font' },
    { key: 'scoreStyle.color', label: 'Score text colour', kind: 'color' },
  ],
  'sync-test': [
    { key: 'periodSec', label: 'Sweep period', kind: 'number', min: 1, max: 30, step: 1 },
    { key: 'showGrid', label: 'Show grid', kind: 'toggle' },
    { key: 'showBezels', label: 'Show bezels', kind: 'toggle' },
  ],
}
```

- [ ] **Step 4: Create `components/editor/canvas-admin/scene-fields.tsx`**

```tsx
'use client'

import { ColorField, SelectField, ToggleField } from '@/components/editor/controls'
import { BUILTIN_FONTS, fontLabel } from '@/lib/fonts'
import type { SceneField } from '@/lib/canvas/scenes/types'
import { LogoUpload } from './logo-upload'
import { MarqueeLinesEditor } from './marquee-lines-editor'

type ConfigObject = Record<string, unknown>

export function getPath(root: ConfigObject, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as ConfigObject)[part]
    return undefined
  }, root)
}

export function setPath<T extends ConfigObject>(root: T, key: string, value: unknown): T {
  const next = structuredClone(root)
  const parts = key.split('.')
  let cursor: ConfigObject = next
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}
    cursor = cursor[part] as ConfigObject
  }
  cursor[parts[parts.length - 1]] = value
  return next
}

const NUMBER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

function FieldRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {help && <p className="text-[11px] leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  )
}

export function SceneFields({
  fields,
  config,
  onChange,
}: {
  fields: SceneField[]
  config: ConfigObject
  onChange: (config: ConfigObject) => void
}) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {fields.map((field) => {
        const id = `scene-${field.key.replace(/\./g, '-')}`
        const value = getPath(config, field.key)
        const write = (next: unknown) => onChange(setPath(config, field.key, next))

        if (field.kind === 'lines') return (
          <FieldRow key={field.key} label={field.label} help={field.help}>
            <MarqueeLinesEditor
              value={Array.isArray(value) ? value.map(String) : []}
              maxLines={field.maxLines}
              maxLength={field.maxLength}
              colorMode={field.key === 'tint.colors'}
              onChange={write}
            />
          </FieldRow>
        )
        if (field.kind === 'image') return (
          <FieldRow key={field.key} label={field.label} help={field.help}>
            <LogoUpload
              value={typeof value === 'string' ? value : ''}
              accept={field.accept}
              maxBytes={field.maxBytes}
              onChange={write}
            />
          </FieldRow>
        )
        if (field.kind === 'toggle') return (
          <ToggleField key={field.key} label={field.label} checked={Boolean(value)} onChange={(v) => write(v)} />
        )
        if (field.kind === 'color') return (
          <ColorField key={field.key} label={field.label} value={String(value ?? '#ffffff')} onChange={(v) => write(v)} />
        )
        if (field.kind === 'font') return (
          <SelectField
            key={field.key}
            label={field.label}
            value={String(value ?? BUILTIN_FONTS[0].id)}
            options={BUILTIN_FONTS.map((font) => ({ value: font.id, label: fontLabel(font.id) }))}
            onChange={(v) => write(v)}
          />
        )
        if (field.kind === 'select') return (
          <SelectField
            key={field.key}
            label={field.label}
            value={String(value ?? field.options[0].value)}
            options={field.options}
            onChange={(v) => write(v)}
          />
        )
        if (field.kind === 'number' || field.kind === 'slider') return (
          <FieldRow key={field.key} label={`${field.label} (${NUMBER.format(Number(value ?? field.min))})`} help={field.help}>
            {(field.kind === 'slider' || field.step !== undefined) ? (
              <input
                id={id}
                type="range"
                aria-label={field.label}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={Number(value ?? field.min)}
                onChange={(e) => write(Number(e.target.value))}
                className="w-full accent-primary"
              />
            ) : (
              <input
                id={id}
                type="number"
                aria-label={field.label}
                min={field.min}
                max={field.max}
                value={Number(value ?? field.min)}
                onChange={(e) => write(Math.max(field.min, Math.min(field.max, Number(e.target.value))))}
                className="editor-control h-9 w-full px-2"
              />
            )}
          </FieldRow>
        )
        if (field.kind === 'style') return (
          <FieldRow key={field.key} label={field.label} help={field.help}>
            <code className="text-[11px] text-muted-foreground">{JSON.stringify(value ?? {})}</code>
          </FieldRow>
        )
        return (
          <FieldRow key={field.key} label={field.label} help={field.help}>
            <input
              id={id}
              type="text"
              aria-label={field.label}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              value={String(value ?? '')}
              onChange={(e) => write(e.target.value)}
              className="editor-control h-9 w-full px-2"
            />
          </FieldRow>
        )
      })}
    </div>
  )
}
```

Field ids are derived from the dot path so no hook runs inside the render loop.

- [ ] **Step 5: Create `components/editor/canvas-admin/marquee-lines-editor.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { withMeasuredStrip } from '@/lib/canvas/measure-client'

export function MarqueeLinesEditor({
  value,
  maxLines,
  maxLength,
  colorMode = false,
  onChange,
}: {
  value: string[]
  maxLines: number
  maxLength: number
  colorMode?: boolean
  onChange: (value: string[] | Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(value.join('\n'))
  const [error, setError] = useState<string | null>(null)

  function commit(next: string) {
    setDraft(next)
    const lines = next.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0 || lines.length > maxLines) {
      setError(`Use between 1 and ${maxLines} entries`)
      return
    }
    if (lines.some((line) => line.length > maxLength)) {
      setError(`Each entry must be ${maxLength} characters or fewer`)
      return
    }
    setError(null)
    if (colorMode) {
      onChange({ colors: lines })
      return
    }
    try {
      const config = withMeasuredStrip({ lines } as never)
      onChange({ lines, strip: (config as { strip?: unknown }).strip ?? null })
    } catch {
      onChange({ lines })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label={colorMode ? 'Colours' : 'Marquee lines'}
        rows={Math.min(12, Math.max(3, value.length + 1))}
        maxLength={maxLength * maxLines}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        className="editor-control min-h-20 w-full p-2 font-mono text-xs"
      />
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        {value.length}/{maxLines} entries. Strip measurements are written to config on save.
      </p>
      <EditorButton
        type="button"
        variant="quiet"
        onClick={() => {
          setDraft('')
          onChange(colorMode ? { colors: [] } : { lines: [] })
        }}
      >
        Clear
      </EditorButton>
    </div>
  )
}
```

For `tint.colors` the editor writes `{ colors }`, and `setPath` places it under `tint.colors`, so the field value becomes an object. Step 6 normalises that back to a string array before validation. The marquee strip is written into `config.strip` through the `lines` key; the server estimates it when absent, so an empty or stale strip never blocks a deployment.

- [ ] **Step 6: Create `components/editor/canvas-admin/logo-upload.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { downscaleToDataUri } from '@/lib/frame-utils'

export function LogoUpload({
  value,
  accept,
  maxBytes,
  onChange,
}: {
  value: string
  accept: string[]
  maxBytes: number
  onChange: (value: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (!accept.includes(file.type)) throw new Error(`Use ${accept.join(', ')}`)
      const dataUri = await downscaleToDataUri(file, 512, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png')
      if (!dataUri.startsWith('data:image/')) throw new Error('Image encoding failed')
      if (dataUri.length > maxBytes * 2) throw new Error('Logo is too large')
      onChange(dataUri)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be used')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.startsWith('data:image/') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Logo preview" className="h-20 w-auto max-w-full rounded border border-border object-contain" />
      ) : (
        <p className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">No image</p>
      )}
      <input
        ref={input}
        type="file"
        accept={accept.join(',')}
        aria-label="Upload logo"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <EditorButton type="button" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Processing…' : value ? 'Replace image' : 'Choose image'}
      </EditorButton>
      {value && (
        <EditorButton type="button" variant="quiet" onClick={() => onChange('')}>Remove image</EditorButton>
      )}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">Stored in the scene as a data URI. Kiosks never fetch an upload URL.</p>
    </div>
  )
}
```

- [ ] **Step 7: Create `components/editor/canvas-admin/album-editor.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { EditorButton, SelectField, SliderField } from '@/components/editor/controls'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { SCENE_FIELDS } from '@/lib/canvas/scenes/fields'
import { SCENE_META, defaultScene } from '@/lib/canvas/scenes/registry'
import type { CanvasScene, CanvasSceneType } from '@/lib/types'
import type { ResolvedGeometry } from '@/lib/canvas/geometry'
import type { Album, CanvasAlbumSlideshow } from '@/lib/canvas/admin-types'
import { SceneFields } from './scene-fields'

function normaliseConfig(scene: CanvasScene): CanvasScene {
  const config = structuredClone(scene.config) as Record<string, unknown>
  if (scene.type === 'marquee' && config.lines && !Array.isArray(config.lines) && typeof config.lines === 'object') {
    const wrapper = config.lines as { lines?: string[]; strip?: unknown }
    config.lines = wrapper.lines ?? []
    if (wrapper.strip && typeof wrapper.strip === 'object') config.strip = wrapper.strip
  }
  if (scene.type === 'bounce') {
    const logo = config.logo as Record<string, unknown>
    const tint = config.tint as Record<string, unknown>
    if (logo.src && typeof logo.src === 'object') logo.src = ''
    if (tint.colors && !Array.isArray(tint.colors) && typeof tint.colors === 'object') {
      tint.colors = (tint.colors as { colors?: string[] }).colors ?? []
    }
  }
  return { ...scene, config } as CanvasScene
}

function problemsFor(album: Album): string[] {
  const problems: string[] = []
  const scenes = (album.scenes ?? []).filter((scene) => scene.enabled)
  if (scenes.length === 0) problems.push('Enable at least one scene before going live.')
  for (const scene of album.scenes ?? []) {
    const parsed = canvasSceneSchema.safeParse(normaliseConfig(scene))
    if (!parsed.success) {
      problems.push(`${scene.name}: ${parsed.error.issues[0]?.message ?? 'invalid scene'}`)
      continue
    }
    if (scene.durationSec < 5 || scene.durationSec > 600) problems.push(`${scene.name}: duration must be 5 to 600 s.`)
    const json = JSON.stringify(scene.config)
    if (json.includes('/api/uploads/') || json.includes('/api/media/')) {
      problems.push(`${scene.name}: embed logos as data URIs, not upload URLs.`)
    }
  }
  return problems
}

export function AlbumEditor({
  album,
  geometry,
  dirty,
  onChange,
  onDelete,
}: {
  album: Album
  geometry: ResolvedGeometry
  dirty: boolean
  onChange: (album: Album) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const problems = problemsFor(album)
  const scenes = album.scenes ?? []

  function updateScene(id: string, fn: (scene: CanvasScene) => CanvasScene) {
    onChange({ ...album, scenes: scenes.map((scene) => scene.id === id ? fn(scene) : scene) })
  }

  function addScene(type: CanvasSceneType) {
    onChange({ ...album, scenes: [...scenes, defaultScene(type, geometry)] })
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2">
        <input
          aria-label="Album name"
          value={album.name}
          maxLength={80}
          onChange={(e) => onChange({ ...album, name: e.target.value })}
          className="editor-control h-9 min-w-0 flex-1 px-2"
        />
        <EditorButton type="button" variant="destructive" aria-label="Delete album" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
        </EditorButton>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
        <span aria-live="polite" className={dirty ? 'text-amber-600' : 'text-muted-foreground'}>
          {dirty ? 'Unpublished changes' : 'All changes saved'}
        </span>
      </div>

      <SelectField
        label="Scene order"
        value={album.slideshow.order}
        options={[{ value: 'sequence', label: 'Sequence' }, { value: 'shuffle', label: 'Shuffle' }]}
        onChange={(v) => onChange({ ...album, slideshow: { ...album.slideshow, order: v as CanvasAlbumSlideshow['order'] } })}
      />
      <SliderField
        label="Crossfade"
        value={album.slideshow.canvas?.crossfadeMs ?? 400}
        min={0}
        max={1500}
        step={50}
        suffix="ms"
        onChange={(v) => onChange({
          ...album,
          slideshow: { ...album.slideshow, canvas: { crossfadeMs: v } },
        })}
      />

      <section aria-label="Scenes" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Scenes</h3>
          <EditorButton type="button" variant="secondary" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" aria-hidden /> Add scene
          </EditorButton>
        </div>
        {adding && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-2">
            {(Object.keys(SCENE_META) as CanvasSceneType[]).map((type) => {
              const meta = SCENE_META[type]
              return (
                <EditorButton key={type} type="button" variant="quiet" onClick={() => addScene(type)}>
                  <meta.icon className="size-4" aria-hidden /> {meta.label}
                </EditorButton>
              )
            })}
          </div>
        )}
        {scenes.length === 0 && <p className="text-xs text-muted-foreground">No scenes yet.</p>}
        {scenes.map((scene) => {
          const meta = SCENE_META[scene.type]
          const open = expanded === scene.id
          return (
            <div key={scene.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 p-2">
                <input
                  type="checkbox"
                  aria-label={`Enable ${scene.name}`}
                  checked={scene.enabled}
                  onChange={(e) => updateScene(scene.id, (s) => ({ ...s, enabled: e.target.checked }))}
                />
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : scene.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <meta.icon className="size-4 text-primary" aria-hidden />
                  <span className="truncate text-sm">{scene.name}</span>
                  {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                </button>
                <EditorButton
                  type="button"
                  variant="destructive"
                  aria-label={`Delete ${scene.name}`}
                  onClick={() => onChange({ ...album, scenes: scenes.filter((s) => s.id !== scene.id) })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </EditorButton>
              </div>
              {open && (
                <div className="flex flex-col gap-3 border-t border-border p-2">
                  <input
                    aria-label="Scene name"
                    value={scene.name}
                    maxLength={60}
                    onChange={(e) => updateScene(scene.id, (s) => ({ ...s, name: e.target.value }))}
                    className="editor-control h-9 w-full px-2"
                  />
                  <SliderField
                    label="Duration"
                    value={scene.durationSec}
                    min={5}
                    max={600}
                    step={5}
                    suffix="s"
                    onChange={(v) => updateScene(scene.id, (s) => ({ ...s, durationSec: v }))}
                  />
                  <SceneFields
                    fields={SCENE_FIELDS[scene.type]}
                    config={scene.config as unknown as Record<string, unknown>}
                    onChange={(config) => updateScene(scene.id, (s) => normaliseConfig({ ...s, config } as CanvasScene))}
                  />
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section aria-label="Problems" className="rounded-lg border border-border bg-card p-2">
        <h3 className="mb-1 text-sm font-semibold">Problems</h3>
        {problems.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ready to deploy.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-amber-700">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}
```

Create `lib/canvas/admin-types.ts` as a tiny re-export shim so the editor imports one place even if Phase 1 splits album types across files:

```ts
export type { Album, Slideshow as CanvasAlbumSlideshow } from '@/lib/types'
```

- [ ] **Step 8: Run the source test and commit**

```bash
pnpm vitest run tests/canvas-scene-forms.test.ts
npx tsc --noEmit
git add lib/canvas/scenes/fields.ts lib/canvas/admin-types.ts components/editor/canvas-admin tests/canvas-scene-forms.test.ts
git commit -m "feat(canvas): add scene field metadata and authoring forms"
```

Expected: the source test and type check PASS before the commit.

---

### Task 8: Arrangement editor and wall preview

**Files:**
- Create: `components/editor/canvas-admin/arrangement-editor.tsx`
- Create: `components/editor/canvas-admin/wall-preview.tsx`
- Test: `tests/canvas-arrangement.test.ts`

- [ ] **Step 1: Write the failing source test**

Create `tests/canvas-arrangement.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas arrangement editor', () => {
  it('edits arrangements, ordering, offsets and display options', () => {
    const source = read('components/editor/canvas-admin/arrangement-editor.tsx')
    for (const arrangement of ['row', 'column', 'grid']) expect(source).toContain(`value: '${arrangement}'`)
    expect(source).toContain('label="Gap"')
    expect(source).toContain('label="Alignment"')
    expect(source).toContain('label="Markers"')
    expect(source).toContain('offset.x')
    expect(source).toContain('scale')
    expect(source).toContain('Empty slot')
    expect(source).toContain('settings.albumId')
    expect(source).toContain('validateGeometry')
    expect(source).toContain('Unpublished changes')
    expect(source).toContain('<WallPreview')
  })

  it('uses the console clock for the preview', () => {
    const source = read('components/editor/canvas-admin/wall-preview.tsx')
    expect(source).toContain("fetch('/api/time'")
    expect(source).toContain('performance.now()')
    expect(source).toContain('sceneAt(')
    expect(source).toContain('CanvasFrameScene')
    expect(source).toContain('paintScene(')
    expect(source).toContain('showBezels')
    expect(source).toContain('marker')
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-arrangement.test.ts
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Create `components/editor/canvas-admin/wall-preview.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ToggleField } from '@/components/editor/controls'
import type { CanvasConfig, CanvasScene, DeploymentAlbum, Layout } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { seedFromString } from '@/lib/canvas/prng'
import { sceneAt } from '@/lib/canvas/scheduler'
import { computeSceneState } from '@/lib/canvas/scenes/registry'
import { CanvasFrameScene, paintScene, type CanvasElementRefs } from '@/components/frame/canvas/canvas-frame-scene'

export function WallPreview({ layout, album }: { layout: Layout; album: DeploymentAlbum | null }) {
  const config = layout.canvas as CanvasConfig
  const geometry = useMemo(() => resolveGeometry(config), [config])
  const [showBezels, setShowBezels] = useState(true)
  const [consoleStart, setConsoleStart] = useState<number | null>(null)
  const [localEpoch, setLocalEpoch] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const refsBySlot = useRef(new Map<string, CanvasElementRefs>())

  useEffect(() => {
    let cancelled = false
    setLocalEpoch(performance.now())
    fetch('/api/time', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json: { t: number }) => {
        if (!cancelled) setConsoleStart(json.t)
      })
      .catch(() => {
        if (!cancelled) setConsoleStart(Date.now())
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (consoleStart === null || localEpoch === null) return
    let handle = 0
    const tick = () => {
      setNow(consoleStart + (performance.now() - localEpoch))
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [consoleStart, localEpoch])

  const plan = useMemo(() => {
    if (!album || consoleStart === null) return null
    const seed = seedFromString(album.id)
    return sceneAt(album, seed, Math.max(0, now - consoleStart), album.crossfadeMs)
  }, [album, consoleStart, now])

  const model = useMemo(() => {
    if (!plan) return null
    const scene = plan.scene as CanvasScene
    return computeSceneState(scene, {
      bounds: { width: geometry.width, height: geometry.height },
      geometry,
      tMs: plan.sceneTimeMs,
      seed: plan.seed,
    })
  }, [plan, geometry])

  useEffect(() => {
    if (!model) return
    for (const slot of geometry.slots) {
      let refs = refsBySlot.current.get(slot.slotId)
      if (!refs) {
        refs = new Map()
        refsBySlot.current.set(slot.slotId, refs)
      }
      paintScene(model, geometry, slot, refs)
    }
  }, [model, geometry])

  const scale = Math.min(1, 320 / geometry.width, 180 / geometry.height)

  return (
    <div className="flex flex-col gap-2">
      <ToggleField label="Show bezels" checked={showBezels} onChange={setShowBezels} />
      <div className="relative overflow-hidden rounded border border-border bg-black" style={{ width: geometry.width * scale, height: geometry.height * scale }}>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: geometry.width, height: geometry.height, transform: `scale(${scale})` }}
        >
          {geometry.slots.map((slot) => {
            const assigned = config.slots.find((entry) => entry.id === slot.slotId)?.frameId ?? null
            const refs = refsBySlot.current.get(slot.slotId) ?? new Map<string, HTMLElement | null>()
            return (
              <div
                key={slot.slotId}
                className="absolute overflow-hidden"
                style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h, outline: showBezels ? '2px solid rgba(255,255,255,.35)' : 'none' }}
              >
                <div style={{ transform: `scale(${slot.scale})`, transformOrigin: 'top left', width: slot.w / slot.scale, height: slot.h / slot.scale }}>
                  {model && <CanvasFrameScene model={model} geometry={geometry} slot={slot} refs={refs} />}
                </div>
                <span className="absolute bottom-1 left-1 bg-black/60 px-1 text-[24px] leading-tight text-white">
                  {slot.marker} · {assigned ?? 'empty'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {consoleStart === null ? 'Reading console clock…' : `${plan?.scene.name ?? 'No active scene'} · t+${Math.round(Math.max(0, now - consoleStart) / 1000)}s`}
      </p>
    </div>
  )
}
```

The preview reads `/api/time` once when it mounts, keeps a local `performance.now()` epoch, and advances from that console time. It never calls `/api/canvas/state`; the console has no kiosk clock samples. The `showBezels` toggle only changes outlines. Each slot owns its own element-ref map so the shared scene renderer cannot overwrite another slot's DOM nodes.

- [ ] **Step 4: Create `components/editor/canvas-admin/arrangement-editor.tsx`**

```tsx
'use client'

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { EditorButton, SelectField, SliderField } from '@/components/editor/controls'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { nanoid } from 'nanoid'
import type { Album, CanvasConfig, CanvasSlot, FrameStore, Layout } from '@/lib/types'
import type { CanvasFrame } from '@/hooks/use-canvas-library'
import { WallPreview } from './wall-preview'

const ALIGN_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
]

export function ArrangementEditor({
  layout,
  store,
  frames,
  dirty,
  onChange,
}: {
  layout: Layout
  store: FrameStore
  frames: CanvasFrame[]
  dirty: boolean
  onChange: (layout: Layout) => void
}) {
  const config = layout.canvas as CanvasConfig
  const geometry = useMemo(() => resolveGeometry(config), [config])
  const issues = useMemo(() => validateGeometry(geometry), [geometry])
  const canvasAlbums = store.albums.filter((album) => album.theme === 'canvas')
  const album: Album | null = canvasAlbums.find((entry) => entry.id === layout.settings.albumId) ?? null

  function updateConfig(next: CanvasConfig) {
    onChange({ ...layout, canvas: next })
  }

  function updateSlot(id: string, fn: (slot: CanvasSlot) => CanvasSlot) {
    updateConfig({ ...config, slots: config.slots.map((slot) => slot.id === id ? fn(slot) : slot) })
  }

  function addSlot(frameId: string | null) {
    updateConfig({
      ...config,
      slots: [...config.slots, { id: nanoid(6), frameId, offset: { x: 0, y: 0 }, scale: 1 }],
    })
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
        <span aria-live="polite" className={dirty ? 'text-amber-600' : 'text-muted-foreground'}>
          {dirty ? 'Unpublished changes' : 'All changes saved'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="canvas-layout-name" className="text-xs font-medium">Layout name</label>
        <input
          id="canvas-layout-name"
          value={layout.name}
          maxLength={80}
          onChange={(e) => onChange({ ...layout, name: e.target.value })}
          className="editor-control h-9 w-full px-2"
        />
      </div>

      <SelectField
        label="Arrangement"
        value={config.arrangement}
        options={[
          { value: 'row', label: 'Row' },
          { value: 'column', label: 'Column' },
          { value: 'grid', label: 'Grid' },
        ]}
        onChange={(v) => updateConfig({ ...config, arrangement: v as CanvasConfig['arrangement'] })}
      />
      {config.arrangement === 'grid' && (
        <SliderField label="Grid columns" value={config.gridColumns ?? 2} min={1} max={8} step={1} onChange={(v) => updateConfig({ ...config, gridColumns: v })} />
      )}
      <SliderField label="Gap" value={config.gap} min={0} max={160} step={2} suffix="px" onChange={(v) => updateConfig({ ...config, gap: v })} />
      <SelectField label="Alignment" value={config.align} options={ALIGN_OPTIONS} onChange={(v) => updateConfig({ ...config, align: v as CanvasConfig['align'] })} />

      <section aria-label="Frames" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Frames ({config.slots.length})</h3>
          <EditorButton type="button" variant="secondary" onClick={() => addSlot(null)}>
            <Plus className="size-4" aria-hidden /> Empty slot
          </EditorButton>
        </div>
        <ul className="flex flex-col gap-2">
          {config.slots.map((slot, index) => {
            const frame = frames.find((entry) => entry.id === slot.frameId)
            const busy = frame?.inCanvas && frame.inCanvas.canvasId !== layout.id
            return (
              <li key={slot.id} className="rounded-lg border border-border bg-card p-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs text-primary">{index + 1}</span>
                  <select
                    aria-label={`Frame for slot ${index + 1}`}
                    value={slot.frameId ?? ''}
                    onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, frameId: e.target.value || null }))}
                    className="editor-control h-9 min-w-0 flex-1 px-2"
                  >
                    <option value="">Empty slot</option>
                    {frames.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}{entry.inCanvas ? ` (${entry.inCanvas.state} on ${entry.inCanvas.name})` : ''}
                      </option>
                    ))}
                  </select>
                  <EditorButton type="button" variant="destructive" aria-label={`Remove slot ${index + 1}`} onClick={() => updateConfig({ ...config, slots: config.slots.filter((s) => s.id !== slot.id) })}>
                    <Trash2 className="size-4" aria-hidden />
                  </EditorButton>
                </div>
                {busy && <p className="mt-1 text-[11px] text-amber-700">Already used by another canvas.</p>}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Offset X
                    <input type="number" aria-label={`Offset X slot ${index + 1}`} value={slot.offset.x} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, offset: { ...s.offset, x: Number(e.target.value) } }))} className="editor-control h-8 px-1" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Offset Y
                    <input type="number" aria-label={`Offset Y slot ${index + 1}`} value={slot.offset.y} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, offset: { ...s.offset, y: Number(e.target.value) } }))} className="editor-control h-8 px-1" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Scale
                    <input type="number" aria-label={`Scale slot ${index + 1}`} min={0.25} max={2} step={0.05} value={slot.scale} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, scale: Math.max(0.25, Math.min(2, Number(e.target.value))) }))} className="editor-control h-8 px-1" />
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <SelectField
        label="Canvas album"
        value={layout.settings.albumId ?? ''}
        options={[{ value: '', label: 'None' }, ...canvasAlbums.map((entry) => ({ value: entry.id, label: entry.name }))]}
        onChange={(v) => onChange({ ...layout, settings: { ...layout.settings, albumId: v || null } })}
      />

      <section aria-label="Display options" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
        <h3 className="text-sm font-semibold">Display options</h3>
        <SelectField label="Markers" value={config.markers} options={[
          { value: 'identify', label: 'During identification' },
          { value: 'always', label: 'Always' },
          { value: 'never', label: 'Never' },
        ]} onChange={(v) => updateConfig({ ...config, markers: v as CanvasConfig['markers'] })} />
        <SelectField label="Notifications" value={config.notifications} options={[
          { value: 'suppress', label: 'Suppress' },
          { value: 'show', label: 'Show' },
        ]} onChange={(v) => updateConfig({ ...config, notifications: v as CanvasConfig['notifications'] })} />
        <SelectField label="Night mode" value={config.nightMode} options={[
          { value: 'inherit', label: 'Inherit from frame' },
          { value: 'ignore', label: 'Ignore' },
        ]} onChange={(v) => updateConfig({ ...config, nightMode: v as CanvasConfig['nightMode'] })} />
        <SelectField label="Max FPS" value={String(config.maxFps)} options={['15', '24', '30', '60'].map((value) => ({ value, label: `${value} fps` }))} onChange={(v) => updateConfig({ ...config, maxFps: Number(v) as CanvasConfig['maxFps'] })} />
      </section>

      <section aria-label="Preview" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
        <h3 className="text-sm font-semibold">Wall preview</h3>
        <WallPreview layout={layout} album={album ? {
          id: album.id,
          name: album.name,
          scenes: album.scenes ?? [],
          order: album.slideshow.order,
          crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? 400,
        } : null} />
      </section>

      <section aria-label="Problems" className="rounded-lg border border-border bg-card p-2">
        <h3 className="mb-1 text-sm font-semibold">Problems</h3>
        {issues.length === 0 && config.slots.every((slot) => slot.frameId) && layout.settings.albumId ? (
          <p className="text-xs text-muted-foreground">Ready to deploy.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-amber-700">
            {issues.map((issue) => <li key={issue.code + (issue.slotIds?.join(',') ?? '')}>{issue.message}</li>)}
            {config.slots.some((slot) => !slot.frameId) && <li>Assign every slot before deploying.</li>}
            {!layout.settings.albumId && <li>Choose a canvas album.</li>}
          </ul>
        )}
      </section>
    </div>
  )
}
```

New slots omit the optional `label` field; identification labels can be added later from the frame list.

- [ ] **Step 5: Run the source test and commit**

```bash
pnpm vitest run tests/canvas-arrangement.test.ts
npx tsc --noEmit
git add components/editor/canvas-admin tests/canvas-arrangement.test.ts
git commit -m "feat(canvas): add arrangement editor and console wall preview"
```

Expected: both commands PASS before the commit.

---

### Task 9: Canvas admin panel and editor rail wiring

**Files:**
- Create: `components/editor/canvas-admin/canvas-admin-panel.tsx`
- Create: `components/editor/canvas-admin/layouts-tab.tsx`
- Create: `components/editor/canvas-admin/albums-tab.tsx`
- Modify: `components/editor/editor.tsx`
- Test: `tests/canvas-admin-shell.test.ts`

Before editing `editor.tsx`, re-read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` only if the drawer is rendered through a page boundary; this change stays inside the client component. No new route or page is added here.

- [ ] **Step 1: Write the failing source test**

Create `tests/canvas-admin-shell.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas admin shell', () => {
  it('exposes only Layouts and Albums tabs', () => {
    const panel = read('components/editor/canvas-admin/canvas-admin-panel.tsx')
    expect(panel).not.toContain('Status')
    expect(panel).toContain("id: 'layouts'")
    expect(panel).toContain("id: 'albums'")
    expect(panel).toContain('<LayoutsTab')
    expect(panel).toContain('<AlbumsTab')
  })

  it('wires deploy release identify and saving into the layouts tab', () => {
    const source = read('components/editor/canvas-admin/layouts-tab.tsx')
    expect(source).toContain('deploy(')
    expect(source).toContain('release(')
    expect(source).toContain('identify(')
    expect(source).toContain('updateLayout(')
    expect(source).toContain('deleteLayout(')
    expect(source).toContain('<ArrangementEditor')
    expect(source).toContain('inCanvas')
  })

  it('adds a console-only rail item to the editor', () => {
    const source = read('components/editor/editor.tsx')
    expect(source).toContain("DrawerId = PanelId | 'canvas' | 'properties'")
    expect(source).toContain("canManageFrames && !singleFrame")
    expect(source).toContain("aria-label=\"Canvas\"")
    expect(source).toContain("activeDrawer === 'canvas'")
    expect(source).toContain('<CanvasAdminPanel />')
    expect(source).toContain("'canvas' ? 'Canvas'")
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-admin-shell.test.ts
```

Expected: FAIL because the new components and editor wiring are absent.

- [ ] **Step 3: Create `components/editor/canvas-admin/canvas-admin-panel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { AlbumsTab } from './albums-tab'
import { LayoutsTab } from './layouts-tab'

type Tab = 'layouts' | 'albums'

const TABS: { id: Tab; label: string }[] = [
  { id: 'layouts', label: 'Layouts' },
  { id: 'albums', label: 'Albums' },
]

export function CanvasAdminPanel() {
  const [tab, setTab] = useState<Tab>('layouts')

  return (
    <div className="flex min-h-full flex-col">
      <div role="group" aria-label="Canvas sections" className="flex shrink-0 border-b border-border">
        {TABS.map((entry) => (
          <EditorButton
            key={entry.id}
            type="button"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
            variant="quiet"
            className="min-h-12 flex-1 shrink rounded-none border-b-2 border-transparent px-2 py-3 aria-pressed:border-primary aria-pressed:text-foreground"
          >
            {entry.label}
          </EditorButton>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'layouts' ? <LayoutsTab /> : <AlbumsTab />}
      </div>
    </div>
  )
}
```

Status is intentionally absent. `getCanvasStatus` is unit-tested in Phase 2 but its route and tab belong to Phase 3.

- [ ] **Step 4: Create `components/editor/canvas-admin/layouts-tab.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EditorButton } from '@/components/editor/controls'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import { useCanvasLibrary } from '@/hooks/use-canvas-library'
import type { CanvasConfig, Layout } from '@/lib/types'
import { ArrangementEditor } from './arrangement-editor'

const SETTINGS = {
  resolution: '1080x1920' as const,
  background: '#000000',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric' as const,
  snap: true,
  gridSize: 20,
  albumId: null,
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function LayoutsTab() {
  const { store, frames, createLayout, updateLayout, deleteLayout, deploy, release, identify } = useCanvasLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Layout | null>(null)
  const [leadSeconds, setLeadSeconds] = useState(15)
  const [identifySeconds, setIdentifySeconds] = useState(20)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!openId) return
    setDraft(store.layouts.find((layout) => layout.id === openId) ?? null)
  }, [openId, store.layouts])

  const dirty = useMemo(() => {
    if (!draft) return false
    const saved = store.layouts.find((layout) => layout.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(saved)
  }, [draft, store.layouts])

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(message)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    await run(async () => {
      const { id } = await createLayout(`Canvas ${store.layouts.length + 1}`, emptyCanvasConfig() as CanvasConfig)
      setOpenId(id)
    }, 'Canvas layout created')
  }

  async function save() {
    if (!draft) return
    await run(() => updateLayout(draft.id, draft), 'Layout saved to the library')
  }

  async function remove(layout: Layout) {
    if (!window.confirm(`Delete "${layout.name}"? Release it first if it is live.`)) return
    await run(async () => {
      await deleteLayout(layout.id)
      if (openId === layout.id) {
        setOpenId(null)
        setDraft(null)
      }
    }, 'Layout deleted')
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Canvas layouts</h2>
        <EditorButton type="button" variant="secondary" onClick={() => void create()} disabled={busy}>
          New layout
        </EditorButton>
      </div>

      <ul className="flex flex-col gap-2">
        {store.layouts.filter((layout) => layout.kind === 'canvas').map((layout) => {
          const users = frames.filter((frame) => frame.inCanvas?.canvasId === layout.id)
          const scheduled = users.some((frame) => frame.inCanvas?.state === 'scheduled')
          const live = users.some((frame) => frame.inCanvas?.state === 'live')
          return (
            <li key={layout.id} className="rounded-lg border border-border bg-card p-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setOpenId(layout.id)} className="min-w-0 flex-1 truncate text-left text-sm">
                  {layout.name}
                </button>
                <EditorButton type="button" variant="destructive" aria-label={`Delete ${layout.name}`} onClick={() => void remove(layout)}>
                  Delete
                </EditorButton>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {scheduled ? 'Scheduled' : live ? 'Live' : 'Draft'} · {users.length} frame{users.length === 1 ? '' : 's'}
              </p>
              {openId === layout.id && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                  <EditorButton type="button" variant="secondary" onClick={() => void save()} disabled={!dirty || busy}>Save</EditorButton>
                  <EditorButton type="button" variant="secondary" onClick={() => void run(() => deploy(layout.id, { leadMs: leadSeconds * 1000 }), 'Canvas scheduled')} disabled={busy}>Deploy</EditorButton>
                  <EditorButton type="button" variant="secondary" onClick={() => void run(() => release(layout.id), 'Canvas released')} disabled={busy}>Release</EditorButton>
                  <EditorButton type="button" variant="quiet" onClick={() => void run(() => identify(layout.id, identifySeconds), 'Identification started')} disabled={busy}>Identify</EditorButton>
                  <EditorButton type="button" variant="quiet" onClick={() => void run(() => identify(layout.id, 0), 'Identification cleared')} disabled={busy}>Clear markers</EditorButton>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Lead
                    <input aria-label="Lead seconds" type="number" min={0} max={600} value={leadSeconds} onChange={(e) => setLeadSeconds(Number(e.target.value))} className="editor-control h-8 w-14 px-1" />
                    s
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    Identify
                    <input aria-label="Identify seconds" type="number" min={0} max={120} value={identifySeconds} onChange={(e) => setIdentifySeconds(Number(e.target.value))} className="editor-control h-8 w-14 px-1" />
                    s
                  </label>
                </div>
              )}
            </li>
          )
        })}
        {store.layouts.filter((layout) => layout.kind === 'canvas').length === 0 && (
          <li className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No canvas layouts yet. Create one to start a wall.
          </li>
        )}
      </ul>

      {draft && (
        <div className="rounded-lg border border-border bg-card">
          <ArrangementEditor
            layout={draft}
            store={store}
            frames={frames}
            dirty={dirty}
            onChange={setDraft}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        New layouts use the standard frame settings with no album selected. {SETTINGS.resolution} is the default canvas size.
      </p>
    </div>
  )
}
```

The `SETTINGS` constant documents the default settings shape; the server route supplies the canonical settings object, so the client only sends the layout's current `settings`. Lead and identify seconds are clamped by the zod schemas on the API routes.

- [ ] **Step 5: Create `components/editor/canvas-admin/albums-tab.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EditorButton } from '@/components/editor/controls'
import { useCanvasLibrary } from '@/hooks/use-canvas-library'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import type { Album } from '@/lib/types'
import { AlbumEditor } from './album-editor'

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function AlbumsTab() {
  const { store, createAlbum, updateAlbum, deleteAlbum } = useCanvasLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Album | null>(null)
  const [busy, setBusy] = useState(false)
  const albums = store.albums.filter((album) => album.theme === 'canvas')
  const geometry = useMemo(() => resolveGeometry(emptyCanvasConfig()), [])

  useEffect(() => {
    if (!openId) return
    setDraft(albums.find((album) => album.id === openId) ?? null)
  }, [openId, albums])

  const dirty = useMemo(() => {
    if (!draft) return false
    const saved = store.albums.find((album) => album.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(saved)
  }, [draft, store.albums])

  async function create() {
    setBusy(true)
    try {
      const { id } = await createAlbum(`Canvas scenes ${albums.length + 1}`)
      setOpenId(id)
      toast.success('Canvas album created with a sync test scene')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    try {
      await updateAlbum(draft.id, draft)
      toast.success('Album saved to the library')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(album: Album) {
    if (!window.confirm(`Delete "${album.name}"?`)) return
    setBusy(true)
    try {
      await deleteAlbum(album.id)
      if (openId === album.id) {
        setOpenId(null)
        setDraft(null)
      }
      toast.success('Album deleted')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Canvas albums</h2>
        <EditorButton type="button" variant="secondary" onClick={() => void create()} disabled={busy}>New album</EditorButton>
      </div>
      <ul className="flex flex-col gap-2">
        {albums.map((album) => (
          <li key={album.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
            <button type="button" onClick={() => setOpenId(album.id)} className="min-w-0 flex-1 truncate text-left text-sm">
              {album.name}
            </button>
            <EditorButton type="button" variant="destructive" aria-label={`Delete ${album.name}`} onClick={() => void remove(album)}>Delete</EditorButton>
          </li>
        ))}
        {albums.length === 0 && (
          <li className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No canvas albums yet.</li>
        )}
      </ul>
      {draft && (
        <div className="rounded-lg border border-border bg-card">
          <AlbumEditor
            album={draft}
            geometry={geometry}
            dirty={dirty}
            onChange={setDraft}
            onDelete={() => void remove(draft)}
          />
          <div className="border-t border-border p-2">
            <EditorButton type="button" variant="secondary" onClick={() => void save()} disabled={!dirty || busy}>Save album</EditorButton>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire the rail item in `components/editor/editor.tsx`**

Apply these targeted edits.

1. Add the icon import on the lucide line:

```ts
import { Bell, CalendarClock, Frame, GalleryVerticalEnd, Grid2X2, Layers, LayoutTemplate, MonitorPlay, SlidersHorizontal, Sparkles, Type, X } from 'lucide-react'
```

2. Add the panel import after the `FrameAdminPanel` import:

```ts
import { CanvasAdminPanel } from './canvas-admin/canvas-admin-panel'
```

3. Extend the drawer union:

```ts
type DrawerId = PanelId | 'canvas' | 'properties'
```

4. Add the title branch before `'properties'`:

```ts
  const drawerTitle =
    activeDrawer === 'widgets'
      ? 'Widgets'
      : activeDrawer === 'frames'
        ? 'Frame administration'
        : activeDrawer === 'canvas'
          ? 'Canvas'
          : activeDrawer === 'properties'
            ? 'Properties'
            : PANELS.find((panel) => panel.id === activeDrawer)?.label ?? 'Editor panel'
```

5. Add the rail button immediately after the `canManageFrames && (<button ... Frames ... />)` block:

```tsx
            {canManageFrames && !singleFrame && (
              <button
                type="button"
                aria-label="Canvas"
                aria-expanded={activeDrawer === 'canvas'}
                aria-controls="editor-drawer"
                onClick={(event) => toggleDrawer('canvas', event.currentTarget)}
                className={cn('editor-icon-button size-8 rounded-lg', activeDrawer === 'canvas' && 'bg-primary/10 text-primary')}
              >
                <MonitorPlay className="size-[18px]" aria-hidden />
              </button>
            )}
```

6. Add the drawer body before the `widgets` branch:

```tsx
                {canManageFrames && !singleFrame && activeDrawer === 'canvas' && <CanvasAdminPanel />}
```

The console runtime is already implied by `canManageFrames && !singleFrame`: kiosk pages render `FrameDisplay` directly and never mount `Editor` with management rights. The API routes still enforce 403 when `INSTANCE_ID` is set.

- [ ] **Step 7: Run the source test, typecheck and commit**

```bash
pnpm vitest run tests/canvas-admin-shell.test.ts
npx tsc --noEmit
git add components/editor/canvas-admin components/editor/editor.tsx tests/canvas-admin-shell.test.ts
git commit -m "feat(canvas): add the console canvas admin panel"
```

Expected: all commands PASS before the commit.

---

### Task 10: Keep canvas documents out of the ordinary editor

**Files:**
- Modify: `components/editor/albums-panel.tsx`
- Modify: `components/editor/album-detail.tsx`
- Test: `tests/canvas-editor-filters.test.ts`

- [ ] **Step 1: Write the failing source test**

Create `tests/canvas-editor-filters.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('ordinary editor canvas filtering', () => {
  it('hides canvas albums from the album picker and list', () => {
    const source = read('components/editor/albums-panel.tsx')
    expect(source).toContain("ALBUM_THEMES.filter((theme) => theme !== 'canvas')")
    expect(source).toContain("albums.filter((album) => album.theme !== 'canvas')")
  })

  it('never offers the canvas presentation in album detail', () => {
    const source = read('components/editor/album-detail.tsx')
    expect(source).toContain("PRESENTATIONS.filter((presentation) => presentation !== 'canvas')")
    expect(source).toContain('VISIBLE_PRESENTATIONS.map')
  })
})
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run tests/canvas-editor-filters.test.ts
```

Expected: FAIL because the filters are absent.

- [ ] **Step 3: Filter `components/editor/albums-panel.tsx`**

Add a constant after the imports:

```ts
const VISIBLE_THEMES = ALBUM_THEMES.filter((theme) => theme !== 'canvas')
```

Replace the theme loop source:

```tsx
              {VISIBLE_THEMES.map((theme) => {
```

Replace the list source:

```tsx
            {albums.filter((album) => album.theme !== 'canvas').map((album) => {
```

Keep the empty-state copy unchanged: if the store has only canvas albums, the ordinary panel still says "No albums yet". Canvas albums are edited from the Canvas rail, not here.

- [ ] **Step 4: Filter `components/editor/album-detail.tsx`**

Add a constant after the imports:

```ts
const VISIBLE_PRESENTATIONS = PRESENTATIONS.filter((presentation) => presentation !== 'canvas')
```

Replace the presentation options source:

```tsx
          options={VISIBLE_PRESENTATIONS.map((p) => ({ value: p, label: PRESENTATION_META[p].label }))}
```

The `map-art` presentation stays available for map-art albums. Canvas presentation is only reachable through a scene form in the canvas admin panel.

- [ ] **Step 5: Run the source test and commit**

```bash
pnpm vitest run tests/canvas-editor-filters.test.ts
npx tsc --noEmit
git add components/editor/albums-panel.tsx components/editor/album-detail.tsx tests/canvas-editor-filters.test.ts
git commit -m "feat(canvas): hide canvas albums from the ordinary editor"
```

Expected: both commands PASS before the commit.

---

## Verification

Run all checks from a clean tree after the last commit. Every command must pass; do not report success until the output confirms it.

- [ ] **Step 1: Rebase onto the latest main**

```bash
git fetch origin
git rebase origin/main
```

Resolve lockfile conflicts by regenerating with `pnpm install --lockfile-only`, never by hand. Rerun the checks after any conflict resolution.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: PASS with no failing tests, including `lib/canvas/__tests__/library.test.ts`, `lib/canvas/__tests__/lead.test.ts`, `lib/canvas/__tests__/service.test.ts`, `tests/canvas-library-guards.test.ts`, `tests/canvas-routes.test.ts`, `tests/canvas-client-helpers.test.ts`, `tests/canvas-scene-forms.test.ts`, `tests/canvas-arrangement.test.ts`, `tests/canvas-admin-shell.test.ts`, and `tests/canvas-editor-filters.test.ts`.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors, including no implicit `any` from `mutateStore` callbacks.

- [ ] **Step 4: Production build**

```bash
pnpm build
```

Expected: build completes. Confirm the compiled route list includes `/api/canvas/library`, `/api/canvas/deploy`, `/api/canvas/release`, `/api/canvas/identify`, and does **not** include `/api/canvas/status`.

- [ ] **Step 5: Release check**

```bash
pnpm release:check
```

Expected: PASS. Fix any finding before opening the PR.

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feature/canvas-phase-2-authoring
gh pr create --title "feat(canvas): author and deploy multi-frame canvases" --body "$(cat <<'EOF'
## What changed

Console operators can create canvas layouts and albums in the reserved `canvas-library` document, assign enrolled frames, identify them, deploy, update live, and release. Generic CRUD routes reject canvas documents outside the library and reject frame documents inside it. Four console-only API routes wrap a service that performs validation, exclusive-slot checks, lead calculation, state writes, pruning and audit logging.

## Evidence

- `pnpm test`, `npx tsc --noEmit`, `pnpm build`, `pnpm release:check` all pass.
- Route tests cover every §13.1 error code, exclusivity, pending-versus-active updates, removed-member release, identify, and console-only 403.
- Source tests cover library guards, rail gating, scene form generation and editor filtering.

## Scope notes

Status tab and `GET /api/canvas/status` are Phase 3; `getCanvasStatus` is implemented and unit-tested here. Contract gaps versus the spec are listed at the top of the plan file.

## Risks

Deployment writes are sequential in SQLite and transactional in Postgres. A canvas cannot be deleted while scheduled or live; release first.
EOF
)"
```

Run `/unslop` over the title and body before posting, per `AGENTS.md`.

---

## Phase 2 exit criteria

- [ ] `CANVAS_LIBRARY_ID`, `isLibraryFrame`, `ensureCanvasLibrary` live in `lib/canvas/library.ts` (with the browser-safe constants in `lib/canvas/ids.ts`); the library starts with empty layouts and albums, the default schedule and disabled experiences.
- [ ] Canvas layouts and albums exist only in `canvas-library`; kiosk routes return 403 or 400 for library access, `/api/frames` hides it and refuses changes, `/api/store` skips the Bob tick, and `/frame/canvas-library` returns 404.
- [ ] `POST /api/albums` with `theme: 'canvas'` creates one enabled 30-second `sync-test` scene and no ordinary slideshow items.
- [ ] `deployCanvas`, `releaseCanvas`, `identifyCanvas`, and `getCanvasStatus` return structured results with every §13.1 error code; internal counters are named `deploymentRevision` and `rowRevision`.
- [ ] Lead is `max(requested, 2 * maxMemberPollMs + 5000)` capped at ten minutes, with 5 s member polls when canvas state exists and 30 s otherwise.
- [ ] Writes use one Postgres transaction or sequential SQLite writes, expire stale deployments, and write audit rows.
- [ ] Routes `GET /api/canvas/library`, `POST /api/canvas/deploy`, `POST /api/canvas/release`, `POST /api/canvas/identify` are live and zod-validated; no status route or tab ships in this phase.
- [ ] The console Canvas rail is gated by `canManageFrames && !singleFrame`; ordinary album and presentation pickers hide `canvas`.
- [ ] Scene forms derive from `SCENE_META` and `SceneField`, marquee text is measured in the browser, and logos are embedded data URIs under 200 KB.
- [ ] The arrangement editor covers row/column/grid, gap, align, ordered frames, markers, empty slots, offset/scale, album select, display options, problems, unpublished changes, and a wall preview driven by `/api/time`.
- [ ] `pnpm test`, `npx tsc --noEmit`, `pnpm build`, and `pnpm release:check` pass; the PR body includes before/after evidence per `AGENTS.md`.

