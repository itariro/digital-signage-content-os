import { promises as fs } from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { FrameStore, Layout, LayoutSettings, Widget } from './types'
import { createWidget } from './widgets'

const DATA_DIR =
  process.env.FRAME_DATA_DIR ?? (process.env.VERCEL ? '/tmp/frame-studio' : path.join(process.cwd(), '.data'))
const DATA_FILE = path.join(DATA_DIR, 'frame-store.json')

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
  return { activeId: morning.id, layouts: [morning, desk], presets: [], customFonts: [] }
}

let cache: FrameStore | null = null
let queue: Promise<unknown> = Promise.resolve()

export async function readStore(): Promise<FrameStore> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    cache = JSON.parse(raw) as FrameStore
  } catch {
    cache = seed()
    await persist(cache)
  }
  return cache
}

async function persist(store: FrameStore) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const tmp = `${DATA_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store))
  await fs.rename(tmp, DATA_FILE)
}

export function mutateStore(fn: (store: FrameStore) => FrameStore | void): Promise<FrameStore> {
  const run = queue.then(async () => {
    const current = structuredClone(await readStore())
    const next = fn(current) ?? current
    await persist(next)
    cache = next
    return next
  })
  queue = run.catch(() => undefined)
  return run
}
