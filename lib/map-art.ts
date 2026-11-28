import type { MapArtAmbiguity, MapArtLocation } from './types'

export type MapView = {
  center: [number, number]
  zoom: number
}

/**
 * Choose the view a poster exports. The preview can be panned and zoomed on the
 * map itself, so the city on screen uses the live view while the rest of a
 * batch keep their own coordinates at the same zoom level.
 */
export function resolveExportView(
  city: Pick<MapArtLocation, 'id' | 'lat' | 'lon'>,
  activeCityId: number | null,
  preview: MapView | null,
  savedZoom: number,
): MapView {
  const zoom = preview?.zoom ?? savedZoom
  if (preview && city.id === activeCityId) {
    return { center: preview.center, zoom }
  }
  return { center: [city.lon, city.lat], zoom }
}

/**
 * Drop the ambiguity owned by a removed result row and shift every later row
 * reference down, so match choices keep pointing at the same city.
 */
export function removeAmbiguityRow(ambiguities: MapArtAmbiguity[], removedRowId: number): MapArtAmbiguity[] {
  return ambiguities
    .filter((entry) => entry.rowId !== removedRowId)
    .map((entry) => (entry.rowId > removedRowId ? { ...entry, rowId: entry.rowId - 1 } : entry))
}

/**
 * Wait until the preview camera has finished its city transition. `pending`
 * returns the move currently in flight, or null when the camera is settled. A
 * new city change can start while the previous one finishes, so keep checking
 * until nothing is pending.
 */
export async function waitForCameraSettled(pending: () => Promise<void> | null): Promise<void> {
  let move = pending()
  while (move) {
    await move
    move = pending()
  }
}

export type TraceStepStatus = 'running' | 'error' | 'pending'

export type TraceStep = {
  id: string
  title: string
  description?: string
  status?: TraceStepStatus
  detail?: string
  children?: TraceStep[]
}

export const CITY_BATCH_LIMIT = 100

/**
 * Use a recent city without growing a batch past the schema limit. A city that
 * is already selected is only focused, so it cannot be generated twice.
 */
export function selectOrAppendCity(
  cities: MapArtLocation[],
  city: MapArtLocation,
  limit = CITY_BATCH_LIMIT,
): { cities: MapArtLocation[]; index: number; added: boolean } | null {
  const index = cities.findIndex((entry) => entry.id === city.id)
  if (index !== -1) return { cities, index, added: false }
  if (cities.length >= limit) return null
  return { cities: [...cities, city], index: cities.length, added: true }
}

/**
 * Find a city in the current batch by id. Gallery artwork keeps the city object
 * from the batch that produced it, so object identity cannot be used here.
 */
export function findCityIndex(cities: readonly MapArtLocation[], city: MapArtLocation): number {
  return cities.findIndex((entry) => entry.id === city.id)
}

const RECENT_LOCATION_LIMIT = 10

export function normalizeRecentLocations(
  locations: MapArtLocation[] | undefined,
  limit = RECENT_LOCATION_LIMIT,
): MapArtLocation[] {
  if (!locations?.length) return []
  const seen = new Set<number>()
  const result: MapArtLocation[] = []
  for (const city of locations) {
    if (seen.has(city.id)) continue
    seen.add(city.id)
    result.push(city)
    if (result.length >= limit) break
  }
  return result
}

export function appendRecentLocation(
  locations: MapArtLocation[] | undefined,
  city: MapArtLocation,
  limit = RECENT_LOCATION_LIMIT,
): MapArtLocation[] {
  return normalizeRecentLocations([city, ...(locations ?? [])], limit)
}

export function getRecentLocations(settings: { recentLocations?: MapArtLocation[] }): MapArtLocation[] {
  return normalizeRecentLocations(settings.recentLocations)
}

/** Update one trace step wherever it sits in the tree, leaving other steps as they were. */
export function updateTraceStep(
  steps: TraceStep[],
  id: string,
  update: (step: TraceStep) => TraceStep,
): TraceStep[] {
  return steps.map((step) => {
    if (step.id === id) return update(step)
    if (!step.children) return step
    return { ...step, children: updateTraceStep(step.children, id, update) }
  })
}

/** Add a step when an operation starts, so attempted work is never missing from the trace. */
export function appendTraceChild(
  steps: TraceStep[],
  parentId: string,
  child: TraceStep,
): TraceStep[] {
  return updateTraceStep(steps, parentId, (step) => {
    if (step.children?.some((entry) => entry.id === child.id)) return step
    return { ...step, children: [...(step.children ?? []), child] }
  })
}
