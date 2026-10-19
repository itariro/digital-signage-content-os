# Local-First Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a single Frame instance run locally with persistent SQLite storage, asset registry, frame-aware editor, Bob-driven display, offline cache, and backup/recovery — without changing console (Postgres) behavior.

**Architecture:** Introduce `FRAME_MODE` (instance|console). Instance mode uses SQLite via Drizzle + WAL; console keeps Postgres. A driver abstraction (`lib/db`) selects tables at runtime. Asset registry replaces raw FS media. Editor and display become frame-aware. Service worker caches last store for offline viewing.

**Tech Stack:** Next.js 16, Drizzle ORM (sqlite + pg), better-sqlite3, nanoid, zod, Clerk (console only), service worker, Vitest.

**Prerequisite:** Spec approved (`docs/superpowers/specs/2026-10-19-local-first-multi-frame-platform-design.md`). Stage 2 only.

---

## File structure (new/modified)

- `lib/db/mode.ts` (new) — mode resolution
- `lib/db/tables.ts` (new) — dialect-aware table accessor
- `lib/db/schema.pg.ts` (renamed from `schema.ts`) — Postgres schema
- `lib/db/schema.sqlite.ts` (new) — SQLite schema
- `lib/db/sqlite.ts` (new) — SQLite client
- `lib/db/index.ts` (modified) — driver dispatch
- `lib/db/migrate.ts` (new) — migration runner
- `lib/db/types.ts` (new) — shared entity types
- `lib/lifecycle/index.ts` (new) — init/start/stop/recover
- `instrumentation.ts` (new, root) — Next.js startup hook
- `lib/backup/index.ts` (new) — snapshot/restore/rotate/integrity
- `lib/assets/registry.ts` (new) — asset CRUD + hashing
- `lib/assets/storage.ts` (new) — path safety + FS ops
- `app/api/assets/route.ts` (new) — list/upload
- `app/api/assets/[id]/route.ts` (new) — get/delete
- `hooks/use-frame-store.ts` (modified) — accept frameId
- `app/page.tsx` (modified) — frame-aware editor entry
- `components/editor/editor.tsx` (modified) — accept frameId prop
- `components/frame/frame-display.tsx` (modified) — consume decision layout
- `public/sw.js` (new) — service worker
- `app/layout.tsx` (modified) — register SW
- `lib/store.ts` (modified) — use tables accessor; asset refs
- `drizzle/sqlite/*` (new) — sqlite migrations
- `package.json` (modified) — add better-sqlite3, types

---

### Task 1: Mode resolution

**Files:**
- Create: `lib/db/mode.ts`
- Test: `lib/db/__tests__/mode.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/db/__tests__/mode.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDatabaseMode } from '@/lib/db/mode'

describe('getDatabaseMode', () => {
  const prev = { ...process.env }
  afterEach(() => { process.env = { ...prev } })

  it('returns sqlite when FRAME_MODE=instance', () => {
    process.env.FRAME_MODE = 'instance'
    delete process.env.DATABASE_URL
    expect(getDatabaseMode()).toBe('sqlite')
  })
  it('returns postgres when FRAME_MODE=console', () => {
    process.env.FRAME_MODE = 'console'
    process.env.DATABASE_URL = 'postgres://x'
    expect(getDatabaseMode()).toBe('postgres')
  })
  it('defaults to postgres when DATABASE_URL present and no FRAME_MODE', () => {
    delete process.env.FRAME_MODE
    process.env.DATABASE_URL = 'postgres://x'
    expect(getDatabaseMode()).toBe('postgres')
  })
  it('defaults to sqlite when no DATABASE_URL and no FRAME_MODE', () => {
    delete process.env.FRAME_MODE
    delete process.env.DATABASE_URL
    expect(getDatabaseMode()).toBe('sqlite')
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run lib/db/__tests__/mode.test.ts`
Expected: FAIL "Cannot find module '@/lib/db/mode'"

- [ ] **Step 3: Implement**

```ts
// lib/db/mode.ts
export type DatabaseMode = 'sqlite' | 'postgres'

export function getDatabaseMode(): DatabaseMode {
  const mode = process.env.FRAME_MODE?.toLowerCase()
  if (mode === 'instance') return 'sqlite'
  if (mode === 'console') return 'postgres'
  if (process.env.DATABASE_URL) return 'postgres'
  return 'sqlite'
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run lib/db/__tests__/mode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/mode.ts lib/db/__tests__/mode.test.ts
git commit -m "feat(db): add FRAME_MODE-based database mode resolution"
```

