import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MapArtAmbiguity, MapArtLocation } from '@/lib/types'
import {
  appendRecentLocation,
  appendTraceChild,
  findCityIndex,
  getRecentLocations,
  normalizeRecentLocations,
  removeAmbiguityRow,
  resolveExportView,
  selectOrAppendCity,
  updateTraceStep,
  waitForCameraSettled,
  type TraceStep,
} from '@/lib/map-art'

const studioSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/map-art-studio.tsx'),
  'utf8',
)
const tableSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/recent-locations-table.tsx'),
  'utf8',
)
const locationsSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/locations-tab.tsx'),
  'utf8',
)
const styleSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/style-tab.tsx'),
  'utf8',
)
const traceSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/generation-trace.tsx'),
  'utf8',
)

const tokyo: MapArtLocation = { id: 2, name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 }

function ambiguity(query: string, rowId: number): MapArtAmbiguity {
  return { query, rowId, chosenId: rowId + 10, matches: [] }
}

describe('map art export view', () => {
  it('exports the live preview center and zoom for the city on screen', () => {
    const preview = { center: [135.5, 34.7] as [number, number], zoom: 14.2 }
    expect(resolveExportView(tokyo, tokyo.id, preview, 12)).toEqual(preview)
  })

  it('keeps other batch cities on their own coordinates at the preview zoom', () => {
    const preview = { center: [135.5, 34.7] as [number, number], zoom: 14.2 }
    expect(resolveExportView(tokyo, 1, preview, 12)).toEqual({
      center: [tokyo.lon, tokyo.lat],
      zoom: 14.2,
    })
  })

  it('falls back to the saved zoom before the map is ready', () => {
    expect(resolveExportView(tokyo, tokyo.id, null, 11)).toEqual({
      center: [tokyo.lon, tokyo.lat],
      zoom: 11,
    })
  })

  it('wires the live view into export without resetting the preview', () => {
    expect(studioSource).toContain('resolveExportView(selected, activeCityId, previewView, settingsRef.current.zoom)')
    expect(studioSource).toContain('center: view.center')
    expect(studioSource).toContain('zoom: view.zoom')
    expect(studioSource).not.toMatch(/map\.flyTo\(\{ center: \[selected\.lon, selected\.lat\]/)
  })

  it('reads the active city after the camera settles, alongside the preview view', () => {
    const waitIndex = studioSource.indexOf('await waitForCameraSettled(() => pendingCityMove.current)')
    const idIndex = studioSource.indexOf('const activeCityId = settingsRef.current.city.id')
    const viewIndex = studioSource.indexOf('const previewView: MapView')
    expect(waitIndex).toBeGreaterThanOrEqual(0)
    expect(idIndex).toBeGreaterThan(waitIndex)
    expect(idIndex).toBeLessThan(viewIndex)
    expect(studioSource).not.toContain('const activeCityId = cityRef.current.id')
    expect(studioSource).toContain('disabled={busy || slides.length < 2}')
  })
})

describe('map art camera settling', () => {
  it('returns immediately when no city move is pending', async () => {
    await expect(waitForCameraSettled(() => null)).resolves.toBeUndefined()
  })

  it('waits for the pending city move before continuing', async () => {
    let finish!: () => void
    const move = new Promise<void>((resolve) => { finish = resolve })
    let checks = 0
    const settled = waitForCameraSettled(() => {
      checks += 1
      return checks === 1 ? move : null
    })
    let done = false
    void settled.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)
    finish()
    await settled
    expect(done).toBe(true)
    expect(checks).toBe(2)
  })

  it('waits for a replacement move started by another city change', async () => {
    const finish: Array<() => void> = []
    const moves = [
      new Promise<void>((resolve) => { finish.push(resolve) }),
      new Promise<void>((resolve) => { finish.push(resolve) }),
    ]
    let index = 0
    const settled = waitForCameraSettled(() => moves[index++] ?? null)
    finish[0]()
    await Promise.resolve()
    await Promise.resolve()
    finish[1]()
    await settled
    expect(index).toBe(3)
  })

  it('takes the export snapshot only after the camera settles', () => {
    const waitIndex = studioSource.indexOf('await waitForCameraSettled')
    const snapshotIndex = studioSource.indexOf('const previewView: MapView | null')
    expect(waitIndex).toBeGreaterThan(-1)
    expect(snapshotIndex).toBeGreaterThan(waitIndex)
    expect(studioSource).toContain("map.once('moveend', finish)")
    expect(studioSource).toContain('const activeCityId = settingsRef.current.city.id')
  })
})

describe('map art ambiguity rows', () => {
  it('drops the removed row and shifts later references down', () => {
    const rows = [ambiguity('first', 0), ambiguity('second', 1), ambiguity('third', 2)]
    expect(removeAmbiguityRow(rows, 1).map((entry) => [entry.query, entry.rowId])).toEqual([
      ['first', 0],
      ['third', 1],
    ])
  })

  it('keeps a match choice on its own city after an earlier row is removed', () => {
    const locations = ['first', 'second', 'third']
    const rows = [ambiguity('second', 1)]
    const removedIndex = 0
    const remaining = locations.filter((_, index) => index !== removedIndex)
    const shifted = removeAmbiguityRow(rows, removedIndex)
    const next = remaining.map((entry, index) => (index === shifted[0].rowId ? 'second-match' : entry))
    expect(next).toEqual(['second-match', 'third'])
  })

  it('removes the ambiguity that belonged to the deleted row', () => {
    expect(removeAmbiguityRow([ambiguity('only', 0)], 0)).toEqual([])
  })

  it('uses the shared removal helper in the studio', () => {
    expect(studioSource).toContain('removeAmbiguityRow(current, index)')
    expect(studioSource).toContain('onRemoveLocation={removeLocation}')
    const locationsSource = readFileSync(
      path.resolve(__dirname, '../components/map-art/locations-tab.tsx'),
      'utf8',
    )
    expect(locationsSource).toContain('onClick={() => onRemoveLocation(item)}')
  })
})

describe('tabs orientation', () => {
  it('passes orientation to the Base UI root', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../components/ui/tabs.tsx'),
      'utf8',
    )
    expect(source).toContain('orientation={orientation}')
    expect(source).toMatch(/(?<!data-)orientation=\{orientation\}/)
  })
})

