'use client'

import './map-art.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import * as maplibregl from 'maplibre-gl'
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Album, AlbumItem, FrameStore, MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import { removeAmbiguityRow, resolveExportView, waitForCameraSettled, type MapView } from '@/lib/map-art'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Download, MapPin, Minus, Plus, RotateCcw, Search, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type City = MapArtLocation
type Artwork = { city: City; url: string; style: string; createdAt: number }

const DEFAULT_CITY: City = { id: 1, name: 'Melbourne', country: 'Australia', lat: -37.8136, lon: 144.9631 }

function defaultMapArtSettings(): MapArtSettings {
  return {
    mode: 'cities',
    query: 'Melbourne, Australia\nSydney, Australia\nTokyo, Japan\nParis, France',
    continent: 'Europe',
    count: '10',
    customCount: 10,
    cities: [DEFAULT_CITY],
    results: [],
    ambiguities: [],
    city: DEFAULT_CITY,
    activeIndex: 0,
    styleId: 'classic',
    title: true,
    showCoords: true,
    orientation: 'portrait',
    zoom: 12,
    backgroundColor: '#f5f0e3',
    streetLabels: 'all',
    showRailways: true,
    showTrails: true,
    customText: '',
  }
}

const styles = [
  { id: 'classic', label: 'Classic cartography', swatches: ['#f5f0e3', '#282724', '#e77a43'] },
  { id: 'minimal', label: 'Modern minimal', swatches: ['#f4f3ef', '#52514d', '#9c9a91'] },
  { id: 'topographic', label: 'Topographic', swatches: ['#e9e5d5', '#4c594b', '#c18152'] },
  { id: 'vintage', label: 'Vintage atlas', swatches: ['#eadcc1', '#6a5744', '#ac7650'] },
  { id: 'dark', label: 'Midnight', swatches: ['#24282b', '#d4d0c5', '#6c9eb1'] },
]
const continentCities: Record<string, string[]> = {
  Africa: ['Cairo, Egypt', 'Lagos, Nigeria', 'Nairobi, Kenya', 'Cape Town, South Africa', 'Marrakesh, Morocco', 'Accra, Ghana', 'Addis Ababa, Ethiopia', 'Dakar, Senegal', 'Kigali, Rwanda', 'Tunis, Tunisia', 'Algiers, Algeria', 'Maputo, Mozambique', 'Windhoek, Namibia', 'Abidjan, Ivory Coast', 'Kampala, Uganda', 'Dar es Salaam, Tanzania', 'Lusaka, Zambia', 'Gaborone, Botswana', 'Kumasi, Ghana', 'Alexandria, Egypt'],
  Asia: ['Tokyo, Japan', 'Seoul, South Korea', 'Mumbai, India', 'Bangkok, Thailand', 'Singapore', 'Istanbul, Turkey', 'Kyoto, Japan', 'Hanoi, Vietnam', 'Kathmandu, Nepal', 'Tbilisi, Georgia', 'Taipei, Taiwan', 'Jaipur, India', 'Kuala Lumpur, Malaysia', 'Colombo, Sri Lanka', 'Baku, Azerbaijan', 'Tashkent, Uzbekistan', 'Manila, Philippines', 'Jakarta, Indonesia', 'Muscat, Oman', 'Beirut, Lebanon'],
  Europe: ['Paris, France', 'Rome, Italy', 'Lisbon, Portugal', 'Copenhagen, Denmark', 'Prague, Czechia', 'Athens, Greece', 'Amsterdam, Netherlands', 'Vienna, Austria', 'Edinburgh, United Kingdom', 'Reykjavik, Iceland', 'Budapest, Hungary', 'Tallinn, Estonia', 'Dubrovnik, Croatia', 'Oslo, Norway', 'Krakow, Poland', 'Seville, Spain', 'Ljubljana, Slovenia', 'Bruges, Belgium', 'Sarajevo, Bosnia and Herzegovina', 'Stockholm, Sweden'],
  'North America': ['New York, United States', 'Mexico City, Mexico', 'Vancouver, Canada', 'Havana, Cuba', 'San Francisco, United States', 'Montreal, Canada', 'Oaxaca, Mexico', 'Kingston, Jamaica', 'Guatemala City, Guatemala', 'Panama City, Panama', 'Quebec City, Canada', 'San Juan, Puerto Rico', 'Belize City, Belize', 'San José, Costa Rica', 'Nassau, Bahamas', 'Chicago, United States', 'Antigua Guatemala, Guatemala', 'Tegucigalpa, Honduras', 'Santo Domingo, Dominican Republic', 'Anchorage, United States'],
  'South America': ['Buenos Aires, Argentina', 'Rio de Janeiro, Brazil', 'Lima, Peru', 'Bogotá, Colombia', 'Santiago, Chile', 'Quito, Ecuador', 'La Paz, Bolivia', 'Montevideo, Uruguay', 'Cartagena, Colombia', 'Cusco, Peru', 'Salvador, Brazil', 'Asunción, Paraguay', 'Medellín, Colombia', 'Valparaíso, Chile', 'Sucre, Bolivia', 'Mendoza, Argentina', 'Georgetown, Guyana', 'Paramaribo, Suriname', 'Arequipa, Peru', 'Florianópolis, Brazil'],
  Oceania: ['Sydney, Australia', 'Melbourne, Australia', 'Auckland, New Zealand', 'Suva, Fiji', 'Hobart, Australia', 'Wellington, New Zealand', 'Apia, Samoa', 'Port Moresby, Papua New Guinea', 'Nouméa, New Caledonia', 'Papeete, French Polynesia', 'Adelaide, Australia', 'Perth, Australia', 'Honiara, Solomon Islands', 'Nukuʻalofa, Tonga', 'Brisbane, Australia', 'Christchurch, New Zealand', 'Port Vila, Vanuatu', 'Majuro, Marshall Islands', 'Darwin, Australia', 'Koror, Palau'],
  Antarctica: ['Antarctica has no permanent cities. Choose a research station instead.'],
}
const vectorStyleUrls: Record<string, string> = {
  classic: 'liberty',
  minimal: 'positron',
  topographic: 'fiord',
  vintage: 'bright',
  dark: 'dark',
}