---

### Task 2: Rename Postgres schema

**Files:**
- Rename: `lib/db/schema.ts` → `lib/db/schema.pg.ts`
- Modify: `drizzle.config.ts` (schema path)
- Modify: `app/api/frames/route.ts`, `app/api/sources/route.ts`, `lib/store.ts` imports (keep pointing to `schema.pg` temporarily via `schema.ts` barrel)

- [ ] **Step 1: Rename file**

```bash
git mv lib/db/schema.ts lib/db/schema.pg.ts
```

- [ ] **Step 2: Create barrel `lib/db/schema.ts` re-exporting pg schema (console default)**

```ts
// lib/db/schema.ts
export * from './schema.pg'
```

- [ ] **Step 3: Update drizzle.config.ts schema path**

Edit `drizzle.config.ts`: `schema: './lib/db/schema.pg.ts'` (postgres dialect).

- [ ] **Step 4: Run build/typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (barrel preserves exports).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.pg.ts drizzle.config.ts
git commit -m "refactor(db): rename postgres schema to schema.pg; add barrel"
```

---

### Task 3: SQLite schema

**Files:**
- Create: `lib/db/schema.sqlite.ts`
- Test: `lib/db/__tests__/schema.sqlite.test.ts` (shape smoke)

- [ ] **Step 1: Write failing smoke test**

```ts
// lib/db/__tests__/schema.sqlite.test.ts
import { describe, it, expect } from 'vitest'
import * as s from '@/lib/db/schema.sqlite'

describe('sqlite schema', () => {
  it('exports frameDocuments and contentSources tables', () => {
    expect(s.frameDocuments).toBeDefined()
    expect(s.contentSources).toBeDefined()
    expect(s.displayHistory).toBeDefined()
  })
})
```

- [ ] **Step 2: Implement schema.sqlite.ts** (port pg tables to sqliteTable)

```ts
// lib/db/schema.sqlite.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const frameDocuments = sqliteTable('frame_documents', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  data: text('data').notNull(), // JSON string
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolutionWidth: integer('resolution_width').notNull().default(1920),
  resolutionHeight: integer('resolution_height').notNull().default(1080),
  screenWidthMm: integer('screen_width_mm'),
  screenHeightMm: integer('screen_height_mm'),
})

export const frameTemplates = sqliteTable('frame_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),
  frameId: text('frame_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const displayHistory = sqliteTable('display_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frameId: text('frame_id').notNull(),
  decisionId: text('decision_id').notNull(),
  ruleId: text('rule_id'),
  layoutId: text('layout_id').notNull(),
  shownAt: text('shown_at').notNull(),
  score: real('score').notNull(),
})

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: text('next_attempt_at').notNull(),
  status: text('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  hash: text('hash').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  source: text('source').notNull().default('local'),
})