describe('recent map locations', () => {
  it('drops duplicates and keeps the newest first', () => {
    const result = normalizeRecentLocations([tokyo, tokyo, { ...tokyo, name: 'Tokyo again' }])
    expect(result).toEqual([tokyo])
  })

  it('caps the stored list at ten cities', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...tokyo, id: index + 1 }))
    expect(normalizeRecentLocations(many)).toHaveLength(10)
    expect(normalizeRecentLocations(many)[0].id).toBe(1)
  })

  it('places a newly generated city at the front', () => {
    const older = { ...tokyo, id: 9, name: 'Osaka' }
    expect(appendRecentLocation([older], tokyo).map((city) => city.id)).toEqual([2, 9])
  })

  it('treats missing settings as an empty list', () => {
    expect(getRecentLocations({})).toEqual([])
    expect(getRecentLocations({ recentLocations: [tokyo] })).toEqual([tokyo])
  })
})

describe('map art settings schema', () => {
  it('accepts recent locations without requiring them', async () => {
    const { albumUpdateSchema } = await import('@/lib/schema')
    const base = {
      name: 'Map album',
      theme: 'map-art',
      items: [],
      slideshow: {
        presentation: 'fill', interval: 25, transition: 'fade', order: 'sequence',
        kenBurns: false, artSize: 100, artPosition: 'center', backdrop: 'blur', backdropColor: '#000000',
      },
      mapArt: {
        mode: 'cities', query: '', continent: 'Europe', count: '5', customCount: 5,
        cities: [], results: [], ambiguities: [],
        city: tokyo, activeIndex: 0, styleId: 'classic', title: true, showCoords: true,
        orientation: 'portrait', zoom: 12, backgroundColor: '#f5f0e3',
        streetLabels: 'all', showRailways: true, showTrails: true, customText: '',
      },
    }
    expect(albumUpdateSchema.safeParse(base).success).toBe(true)
    const withRecent = albumUpdateSchema.safeParse({
      ...base,
      mapArt: { ...base.mapArt, recentLocations: [tokyo] },
    })
    expect(withRecent.success).toBe(true)
    expect(withRecent.success ? withRecent.data.mapArt?.recentLocations : []).toEqual([tokyo])
  })
})

