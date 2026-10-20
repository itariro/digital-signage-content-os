import path from 'node:path'
import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'
import type { Album, ExperienceRule, FrameStore, Layout, LayoutSettings, Widget } from './types'
import { createWidget } from './widgets'
import { DEFAULT_SCHEDULE } from './schedule'
import { defaultSlideshow } from './albums'
import { normalizeFrameNotifications } from './notifications'
import { MAX_DURATION_MS, MAX_RULE_SCORE, MIN_RULE_SCORE } from './schema'
import { getDb } from './db'
import { getDatabaseMode } from './db/mode'
import { getTables } from './db/tables'
import { remoteEntityId } from './sync/ids'
// Call-time table access: no mode freeze at import time.
function frameDocumentsTable() { return getTables().frameDocuments }
import { createTtlCache } from './ttl-cache'

export const DEFAULT_FRAME_ID = 'home'
export const DATA_DIR = process.env.FRAME_DATA_DIR ?? path.join(process.cwd(), '.data')

export const DEFAULT_SETTINGS: LayoutSettings = {
  resolution: '1080x1920',
  background: '/backgrounds/alpine-lake.png',
  dim: 15,
  locationName: 'Zurich, Switzerland',
  lat: 47.3769,
  lon: 8.5417,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

function w(type: Widget['type'], x: number, y: number, width: number, height: number, extra: Partial<Widget> = {}): Widget {
  const base = createWidget(type)
  return {
    ...base,
    x,
    y,
    w: width,
    h: height,
    ...extra,
    style: { ...base.style, ...extra.style },
    props: { ...base.props, ...extra.props },
  }
}

function seedPhotoAlbum(): Album {
  const now = new Date().toISOString()
  return {
    id: nanoid(10),
    name: 'Favourite places',
    theme: 'photos',
    createdAt: now,
    updatedAt: now,
    slideshow: defaultSlideshow('photos'),
    items: [
      ['alpine-lake', 'Alpine lake'],
      ['coastal-cliffs', 'Coastal cliffs'],
      ['city-night', 'City at dusk'],
      ['desert-dunes', 'Desert dunes'],
    ].map(([file, title]) => ({
      id: nanoid(8),
      image: `/backgrounds/${file}.png`,
      sourceUrl: '',
      title,
      subtitle: '',
      year: '',
    })),
  }
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const

function curatedLayout(name: string, background: string, dim: number, widgets: Widget[], albumId: string | null = null): Layout {
  const now = new Date().toISOString()
  return {
    id: nanoid(10),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, background, dim, albumId },
    widgets,
  }
}

/** The eight curated layouts from spec §7, composed from the existing widget set. */
function curatedLayouts(albumId: string): Layout[] {
  return [
    curatedLayout('Morning', '/backgrounds/alpine-lake.png', 20, [
      w('date', 140, 200, 800, 70, { template: 'long' }),
      w('weather', 140, 320, 560, 200, { template: 'compact' }),
      w('text', 140, 560, 800, 120, { template: 'plain', props: { text: 'Good morning' } }),
      w('bob', 360, 780, 360, 480, { props: { source: 'decision', expression: 'planning' } }),
    ]),
    curatedLayout('Today', '/backgrounds/alpine-lake.png', 25, [
      w('date', 140, 160, 800, 80, { template: 'long' }),
      w('calendar', 140, 300, 800, 560, { template: 'week' }),
      w('weather', 140, 920, 480, 200, { template: 'compact' }),
      w('bob', 620, 900, 320, 420, { props: { source: 'decision', expression: 'planning' } }),
    ]),
    curatedLayout('Gallery', '/backgrounds/city-night.png', 30, [
      w('now-showing', 120, 1560, 840, 220, { template: 'card' }),
      w('date', 120, 140, 500, 60, { template: 'compact' }),
      w('weather', 660, 140, 300, 120, { template: 'compact', props: { showLocation: false } }),
    ], albumId),
    curatedLayout('Welcome Home', '/backgrounds/coastal-cliffs.png', 25, [
      w('text', 140, 300, 800, 160, { template: 'caption', props: { text: 'Welcome home' } }),
      w('weather', 140, 520, 560, 200, { template: 'compact' }),
      w('bob', 360, 820, 360, 480, { props: { source: 'decision', expression: 'happy' } }),
    ]),
    curatedLayout('Evening', '/backgrounds/desert-dunes.png', 35, [
      w('weather', 140, 200, 800, 220, { template: 'compact' }),
      w('date', 140, 460, 800, 70, { template: 'long' }),
      w('quote', 140, 620, 800, 240, { template: 'serif' }),
      w('bob', 360, 940, 360, 480, { props: { source: 'decision', expression: 'talking' } }),
    ]),
    curatedLayout('Weekend', '/backgrounds/coastal-cliffs.png', 30, [
      w('countdown', 140, 200, 800, 220, { template: 'ring' }),
      w('quote', 140, 500, 800, 240, { template: 'marks' }),
      w('bob', 360, 820, 360, 480, { props: { source: 'decision', expression: 'celebrate' } }),
    ], albumId),
    curatedLayout('Weather', '/backgrounds/alpine-lake.png', 20, [
      w('weather', 140, 200, 800, 300, { template: 'detailed' }),
      w('uv', 140, 560, 360, 260, { template: 'bar' }),
      w('sun', 540, 560, 400, 260, { template: 'arc' }),
      w('bob', 360, 900, 360, 480, { props: { source: 'decision', expression: 'reminder' } }),
    ]),
    curatedLayout('Night', '/backgrounds/city-night.png', 55, [
      w('clock-digital', 140, 700, 800, 220, { template: 'classic' }),
      w('date', 140, 960, 800, 70, { template: 'compact' }),
    ]),
  ]
}

/** Default rules from spec §4.5, wired to the curated layout ids. */
function defaultExperienceRules(layouts: Layout[]): ExperienceRule[] {
  const byName = new Map(layouts.map(l => [l.name, l.id]))
  const id = (name: string) => {
    const found = byName.get(name)
    if (!found) throw new Error(`defaultExperienceRules: no curated layout named "${name}"`)
    return found
  }
  return [
    { id: nanoid(8), name: 'Morning', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '06:00', to: '08:45' } }] }, then: { layoutId: id('Morning'), state: 'action', bob: { expression: 'planning', speech: 'Good morning! Have a great day.' }, score: 0, durationMs: 0, reason: 'Morning' } },
    { id: nanoid(8), name: 'Gallery', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '08:45', to: '16:30' } }] }, then: { layoutId: id('Gallery'), state: 'gallery', score: 0, durationMs: 0, reason: 'Gallery' } },
    { id: nanoid(8), name: 'Welcome home', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '16:30', to: '18:30' } }] }, then: { layoutId: id('Welcome Home'), state: 'action', bob: { expression: 'happy', speech: 'Welcome home!' }, score: 0, durationMs: 0, reason: 'Welcome home' } },
    { id: nanoid(8), name: 'Evening', enabled: true, priority: 100, when: { time: { from: '18:30', to: '21:00' } }, then: { layoutId: id('Evening'), state: 'information', bob: { expression: 'talking' }, score: 0, durationMs: 0, reason: 'Evening' } },
    { id: nanoid(8), name: 'Weekend', enabled: true, priority: 100, when: { days: ['SAT', 'SUN'] }, then: { layoutId: id('Weekend'), state: 'ambient', bob: { expression: 'celebrate', speech: 'It is the weekend — enjoy it!' }, score: 0, durationMs: 0, reason: 'Weekend' } },
    { id: nanoid(8), name: 'Rain', enabled: true, priority: 200, when: { weather: { rainProbabilityAbove: 60 } }, then: { layoutId: id('Weather'), state: 'weather', bob: { expression: 'reminder', speech: 'Rain is on the way — take an umbrella.' }, score: 0, durationMs: 0, reason: 'Rain' } },
    { id: nanoid(8), name: 'Night', enabled: true, priority: 100, when: { time: { from: '21:00', to: '06:00' } }, then: { layoutId: id('Night'), state: 'ambient', score: 0, durationMs: 0, reason: 'Night' } },
  ]
}