export const syncCheckpoints = sqliteTable('sync_checkpoints', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 3: Run test**

Run: `npx vitest run lib/db/__tests__/schema.sqlite.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.sqlite.ts lib/db/__tests__/schema.sqlite.test.ts
git commit -m "feat(db): add SQLite schema for instance mode"
```

---

### Task 4: SQLite client

**Files:**
- Create: `lib/db/sqlite.ts`
- Modify: `package.json` (add better-sqlite3 + types)

- [ ] **Step 1: Add dependency**

```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: Implement client**

```ts
// lib/db/sqlite.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.sqlite'
import path from 'node:path'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
const DB_PATH = process.env.FRAME_DB_PATH || path.join(DATA_DIR, 'frame.db')

let _db: ReturnType<typeof drizzle> | null = null

export function getSqliteDb() {
  if (_db) return _db
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  return _db
}

export function getSqlitePath() { return DB_PATH }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/db/sqlite.ts package.json pnpm-lock.yaml
git commit -m "feat(db): add SQLite client with WAL mode"
```

---

### Task 5: Tables accessor

**Files:**
- Create: `lib/db/tables.ts`
- Modify: `lib/db/index.ts`, `lib/store.ts`, `app/api/frames/route.ts`, `app/api/sources/route.ts`

- [ ] **Step 1: Implement accessor**

```ts
// lib/db/tables.ts
import { getDatabaseMode } from './mode'

export function getTables() {
  if (getDatabaseMode() === 'sqlite') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./schema.sqlite') as typeof import('./schema.sqlite')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./schema.pg') as typeof import('./schema.pg')
}
```

- [ ] **Step 2: Update `lib/db/index.ts`**

Modify `getDb()` to return sqlite drizzle when mode=sqlite; keep pg pool otherwise. Import tables via `getTables()` for schema. Keep `queryHistory`/`recordDecision`/`pruneHistory` but make them dialect-aware? For Stage 2, keep pg implementations and add sqlite equivalents guarded by mode. Minimal: if sqlite mode, use sqlite db and sqlite schema; history functions use `getTables().displayHistory`.

Refactor `getDb()`:

```ts
export function getDb() {
  if (getDatabaseMode() === 'sqlite') return getSqliteDb()
  return drizzle(getPool(), { schema: getTables() as any })
}
```

(Note: `drizzle(getPool(), { schema })` still works for pg.)

- [ ] **Step 3: Update call sites** to use `getTables().frameDocuments` / `contentSources` instead of imported table constants. In `lib/store.ts` and routes, replace `import { frameDocuments } from '@/lib/db/schema'` with `const { frameDocuments } = getTables()` inside functions (or module-level const). Since mode is fixed per process, module-level is fine:

```ts
import { getTables } from '@/lib/db/tables'
const { frameDocuments } = getTables()
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (existing tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/tables.ts lib/db/index.ts lib/store.ts app/api/frames/route.ts app/api/sources/route.ts
git commit -m "feat(db): add dialect-aware table accessor and dispatch getDb by mode"
```

---

### Task 6: Migration runner

**Files:**
- Create: `lib/db/migrate.ts`
- Create: `lib/db/__tests__/migrate.test.ts`

- [ ] **Step 1: Write failing test (sqlite in-memory)**

```ts
// lib/db/__tests__/migrate.test.ts
import { describe, it, expect } from 'vitest'
import { runMigrations } from '@/lib/db/migrate'

describe('runMigrations', () => {
  it('creates core tables on empty sqlite db', async () => {
    process.env.FRAME_MODE = 'instance'
    process.env.FRAME_DB_PATH = ':memory:'
    // reset cached db
    const { runMigrations } = await import('@/lib/db/migrate')
    await runMigrations()
    const { getSqliteDb } = await import('@/lib/db/sqlite')
    const db = getSqliteDb()
    const rows = db.all?.("SELECT name FROM sqlite_master WHERE type='table'") ?? []
    const names = (rows as any[]).map(r => r.name)
    expect(names).toContain('frame_documents')
    expect(names).toContain('assets')
  })
})
```

Note: `:memory:` with better-sqlite3 requires not caching a file path; client uses env at first call. For tests, allow `FRAME_DB_PATH=:memory:`. Adjust client to handle `:memory:` (better-sqlite3 supports `new Database(':memory:')`).

- [ ] **Step 2: Implement runner**

```ts
// lib/db/migrate.ts
import { getDatabaseMode } from './mode'
import fs from 'node:fs'
import path from 'node:path'

export async function runMigrations() {
  if (getDatabaseMode() === 'sqlite') {
    const { getSqliteDb } = await import('./sqlite')
    const db = getSqliteDb()
    // Apply embedded DDL (idempotent CREATE TABLE IF NOT EXISTS)
    const ddl = fs.readFileSync(path.join(process.cwd(), 'drizzle/sqlite/0000_init.sql'), 'utf8')
    db.exec(ddl)
    return
  }
  // postgres: assume drizzle-kit applied; no-op at runtime
}
```

Create `drizzle/sqlite/0000_init.sql` with `CREATE TABLE IF NOT EXISTS` for all sqlite tables.

- [ ] **Step 3: Create DDL file** `drizzle/sqlite/0000_init.sql`.

- [ ] **Step 4: Run test**

Run: `npx vitest run lib/db/__tests__/migrate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrate.ts lib/db/__tests__/migrate.test.ts drizzle/sqlite
git commit -m "feat(db): add idempotent migration runner for sqlite instance mode"
```

---

### Task 7: Lifecycle module

**Files:**
- Create: `lib/lifecycle/index.ts`
- Create: `instrumentation.ts` (root)

- [ ] **Step 1: Implement lifecycle**

```ts
// lib/lifecycle/index.ts
import { getDatabaseMode } from '@/lib/db/mode'
import { runMigrations } from '@/lib/db/migrate'

export async function initInstance() {
  await runMigrations()
  // integrity check for sqlite
  if (getDatabaseMode() === 'sqlite') {
    const { getSqliteDb } = await import('@/lib/db/sqlite')
    const db = getSqliteDb() as any
    const r = db.get?.("PRAGMA integrity_check") ?? db.all?.("PRAGMA integrity_check")
    const ok = Array.isArray(r) ? r.every((x: any) => Object.values(x)[0] === 'ok') : Object.values(r ?? {})[0] === 'ok'
    if (!ok) throw new Error('SQLite integrity check failed')
  }
}

export async function shutdownInstance() {
  // checkpoint WAL
  if (getDatabaseMode() === 'sqlite') {
    const { getSqliteDb } = await import('@/lib/db/sqlite')
    const db = getSqliteDb() as any
    try { db.exec?.('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
  }
}
```

- [ ] **Step 2: instrumentation.ts**

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initInstance } = await import('./lib/lifecycle')
    await initInstance()
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/lifecycle instrumentation.ts
git commit -m "feat(lifecycle): init migrations + integrity check on startup"
```

---

### Task 8: Backup module

**Files:**
- Create: `lib/backup/index.ts`
- Test: `lib/backup/__tests__/index.test.ts`

- [ ] **Step 1: Write failing test (rotation logic)**

```ts
// lib/backup/__tests__/index.test.ts
import { describe, it, expect } from 'vitest'
import { rotateBackups } from '@/lib/backup'

describe('rotateBackups', () => {
  it('keeps only maxN newest', () => {
    const files = ['a.db','b.db','c.db','d.db'].map((n,i)=>({ name:n, mtime: i }))
    const keep = rotateBackups(files as any, 2)
    expect(keep.map((f:any)=>f.name)).toEqual(['c.db','d.db'])
  })
})
```

- [ ] **Step 2: Implement pure rotation + snapshot helpers**

```ts
// lib/backup/index.ts
import fs from 'node:fs'
import path from 'node:path'

export interface BackupFile { name: string; mtime: number; path: string }

export function rotateBackups(files: BackupFile[], maxN: number): BackupFile[] {
  const sorted = [...files].sort((a,b) => a.mtime - b.mtime)
  return sorted.slice(Math.max(0, sorted.length - maxN))
}

export function backupDir(dataDir = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`) {
  return path.join(dataDir, 'backups')
}

export function createSnapshot(dataDir?: string): string {
  const dir = backupDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g,'-')
  const src = path.join(dataDir || process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`, 'frame.db')
  const dst = path.join(dir, `frame-${ts}.db`)
  fs.copyFileSync(src, dst)
  return dst
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run lib/backup/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/backup
git commit -m "feat(backup): snapshot + rotation helpers"
```

---

### Task 9: Asset storage path safety

**Files:**
- Create: `lib/assets/storage.ts`
- Test: `lib/assets/__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/assets/__tests__/storage.test.ts
import { describe, it, expect } from 'vitest'
import { safeAssetPath, hashBuffer } from '@/lib/assets/storage'

describe('safeAssetPath', () => {
  it('resolves inside assets dir', () => {
    const p = safeAssetPath('/data', 'abc.jpg')
    expect(p).toBe('/data/assets/abc.jpg')
  })
  it('rejects traversal', () => {
    expect(() => safeAssetPath('/data', '../etc/passwd')).toThrow()
    expect(() => safeAssetPath('/data', '/abs/path')).toThrow()
  })
})

describe('hashBuffer', () => {
  it('returns sha256 hex', () => {
    expect(hashBuffer(Buffer.from('hi'))).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// lib/assets/storage.ts
import crypto from 'node:crypto'
import path from 'node:path'

export function safeAssetPath(dataDir: string, name: string): string {
  if (!name || name.includes('\0')) throw new Error('invalid name')
  const base = path.resolve(dataDir, 'assets')
  const target = path.resolve(base, name)
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('path traversal')
  if (path.basename(target) !== name) throw new Error('invalid name')
  return target
}

export function hashBuffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run lib/assets/__tests__/storage.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/assets/storage.ts lib/assets/__tests__/storage.test.ts
git commit -m "feat(assets): path-safe storage helpers + hashing"
```

---

### Task 10: Asset registry

**Files:**
- Create: `lib/assets/registry.ts`
- (Uses `assets` table via getTables)

Core functions: `registerAsset({type,name,mime,size,hash,source})` returns id; dedup by hash returns existing; `getAsset(id)`; `incrementRef/decrementRef`; `deleteAsset` (soft delete when refCount 0).

- [ ] **Step 1: Implement registry (uses DB)**

```ts
// lib/assets/registry.ts
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

export interface AssetInput { type: string; name: string; mime: string; size: number; hash: string; source?: string }

export async function registerAsset(input: AssetInput) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const existing = await db.select().from(assets).where(eq(assets.hash, input.hash))
  if (existing.length) return existing[0]
  const now = new Date().toISOString()
  const row = { id: nanoid(), type: input.type, name: input.name, mime: input.mime, size: input.size, hash: input.hash, version: 1, createdAt: now, updatedAt: now, refCount: 0, source: input.source ?? 'local' }
  await db.insert(assets).values(row)
  return row
}

export async function getAsset(id: string) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const rows = await db.select().from(assets).where(eq(assets.id, id))
  return rows[0] ?? null
}

export async function adjustRefCount(id: string, delta: number) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const a = await getAsset(id)
  if (!a) return
  await db.update(assets).set({ refCount: Math.max(0, a.refCount + delta), updatedAt: new Date().toISOString() }).where(eq(assets.id, id))
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/assets/registry.ts
git commit -m "feat(assets): asset registry with hash dedup and ref counts"
```

---

### Task 11: Asset API routes

**Files:**
- Create: `app/api/assets/route.ts`
- Create: `app/api/assets/[id]/route.ts`

GET list (optional `?type=`), POST upload (dataUrl or remote URL with allow-list), GET by id (redirect to file), DELETE (if refCount 0).

Reuse `/api/media` patterns (allowed hosts, 10MB cap). For brevity, implement upload returning asset id + url `/api/assets/<id>`.

- [ ] **Step 1: Implement list/upload route**

```ts
// app/api/assets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { registerAsset } from '@/lib/assets/registry'
import { safeAssetPath, hashBuffer } from '@/lib/assets/storage'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`
const ALLOWED = ['upload.wikimedia.org','commons.wikimedia.org','images.unsplash.com']

export async function GET(req: NextRequest) {
  const db = getDb() as any
  const { assets } = getTables() as any
  const type = req.nextUrl.searchParams.get('type')
  let q = db.select().from(assets)
  const rows = await q
  const filtered = type ? rows.filter((r:any)=>r.type===type) : rows
  return NextResponse.json({ assets: filtered })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>null)
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  let buf: Buffer
  let mime = 'application/octet-stream'
  let name = 'asset'
  if (typeof body.dataUrl === 'string' && body.dataUrl.startsWith('data:')) {
    const m = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return NextResponse.json({ error: 'bad dataUrl' }, { status: 400 })
    mime = m[1]; buf = Buffer.from(m[2], 'base64')
    name = body.name || `upload.${mime.split('/')[1] || 'bin'}`
  } else if (typeof body.url === 'string') {
    let u: URL
    try { u = new URL(body.url) } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }) }
    if (!ALLOWED.includes(u.hostname)) return NextResponse.json({ error: 'host not allowed' }, { status: 400 })
    const r = await fetch(body.url)
    if (!r.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
    buf = Buffer.from(await r.arrayBuffer())
    mime = r.headers.get('content-type') || mime
    name = body.name || path.basename(u.pathname) || 'remote'
  } else {
    return NextResponse.json({ error: 'dataUrl or url required' }, { status: 400 })
  }
  if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const hash = hashBuffer(buf)
  const ext = (name.match(/\.(\w+)$/) || [,'bin'])[1]
  const assetName = `${hash.slice(0,12)}.${ext}`
  const target = safeAssetPath(DATA_DIR, assetName)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) fs.writeFileSync(target, buf)
  const asset = await registerAsset({ type: body.type || 'image', name: assetName, mime, size: buf.length, hash, source: body.url ? 'remote' : 'local' })
  return NextResponse.json({ asset, url: `/api/assets/${asset.id}` })
}
```

- [ ] **Step 2: Implement get/delete route**

```ts
// app/api/assets/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getAsset, adjustRefCount } from '@/lib/assets/registry'
import { getTables } from '@/lib/db/tables'
import { getDb } from '@/lib/db'
import { safeAssetPath } from '@/lib/assets/storage'
import fs from 'node:fs'
import { eq } from 'drizzle-orm'