describe('map art tab and trace wiring', () => {
  it('renders both tabs and the trace under the preview', () => {
    expect(studioSource).toContain('<Tabs value={tab}')
    expect(studioSource).toContain('<TabsTrigger value="locations">Locations</TabsTrigger>')
    expect(studioSource).toContain('<TabsTrigger value="style">Style</TabsTrigger>')
    expect(studioSource).toContain('<GenerationTrace steps={traceSteps} />')
  })

  it('appends a recent location only after generation succeeds', () => {
    const appendIndex = studioSource.indexOf('appendRecentLocation(')
    const savedIndex = studioSource.indexOf('const url = await renderArtwork(selected, view)')
    expect(appendIndex).toBeGreaterThan(savedIndex)
    expect(studioSource).toContain("persistField('recentLocations'")
  })

  it('reads the latest recent locations before each append without depending on a render', () => {
    expect(studioSource).toContain('appendRecentLocation(getRecentLocations(settingsRef.current), selected)')
    expect(studioSource).not.toContain('let nextRecent')
    expect(studioSource).not.toContain('recentRef')
  })

  it('only records recent locations when the batch was verified', () => {
    expect(studioSource).toContain('const recordRecent = verifiedCount !== null')
  })

  it('invalidates verification whenever the candidate set changes', () => {
    const resets = studioSource.match(/setVerifiedCount\(null\)/g) ?? []
    expect(resets.length).toBeGreaterThanOrEqual(6)
  })
})

describe('map art zoom preset controls', () => {
  it('uses radio semantics for zoom presets', () => {
    expect(styleSource).toContain("from '@/components/ui/radio-group'")
    expect(styleSource).toContain('<RadioGroup')
    expect(styleSource).toContain('<RadioGroupItem')
    expect(styleSource).not.toContain('aria-pressed=')
    expect(styleSource).not.toContain('<ToggleGroup')
  })

  it('shows a one-line description for each zoom preset', () => {
    for (const description of [
      'Whole city context',
      'Neighbourhood clusters',
      'Street-level detail',
      'Closest streets and blocks',
    ]) {
      expect(styleSource).toContain(description)
    }
  })

  it('uses radio semantics for poster type', () => {
    expect(styleSource).toContain('aria-label="Poster type"')
    expect(styleSource).toContain('Tall 11 MP poster for walls and portrait displays')
    expect(styleSource).toContain('Wide 8 MP poster for screens and landscape frames')
  })

  it('uses real radio controls for map style cards', () => {
    expect(styleSource).toContain('<RadioGroup')
    expect(styleSource).toContain('value={values.styleId}')
    expect(styleSource).toContain('onValueChange={(next: string) => onStyleChange(')
    expect(styleSource).not.toContain('role="radio"')
    expect(styleSource).not.toContain('<button')
  })
})

describe('map art background colour editing', () => {
  it('keeps the hex field mounted while a valid edit updates the colour', () => {
    expect(styleSource).toContain('const [backgroundDraft, setBackgroundDraft] = useState(values.backgroundColor)')
    expect(styleSource).not.toContain('key={values.backgroundColor}')
    expect(styleSource).toContain('value={backgroundDraft}')
    expect(styleSource).toContain('setBackgroundDraft(values.backgroundColor)')
  })
})

describe('map art recent city selection', () => {
  it('selects a city already in the batch instead of appending another copy', () => {
    const paris: MapArtLocation = { id: 3, name: 'Paris', country: 'France', lat: 48.85, lon: 2.35 }
    expect(selectOrAppendCity([tokyo, paris], tokyo)).toEqual({
      cities: [tokyo, paris],
      index: 0,
      added: false,
    })
  })

  it('appends a new city at the end of the batch', () => {
    expect(selectOrAppendCity([tokyo], { ...tokyo, id: 9 })).toEqual({
      cities: [tokyo, { ...tokyo, id: 9 }],
      index: 1,
      added: true,
    })
  })

  it('refuses to append past the batch limit but still allows selection', () => {
    const full = Array.from({ length: 100 }, (_, id) => ({ ...tokyo, id }))
    expect(selectOrAppendCity(full, { ...tokyo, id: 999 })).toBeNull()
    expect(selectOrAppendCity(full, tokyo)).toEqual({ cities: full, index: tokyo.id, added: false })
  })

  it('guards use-recent in the studio and explains the full batch', () => {
    expect(studioSource).toContain('selectOrAppendCity(cities, city)')
    expect(studioSource).toContain('Remove one before adding another')
  })
})

describe('map art gallery selection', () => {
  const paris: MapArtLocation = { id: 3, name: 'Paris', country: 'France', lat: 48.85, lon: 2.35 }

  it('finds the clicked city at its position in the current batch', () => {
    expect(findCityIndex([tokyo, paris], paris)).toBe(1)
  })

  it('reports a city that is no longer in the current batch', () => {
    expect(findCityIndex([tokyo], { ...tokyo, id: 99 })).toBe(-1)
  })

  it('opens gallery cities via selectOrAppendCity so camera and slide stay in sync', () => {
    expect(studioSource).toContain('selectOrAppendCity(cities, artwork.city)')
    expect(studioSource).toContain('setCity(resolved.cities[resolved.index])')
    expect(studioSource).toContain('setActiveIndex(resolved.index)')
    expect(studioSource).toContain('renderPoster(live ? city : entry, live)')
  })
})

