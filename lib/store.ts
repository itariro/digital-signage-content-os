import path from 'node:path'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import type { Album, FrameStore, Layout, LayoutSettings, Widget } from './types'
import { createWidget } from './widgets'
import { DEFAULT_SCHEDULE } from './schedule'
import { defaultSlideshow } from './albums'
import { getDb } from './db'
import { frameDocuments } from './db/schema'

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

function seed(): FrameStore {
  const now = new Date().toISOString()
  const morning: Layout = {
    id: nanoid(10),
    name: 'Morning lockscreen',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    widgets: [
      w('date', 140, 200, 800, 70, { template: 'long' }),
      w('clock-digital', 90, 270, 900, 330, { template: 'classic', style: { fontWeight: 600, letterSpacing: -3 } as Widget['style'] }),
      w('weather', 140, 1500, 480, 200, { template: 'compact' }),
      w('uv', 640, 1500, 300, 200, { template: 'bar' }),
      w('text', 140, 1730, 800, 90, { template: 'caption', props: { text: 'Home is wherever we are together' } }),
    ],
  }
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
  return {
    activeId: morning.id,
    layouts: [morning, desk],
    albums: [seedPhotoAlbum()],
    presets: [],
    customFonts: [],
    schedule: {
      ...structuredClone(DEFAULT_SCHEDULE),
      rules: [
        { id: nanoid(8), layoutId: morning.id, days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '18:00' },
        { id: nanoid(8), layoutId: desk.id, days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '06:00' },
      ],
    },
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
  }
}

function normalize(store: FrameStore): FrameStore {
  // Add default experiences if missing
  if (!store.experiences) {
    store.experiences = { enabled: false, rules: [], settings: { schoolHolidays: [] } }
  }

  const schedule = store.schedule ?? structuredClone(DEFAULT_SCHEDULE)
  const albums = store.albums ?? [seedPhotoAlbum()]

  // Prune experience rules referencing deleted layouts
  const layoutIds = new Set(store.layouts.map(l => l.id))
  const rulesBefore = store.experiences.rules.length
  store.experiences.rules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  if (store.experiences.rules.length < rulesBefore) {
    console.log(`[normalize] Pruned ${rulesBefore - store.experiences.rules.length} experience rules referencing deleted layouts`)
  }

  return {
    ...store,
    albums,
    layouts: store.layouts.map((l) => ({
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
      rules: (schedule.rules ?? []).filter((r) => store.layouts.some((l) => l.id === r.layoutId)),
    },
  }
}

const storeCache = new Map<string, FrameStore>()
const queues = new Map<string, Promise<unknown>>()

export async function readStore(frameId = DEFAULT_FRAME_ID): Promise<FrameStore | null> {
  const cached = storeCache.get(frameId)
  if (cached) return cached

  const db = getDb()
  const [document] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, frameId)).limit(1)
  if (document) {
    const store = normalize(document.data as FrameStore)
    storeCache.set(frameId, store)
    return store
  }

  if (frameId !== DEFAULT_FRAME_ID) return null

  const store = seed()
  const now = new Date()
  await db.insert(frameDocuments).values({
    id: nanoid(12), identifier: frameId, name: frameId === DEFAULT_FRAME_ID ? 'Home frame' : frameId,
    data: store, createdAt: now, updatedAt: now,
    resolutionWidth: 1920, resolutionHeight: 1080,
  })
  storeCache.set(frameId, store)
  return store
}

async function persist(frameId: string, store: FrameStore) {
  const db = getDb()
  await db.update(frameDocuments).set({ data: store, updatedAt: new Date() }).where(eq(frameDocuments.identifier, frameId))
}

export function mutateStore(fn: (store: FrameStore) => FrameStore | void, frameId = DEFAULT_FRAME_ID): Promise<FrameStore> {
  const queue = queues.get(frameId) ?? Promise.resolve()
  const run = queue.then(async () => {
    const current = await readStore(frameId)
    if (!current) throw new Error(`Store not found for frame "${frameId}"`)
    const next = normalize(fn(current) ?? current)
    await persist(frameId, next)
    storeCache.set(frameId, next)
    return next
  })
  queues.set(frameId, run.catch(() => undefined))
  return run
}