export function seed(): FrameStore {
  const now = new Date().toISOString()
  const album = seedPhotoAlbum()
  const layouts = curatedLayouts(album.id)
  const desk: Layout = {
    id: nanoid(10),
    name: 'Analog desk',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, background: '/backgrounds/city-night.png', dim: 25 },
    widgets: [
      w('clock-analog', 290, 240, 500, 500, { template: 'numerals', style: { fontFamily: 'playfair' } as Widget['style'] }),
      w('date', 190, 780, 700, 120, { template: 'stacked', style: { fontFamily: 'playfair' } as Widget['style'] }),
      w('sun', 140, 1360, 800, 300, { template: 'arc' }),
      w('calendar', 140, 1680, 800, 160, { template: 'week' }),
    ],
  }
  const allLayouts = [...layouts, desk]
  const morningId = allLayouts[0].id
  return {
    activeId: morningId,
    layouts: allLayouts,
    albums: [album],
    presets: [],
    customFonts: [],
    schedule: {
      ...structuredClone(DEFAULT_SCHEDULE),
      rules: [
        { id: nanoid(8), layoutId: morningId, days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '18:00' },
        { id: nanoid(8), layoutId: desk.id, days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '06:00' },
      ],
    },
    experiences: { enabled: true, rules: defaultExperienceRules(allLayouts), settings: { schoolHolidays: [] } },
  }
}