describe('map art trace updates', () => {
  const discoverSteps: TraceStep[] = [{
    id: 'discover',
    title: 'Discovering',
    status: 'running',
    children: [{ id: 'candidate-Paris', title: 'Checking Paris', status: 'pending' }],
  }]

  it('updates a nested step without changing its siblings', () => {
    const updated = updateTraceStep(discoverSteps, 'candidate-Paris', (step) => ({ ...step, status: 'error' }))
    expect(updated[0].children?.[0].status).toBe('error')
    expect(updated[0].title).toBe('Discovering')
    expect(discoverSteps[0].children?.[0].status).toBe('pending')
  })

  it('adds a child once when a lookup starts', () => {
    const once = appendTraceChild(discoverSteps, 'discover', { id: 'candidate-Rome', title: 'Checking Rome', status: 'running' })
    expect(once[0].children?.map((child) => child.id)).toEqual(['candidate-Paris', 'candidate-Rome'])
    expect(appendTraceChild(once, 'discover', { id: 'candidate-Rome', title: 'Checking Rome' })).toEqual(once)
  })

  it('creates a trace row for every attempted discovery candidate', () => {
    expect(studioSource).toContain("appendTraceChild(current, 'discover'")
    expect(studioSource).not.toContain('candidates.slice(0, target)')
  })

  it('publishes poster stages as they run and marks the failing stage', () => {
    expect(studioSource).toContain('report?: (name: string')
    for (const stage of ['render', 'compose', 'upload', 'album']) {
      expect(studioSource).toContain(`report?.('${stage}', 'running')`)
    }
    expect(studioSource).toContain('activeStepId')
    expect(studioSource).toMatch(/status: 'error',\s*description: error instanceof Error/)
  })
})

describe('map art concurrent edits and announcements', () => {
  it('disables recent location actions while work is running', () => {
    expect(locationsSource).toContain('busy={busy}')
    expect((tableSource.match(/disabled=\{busy\}/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps a polite live region mounted for the top-level trace', () => {
    expect(traceSource.indexOf('aria-live="polite"')).toBeLessThan(traceSource.indexOf('steps.length'))
    expect(traceSource).toContain('<TraceSteps steps={step.children} />')
    expect(traceSource).not.toContain('if (!steps.length) return null')
  })

  it('freezes each collapsible default open state at mount', () => {
    expect(traceSource).toContain("const [initiallyOpen] = useState(() => step.status === 'running')")
    expect(traceSource).toContain('<TraceCollapsible defaultOpen={initiallyOpen}>')
    expect(traceSource).not.toContain('defaultOpen={step.status ===')
  })
})

describe('map art zoom controls', () => {
  it('uses a shadcn button group for zoom and recentre controls', () => {
    expect(studioSource).toContain("from '@/components/ui/button-group'")
    expect(studioSource).toContain('<ButtonGroup aria-label="Map zoom and view controls">')
    expect(studioSource).toContain('<ButtonGroupSeparator />')
    expect(studioSource).toContain('<ButtonGroupText')
    expect(studioSource).toContain('{zoom.toFixed(1)}')
    expect(studioSource).toContain('onClick={() => stepZoom(-0.5)}')
    expect(studioSource).toContain('onClick={() => stepZoom(0.5)}')
    expect(studioSource).toContain('onClick={resetView}')
  })
})

describe('map art status panel placement', () => {
  it('puts validation, trace and Generate below the tabs', () => {
    const tabsEnd = studioSource.indexOf('</Tabs>')
    const panel = studioSource.indexOf('aria-label="Generation status"', tabsEnd)
    const generate = studioSource.indexOf('{generateLabel}', panel)

    expect(tabsEnd).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(tabsEnd)
    expect(generate).toBeGreaterThan(panel)

    const sidebarPanel = studioSource.slice(panel, generate)
    expect(sidebarPanel).toContain('{verifiedCount} location')
    expect(sidebarPanel).toContain('<GenerationTrace steps={traceSteps} />')
    expect(studioSource).toContain('<aside className="map-art-left [@media(max-width:700px)]:pb-20">')
    expect(studioSource).toContain('<div className="sticky bottom-0 z-10 border-t bg-inherit p-4 [@media(max-width:700px)]:fixed [@media(max-width:700px)]:inset-x-0 [@media(max-width:700px)]:z-50 [@media(max-width:700px)]:bg-[var(--paper)]">')
  })

  it('keeps the validation marker out of the locations tab', () => {
    expect(locationsSource).not.toContain('{verifiedCount} location')
    expect(locationsSource).not.toContain('onEditVerified')
  })
})