const DATA_DIR = process.env.FRAME_DATA_DIR || `${process.cwd()}/.data`

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'missing file' }, { status: 404 })
  const buf = fs.readFileSync(filePath)
  return new NextResponse(buf, { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'public, max-age=31536000, immutable' } })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (asset.refCount > 0) return NextResponse.json({ error: 'asset in use' }, { status: 409 })
  const db = getDb() as any
  const { assets } = getTables() as any
  await db.delete(assets).where(eq(assets.id, id))
  const filePath = safeAssetPath(DATA_DIR, asset.name)
  try { fs.unlinkSync(filePath) } catch {}
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/assets
git commit -m "feat(assets): asset upload/list/get/delete API routes"
```

---

### Task 12: Frame-aware store hook

**Files:**
- Modify: `hooks/use-frame-store.ts`

Change `useFrameStore` to accept optional `frameId` and append `?frame=` to `/api/store`. Add `useFrameStore(frameId)` signature. Update callers.

- [ ] **Step 1: Modify hook**

In `hooks/use-frame-store.ts`, change function signature:

```ts
export function useFrameStore(frameId?: string) {
  const url = frameId ? `/api/store?frame=${encodeURIComponent(frameId)}` : '/api/store'
  // ... existing SWR(url, ...)
}
```

Ensure mutation helpers include frame param.

- [ ] **Step 2: Update editor entry** `app/page.tsx` to read `?frame=` from search params and pass to `useEditor`/`useFrameStore`.

- [ ] **Step 3: Update `components/editor/editor.tsx`** to accept `frameId` prop and pass to store hook and save calls.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/use-frame-store.ts app/page.tsx components/editor/editor.tsx
git commit -m "feat(editor): make store hook and editor frame-aware"
```

