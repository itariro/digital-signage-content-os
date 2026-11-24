import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MapArtAmbiguity, MapArtLocation } from '@/lib/types'
import { removeAmbiguityRow, resolveExportView } from '@/lib/map-art'

const studioSource = readFileSync(
  path.resolve(__dirname, '../components/map-art/map-art-studio.tsx'),
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
    expect(studioSource).toContain('resolveExportView(selected, activeCityId, previewView, zoom)')
    expect(studioSource).toContain('center: view.center')
    expect(studioSource).toContain('zoom: view.zoom')
    expect(studioSource).not.toMatch(/map\.flyTo\(\{ center: \[selected\.lon, selected\.lat\]/)
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
    expect(studioSource).toContain('onClick={() => removeLocation(item)}')
  })
})
