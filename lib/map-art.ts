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