function vectorMapStyle(styleId: string) {
  return `https://tiles.openfreemap.org/styles/${vectorStyleUrls[styleId] ?? 'liberty'}`
}

const baseLayerFilters = new WeakMap<MapLibreMap, Map<string, FilterSpecification | null>>()
const majorStreetClasses = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
const railwayClasses = ['rail', 'transit', 'railway']
const trailClasses = ['path', 'pedestrian', 'track', 'footway', 'cycleway', 'bridleway']

function applyMapPreferences(map: MapLibreMap, preferences: Pick<MapArtSettings, 'streetLabels' | 'showRailways' | 'showTrails' | 'backgroundColor'>) {
  const style = map.getStyle()
  const baseFilters = baseLayerFilters.get(map) ?? new Map<string, FilterSpecification | null>()
  for (const layer of style.layers) {
    if (!baseFilters.has(layer.id)) baseFilters.set(layer.id, 'filter' in layer ? layer.filter ?? null : null)
    const baseFilter = baseFilters.get(layer.id) ?? null
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    let preferenceFilter: FilterSpecification | null = null
    if (sourceLayer === 'transportation_name') {
      if (preferences.streetLabels === 'none') preferenceFilter = ['==', 1, 0]
      else if (preferences.streetLabels === 'major') preferenceFilter = ['in', ['get', 'class'], ['literal', majorStreetClasses]]
    } else if (sourceLayer === 'transportation') {
      const excluded = [
        ...(!preferences.showRailways ? railwayClasses : []),
        ...(!preferences.showTrails ? trailClasses : []),
      ]
      if (excluded.length) preferenceFilter = ['!', ['in', ['get', 'class'], ['literal', excluded]]]
    }
    const combined = preferenceFilter
      ? ['all', ...(baseFilter ? [baseFilter] : []), preferenceFilter] as FilterSpecification
      : baseFilter
    map.setFilter(layer.id, combined)
    if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', preferences.backgroundColor)
  }
  baseLayerFilters.set(map, baseFilters)
}

function waitForIdle(map: MapLibreMap, forceRefresh = false) {
  return new Promise<void>((resolve, reject) => {
    if (!forceRefresh && map.loaded()) return resolve()
    let timeout: number
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      map.off('idle', onIdle)
      if (error) reject(error)
      else resolve()
    }
    const onIdle = () => finish()
    timeout = window.setTimeout(() => finish(new Error('Map tiles did not finish loading in time.')), 20000)
      map.once('idle', onIdle)
      if (forceRefresh) map.triggerRepaint()
    })
}