/** Clamps a possibly-missing/legacy numeric field to the range the schema now enforces. */
function clampLegacyNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function normalize(store: FrameStore): FrameStore {
  const experiences = store.experiences ?? { enabled: false, rules: [], settings: { schoolHolidays: [] } }
  const schedule = store.schedule ?? structuredClone(DEFAULT_SCHEDULE)
  const albums = store.albums ?? [seedPhotoAlbum()]
  const layouts = store.layouts ?? []

  // Prune experience rules referencing deleted layouts (never mutate the input).
  const layoutIds = new Set(layouts.map(l => l.id))
  const allRules = experiences.rules ?? []
  const prunedRules = allRules.filter(r => layoutIds.has(r.then.layoutId))
  if (prunedRules.length < allRules.length) {
    console.log(`[normalize] Pruned ${allRules.length - prunedRules.length} experience rules referencing deleted layouts`)
  }
  // Legacy stores can hold values the schema now rejects (score/durationMs out
  // of bounds). Clamp on read so an old save still loads instead of bricking
  // the frame the next time it is saved through the validated PUT.
  const rules = prunedRules.map((rule) => ({
    ...rule,
    then: {
      ...rule.then,
      score: clampLegacyNumber(rule.then.score, MIN_RULE_SCORE, MAX_RULE_SCORE, 0),
      durationMs: clampLegacyNumber(rule.then.durationMs, 0, MAX_DURATION_MS, 0),
    },
  }))

  return {
    ...store,
    experiences: { ...experiences, rules },
    albums,
    layouts: layouts.map((l) => ({
      ...l,
      settings: {
        ...DEFAULT_SETTINGS,
        ...l.settings,
        albumId: albums.some((a) => a.id === l.settings.albumId) ? l.settings.albumId : null,
      },
    })),
    schedule: {
      ...DEFAULT_SCHEDULE,
      ...schedule,
      night: { ...DEFAULT_SCHEDULE.night, ...schedule.night },
      rules: (schedule.rules ?? []).filter((r) => layouts.some((l) => l.id === r.layoutId)),
    },
    notifications: normalizeFrameNotifications(store.notifications),
  }
}

const STORE_CACHE_TTL_MS = 5_000
const storeCache = createTtlCache<FrameStore>(STORE_CACHE_TTL_MS)

/** Drop cached frame stores (used when the underlying database is reset). */
export function resetStoreCache() {
  storeCache.clear()
}
const queues = new Map<string, Promise<unknown>>()

