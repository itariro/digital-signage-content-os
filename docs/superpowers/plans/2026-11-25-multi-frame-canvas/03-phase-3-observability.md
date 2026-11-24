# Multi-frame canvas: phase 3, observability and resilience implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give console operators a live status view that explains why a canvas frame is broken, detect unpublished library edits, clean up state on revoke, and document the whole operator workflow.

**Architecture:** The console reads `canvas_state` rows through the Phase 2 service layer and returns a small JSON status shape. A pure problem classifier turns that shape into operator labels. The status tab polls the route with SWR every 5 seconds while open. Content hashes compare the library documents with the deployed snapshot without adding a required field to older snapshots.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, SWR, Vitest (node), in-memory SQLite test harness, Drizzle, zod, Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md`, especially sections 12.8, 13.1, 13.5, 14, 15, 18, 19 and 21.

**Assessment and shared contracts:** `docs/superpowers/plans/2026-11-25-multi-frame-canvas/00-assessment.md`.

Before writing any route or page, read the relevant guide under `node_modules/next/dist/docs/`. This Next.js version differs from training data.

---

## Contract preflight

- [ ] **Step 1: Confirm an isolated branch and the Phase 1 poll contract**

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git log --oneline -1 origin/main
rg "pollDelayMs|startCanvasPoll|stopCanvasPoll|CANVAS_POLL_ACTIVE_SECONDS|CANVAS_POLL_IDLE_SECONDS|SYNC_INTERVAL_MINUTES" lib/canvas/poll.ts .env.example docs/canvas.md
test -f docs/superpowers/plans/2026-11-25-multi-frame-canvas/02-phase-2-authoring-and-deployment.md
```

Expected: a worktree path, a branch other than `main`, and the Phase 1 contract from `docs/superpowers/plans/2026-11-25-multi-frame-canvas/01-phase-1-engine-and-display.md` present in `lib/canvas/poll.ts`: `pollDelayMs(active, env)`, `startCanvasPoll`, `stopCanvasPoll`, the active and idle overrides and the `SYNC_INTERVAL_MINUTES` regular sync fallback. The Phase 2 plan at `docs/superpowers/plans/2026-11-25-multi-frame-canvas/02-phase-2-authoring-and-deployment.md` also exists. If any of these are missing, stop and finish Phase 1 or Phase 2 before executing this plan.

- [ ] **Step 2: Confirm Phase 2 service names**

Run:

```bash
rg "export async function getCanvasStatus|deployCanvas|releaseCanvas|identifyCanvas" lib/canvas/service.ts
rg "CANVAS_LIBRARY_ID|ensureCanvasLibrary" lib/canvas/library.ts
rg "CanvasAdminPanel" components/editor/editor.tsx components/editor/canvas-admin/canvas-admin-panel.tsx
```

Expected: `getCanvasStatus` and the deploy, release and identify services exist in `lib/canvas/service.ts`; the library helpers exist; `CanvasAdminPanel` is mounted with the two Phase 2 tabs, Layouts and Albums. The Status tab is added later in this phase, so it is not part of this gate. Phase 2 is specified in `docs/superpowers/plans/2026-11-25-multi-frame-canvas/02-phase-2-authoring-and-deployment.md`, so this check is a hard gate. If the names or the two tabs are absent, finish Phase 2 before executing this plan.

- [ ] **Step 3: Run the baseline checks**

Run:

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: all three pass. A failure here is a baseline problem and is not fixed inside this phase.

- [ ] **Step 4: Skim open PRs for overlap**

Run:

```bash
gh pr list --state open
gh pr diff <number> --name-only
```

Expected: no open PR touching `lib/canvas/status.ts`, `lib/canvas/problems.ts`, `lib/canvas/hash.ts`, `app/api/canvas/status/route.ts`, the status tab, the instance revoke route, or the four docs files named below. On overlap, stop and ask for direction.

---

## File map for this phase

Create:

```
lib/canvas/problems.ts
lib/canvas/hash.ts
lib/canvas/status.ts
app/api/canvas/status/route.ts
components/editor/canvas-admin/status-tab.tsx
lib/canvas/__tests__/problems.test.ts
lib/canvas/__tests__/hash.test.ts
tests/canvas-status-route.test.ts
tests/canvas-status-wiring.test.ts
tests/canvas-revoke-cleanup.test.ts
tests/canvas-docs.test.ts
```

Modify:

```
lib/canvas/service.ts
components/editor/canvas-admin/canvas-admin-panel.tsx
app/api/instances/[id]/route.ts
docs/canvas.md
README.md
docs/operations.md
docs/kiosk-cli.md
```

No schema migration or new deployment field is needed. `deployedCanvasContentHash` derives the hash from the snapshot, so all phase 1 snapshots remain valid.

---

### Task 1: Pure problem labels

**Files:**
- Create: `lib/canvas/problems.ts`
- Test: `lib/canvas/__tests__/problems.test.ts`

This task defines the exact row shape used by the route, the service, the UI and the tests. Keep every field in milliseconds or plain numbers so the classifier stays pure.

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/__tests__/problems.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CANVAS_PROBLEM_LABELS,
  STATUS_POLL_MS,
  canvasProblems,
  type CanvasStatusRow,
} from '@/lib/canvas/problems'

const now = 100_000

const base: CanvasStatusRow = {
  canvasId: 'wall-1',
  canvasName: 'Entrance wall',
  slotId: 'slot-a',
  marker: 1,
  frameId: 'frame-a',
  frameName: 'Frame A',
  frameExists: true,
  reportedAtMs: 100_000,
  revision: 2,
  deploymentRevision: 2,
  reportedRevision: 2,
  effectiveAtMs: 90_000,
  clockOffsetMs: 8,
  clockUncertaintyMs: 6,
  clockQuality: 'good',
  viewportW: 1080,
  viewportH: 1920,
  fpsAvg: 29.5,
  unpublishedChanges: false,
}

function row(overrides: Partial<CanvasStatusRow> = {}): CanvasStatusRow {
  return { ...base, ...overrides }
}