async function renderMapAtResolution({
  width,
  height,
  center,
  zoom,
  styleId,
  preferences,
}: {
  width: number
  height: number
  center: [number, number]
  zoom: number
  styleId: string
  preferences: Pick<MapArtSettings, 'streetLabels' | 'showRailways' | 'showTrails' | 'backgroundColor'>
}) {
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`
  document.body.append(container)
  let exportMap: MapLibreMap | null = null
  try {
    exportMap = new maplibregl.Map({
      container,
      style: vectorMapStyle(styleId),
      center,
      zoom,
      attributionControl: false,
      interactive: false,
      pixelRatio: 1,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    })
    await waitForIdle(exportMap)
    applyMapPreferences(exportMap, preferences)
    await waitForIdle(exportMap, true)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create the high-resolution map canvas.')
    context.drawImage(exportMap.getCanvas(), 0, 0, width, height)
    return canvas
  } finally {
    exportMap?.remove()
    container.remove()
  }
}

export function MapArtStudio({ frameId, onAddToAlbum, onSettingsChange, mapArt, embedded = false, albumCount = 0 }: { frameId?: string; onAddToAlbum?: (item: AlbumItem) => void; onSettingsChange?: (settings: MapArtSettings) => void; mapArt?: MapArtSettings; embedded?: boolean; albumCount?: number }) {
  const settingsRef = useRef<MapArtSettings>(mapArt ?? defaultMapArtSettings())
  const initialSettings = settingsRef.current
  const mapNode = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pendingCityMove = useRef<Promise<void> | null>(null)
  const cityRef = useRef<City>(initialSettings.city)
  const activeStyleId = useRef(initialSettings.styleId)
  const preferencesRef = useRef<Pick<MapArtSettings, 'streetLabels' | 'showRailways' | 'showTrails' | 'backgroundColor'>>({ streetLabels: initialSettings.streetLabels ?? 'all', showRailways: initialSettings.showRailways ?? true, showTrails: initialSettings.showTrails ?? true, backgroundColor: initialSettings.backgroundColor ?? '#f5f0e3' })
  const albumRef = useRef<Album | null>(null)
  const frameQuery = frameId ? `?frame=${encodeURIComponent(frameId)}` : ''
  const [city, setCityState] = useState<City>(initialSettings.city)
  const [mode, setModeState] = useState<MapArtSettings['mode']>(initialSettings.mode)
  const [query, setQuery] = useState(initialSettings.query)
  const [continent, setContinentState] = useState(initialSettings.continent)
  const [count, setCountState] = useState(initialSettings.count)
  const [customCount, setCustomCountState] = useState(initialSettings.customCount)
  const [cities, setCitiesState] = useState<City[]>(initialSettings.cities)
  const [results, setResultsState] = useState<City[]>(initialSettings.results)
  const [ambiguities, setAmbiguitiesState] = useState<MapArtAmbiguity[]>(initialSettings.ambiguities)
  const [style, setStyleState] = useState(() => styles.find((entry) => entry.id === initialSettings.styleId) ?? styles[0])
  const [title, setTitleState] = useState(initialSettings.title)
  const [showCoords, setShowCoordsState] = useState(initialSettings.showCoords)
  const [orientation, setOrientationState] = useState(initialSettings.orientation)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [batchProgress, setBatchProgress] = useState(0)
  const [activeIndex, setActiveIndexState] = useState(initialSettings.activeIndex)
  const [zoom, setZoomState] = useState(initialSettings.zoom || 12)
  const [backgroundColor, setBackgroundColorState] = useState(initialSettings.backgroundColor ?? '#f5f0e3')
  const [streetLabels, setStreetLabelsState] = useState(initialSettings.streetLabels ?? 'all')
  const [showRailways, setShowRailwaysState] = useState(initialSettings.showRailways ?? true)
  const [showTrails, setShowTrailsState] = useState(initialSettings.showTrails ?? true)
  const [customText, setCustomText] = useState(initialSettings.customText)

  function persistField<K extends keyof MapArtSettings>(
    key: K,
    value: MapArtSettings[K] | ((current: MapArtSettings[K]) => MapArtSettings[K]),
  ) {
    const current = settingsRef.current[key]
    const nextValue = typeof value === 'function'
      ? (value as (current: MapArtSettings[K]) => MapArtSettings[K])(current)
      : value
    const nextSettings = { ...settingsRef.current, [key]: nextValue }
    settingsRef.current = nextSettings
    onSettingsChange?.(nextSettings)
    return nextValue
  }

  const setCity = (value: City) => setCityState(persistField('city', value))
  const setMode = (value: MapArtSettings['mode']) => setModeState(persistField('mode', value))
  const setContinent = (value: string) => setContinentState(persistField('continent', value))
  const setCount = (value: string) => setCountState(persistField('count', value))
  const setCustomCount = (value: number) => setCustomCountState(persistField('customCount', value))
  const setCities = (value: City[] | ((current: City[]) => City[])) => setCitiesState(persistField('cities', value))
  const setResults = (value: City[] | ((current: City[]) => City[])) => setResultsState(persistField('results', value))
  const setAmbiguities = (value: MapArtAmbiguity[] | ((current: MapArtAmbiguity[]) => MapArtAmbiguity[])) => setAmbiguitiesState(persistField('ambiguities', value))
  const setStyle = (value: (typeof styles)[number]) => {
    setStyleState(value)
    persistField('styleId', value.id as MapArtSettings['styleId'])
  }
  const setTitle = (value: boolean) => setTitleState(persistField('title', value))
  const setShowCoords = (value: boolean) => setShowCoordsState(persistField('showCoords', value))
  const setOrientation = (value: MapArtSettings['orientation']) => setOrientationState(persistField('orientation', value))
  const setActiveIndex = (value: number) => setActiveIndexState(persistField('activeIndex', value))
  const setZoom = (value: number | ((current: number) => number)) => setZoomState(persistField('zoom', value))
  const setBackgroundColor = (value: string) => setBackgroundColorState(persistField('backgroundColor', value))
  const setStreetLabels = (value: MapArtSettings['streetLabels']) => setStreetLabelsState(persistField('streetLabels', value))
  const setShowRailways = (value: boolean) => setShowRailwaysState(persistField('showRailways', value))
  const setShowTrails = (value: boolean) => setShowTrailsState(persistField('showTrails', value))

  preferencesRef.current = { streetLabels, showRailways, showTrails, backgroundColor }
  cityRef.current = city

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs')
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: vectorMapStyle(style.id),
      center: [city.lon, city.lat],
      zoom: initialSettings.zoom || 12,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })
    map.on('load', () => {
      map.resize()
      map.jumpTo({ center: [city.lon, city.lat], zoom })
      applyMapPreferences(map, preferencesRef.current)
      map.triggerRepaint()
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (activeStyleId.current !== style.id) {
      activeStyleId.current = style.id as MapArtSettings['styleId']
      map.setStyle(vectorMapStyle(style.id))
      map.once('style.load', () => {
        baseLayerFilters.delete(map)
        applyMapPreferences(map, preferencesRef.current)
      })
    } else if (map.isStyleLoaded()) {
      applyMapPreferences(map, preferencesRef.current)
    }
  }, [style.id, streetLabels, showRailways, showTrails, backgroundColor])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let resolveMove: (() => void) | undefined
    const move = new Promise<void>((resolve) => { resolveMove = resolve })
    let timeout = 0
    const finish = () => {
      window.clearTimeout(timeout)
      resolveMove?.()
      resolveMove = undefined
      map.off('moveend', finish)
      if (pendingCityMove.current === move) pendingCityMove.current = null
    }
    pendingCityMove.current = move
    map.once('moveend', finish)
    // Do not let a stalled animation block generation forever.
    timeout = window.setTimeout(finish, 1500)
    map.flyTo({ center: [city.lon, city.lat], zoom, duration: 700 })
    return finish
  }, [city, zoom])

  const resolveCity = useCallback(async (line: string) => {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(line)}`)
    if (!response.ok) throw new Error(`Could not resolve ${line}`)
    const data = await response.json() as { results?: (City & { city?: string; admin1?: string })[] }
    return (data.results ?? []).map((result) => ({
      ...result,
      name: result.city ?? result.name,
      region: result.admin1,
    }))
  }, [])

  async function validateCities(input = query) {
    const normalized = input.split(/\n|;/).map((part) => part.trim()).filter(Boolean)
    const unique = [...new Set(normalized)]
    if (!unique.length) return setStatus('Add at least one city, one per line.')
    if (unique.length > 100) return setStatus('Choose 100 cities or fewer per batch.')
    setBusy(true)
    setStatus(`Checking ${unique.length} locations…`)
    const found: City[] = []
    const needsReview: { query: string; rowId: number; chosenId: number; matches: City[] }[] = []
    try {
      for (const line of unique) {
        const matches = await resolveCity(line)
        if (matches[0]) {
          const rowId = found.length
          found.push(matches[0])
          if (matches.length > 1) needsReview.push({ query: line, rowId, chosenId: matches[0].id, matches })
        }
      }
      setAmbiguities(needsReview)
      setResults(found)
      setCities(found)
      if (found[0]) { setCity(found[0]); setActiveIndex(0) }
      setStatus(`${found.length} of ${unique.length} locations validated. Review results before generating.`)
      if (!found.length) setStatus('No matching locations. Try adding a country name.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Location lookup failed. Try again.')
    } finally { setBusy(false) }
  }

  function chooseCityMatch(queryText: string, selectedId: number) {
    const ambiguity = ambiguities.find((entry) => entry.query === queryText)
    const selected = ambiguity?.matches.find((match) => match.id === selectedId)
    if (!ambiguity || !selected) return
    setResults((current) => current.map((entry, index) => index === ambiguity.rowId ? selected : entry))
    setCities((current) => current.map((entry, index) => index === ambiguity.rowId ? selected : entry))
    setAmbiguities((current) => current.map((entry) => entry.rowId === ambiguity.rowId ? { ...entry, chosenId: selected.id } : entry))
    if (activeIndex === ambiguity.rowId) setCity(selected)
  }

  function removeLocation(removed: City) {
    const index = results.findIndex((entry) => entry.id === removed.id)
    if (index === -1) return
    const remaining = results.filter((_, currentIndex) => currentIndex !== index)
    setResults(remaining)
    setCities(remaining)
    setAmbiguities((current) => removeAmbiguityRow(current, index))
    if (city.id === removed.id) {
      const nextIndex = Math.min(index, Math.max(0, remaining.length - 1))
      const nextCity = remaining[nextIndex]
      if (nextCity) {
        setCity(nextCity)
        setActiveIndex(nextIndex)
      }
    } else if (index < activeIndex) {
      setActiveIndex(activeIndex - 1)
    }
  }

  async function discoverCities() {
    if (continent === 'Antarctica') { setStatus('Antarctica has no permanent cities. Select a research station by name in Enter cities.'); return }
    const candidates = continentCities[continent] ?? []
    const target = count === 'custom' ? customCount : Number(count)
    const found: City[] = []
    setBusy(true)
    setStatus(`Validating city candidates across ${continent}…`)
    try {
      for (const candidate of candidates) {
        if (found.length >= target) break
        const match = (await resolveCity(candidate))[0]
        if (match && !found.some((entry) => entry.id === match.id)) found.push(match)
      }
      setCities(found)
      setResults(found)
      setAmbiguities([])
      if (found[0]) { setCity(found[0]); setActiveIndex(0) }
      setStatus(`Validated ${found.length} cities. Review the list, then generate your maps.`)
    } catch { setStatus('City discovery could not reach the geographic data service. Try again.') }
    finally { setBusy(false) }
  }

  async function savePosterToCollection(url: string, selected: City) {
    let album = albumRef.current
    if (!album) {
      const storeResponse = await fetch(`/api/store${frameQuery}`, { cache: 'no-store' })
      if (!storeResponse.ok) throw new Error('Could not open the frame image library.')
      const store = await storeResponse.json() as FrameStore
      album = store.albums.find((entry) => entry.name === 'City Map Collection' && entry.theme === 'photos') ?? null
      if (!album) {
        const createdResponse = await fetch(`/api/albums${frameQuery}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'City Map Collection', theme: 'photos' }),
        })
        const created = await createdResponse.json() as { id?: string; store?: FrameStore; error?: string }
        if (!createdResponse.ok || !created.id) throw new Error(created.error ?? 'Could not create the City Map Collection album.')
        album = created.store?.albums.find((entry) => entry.id === created.id) ?? null
      }
    }
    if (!album) throw new Error('The City Map Collection album could not be loaded.')
    const item: AlbumItem = {
      id: `map-${selected.id}-${Date.now()}`,
      image: url,
      sourceUrl: '',
      title: selected.name,
      subtitle: selected.country ?? '',
      year: '',
    }
    const response = await fetch(`/api/albums/${album.id}${frameQuery}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    })
    const body = await response.json().catch(() => ({})) as { error?: string; store?: FrameStore }
    if (!response.ok) throw new Error(body.error ?? 'Map image was saved but could not be added to the frame album.')
    albumRef.current = body.store?.albums.find((entry) => entry.id === album?.id) ?? album
  }

  async function renderArtwork(selected: City, view: MapView) {
    const map = mapRef.current
    if (!map) throw new Error('Map renderer is not ready yet.')
    const width = orientation === 'portrait' ? 2880 : 3840
    const height = orientation === 'portrait' ? 3840 : 2160
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create the poster canvas.')
    const paper = backgroundColor
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, width, height)
    const margin = Math.round(width * 0.052)
    const titleHeight = title ? Math.round(height * 0.16) : Math.round(height * 0.035)
    const mapWidth = width - margin * 2
    const mapHeight = height - margin * 2 - titleHeight
    const exportMapCanvas = await renderMapAtResolution({
      width: mapWidth,
      height: mapHeight,
      center: view.center,
      zoom: view.zoom,
      styleId: style.id,
      preferences: { streetLabels, showRailways, showTrails, backgroundColor },
    })
    ctx.save()
    ctx.beginPath()
    ctx.rect(margin, margin, width - margin * 2, mapHeight)
    ctx.clip()
      ctx.drawImage(exportMapCanvas, margin, margin, mapWidth, mapHeight)
    ctx.restore()
    ctx.strokeStyle = style.id === 'dark' ? '#b9b4a9' : '#37352f'
    ctx.lineWidth = Math.max(1, width / 1500)
    ctx.strokeRect(margin, margin, width - margin * 2, mapHeight)
    if (title) {
      const centerX = width / 2
      let y = margin + mapHeight + height * 0.064
      ctx.textAlign = 'center'
      ctx.fillStyle = style.id === 'dark' ? '#f1eee5' : '#262522'
      ctx.font = `${Math.round(width * 0.037)}px Georgia, serif`
      ctx.fillText(selected.name.toLocaleUpperCase(), centerX, y, width - margin * 2)
      y += height * 0.044
      ctx.fillStyle = style.id === 'dark' ? '#d1cec5' : '#56534d'
      ctx.font = `${Math.round(width * 0.013)}px Arial, sans-serif`
      ctx.fillText((selected.country ?? '').toLocaleUpperCase(), centerX, y, width - margin * 2)
      if (showCoords) {
        y += height * 0.026
        ctx.font = `${Math.round(width * 0.009)}px Arial, sans-serif`
        ctx.fillText(`${Math.abs(selected.lat).toFixed(4)}° ${selected.lat < 0 ? 'S' : 'N'}  ·  ${Math.abs(selected.lon).toFixed(4)}° ${selected.lon < 0 ? 'W' : 'E'}`, centerX, y)
      }
      if (customText) {
        y += height * 0.026
        ctx.font = `${Math.round(width * 0.01)}px Arial, sans-serif`
        ctx.fillText(customText.toLocaleUpperCase(), centerX, y, width - margin * 2)
      }
    }
    ctx.fillStyle = style.id === 'dark' ? '#dedbd1' : '#55524b'
    ctx.font = `${Math.max(12, width * 0.006)}px Arial, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText('© OpenFreeMap · OpenMapTiles · OpenStreetMap contributors', width - margin, height - Math.round(margin * 0.35))
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Poster export failed.')), 'image/png'))
    const form = new FormData()
    form.set('file', new File([blob], `${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-map.png`, { type: 'image/png' }))
    const upload = await fetch('/api/uploads', { method: 'POST', body: form })
    if (!upload.ok) {
      const failure = await upload.json().catch(() => ({})) as { error?: string }
      throw new Error(failure.error ?? 'The poster could not be saved to the image library.')
    }
    const saved = await upload.json() as { url: string }
    const item: AlbumItem = {
      id: `map-${selected.id}-${Date.now()}`,
      image: saved.url,
      sourceUrl: saved.url,
      title: selected.name,
      subtitle: selected.country ?? '',
      year: '',
    }
    if (onAddToAlbum) onAddToAlbum(item)
    else await savePosterToCollection(saved.url, selected)
    return saved.url
  }

  async function generateBatch() {
    if (!cities.length) { setStatus('Validate a city list before generating maps.'); return }
    const available = onAddToAlbum ? Math.max(0, 200 - albumCount) : cities.length
    if (available === 0) { setStatus('This album has reached the 200 map limit. Remove a map before generating more.'); return }
    const batch = cities.slice(0, available)
    setBusy(true)
    setBatchProgress(0)
    // A city selection starts a 700 ms camera move. Exporting before it ends
    // would pair an in-between center with the newly selected city.
    await waitForCameraSettled(() => pendingCityMove.current)
    const previewView: MapView | null = mapRef.current
      ? {
          center: [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat],
          zoom: mapRef.current.getZoom(),
        }
      : null
    const activeCityId = cityRef.current.id
    const output: Artwork[] = []
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const selected = batch[index]
        setCity(selected)
        setActiveIndex(index)
        setStatus(`Rendering and saving ${index + 1} of ${batch.length}: ${selected.name}…`)
        const view = resolveExportView(selected, activeCityId, previewView, settingsRef.current.zoom)
        const url = await renderArtwork(selected, view)
        output.push({ city: selected, url, style: style.label, createdAt: Date.now() })
        setArtworks((current) => [...current, output[output.length - 1]])
        setBatchProgress(index + 1)
      }
      setStatus(`${output.length} map${output.length === 1 ? '' : 's'} ${onAddToAlbum ? 'added to this album' : 'saved to the image library'}.${batch.length < cities.length ? ' Album limit reached; remove maps to generate more.' : ''}`)
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Map generation failed.') }
    finally { setBusy(false) }
  }

  async function downloadAll() {
    if (artworks.length === 0) return
    setBusy(true)
    setStatus('Preparing your map collection ZIP…')
    try {
      const zip = new JSZip()
      for (const [index, artwork] of artworks.entries()) {
        const response = await fetch(artwork.url)
        if (!response.ok) throw new Error(`Could not download ${artwork.city.name}.`)
        const name = artwork.city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        zip.file(`${String(index + 1).padStart(2, '0')}-${name}-map.png`, await response.blob())
      }
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
      const href = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = href
      link.download = 'city-map-collection.zip'
      link.click()
      URL.revokeObjectURL(href)
      setStatus(`${artworks.length} maps packed into city-map-collection.zip.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the ZIP archive.')
    } finally { setBusy(false) }
  }

  function changeCity(index: number) {
    if (!cities.length) return
    const next = (index + cities.length) % cities.length
    setActiveIndex(next)
    setCity(cities[next])
  }

  const presets = ['Streets', 'Minimal', 'Topographic', 'Vintage atlas', 'Dark cartographic']

  return (
    <div className={embedded ? 'map-art-shell map-art-embedded' : 'map-art-shell'}>
      <header className="map-art-topbar">
        <a className="map-art-wordmark" href="/" aria-label="Return to frame editor">MURAL</a>
        <div className="map-art-heading"><MapPin size={17} /><span>Map Art Generator</span></div>
        <div className="map-art-header-actions"><a href="/" className="map-art-back"><ArrowLeft size={15} /> Frame editor</a><Button size="sm" onClick={generateBatch} disabled={busy}><Download size={15} data-icon="inline-start" /> {busy ? 'Generating…' : 'Generate maps'}</Button></div>
      </header>
      <div className="map-art-body">
        <aside className="map-art-left">
          <div className="map-art-mode" role="tablist" aria-label="City selection mode">
            <button role="tab" aria-selected={mode === 'cities'} onClick={() => setMode('cities')}>Enter cities</button>
            <button role="tab" aria-selected={mode === 'continent'} onClick={() => setMode('continent')}>Choose continent</button>
          </div>
          {mode === 'cities' ? <section className="map-art-block">
            <label className="map-art-label" htmlFor="city-list">Your cities <span>{query.split(/\n|;/).filter((line) => line.trim()).length}</span></label>
            <textarea id="city-list" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => persistField('query', query)} placeholder={'Melbourne, Australia\nTokyo, Japan\nParis, France'} rows={7} />
            <p className="map-art-hint">One location per line. Add a country to resolve ambiguous names.</p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => void validateCities()} disabled={busy}><Search size={15} data-icon="inline-start" /> Validate locations</Button>
          </section> : <section className="map-art-block">
            <label className="map-art-label" htmlFor="continent">Continent</label>
            <div className="map-art-select"><select id="continent" value={continent} onChange={(event) => setContinent(event.target.value)}>{Object.keys(continentCities).map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={14} /></div>
            <label className="map-art-label" htmlFor="city-count">Number of cities</label>
            <div className="map-art-select"><select id="city-count" value={count} onChange={(event) => setCount(event.target.value)}>{['5', '10', '20', 'custom'].map((value) => <option key={value} value={value}>{value === 'custom' ? 'Custom number' : `${value} cities`}</option>)}</select><ChevronDown size={14} /></div>
            {count === 'custom' && <input className="map-art-input" aria-label="Custom number of cities" type="number" min="1" max="20" value={customCount} onChange={(event) => setCustomCount(Math.min(20, Math.max(1, Number(event.target.value))))} />}
            <Button variant="outline" size="sm" className="w-full" onClick={() => void discoverCities()} disabled={busy}><MapPin size={15} data-icon="inline-start" /> Find cities</Button>
            <p className="map-art-hint">Up to 20 curated candidates are geocoded and checked before generation.</p>
          </section>}
          {results.length > 0 && <section className="map-art-block">
            <div className="map-art-label">Review locations <span>{results.length}</span></div>
            <div className="map-art-city-list">{results.map((item) => <div key={item.id} className={city.id === item.id ? 'selected' : ''}><button type="button" onClick={() => { setCity(item); setActiveIndex(results.indexOf(item)) }}>{item.name}</button><small>{[item.region, item.country].filter(Boolean).join(', ')}</small><button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeLocation(item)}><X size={13} /></button></div>)}</div>
          </section>}
          {ambiguities.map((entry, index) => (
            <section className="map-art-block" key={entry.query}>
              <label className="map-art-label" htmlFor={`ambiguous-city-${index}`}>Choose match for “{entry.query}”</label>
              <select id={`ambiguous-city-${index}`} className="map-art-input" value={entry.chosenId} onChange={(event) => chooseCityMatch(entry.query, Number(event.target.value))}>
                {entry.matches.map((match) => <option key={match.id} value={match.id}>{[match.name, match.region, match.country].filter(Boolean).join(', ')}</option>)}
              </select>
            </section>
          ))}
          <section className="map-art-block">
            <div className="map-art-label">Map style</div>
            <div className="map-art-presets">{presets.map((preset, index) => <button key={preset} className={style.id === styles[index % styles.length].id ? 'active' : ''} onClick={() => setStyle(styles[index % styles.length])} aria-pressed={style.id === styles[index % styles.length].id}><span className={`map-art-swatch swatch-${styles[index % styles.length].id}`}><i /><i /><i /></span><span>{preset}</span></button>)}</div>
          </section>
          <section className="map-art-block">
            <div className="map-art-label">Poster format</div>
            <div className="map-art-segment"><button aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')}>Portrait</button><button aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')}>Landscape</button></div>
            <div className="map-art-resolution">{orientation === 'portrait' ? '11 MP · 2880 × 3840' : '8 MP · 3840 × 2160'} <span>PNG</span></div>
          </section>
          <section className="map-art-block">
            <label className="map-art-label" htmlFor="poster-background">Poster background</label>
            <div className="map-art-color-picker"><input id="poster-background" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /><input className="map-art-input" aria-label="Background hex color" value={backgroundColor} onChange={(event) => /^#[0-9a-fA-F]{6}$/.test(event.target.value) && setBackgroundColor(event.target.value)} /></div>
            <label className="map-art-label" htmlFor="map-zoom">Map zoom · {zoom.toFixed(1)}</label>
            <input id="map-zoom" type="range" min="8" max="16" step="0.1" value={zoom} onChange={(event) => { const next = Number(event.target.value); setZoom(next); mapRef.current?.setZoom(next) }} />
            <div className="map-art-zoom-presets">{[{ label: 'City', value: 10 }, { label: 'District', value: 12 }, { label: 'Neighborhood', value: 14 }, { label: 'Detail', value: 16 }].map((preset) => <button key={preset.label} type="button" aria-pressed={Math.abs(zoom - preset.value) < 0.1} onClick={() => { setZoom(preset.value); mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: preset.value, duration: 300 }) }}>{preset.label}</button>)}</div>
            <label className="map-art-label" htmlFor="street-label-density">Street names</label>
            <select id="street-label-density" className="map-art-input" value={streetLabels} onChange={(event) => setStreetLabels(event.target.value as MapArtSettings['streetLabels'])}><option value="major">Major streets</option><option value="all">All street names</option><option value="none">Hide street names</option></select>
            <label className="map-art-layer-toggle"><input type="checkbox" checked={showRailways} onChange={(event) => setShowRailways(event.target.checked)} /> Railway lines</label>
            <label className="map-art-layer-toggle"><input type="checkbox" checked={showTrails} onChange={(event) => setShowTrails(event.target.checked)} /> Trails &amp; paths</label>
          </section>
          <section className="map-art-block map-art-checks">
            <label><input type="checkbox" checked={title} onChange={(event) => setTitle(event.target.checked)} /> City title</label>
            <label><input type="checkbox" checked={showCoords} onChange={(event) => setShowCoords(event.target.checked)} /> Coordinates</label>
            <label className="map-art-label" htmlFor="poster-note">Custom subtitle</label><input id="poster-note" className="map-art-input" maxLength={60} value={customText} onChange={(event) => setCustomText(event.target.value)} onBlur={() => persistField('customText', customText)} placeholder="Optional text" />
          </section>
        </aside>
        <main className="map-art-stage">
          <div className="map-art-stage-head"><div><span className="eyebrow">MAP PREVIEW</span><h1>{city.name}<span>{city.country}</span></h1></div><div className="map-art-pager"><button aria-label="Previous city" onClick={() => changeCity(activeIndex - 1)} disabled={cities.length < 2}><ChevronLeft size={17} /></button><span>{cities.length ? `${activeIndex + 1} / ${cities.length}` : '0 / 0'}</span><button aria-label="Next city" onClick={() => changeCity(activeIndex + 1)} disabled={cities.length < 2}><ChevronRight size={17} /></button></div></div>
          <div className="map-art-canvas-wrap"><div className={`map-art-poster ${orientation}`} data-style={style.id} style={{ backgroundColor }}><div className="map-art-map-area"><div className="map-art-map" ref={mapNode} /><span className="map-art-map-credit">© OpenFreeMap · OpenMapTiles · OpenStreetMap contributors</span></div>{title && <div className="map-art-title"><h2>{city.name}</h2><p>{city.country}</p>{showCoords && <small>{Math.abs(city.lat).toFixed(4)}° {city.lat < 0 ? 'S' : 'N'} · {Math.abs(city.lon).toFixed(4)}° {city.lon < 0 ? 'W' : 'E'}</small>}{customText && <small>{customText}</small>}</div>}</div></div>
          <div className="map-art-stage-foot"><div className="map-art-zoom"><button aria-label="Zoom out" onClick={() => { const next = Math.max(8, zoom - 0.5); setZoom(next); mapRef.current?.setZoom(next) }}><Minus size={15} /></button><span>{zoom.toFixed(1)}×</span><button aria-label="Zoom in" onClick={() => { const next = Math.min(16, zoom + 0.5); setZoom(next); mapRef.current?.setZoom(next) }}><Plus size={15} /></button><button onClick={() => { mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: 12 }); setZoom(12) }}>Fit</button><button aria-label="Reset map position" onClick={() => { mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: 12 }); setZoom(12) }}><RotateCcw size={14} /></button></div><span>{style.label} · {orientation === 'portrait' ? '11 MP portrait' : '8 MP landscape'}</span><Button variant="outline" size="sm" onClick={() => void generateBatch()} disabled={busy}><Upload size={14} data-icon="inline-start" /> {busy ? 'Generating…' : embedded ? 'Generate maps' : 'Save poster'}</Button></div>
          {status && <div className="map-art-status" role="status"><span>{status}</span>{busy && <progress aria-label="Map generation progress" max={Math.max(1, onAddToAlbum ? Math.min(cities.length, 200 - albumCount) : cities.length)} value={batchProgress} />}</div>}
          {artworks.length > 0 && <section className="map-art-gallery"><div className="map-art-gallery-head"><div><span className="eyebrow">YOUR COLLECTION</span><h2>{artworks.length} finished map{artworks.length === 1 ? '' : 's'}</h2></div><Button variant="outline" size="sm" onClick={() => void downloadAll()} disabled={busy}><Download size={14} data-icon="inline-start" /> Download ZIP</Button></div><div className="map-art-gallery-grid">{artworks.map((artwork, index) => <article key={`${artwork.city.id}-${artwork.createdAt}`}><button className="map-art-thumb" onClick={() => { setCity(artwork.city); setActiveIndex(index) }}><img src={artwork.url} alt={`Map poster of ${artwork.city.name}, ${artwork.city.country}`} /></button><div><strong>{artwork.city.name}</strong><small>{artwork.city.country}</small><a href={artwork.url} download={`${artwork.city.name}-map.png`} aria-label={`Download ${artwork.city.name} map`}><Download size={14} /></a></div></article>)}</div></section>}
        </main>
        <aside className="map-art-right">
          <section className="map-art-block"><div className="map-art-label">Map layers</div><p className="map-art-hint">OpenFreeMap vector tiles keep roads, railway lines, paths, and street labels independently adjustable.</p></section>
          <details className="map-art-details" open><summary>Colours &amp; finish <span>{style.label}</span></summary><div className="map-art-color-row">Paper <span>{style.swatches[0]} <i style={{ background: style.swatches[0] }} /></span></div><div className="map-art-color-row">Roads <span>{style.swatches[1]} <i style={{ background: style.swatches[1] }} /></span></div><div className="map-art-color-row">Contours <span>{style.swatches[2]} <i style={{ background: style.swatches[2] }} /></span></div></details>
          <details className="map-art-details"><summary>Typography &amp; labels <span>Poster title</span></summary><p>City title, country, and coordinates are composed on the final poster.</p></details>
          <details className="map-art-details"><summary>Export details <span>PNG</span></summary><p>Exported poster artwork is saved into the existing frame uploads library. Vector tiles by OpenFreeMap · OpenStreetMap data.</p></details>
          <div className="map-art-right-foot">OpenFreeMap vector tiles · OpenStreetMap data. Batch rendering is sequential to limit tile requests.</div>
        </aside>
      </div>
    </div>
  )
}