export async function readStore(frameId = DEFAULT_FRAME_ID): Promise<FrameStore | null> {
  const cached = storeCache.get(frameId)
  if (cached) return cached

  const db = getDb()
  const frameDocuments = frameDocumentsTable()
  const [document] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, frameId)).limit(1)
  if (document) {
    const store = normalize(document.data as FrameStore)
    storeCache.set(frameId, store)
    return store
  }

  if (frameId !== DEFAULT_FRAME_ID) return null

  const store = seed()
  const now = new Date()
  // Two concurrent first requests can both miss the cache; ON CONFLICT makes
  // the loser a no-op, then re-select to return the winning document.
  await db
    .insert(frameDocuments)
    .values({
      id: nanoid(12),
      identifier: frameId,
      name: 'Home frame',
      data: store,
      createdAt: now,
      updatedAt: now,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
    })
    .onConflictDoNothing({ target: frameDocuments.identifier })

  const [created] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, frameId)).limit(1)
  const resolved = created ? normalize(created.data as FrameStore) : store
  storeCache.set(frameId, resolved)
  return resolved
}

async function createDoc(frameId: string, store: FrameStore, revision?: number): Promise<number> {
  const db = getDb()
  const frameDocuments = frameDocumentsTable()
  const now = new Date()
  await db.insert(frameDocuments).values({
    id: nanoid(12), identifier: frameId, name: frameId, data: store,
    createdAt: now, updatedAt: now, revision: revision ?? 1,
  })
  return revision ?? 1
}

async function persist(frameId: string, store: FrameStore, revision?: number): Promise<number> {
  const db = getDb()
  const frameDocuments = frameDocumentsTable()
  const crypto = await import('node:crypto')
  const hash = crypto.createHash('sha256').update(JSON.stringify(store)).digest('hex')
  const nextRevision = revision !== undefined ? revision : sql`${frameDocuments.revision} + 1`
  const [row] = await db.update(frameDocuments).set({ data: store, updatedAt: new Date(), revision: nextRevision, contentHash: hash, updatedBy: 'instance' }).where(eq(frameDocuments.identifier, frameId)).returning({ revision: frameDocuments.revision })
  return Number(row?.revision ?? 0)
}

export function mutateStore(
  fn: (store: FrameStore) => FrameStore | void,
  frameId = DEFAULT_FRAME_ID,
  opts?: { source?: 'remote'; revision?: number },
): Promise<FrameStore> {
  const queue = queues.get(frameId) ?? Promise.resolve()
  const run = queue.then(async () => {
    const current = await readStore(frameId)
    if (!current && opts?.source !== 'remote') throw new Error(`Store not found for frame "${frameId}"`)
    // A remote-applied frame the device does not have yet is created from
    // the console payload (final review C-2/C-3: registered frames arrive
    // via pull before any local edit exists).
    const applied = current ? fn(current) ?? current : fn(undefined as never)
    if (!applied) throw new Error(`Remote create requires the payload as the new store for frame "${frameId}"`)
    const next = normalize(applied)
    const newRevision = current
      ? await persist(frameId, next, opts?.revision)
      : await createDoc(frameId, next, opts?.revision)
    storeCache.set(frameId, next)
    // Enqueue synchronization work in local-first (sqlite) mode — resolved
    // via getDatabaseMode so sync is never silently off when FRAME_MODE is
    // unset but the mode resolves to sqlite.
    // Remote applies are by definition already known to the console — no
    // re-enqueue (that echo loop was churning revisions on every pull).
    // baseRevision is the doc revision this edit builds on (mutations are
    // serialized per frame, so the pre-persist revision was newRevision - 1).
    if (getDatabaseMode() === 'sqlite' && opts?.source !== 'remote') {
      try {
        const { enqueueChange } = await import('./sync/queue')
        await enqueueChange({ entityType: 'frame_document', entityId: remoteEntityId(frameId), operation: 'upsert', payload: next, idempotencyKey: nanoid(16), baseRevision: newRevision ? newRevision - 1 : undefined })
      } catch (e: unknown) {
        // Sync queue failure must not block local writes — but it must be loud.
        console.error('sync enqueue failed for frame', frameId, e)
      }
    }
    return next
  })
  queues.set(frameId, run.catch(() => undefined))
  return run
}