describe('canvas problem labels', () => {
  it('exports every label used by the status table', () => {
    expect(CANVAS_PROBLEM_LABELS).toEqual([
      'Frame missing',
      'No report yet',
      'Offline',
      'Out of date',
      'Clock drift risk',
      'Wrong aspect ratio',
      'Unpublished changes',
    ])
    expect(STATUS_POLL_MS).toBe(5000)
  })

  it('returns no labels for a healthy member', () => {
    expect(canvasProblems(row(), now, STATUS_POLL_MS)).toEqual([])
  })

  it('flags a revoked frame', () => {
    expect(canvasProblems(row({ frameExists: false }), now, STATUS_POLL_MS)).toEqual(['Frame missing'])
  })

  it('flags a member that never reported', () => {
    expect(canvasProblems(row({ reportedAtMs: null, reportedRevision: null }), now, STATUS_POLL_MS)).toEqual(['No report yet'])
  })

  it('flags a member after three poll intervals without a report', () => {
    expect(canvasProblems(row({ reportedAtMs: 84_999 }), now, STATUS_POLL_MS)).toEqual(['Offline'])
  })

  it('does not flag a member at exactly three poll intervals', () => {
    expect(canvasProblems(row({ reportedAtMs: 85_000 }), now, STATUS_POLL_MS)).toEqual([])
  })

  it('does not flag a behind revision before effectiveAt', () => {
    const value = row({ effectiveAtMs: 100_001, reportedRevision: 1 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual([])
  })

  it('flags a behind revision after effectiveAt', () => {
    const value = row({ effectiveAtMs: 100_000, reportedRevision: 1 })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual(['Out of date'])
  })

  it('flags poor clock quality', () => {
    const value = row({ clockQuality: 'poor' })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual(['Clock drift risk'])
  })

  it('uses a 50 ms uncertainty boundary', () => {
    expect(canvasProblems(row({ clockUncertaintyMs: 50 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ clockUncertaintyMs: 50.1 }), now, STATUS_POLL_MS)).toEqual(['Clock drift risk'])
  })

  it('flags a viewport more than one percent off 9:16', () => {
    expect(canvasProblems(row({ viewportH: 1920 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ viewportH: 1930 }), now, STATUS_POLL_MS)).toEqual([])
    expect(canvasProblems(row({ viewportH: 1950 }), now, STATUS_POLL_MS)).toEqual(['Wrong aspect ratio'])
  })

  it('flags library edits that are not deployed', () => {
    expect(canvasProblems(row({ unpublishedChanges: true }), now, STATUS_POLL_MS)).toEqual(['Unpublished changes'])
  })

  it('returns labels in a stable order for several faults', () => {
    const value = row({
      frameExists: false,
      reportedAtMs: null,
      reportedRevision: null,
      clockQuality: 'poor',
      viewportH: 1950,
      unpublishedChanges: true,
    })
    expect(canvasProblems(value, now, STATUS_POLL_MS)).toEqual([
      'Frame missing',
      'No report yet',
      'Clock drift risk',
      'Wrong aspect ratio',
      'Unpublished changes',
    ])
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/problems.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/canvas/problems'`.

- [ ] **Step 3: Implement the classifier**

Create `lib/canvas/problems.ts`:

```ts
export type CanvasClockQuality = 'good' | 'fair' | 'poor'

export type CanvasProblem =
  | 'Frame missing'
  | 'No report yet'
  | 'Offline'
  | 'Out of date'
  | 'Clock drift risk'
  | 'Wrong aspect ratio'
  | 'Unpublished changes'

export const CANVAS_PROBLEM_LABELS = [
  'Frame missing',
  'No report yet',
  'Offline',
  'Out of date',
  'Clock drift risk',
  'Wrong aspect ratio',
  'Unpublished changes',
] as const

export const STATUS_POLL_MS = 5000

export type CanvasStatusRow = {
  canvasId: string
  canvasName: string
  slotId: string
  marker: number
  frameId: string
  frameName: string | null
  frameExists: boolean
  reportedAtMs: number | null
  revision: number
  deploymentRevision: number | null
  reportedRevision: number | null
  effectiveAtMs: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  clockQuality: CanvasClockQuality | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
  unpublishedChanges: boolean
}

const TARGET_RATIO = 9 / 16
const RATIO_TOLERANCE = TARGET_RATIO * 0.01
const CLOCK_UNCERTAINTY_LIMIT_MS = 50

export function canvasProblems(row: CanvasStatusRow, nowMs: number, pollMs: number): CanvasProblem[] {
  const problems: CanvasProblem[] = []

  if (!row.frameExists) problems.push('Frame missing')

  if (row.reportedAtMs === null) {
    problems.push('No report yet')
  } else if (nowMs - row.reportedAtMs > 3 * pollMs) {
    problems.push('Offline')
  }

  if (
    row.effectiveAtMs !== null &&
    nowMs >= row.effectiveAtMs &&
    row.reportedRevision !== null &&
    row.reportedRevision < row.revision
  ) {
    problems.push('Out of date')
  }

  if (
    row.clockQuality === 'poor' ||
    (row.clockUncertaintyMs !== null && row.clockUncertaintyMs > CLOCK_UNCERTAINTY_LIMIT_MS)
  ) {
    problems.push('Clock drift risk')
  }

  if (row.viewportW !== null && row.viewportH !== null && row.viewportH > 0) {
    const ratio = row.viewportW / row.viewportH
    if (Math.abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE) problems.push('Wrong aspect ratio')
  }

  if (row.unpublishedChanges) problems.push('Unpublished changes')

  return problems
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/problems.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/problems.ts lib/canvas/__tests__/problems.test.ts
git commit -m "feat(canvas): classify frame health problems"
```

---

### Task 2: Canvas content hash

**Files:**
- Create: `lib/canvas/hash.ts`
- Test: `lib/canvas/__tests__/hash.test.ts`

The hash covers only the fields that a deployment snapshot carries. That keeps edits to unrelated timestamps and widgets from looking unpublished.

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/__tests__/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultSlideshow } from '@/lib/albums'
import { canvasContentHash, deployedCanvasContentHash } from '@/lib/canvas/hash'
import type { Album, CanvasConfig, CanvasDeployment, CanvasScene, Layout } from '@/lib/types'

const createdAt = '2026-01-01T00:00:00.000Z'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'slot-a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const scene: CanvasScene = {
  id: 'scene-1',
  name: 'Check alignment',
  enabled: true,
  durationSec: 30,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
}

const layout: Layout = {
  id: 'wall-1',
  name: 'Entrance wall',
  kind: 'canvas',
  canvas: config,
  widgets: [],
  settings: {
    resolution: '1080x1920',
    background: '',
    dim: 0,
    locationName: '',
    lat: 0,
    lon: 0,
    units: 'metric',
    snap: true,
    gridSize: 20,
    albumId: 'album-1',
  },
  createdAt,
  updatedAt: createdAt,
}

const album: Album = {
  id: 'album-1',
  name: 'Entrance album',
  theme: 'canvas',
  items: [],
  scenes: [scene],
  slideshow: { ...defaultSlideshow('canvas'), canvas: { crossfadeMs: 400 } },
  createdAt,
  updatedAt: createdAt,
}

function deploymentFrom(value: Layout, source: Album): CanvasDeployment {
  if (!value.canvas) throw new Error('layout has no canvas config')
  return {
    canvasId: value.id,
    name: value.name,
    revision: 1,
    effectiveAt: 1_000_000,
    releaseAt: null,
    slotId: 'slot-a',
    config: value.canvas,
    album: {
      id: source.id,
      name: source.name,
      scenes: source.scenes ?? [],
      order: source.slideshow.order,
      crossfadeMs: source.slideshow.canvas?.crossfadeMs ?? 0,
    },
  }
}

describe('canvasContentHash', () => {
  it('is deterministic and ignores key order', () => {
    expect(canvasContentHash(layout, album)).toBe(canvasContentHash(layout, album))
    expect(canvasContentHash(
      { ...layout, canvas: { gap: 0, slots: config.slots, ...config } as CanvasConfig },
      album,
    )).toBe(canvasContentHash(layout, album))
  })

  it('changes when a layout field used by the deployment changes', () => {
    const before = canvasContentHash(layout, album)
    const after = canvasContentHash({ ...layout, canvas: { ...config, gap: 120 } }, album)
    expect(after).not.toBe(before)
  })

  it('changes when an album field used by the deployment changes', () => {
    const before = canvasContentHash(layout, album)
    const changed: CanvasScene = {
      ...scene,
      config: { ...scene.config, periodSec: 8 },
    }
    const after = canvasContentHash(layout, { ...album, scenes: [changed] })
    expect(after).not.toBe(before)
  })

  it('distinguishes a missing album from an empty album reference', () => {
    const withAlbum = canvasContentHash(layout, album)
    const withoutAlbum = canvasContentHash(layout, null)
    expect(withoutAlbum).not.toBe(withAlbum)
  })

  it('matches a deployment made from the same library content', () => {
    const deployment = deploymentFrom(layout, album)
    expect(deployedCanvasContentHash(deployment)).toBe(canvasContentHash(layout, album))
  })

  it('does not report a false positive immediately after deploy', () => {
    const deployment = deploymentFrom(layout, album)
    expect(deployedCanvasContentHash(deployment) === canvasContentHash(layout, album)).toBe(true)
    const deployedAlbum = deployment.album
    if (!deployedAlbum) throw new Error('deployment has no album')
    const editedDeployment: CanvasDeployment = {
      ...deployment,
      album: { ...deployedAlbum, crossfadeMs: 900 },
    }
    expect(deployedCanvasContentHash(editedDeployment)).not.toBe(canvasContentHash(layout, album))
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/hash.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/canvas/hash'`.

- [ ] **Step 3: Implement the hash module**

Create `lib/canvas/hash.ts`:

```ts
import { createHash } from 'node:crypto'
import type { Album, CanvasConfig, CanvasDeployment, Layout } from '@/lib/types'

type HashAlbum = {
  id: string
  name: string
  scenes: unknown[]
  order: string
  crossfadeMs: number
} | null

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) result[key] = canonical(source[key])
    return result
  }
  return value
}

function digest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')
}

function hashAlbum(album: HashAlbum): HashAlbum {
  if (!album) return null
  return {
    id: album.id,
    name: album.name,
    scenes: album.scenes,
    order: album.order,
    crossfadeMs: album.crossfadeMs,
  }
}

function hashPayload(
  layout: { name: string; canvas: CanvasConfig | null; albumId: string | null },
  album: HashAlbum,
): string {
  return digest({ layout, album: hashAlbum(album) })
}

export function canvasContentHash(layout: Layout, album: Album | null | undefined): string {
  return hashPayload(
    {
      name: layout.name,
      canvas: layout.canvas ?? null,
      albumId: layout.settings.albumId ?? null,
    },
    album
      ? {
          id: album.id,
          name: album.name,
          scenes: album.scenes ?? [],
          order: album.slideshow.order,
          crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? 0,
        }
      : null,
  )
}

export function deployedCanvasContentHash(deployment: CanvasDeployment): string {
  return hashPayload(
    {
      name: deployment.name,
      canvas: deployment.config,
      albumId: deployment.album?.id ?? null,
    },
    deployment.album
      ? {
          id: deployment.album.id,
          name: deployment.album.name,
          scenes: deployment.album.scenes,
          order: deployment.album.order,
          crossfadeMs: deployment.album.crossfadeMs,
        }
      : null,
  )
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/hash.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/hash.ts lib/canvas/__tests__/hash.test.ts
git commit -m "feat(canvas): hash deployed canvas content"
```

---

### Task 3: Status service and status route

**Files:**
- Create: `lib/canvas/status.ts`
- Create: `app/api/canvas/status/route.ts`
- Create: `tests/canvas-status-route.test.ts`
- Modify: `lib/canvas/service.ts`
- Modify: `lib/canvas/__tests__/service.test.ts`

The phase 2 service owns deploy, release and identify. This task replaces only `getCanvasStatus` with a re-export from a focused status service, updates the phase 2 service test to the flat row shape, then adds the operator route.

- [ ] **Step 1: Write the failing route tests**

Create `tests/canvas-status-route.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasScene, Layout } from '@/lib/types'

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = process.env.NODE_ENV

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-status-route'
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = originalNodeEnv
  delete env.CONSOLE_ADMIN_TOKEN
  delete env.INSTANCE_ID
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
  const { ensureCanvasLibrary } = await import('@/lib/canvas/library')
  await ensureCanvasLibrary()
}

async function seedInstance(id: string, name: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { seed } = await import('@/lib/store')
  const db = getDb()
  const tables = getTables()
  const now = new Date()
  await db.insert(tables.frameDocuments).values({
    id,
    identifier: id,
    name,
    data: seed(),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  })
  await db.insert(tables.instances).values({ id, createdAt: now, lastSeenAt: now })
}

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'slot-a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const scene: CanvasScene = {
  id: 'scene-1',
  name: 'Check alignment',
  enabled: true,
  durationSec: 30,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
}

async function seedStatus(options: { includeInstance?: boolean } = {}) {
  const includeInstance = options.includeInstance ?? true
  const { CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
  const { mutateStore } = await import('@/lib/store')
  const { defaultSlideshow } = await import('@/lib/albums')
  const { putCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
  const createdAt = '2026-01-01T00:00:00.000Z'
  const now = Date.now()

  const layout: Layout = {
    id: 'wall-1',
    name: 'Entrance wall',
    kind: 'canvas',
    canvas: config,
    widgets: [],
    settings: {
      resolution: '1080x1920',
      background: '',
      dim: 0,
      locationName: '',
      lat: 0,
      lon: 0,
      units: 'metric',
      snap: true,
      gridSize: 20,
      albumId: 'album-1',
    },
    createdAt,
    updatedAt: createdAt,
  }

  const album = {
    id: 'album-1',
    name: 'Entrance album',
    theme: 'canvas' as const,
    items: [],
    scenes: [scene],
    slideshow: { ...defaultSlideshow('canvas'), canvas: { crossfadeMs: 400 } },
    createdAt,
    updatedAt: createdAt,
  }

  await mutateStore((store) => {
    store.layouts.push(layout)
    store.albums.push(album)
  }, CANVAS_LIBRARY_ID)

  if (includeInstance) await seedInstance('frame-a', 'Frame A')

  const deployment: CanvasDeployment = {
    canvasId: layout.id,
    name: layout.name,
    revision: 1,
    effectiveAt: now - 1000,
    releaseAt: null,
    slotId: 'slot-a',
    config,
    album: {
      id: album.id,
      name: album.name,
      scenes: [scene],
      order: album.slideshow.order,
      crossfadeMs: 400,
    },
  }

  await putCanvasState('frame-a', { v: 1, active: deployment, pending: null, identify: null })
  await recordCanvasReport('frame-a', {
    appliedRevision: 1,
    clockOffsetMs: 8,
    clockUncertaintyMs: 6,
    viewportW: 1080,
    viewportH: 1920,
    fpsAvg: 29.5,
  }, now)

  return { layout, album, deployment, now }
}

async function getStatus(query = '', token = 'status-admin', headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  const { GET } = await import('@/app/api/canvas/status/route')
  const request = new NextRequest(`http://localhost/api/canvas/status${query}`, {
    headers: { 'x-admin-token': token, ...headers },
  })
  return GET(request)
}

describe('GET /api/canvas/status', () => {
  beforeEach(async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'status-admin'
    delete env.INSTANCE_ID
    await freshDb()
  })

  it('returns health fields for an authorized operator', async () => {
    const seeded = await seedStatus()
    const response = await getStatus('?layoutId=wall-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.pollMs).toBe(5000)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]).toMatchObject({
      canvasId: 'wall-1',
      canvasName: 'Entrance wall',
      slotId: 'slot-a',
      marker: 1,
      frameId: 'frame-a',
      frameName: 'Frame A',
      frameExists: true,
      revision: 1,
      deploymentRevision: 1,
      reportedRevision: 1,
      reportedAtMs: seeded.now,
      clockQuality: 'good',
      unpublishedChanges: false,
    })
  })

  it('rejects a missing or wrong operator token', async () => {
    await seedStatus()
    expect((await getStatus('', '')).status).toBe(401)
    expect((await getStatus('', 'wrong')).status).toBe(401)
  })

  it('refuses to run on a kiosk instance', async () => {
    await seedStatus()
    env.INSTANCE_ID = 'frame-a'
    const response = await getStatus()
    expect(response.status).toBe(403)
  })

  it('rejects an invalid layoutId query', async () => {
    await seedStatus()
    const response = await getStatus('?layoutId=../wall')
    expect(response.status).toBe(400)
  })

  it('sets unpublishedChanges after a library edit', async () => {
    await seedStatus()
    const { CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
    const { mutateStore } = await import('@/lib/store')
    await mutateStore((store) => {
      const layout = store.layouts.find((value) => value.id === 'wall-1')
      if (layout?.canvas) layout.canvas = { ...layout.canvas, gap: 240 }
    }, CANVAS_LIBRARY_ID)

    const response = await getStatus('?layoutId=wall-1')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0].unpublishedChanges).toBe(true)
  })

  it('reports stale and poor clock fields for a struggling member', async () => {
    const seeded = await seedStatus()
    const { recordCanvasReport } = await import('@/lib/canvas/state-store')
    await recordCanvasReport('frame-a', {
      appliedRevision: 0,
      clockOffsetMs: 120,
      clockUncertaintyMs: 80,
      viewportW: 1080,
      viewportH: 1950,
      fpsAvg: 4,
    }, seeded.now + 20_000)

    const response = await getStatus()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0]).toMatchObject({
      revision: 1,
      reportedRevision: 0,
      reportedAtMs: seeded.now + 20_000,
      clockQuality: 'poor',
      viewportH: 1950,
      fpsAvg: 4,
    })
  })

  it('shows a missing frame after its instance is removed', async () => {
    await seedStatus({ includeInstance: false })
    const response = await getStatus()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rows[0]).toMatchObject({
      frameId: 'frame-a',
      frameExists: false,
      revision: 1,
      reportedRevision: 1,
    })
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run:

```bash
pnpm vitest run tests/canvas-status-route.test.ts
```

Expected: FAIL with `Cannot find module '@/app/api/canvas/status/route'`.

- [ ] **Step 3: Implement the status service**

Create `lib/canvas/status.ts`:

```ts
import { listInstanceCards } from '@/lib/console/service'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { canvasContentHash, deployedCanvasContentHash } from '@/lib/canvas/hash'
import type { CanvasClockQuality, CanvasStatusRow } from '@/lib/canvas/problems'
import { CANVAS_LIBRARY_ID, ensureCanvasLibrary } from '@/lib/canvas/library'
import { listCanvasStates, pruneCanvasState } from '@/lib/canvas/state-store'
import { readStore } from '@/lib/store'
import type { CanvasDeployment } from '@/lib/types'

export type CanvasStatus = CanvasStatusRow

export type CanvasStatusState = 'draft' | 'scheduled' | 'live' | 'released'

export type CanvasStatusRowWithState = CanvasStatusRow & { state: CanvasStatusState }

const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/

function clockQualityFromUncertainty(
  clockOffsetMs: number | null,
  clockUncertaintyMs: number | null,
): CanvasClockQuality | null {
  if (clockOffsetMs === null || clockUncertaintyMs === null) return null
  if (clockUncertaintyMs <= 15) return 'good'
  if (clockUncertaintyMs <= 50) return 'fair'
  return 'poor'
}

function deploymentState(deployment: CanvasDeployment | null, nowMs: number): CanvasStatusState {
  if (!deployment) return 'draft'
  if (nowMs < deployment.effectiveAt) return 'scheduled'
  if (deployment.releaseAt !== null && nowMs >= deployment.releaseAt) return 'released'
  return 'live'
}

function toEpochMs(value: Date | string | number | null): number | null {
  if (value === null) return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getCanvasStatus(
  input: { layoutId?: string } = {},
): Promise<CanvasStatusRowWithState[]> {
  const layoutFilter = input.layoutId?.trim()
  if (layoutFilter && !VALID_ID.test(layoutFilter)) return []

  await ensureCanvasLibrary()
  const store = await readStore(CANVAS_LIBRARY_ID)
  if (!store) return []

  const nowMs = Date.now()
  await pruneCanvasState(nowMs)

  const layouts = store.layouts.filter((layout) =>
    layout.kind === 'canvas' &&
    layout.canvas !== undefined &&
    (!layoutFilter || layout.id === layoutFilter),
  )
  if (layouts.length === 0) return []

  const stateRows = await listCanvasStates()
  const cards = await listInstanceCards()
  const cardsById = new Map(cards.map((card) => [card.id, card]))

  const statuses: CanvasStatusRowWithState[] = []

  for (const layout of layouts) {
    if (!layout.canvas) continue
    const geometry = resolveGeometry(layout.canvas)
    const markers = new Map(geometry.slots.map((slot) => [slot.slotId, slot.marker]))
    const canvasRows = stateRows.filter((row) =>
      row.data.active?.canvasId === layout.id || row.data.pending?.canvasId === layout.id,
    )
    if (canvasRows.length === 0) continue
    const rowsByInstance = new Map(canvasRows.map((row) => [row.instanceId, row]))
    const album = layout.settings.albumId
      ? store.albums.find((value) => value.id === layout.settings.albumId && value.theme === 'canvas') ?? null
      : null
    const libraryHash = canvasContentHash(layout, album)

    for (const slot of layout.canvas.slots) {
      const frameId = slot.frameId ?? ''
      const stateRow = frameId ? rowsByInstance.get(frameId) ?? null : null
      const card = frameId ? cardsById.get(frameId) ?? null : null
      const deployment = stateRow?.data.pending ?? stateRow?.data.active ?? null
      const deploymentRevision = deployment?.revision ?? null
      const rowRevision = stateRow?.revision ?? 0
      const deployedHash = deployment ? deployedCanvasContentHash(deployment) : null

      statuses.push({
        canvasId: layout.id,
        canvasName: layout.name,
        slotId: slot.id,
        marker: markers.get(slot.id) ?? geometry.slots.find((value) => value.slotId === slot.id)?.marker ?? 0,
        frameId,
        frameName: card?.frame?.name ?? (frameId || null),
        frameExists: Boolean(card),
        reportedAtMs: toEpochMs(stateRow?.reportedAt ?? null),
        revision: rowRevision,
        deploymentRevision,
        reportedRevision: stateRow?.reportedRevision ?? null,
        effectiveAtMs: deployment?.effectiveAt ?? null,
        clockOffsetMs: stateRow?.clockOffsetMs ?? null,
        clockUncertaintyMs: stateRow?.clockUncertaintyMs ?? null,
        clockQuality: clockQualityFromUncertainty(
          stateRow?.clockOffsetMs ?? null,
          stateRow?.clockUncertaintyMs ?? null,
        ),
        viewportW: stateRow?.viewportW ?? null,
        viewportH: stateRow?.viewportH ?? null,
        fpsAvg: stateRow?.fpsAvg ?? null,
        unpublishedChanges: deployedHash !== null && deployedHash !== libraryHash,
        state: deploymentState(deployment, nowMs),
      })
    }
  }

  return statuses.sort((a, b) =>
    a.canvasId.localeCompare(b.canvasId) ||
    a.marker - b.marker ||
    a.slotId.localeCompare(b.slotId),
  )
}
```

- [ ] **Step 4: Re-export the service function and update the service test**

In `lib/canvas/service.ts`, delete the phase 2 `export async function getCanvasStatus(...)` body. Add this next to the other imports:

```ts
export { getCanvasStatus } from './status'
export type { CanvasStatus, CanvasStatusRowWithState, CanvasStatusState } from './status'
```

Keep every other service function unchanged. If phase 2 imported `getCanvasStatus` internally, leave that import in place; the re-export resolves to the new function.

In `lib/canvas/__tests__/service.test.ts`, replace the phase 2 `getCanvasStatus` assertion, which expects `phase` and `members`, with the flat `CanvasStatusRowWithState` rows the re-export now returns. Derive `No report yet` from `canvasProblems` instead of a stored `problems` array:

```ts
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

- [ ] **Step 5: Implement the route**

Create `app/api/canvas/status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { STATUS_POLL_MS } from '@/lib/canvas/problems'
import { getCanvasStatus } from '@/lib/canvas/service'
import { resolveActor } from '@/lib/http-auth'

export const dynamic = 'force-dynamic'

const VALID_LAYOUT_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function GET(request: NextRequest) {
  if (process.env.INSTANCE_ID) {
    return NextResponse.json({ error: 'Canvas status is available on the console only' }, { status: 403 })
  }

  const actor = await resolveActor(request)
  if (!actor.ok) {
    return NextResponse.json(
      { error: actor.reason },
      { status: actor.reason === 'misconfigured' ? 500 : 401 },
    )
  }

  const rawLayoutId = request.nextUrl.searchParams.get('layoutId')?.trim()
  const layoutId = rawLayoutId || undefined
  if (layoutId && !VALID_LAYOUT_ID.test(layoutId)) {
    return NextResponse.json({ error: 'Invalid layoutId' }, { status: 400 })
  }

  const rows = await getCanvasStatus(layoutId ? { layoutId } : {})
  return NextResponse.json({ rows, serverNow: Date.now(), pollMs: STATUS_POLL_MS })
}
```

- [ ] **Step 6: Run the status route tests**

Run:

```bash
pnpm vitest run tests/canvas-status-route.test.ts lib/canvas/__tests__/service.test.ts
```

Expected: PASS for both files. The route tests cover the new HTTP surface; the service test uses the flat rows from the re-export.

- [ ] **Step 7: Commit**

```bash
git add lib/canvas/status.ts lib/canvas/service.ts lib/canvas/__tests__/service.test.ts app/api/canvas/status/route.ts tests/canvas-status-route.test.ts
git commit -m "feat(canvas): add operator status route"
```

---

### Task 4: Status tab and admin panel wiring

**Files:**
- Create: `components/editor/canvas-admin/status-tab.tsx`
- Create: `tests/canvas-status-wiring.test.ts`
- Modify: `components/editor/canvas-admin/canvas-admin-panel.tsx`

The panel keeps the Phase 2 Layouts and Albums tabs. It adds Status as the third tab. SWR polling stops when the tab unmounts.

- [ ] **Step 1: Write the failing wiring test**

Create `tests/canvas-status-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const statusSource = readFileSync(
  path.join(root, 'components/editor/canvas-admin/status-tab.tsx'),
  'utf8',
)
const panelSource = readFileSync(
  path.join(root, 'components/editor/canvas-admin/canvas-admin-panel.tsx'),
  'utf8',
)

describe('canvas status tab wiring', () => {
  it('polls the status route every five seconds while mounted', () => {
    expect(statusSource).toContain("import useSWR from 'swr'")
    expect(statusSource).toContain('refreshInterval: STATUS_POLL_MS')
    expect(statusSource).toContain('/api/canvas/status')
  })

  it('uses the pure classifier for every row', () => {
    expect(statusSource).toContain("from '@/lib/canvas/problems'")
    expect(statusSource).toContain('canvasProblems(row, now, STATUS_POLL_MS)')
  })

  it('renders every required column', () => {
    for (const heading of ['Marker', 'Frame', 'Last seen', 'Delivered', 'Rendering', 'Clock', 'Viewport', 'FPS', 'Problems']) {
      expect(statusSource).toContain(`>${heading}</th>`)
    }
  })

  it('adds Status as the third admin tab', () => {
    expect(panelSource).toContain("type CanvasAdminTab = 'layouts' | 'albums' | 'status'")
    expect(panelSource).toContain("{ id: 'status', label: 'Status' }")
    expect(panelSource).toContain("<StatusTab />")
  })

  it('keeps the Phase 2 tabs mounted', () => {
    expect(panelSource).toContain('<LayoutsTab />')
    expect(panelSource).toContain('<AlbumsTab />')
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run:

```bash
pnpm vitest run tests/canvas-status-wiring.test.ts
```

Expected: FAIL because `status-tab.tsx` does not exist.

- [ ] **Step 3: Implement the status tab**

Create `components/editor/canvas-admin/status-tab.tsx`:

```tsx
'use client'

import useSWR from 'swr'
import {
  STATUS_POLL_MS,
  canvasProblems,
  type CanvasStatusRow,
} from '@/lib/canvas/problems'

type StatusResponse = {
  rows: CanvasStatusRow[]
  serverNow: number
  pollMs: number
}

type CanvasGroup = {
  canvasId: string
  canvasName: string
  rows: CanvasStatusRow[]
}

async function fetchStatus(url: string): Promise<StatusResponse> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (response.status === 401) throw new Error('Sign in as an operator to view canvas status.')
  if (!response.ok) throw new Error(`Status request failed (${response.status}).`)
  return response.json() as Promise<StatusResponse>
}

function formatSeen(reportedAtMs: number | null, nowMs: number): string {
  if (reportedAtMs === null) return 'No report yet'
  const seconds = Math.max(0, Math.round((nowMs - reportedAtMs) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function formatClock(row: CanvasStatusRow): string {
  if (row.clockOffsetMs === null || row.clockUncertaintyMs === null) return 'No sample'
  return `${Math.round(row.clockOffsetMs)} ms / ${Math.round(row.clockUncertaintyMs)} ms / ${row.clockQuality ?? 'unknown'}`
}

function formatNumber(value: number | null): string {
  return value === null ? 'None' : String(value)
}

function formatFps(value: number | null): string {
  return value === null ? 'None' : value.toFixed(1)
}

function groupRows(rows: CanvasStatusRow[]): CanvasGroup[] {
  const groups: CanvasGroup[] = []
  const byCanvas = new Map<string, CanvasGroup>()
  for (const row of rows) {
    let group = byCanvas.get(row.canvasId)
    if (!group) {
      group = { canvasId: row.canvasId, canvasName: row.canvasName, rows: [] }
      byCanvas.set(row.canvasId, group)
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

export function StatusTab({ layoutId }: { layoutId?: string }) {
  const query = layoutId ? `?layoutId=${encodeURIComponent(layoutId)}` : ''
  const { data, error, isLoading } = useSWR<StatusResponse>(
    `/api/canvas/status${query}`,
    fetchStatus,
    { refreshInterval: STATUS_POLL_MS, revalidateOnFocus: true },
  )

  if (error instanceof Error) return <p className="text-sm text-destructive">{error.message}</p>
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading canvas status.</p>

  const now = Date.now()
  const groups = groupRows(data.rows)

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No deployed canvases are reporting yet.</p>
  }

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      {groups.map((group) => (
        <section key={group.canvasId} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{group.canvasName}</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-2 py-1">Marker</th>
                  <th scope="col" className="px-2 py-1">Frame</th>
                  <th scope="col" className="px-2 py-1">Last seen</th>
                  <th scope="col" className="px-2 py-1">Delivered</th>
                  <th scope="col" className="px-2 py-1">Rendering</th>
                  <th scope="col" className="px-2 py-1">Clock</th>
                  <th scope="col" className="px-2 py-1">Viewport</th>
                  <th scope="col" className="px-2 py-1">FPS</th>
                  <th scope="col" className="px-2 py-1">Problems</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const problems = canvasProblems(row, now, STATUS_POLL_MS)
                  return (
                    <tr key={`${row.canvasId}:${row.slotId}`} className="border-b border-border/60 align-top">
                      <td className="px-2 py-2 font-semibold">{row.marker || 'Unassigned'}</td>
                      <td className="px-2 py-2">
                        <span className="block">{row.frameName ?? row.frameId || 'Unassigned'}</span>
                        {row.frameId ? <span className="block font-mono text-muted-foreground">{row.frameId}</span> : null}
                      </td>
                      <td className="px-2 py-2">{formatSeen(row.reportedAtMs, now)}</td>
                      <td className="px-2 py-2">{formatNumber(row.revision)}</td>
                      <td className="px-2 py-2">{formatNumber(row.reportedRevision)}</td>
                      <td className="px-2 py-2">{formatClock(row)}</td>
                      <td className="px-2 py-2">
                        {row.viewportW === null || row.viewportH === null ? 'None' : `${row.viewportW}x${row.viewportH}`}
                      </td>
                      <td className="px-2 py-2">{formatFps(row.fpsAvg)}</td>
                      <td className="px-2 py-2">{problems.length === 0 ? 'OK' : problems.join(', ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Replace the admin panel**

Replace `components/editor/canvas-admin/canvas-admin-panel.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { EditorButton } from '../controls'
import { AlbumsTab } from './albums-tab'
import { LayoutsTab } from './layouts-tab'
import { StatusTab } from './status-tab'

export type CanvasAdminTab = 'layouts' | 'albums' | 'status'

const TABS: { id: CanvasAdminTab; label: string }[] = [
  { id: 'layouts', label: 'Layouts' },
  { id: 'albums', label: 'Albums' },
  { id: 'status', label: 'Status' },
]

export function CanvasAdminPanel() {
  const [activeTab, setActiveTab] = useState<CanvasAdminTab>('layouts')

  return (
    <div className="flex min-h-full flex-col">
      <div role="group" aria-label="Canvas administration sections" className="flex shrink-0 border-b border-border">
        {TABS.map((tab) => (
          <EditorButton
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            variant="quiet"
            className="min-h-12 flex-1 shrink rounded-none border-b-2 border-transparent px-2 py-3 aria-pressed:border-primary aria-pressed:text-foreground"
          >
            {tab.label}
          </EditorButton>
        ))}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {activeTab === 'layouts' && <LayoutsTab />}
        {activeTab === 'albums' && <AlbumsTab />}
        {activeTab === 'status' && <StatusTab />}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the wiring test and related source tests**

Run:

```bash
pnpm vitest run tests/canvas-status-wiring.test.ts tests/frame-admin-panel.test.ts tests/editor-shell.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/editor/canvas-admin/status-tab.tsx components/editor/canvas-admin/canvas-admin-panel.tsx tests/canvas-status-wiring.test.ts
git commit -m "feat(canvas): show live frame status in the admin panel"
```

---

### Task 5: Revoke cleanup

**Files:**
- Modify: `app/api/instances/[id]/route.ts`
- Test: `tests/canvas-revoke-cleanup.test.ts`

Spec section 14 requires revoke to delete the derived `canvas_state` row. The route owns the cleanup because it already coordinates auth, revoke and audit.

- [ ] **Step 1: Write the failing route test**

Create `tests/canvas-revoke-cleanup.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = process.env.NODE_ENV

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-revoke-cleanup'
})

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = originalNodeEnv
  delete env.CONSOLE_ADMIN_TOKEN
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seedInstance(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const db = getDb()
  const tables = getTables()
  const now = new Date()
  await db.insert(tables.instances).values({ id, createdAt: now, lastSeenAt: now })
}

async function deleteInstance(id: string) {
  const { NextRequest } = await import('next/server')
  const { DELETE } = await import('@/app/api/instances/[id]/route')
  const request = new NextRequest(`http://localhost/api/instances/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': 'revoke-admin' },
  })
  return DELETE(request, { params: Promise.resolve({ id }) })
}

describe('instance revoke cleanup', () => {
  beforeEach(async () => {
    env.NODE_ENV = 'production'
    env.CONSOLE_ADMIN_TOKEN = 'revoke-admin'
    await freshDb()
  })

  it('deletes the canvas_state row when an instance is revoked', async () => {
    await seedInstance('frame-r')
    const { putCanvasState, getCanvasState } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-r', { v: 1, active: null, pending: null, identify: null })
    expect(await getCanvasState('frame-r')).not.toBeNull()

    const response = await deleteInstance('frame-r')
    expect(response.status).toBe(200)
    expect(await getCanvasState('frame-r')).toBeNull()
  })

  it('succeeds when the instance has no canvas_state row', async () => {
    await seedInstance('frame-s')
    const response = await deleteInstance('frame-s')
    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run:

```bash
pnpm vitest run tests/canvas-revoke-cleanup.test.ts
```

Expected: FAIL because the first assertion finds the row after DELETE.

- [ ] **Step 3: Add cleanup to the revoke route**

Replace `app/api/instances/[id]/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { deleteCanvasState } from '@/lib/canvas/state-store'
import { resolveActor } from '@/lib/http-auth'
import { revokeInstance } from '@/lib/console/service'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason }, { status: outcome.reason === 'misconfigured' ? 500 : 401 })
  }
  const { id } = await params
  await revokeInstance(id)
  await deleteCanvasState(id)
  await audit(outcome.actor, 'revoke_instance', 'instance', id, {})
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the cleanup test**

Run:

```bash
pnpm vitest run tests/canvas-revoke-cleanup.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/instances/[id]/route.ts tests/canvas-revoke-cleanup.test.ts
git commit -m "fix(canvas): clear canvas state on instance revoke"
```

---

### Task 6: Operator documentation

**Files:**
- Create: `tests/canvas-docs.test.ts`
- Modify: `docs/canvas.md`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `docs/kiosk-cli.md`

All prose below uses plain words, short sentences and no em dashes. Run the repository `/unslop` skill over these four documents before committing.

- [ ] **Step 1: Write the failing docs test**

Create `tests/canvas-docs.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_PROBLEM_LABELS } from '@/lib/canvas/problems'

const root = path.resolve(__dirname, '..')
const canvasGuide = readFileSync(path.join(root, 'docs/canvas.md'), 'utf8')
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')
const operations = readFileSync(path.join(root, 'docs/operations.md'), 'utf8')
const kioskCli = readFileSync(path.join(root, 'docs/kiosk-cli.md'), 'utf8')

describe('canvas operator documentation', () => {
  it('covers setup, NTP, calibration and the deployment lifecycle', () => {
    for (const heading of [
      '## Setup',
      '## Clock setup',
      '## Calibration',
      '## Deploy, update and release',
      '## Troubleshooting',
      '## Environment',
    ]) {
      expect(canvasGuide).toContain(heading)
    }
  })

  it('explains every problem label', () => {
    for (const label of CANVAS_PROBLEM_LABELS) expect(canvasGuide).toContain(label)
  })

  it('documents the fast poll overrides and regular sync fallback', () => {
    for (const variable of ['CANVAS_POLL_ACTIVE_SECONDS', 'CANVAS_POLL_IDLE_SECONDS', 'SYNC_INTERVAL_MINUTES']) {
      expect(canvasGuide).toContain(variable)
      expect(operations).toContain(variable)
      expect(kioskCli).toContain(variable)
    }
  })

  it('links the feature from the README', () => {
    expect(readme).toContain('### Multi-frame canvas')
    expect(readme).toContain('docs/canvas.md')
  })

  it('adds console operations guidance', () => {
    expect(operations).toContain('## Multi-frame canvas')
    expect(operations).toContain('GET /api/canvas/status')
  })

  it('uses plain prose in the canvas guide', () => {
    expect(canvasGuide).not.toContain('—')
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run:

```bash
pnpm vitest run tests/canvas-docs.test.ts
```

Expected: FAIL on missing headings and environment variables.

- [ ] **Step 3: Replace the operator guide**

Replace `docs/canvas.md` with:

````markdown
# Multi-frame canvas operator guide

A canvas makes several frames show one shared surface. Each frame keeps its own
layout and schedule. While a deployment is live, the frame shows its window of
the canvas instead. Releasing the deployment returns the frame to its own
content without a restore step.

## Setup

1. Enroll each screen as an instance from the Frame Directory. Follow the steps
   in `docs/operations.md`. Wait until each instance appears in the frame list.
2. Open the editor and choose **Canvas** from the rail. The drawer opens on
   Layouts.
3. Open the Albums tab and create an album. A new canvas album starts with one
   sync-test scene. Keep that scene first for calibration, then add a marquee
   scene with the text you want on the wall.
4. Open the Layouts tab and create a canvas layout. Choose Row, Column or Grid,
   set the bezel gap, then add each enrolled frame to a slot. Marker numbers
   follow slot order.
5. Select the album in the layout. Check the Problems list before deploying.
6. Click **Identify frames** and confirm that the screens show markers 1, 2 and
   3 in the order you expect.
7. Click **Go live**. The console waits about 15 seconds so every frame can
   pull the deployment. All frames switch at the same instant.
8. Open the Status tab. Confirm that each slot has a recent report, the same
   delivered and rendering revision, a clock quality of good or fair, and no
   problem labels.
9. When the sweep bar lines up across the bezels, disable the sync-test scene or
   set its duration short, then press **Update live canvas**. Confirm the
   marquee crosses both bezels on the live wall.

Use enrolled instances only. A slot with no frame stays unassigned until you
pick one. A frame can belong to one scheduled or live canvas at a time.

## Clock setup

Every frame measures its offset to the console on each sync pull. Playback uses
that offset so scenes line up across bezels. The operating system clock still
needs network time, especially after a power cut.

On a Debian kiosk, check network time with:

```bash
timedatectl status
sudo timedatectl set-ntp true
```

Wait a few minutes after boot before a go live. Aim for clock skew at or below
20 ms on a LAN and at or below 50 ms through a WAN console. The sync-test
scene and the Status tab are the practical checks. A projector or kiosk with a
flat battery needs a board battery replacement if its clock resets on every power
loss.

The app drops clock samples with a round trip above 3 seconds. A frame that
has never reached the console falls back to its system clock and reports a poor
clock until it gets a sample.

## Calibration

1. Open the canvas layout during setup.
2. Add or keep a sync-test scene at the start of the album. The sweep bar
   crosses the whole canvas. Each slot shows its marker and rectangle.
3. Deploy with **Go live** and watch the bar cross each bezel.
4. If the bar jumps at a bezel, open the Status tab. Check Clock drift risk
   and the clock offset for the two frames on either side of that bezel.
5. Use **Identify frames** to match physical screens to slot numbers. Change
   slot order in the layout if the markers do not match the room.
6. Adjust the bezel gap in the layout when the visual gap differs from the
   physical gap. The sweep bar passes behind bezels by design.

For fast local checks, the development harness at `/dev/canvas-wall` accepts
`frames`, `arrangement`, `gap`, `scene` and `t` query values. It uses the same
renderer as a kiosk and never runs the console status route.

## Deploy, update and release

- **Go live** creates a new deployment revision. The console sets `effectiveAt`
  in the future. Frames keep their old content until that time.
- **Update live canvas** writes a pending deployment. Frames that stay on the
  canvas keep playing the active deployment until the new time. Frames that
  leave the canvas get a release time, so there is no blank gap.
- **Release** ends the deployment at a shared time. Frames return to their own
  layouts and schedules.
- **Identify frames** shows markers for a chosen number of seconds on draft,
  scheduled and live canvases.
- Editing a layout or album does not change the wall. The Problems column shows
  **Unpublished changes** until you press **Update live canvas** or **Go live**.

After each deploy, refresh the Status tab and check that delivered and
rendering revisions match once `effectiveAt` has passed.

## Status columns

| Column | Meaning |
| --- | --- |
| Marker | Slot number from layout order. |
| Frame | Frame name and instance id. |
| Last seen | Age of the last display report. |
| Delivered | `canvas_state.revision` written by the console. |
| Rendering | Revision the display last applied. |
| Clock | Offset, uncertainty and quality from the frame report. |
| Viewport | Reported logical width and height. |
| FPS | Reported average frames per second. |
| Problems | Labels from the health checks below. |

## Troubleshooting

### Frame missing

The instance was revoked or is no longer enrolled. Revoke cleanup removes its
canvas state row. Add a new enrolled frame to the slot, or remove the slot, then
deploy again.

### No report yet

The frame has never sent a canvas report. Check that it is enrolled, that sync
is enabled, and that its display page is open. Run `kiosk sync now` on the
frame. If the Status tab still shows no report, check `kiosk app logs`.

### Offline

The frame has not reported for more than three poll intervals, 15 seconds with
the default poll. Check network reachability and the app service with `kiosk
app health`. Playback continues from the last clock offset, so a temporary
network loss does not stop the show. The frame joins the current scene when it
returns.

### Out of date

The delivered revision is ahead of the rendering revision after `effectiveAt`.
Check that the frame can reach the console and that its local poll is running.
A repeat **Update live canvas** repairs a partial write. Frames that joined late
start mid scene, which is correct behavior.

### Clock drift risk

Clock uncertainty is above 50 ms or the derived quality is poor. Check network
time on the frame, round trip time to the console and WAN latency. enable NTP
with `sudo timedatectl set-ntp true`, wait for a fresh sample, then check the
sync-test bar again.

### Wrong aspect ratio

The reported viewport is more than 1 percent away from 9 by 16. Check kiosk
rotation, screen mode and browser window size. `kiosk config set rotate right`
or `left` restores portrait. Restart the browser with `sudo kiosk-ctl restart`
after a rotation change.

### Unpublished changes

The library layout or album differs from the deployed snapshot. Press **Update
live canvas** for an existing live canvas, or **Go live** for a draft. No change
reaches a frame until you deploy.

## Environment

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `CANVAS_POLL_ACTIVE_SECONDS` | frame service | `5` | Poll interval while the frame has a deployment or identify request. `0` disables the fast active poll and falls back to the regular sync interval. |
| `CANVAS_POLL_IDLE_SECONDS` | frame service | `30` | Poll interval while the frame has no canvas work. `0` disables the idle fast poll. |
| `SYNC_INTERVAL_MINUTES` | frame service | `15` | Regular sync fallback used when an active or idle override is `0`. |
| `CANVAS_DEMO` | local app | unset | Set to `1` to allow the demo route in production. |
| `SYNC_ENDPOINT`, `SYNC_TOKEN`, `INSTANCE_ID` | frame service | unset | Required for canvas delivery. Without them the display has no canvas row. |
| `CONSOLE_ADMIN_TOKEN` | console | unset | Operator token for `GET /api/canvas/status` and other console APIs. |

The Status tab polls every 5 seconds while it is open. Offline means 15
seconds without a report unless you change the active poll interval. The
console does not know each frame's environment, so the status view uses the
default 5 second interval for this label.

## Local walkthrough

1. Run the app with a SQLite database:
   `FRAME_DB_PATH=.data/canvas-demo.db pnpm dev`.
2. Create a demo wall:
   `curl -X POST 'http://localhost:3000/api/canvas/demo?frame=home&slot=a&identify=1'`.
3. Open `http://localhost:3000` and watch the marquee, bounce and sync test.
4. Clear the demo row:
   `curl -X DELETE 'http://localhost:3000/api/canvas/demo?frame=home'`.

The demo row is local and does not use the console status route.

## Checks

```bash
pnpm test
npx tsc --noEmit
pnpm build
```
````

- [ ] **Step 4: Add the README feature section**

Insert this section immediately before `### Widget library` in `README.md`:

```markdown
### Multi-frame canvas

A canvas treats several frames as one wide or tall display. Operators create
canvas albums and canvas layouts from the Canvas rail, assign enrolled frames
to slots, identify the slots on the wall, and deploy with a shared start time.
Frames pull the same snapshot and compute scenes from synced time, so motion
stays continuous across bezels and survives a network drop.

The Status tab shows the last report, delivered and rendering revisions, clock
offset and quality, viewport, frame rate and problem labels for every slot.
Library edits are marked as unpublished until the next deploy. Revoking an
instance also clears its canvas state row. See `docs/canvas.md` for setup, NTP
advice, calibration and troubleshooting.

```

- [ ] **Step 5: Add operations entries**

Append this block to `docs/operations.md`:

```markdown

## Multi-frame canvas

- The console Canvas rail manages canvas layouts, canvas albums and frame
  status. Console canvas routes require `resolveActor` and refuse requests when
  `INSTANCE_ID` is set. `GET /api/canvas/status?layoutId=<id>` returns the
  status rows used by the Status tab.
- Enroll every canvas member as an instance. A frame can join one scheduled or
  live canvas at a time. Keep network time enabled on every frame. The operator
  guide in `docs/canvas.md` covers go live, update, release and calibration.
- Fast canvas polling uses `CANVAS_POLL_ACTIVE_SECONDS` (default `5`) while a
  frame has a canvas deployment or identify request, and
  `CANVAS_POLL_IDLE_SECONDS` (default `30`) otherwise. Set either value to `0`
  to disable that fast poll and fall back to the regular sync interval from
  `SYNC_INTERVAL_MINUTES` (default `15` minutes). Set these values in
  `/etc/dscos/frame.env` and restart `dscos`. The console Status tab always
  polls every 5 seconds.
- Problem labels: Offline means no report for more than three poll intervals.
  Out of date means the rendering revision trails the delivered revision after
  `effectiveAt`. Clock drift risk means poor quality or uncertainty above
  50 ms. Wrong aspect ratio means the viewport differs from 9 by 16 by more
  than 1 percent. No report yet means the frame never sent a canvas report.
  Unpublished changes means the library differs from the deployed snapshot.
  Frame missing means the instance is gone or was revoked.
- Revoking an instance with `DELETE /api/instances/<id>` deletes its
  `canvas_state` row. The next deploy skips a revoked frame that is still in a
  slot, and the Status tab marks the slot as missing.
- Canvas state is derived data. Backups cover the authoring library through
  frame documents. A rebuild on the next deploy restores delivery rows.

```

- [ ] **Step 6: Add kiosk CLI guidance**

Insert this block in `docs/kiosk-cli.md` immediately before `### Updates`:

````markdown

### Canvas fast poll

Canvas delivery uses a second pull timer in the app service. It runs beside the
15 minute sync worker. Set these values in `/etc/dscos/frame.env` as root and
restart the app with `kiosk app restart`:

```bash
CANVAS_POLL_ACTIVE_SECONDS=5
CANVAS_POLL_IDLE_SECONDS=30
```

`CANVAS_POLL_ACTIVE_SECONDS` applies while the frame has a canvas deployment or
an identify request. `CANVAS_POLL_IDLE_SECONDS` applies when it has no canvas
work. Set either value to `0` to disable that fast poll and fall back to the
regular sync interval from `SYNC_INTERVAL_MINUTES` (default `15` minutes). Check
the Status tab in the console to see whether reports arrive within the expected
5 seconds.

````

- [ ] **Step 7: Run the docs tests**

Run:

```bash
pnpm vitest run tests/canvas-docs.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add docs/canvas.md README.md docs/operations.md docs/kiosk-cli.md tests/canvas-docs.test.ts
git commit -m "docs: explain canvas status and recovery"
```

---

### Task 7: Verification and phase evidence

**Files:**
- None unless a check finds a bug.

- [ ] **Step 1: Run the focused health scenario tests**

Run:

```bash
pnpm vitest run lib/canvas/__tests__/problems.test.ts tests/canvas-status-route.test.ts tests/canvas-revoke-cleanup.test.ts tests/canvas-status-wiring.test.ts tests/canvas-docs.test.ts
```

Expected: PASS. This suite covers offline, out of date, poor clock, aspect ratio, unpublished changes, revoke cleanup, UI wiring and docs presence.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. The count grows by the new tests in this phase. Record the final line for the PR.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Build**

Run:

```bash
pnpm build
```

Expected: production build succeeds and `/api/canvas/status` appears in the route table.

- [ ] **Step 5: Run the release check**

Run:

```bash
pnpm release:check
```

Expected: PASS. If it reports a version note problem, update only the release notes it asks for in a separate commit.

- [ ] **Step 6: Capture before and after evidence**

Before this phase, the status route did not exist and the admin panel had two tabs. Run these commands and keep both outputs for the PR description:

```bash
pnpm vitest run lib/canvas/__tests__/problems.test.ts tests/canvas-status-route.test.ts 2>&1 | tee docs/evidence/canvas-phase3-status.txt
```

For the visible surface, open a console with a seeded canvas from Phase 2. Capture a screenshot of the two-tab panel before this phase and a screenshot of the Status tab with at least one problem label after this phase. Pass both PNGs to the repository `/before-and-after` command with `--markdown` and paste the table into the PR. If the browser cannot start in this environment, set `AGENT_BROWSER_ARGS="--no-sandbox"` for the capture command and say so in the PR.

- [ ] **Step 7: Commit proof files only if they are tracked in this repo**

```bash
git add docs/evidence/canvas-phase3-status.txt
git commit -m "test(canvas): record phase 3 status evidence"
```

If the evidence file is already covered by `.gitignore`, skip this commit and attach the output to the PR instead.

---

## Phase 3 exit criteria

The phase is done when every item below is true.

1. `pnpm test`, `npx tsc --noEmit`, `pnpm build` and `pnpm release:check` pass.
2. `GET /api/canvas/status` requires an operator, returns 403 on a kiosk, validates `layoutId`, exposes both the row `revision` and `deploymentRevision`, and reads `getCanvasStatus` from the Phase 2 service module.
3. The Status tab is the third Canvas admin tab. It polls every 5 seconds while mounted, shows marker, frame, Last seen, Delivered, Rendering, Clock, Viewport, FPS and Problems, and uses `canvasProblems` for labels.
4. Library edits produce **Unpublished changes** and disappear after the next deploy. `lib/canvas/__tests__/hash.test.ts` proves no false positive immediately after deploy.
5. Revoking an instance deletes its `canvas_state` row. The route test proves it.
6. `docs/canvas.md` walks a new operator from an empty console to a live three frame marquee, covers NTP and sync-test calibration, and explains every problem label. `README.md`, `docs/operations.md` and `docs/kiosk-cli.md` link or repeat the needed steps and poll variables.
7. The simulated failure scenarios from spec section 19 produce these labels in `lib/canvas/__tests__/problems.test.ts`:

| Scenario | Setup in the test | Expected label |
| --- | --- | --- |
| Offline frame | `reportedAtMs = now - 15_001`, `pollMs = 5000` | Offline |
| Out of date frame | `effectiveAtMs <= now`, `revision = 2`, `reportedRevision = 1` | Out of date |
| Poor clock | `clockQuality = 'poor'` or `clockUncertaintyMs > 50` | Clock drift risk |
| Wrong aspect ratio | `viewportW = 1080`, `viewportH = 1950` | Wrong aspect ratio |
| Late frame with no report | `reportedAtMs = null` | No report yet |
| Edited library | `unpublishedChanges = true` | Unpublished changes |
| Revoked frame | `frameExists = false` | Frame missing |

8. The PR describes what was checked locally and what still needs a real kiosk. Clock accuracy on a Dell Wyse 3040 and WAN behavior remain manual checks.