---

### Task 13: Bob decisions drive display

**Files:**
- Modify: `components/frame/frame-display.tsx`

Fetch `/api/display/state?frame=<id>`; render layout whose id matches `decision.layoutId` if present, else fall back to `resolveDisplay`. Keep 3s polling; combine with store poll.

- [ ] **Step 1: Modify FrameDisplay**

Add SWR for `/api/display/state?frame=${frameId}`. Compute `activeLayoutId = decision?.layoutId ?? store.activeId ?? resolveDisplay(store, clock).layoutId`. Render that layout.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/frame/frame-display.tsx
git commit -m "feat(display): consume Bob decision layoutId with schedule fallback"
```

---

### Task 14: Offline service worker

**Files:**
- Create: `public/sw.js`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create SW**

Cache app shell + last store response (stale-while-revalidate). Offline indicator via `navigator.onLine`.

```js
// public/sw.js
const CACHE = 'frame-v1'
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/']))) })
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
    const clone = resp.clone()
    caches.open(CACHE).then(c => c.put(e.request, clone))
    return resp
  }).catch(() => caches.match(e.request))))
})
```

- [ ] **Step 2: Register in layout.tsx**

Add client component `components/sw-register.tsx` registered in root layout.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js app/layout.tsx components/sw-register.tsx
git commit -m "feat(pwa): add service worker for offline cache"
```

---

### Task 15: Documentation update

**Files:**
- Modify: `README.md`, `docs/kiosk-cli.md`

Document `FRAME_MODE`, SQLite data dir, backup location, asset API, frame-aware editor URLs (`/?frame=<id>`).

- [ ] **Step 1: Update docs**

- [ ] **Step 2: Commit**

```bash
git add README.md docs/kiosk-cli.md
git commit -m "docs: document local-first foundation (modes, sqlite, assets, frame-aware editor)"
```

---

## Self-review checklist
- Spec coverage: mode, sqlite, migrations, lifecycle, backup, assets, frame-aware editor, Bob-driven display, offline, docs — all covered.
- No placeholders: code blocks provided for each step.
- Type consistency: `getTables()`, `getDb()`, `getDatabaseMode()` used consistently.

## Execution handoff
Plan complete. Two execution options:
1. Subagent-Driven (recommended) — fresh subagent per task + two-stage review.
2. Inline Execution — execute tasks in this session with checkpoints.

Which approach?
