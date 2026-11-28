'use client'

import './map-art.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import * as maplibregl from 'maplibre-gl'
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Album, AlbumItem, FrameStore, MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import {
  CITY_BATCH_LIMIT,
  appendRecentLocation,
  appendTraceChild,
  getRecentLocations,
  removeAmbiguityRow,
  resolveExportView,
  selectOrAppendCity,
  updateTraceStep,
  waitForCameraSettled,
  type MapView,
  type TraceStep,
  type TraceStepStatus,
} from '@/lib/map-art'
import { ArrowLeft, CircleCheck, Download, MapPin, Minus, Pencil, Plus, RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@/components/ui/button-group'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerationTrace } from './generation-trace'
import { LocationsTab } from './locations-tab'
import { StyleTab, type StyleOption } from './style-tab'

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
    recentLocations: [],
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
  // The live map lives in one persistent DOM node that is moved into whichever carousel slide is active.
  const mapNode = useRef<HTMLDivElement | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
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
  const [tab, setTab] = useState<'locations' | 'style'>('locations')
  const [recentLocations, setRecentLocations] = useState(() => getRecentLocations(initialSettings))
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null)
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([])
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const busyRef = useRef(busy)
  busyRef.current = busy

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
  const setRecent = (value: MapArtLocation[]) => setRecentLocations(persistField('recentLocations', value) ?? [])
  const setCustomTextValue = (value: string) => setCustomText(persistField('customText', value))

  preferencesRef.current = { streetLabels, showRailways, showTrails, backgroundColor }
  cityRef.current = city

  useEffect(() => {
    if (mapRef.current) return
    const node = document.createElement('div')
    node.className = 'map-art-map'
    mapNode.current = node
    slotRef.current?.append(node)
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs')
    const map = new maplibregl.Map({
      container: node,
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
    // Zoom lives in the pill below the carousel and attribution is in the poster credit line,
    // so the built-in map controls are left off to keep the poster clean.
    mapRef.current = map
    return () => {
      map.remove()
      node.remove()
      mapRef.current = null
      mapNode.current = null
    }
  }, [])

  const attachMapSlot = useCallback((slot: HTMLDivElement | null) => {
    slotRef.current = slot
    const node = mapNode.current
    if (slot && node && node.parentElement !== slot) {
      slot.append(node)
      requestAnimationFrame(() => mapRef.current?.resize())
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

  // Carousel → studio: swiping or arrow clicks select that city.
  useEffect(() => {
    if (!carouselApi) return
    const onSelect = () => {
      const index = carouselApi.selectedScrollSnap()
      if (index !== settingsRef.current.activeIndex && cities[index]) changeCity(index)
      requestAnimationFrame(() => mapRef.current?.resize())
    }
    carouselApi.on('select', onSelect)
    return () => { carouselApi.off('select', onSelect) }
  }, [carouselApi, cities])

  // Studio → carousel: batch generation, gallery clicks and validation move the slide.
  useEffect(() => {
    if (carouselApi && carouselApi.selectedScrollSnap() !== activeIndex) carouselApi.scrollTo(activeIndex)
  }, [carouselApi, activeIndex])

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
    setVerifiedCount(null)
    setTraceSteps([{
      id: 'validate',
      title: 'Validating locations',
      status: 'running',
      children: unique.map((line) => ({ id: `geocode-${line}`, title: `Resolving ${line}`, status: 'pending' })),
    }])
    setBusy(true)
    setStatus(`Checking ${unique.length} locations…`)
    const found: City[] = []
    const needsReview: { query: string; rowId: number; chosenId: number; matches: City[] }[] = []
    try {
      for (const line of unique) {
        const matches = await resolveCity(line)
        const chosen = matches[0]
        setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
          ...step,
          children: step.children?.map((child) => child.id === `geocode-${line}` ? {
            ...child,
            status: chosen ? undefined : 'error',
            description: chosen ? `${[chosen.name, chosen.region, chosen.country].filter(Boolean).join(', ')}` : 'No match found',
            detail: `Geocoded ${line} with /api/geocode.`,
          } : child),
        } : step))
        if (chosen) {
          const rowId = found.length
          found.push(chosen)
          if (matches.length > 1) needsReview.push({ query: line, rowId, chosenId: chosen.id, matches })
        }
      }
      setAmbiguities(needsReview)
      setResults(found)
      setCities(found)
      if (found[0]) { setCity(found[0]); setActiveIndex(0) }
      setStatus(`${found.length} of ${unique.length} locations validated. Review results before generating.`)
      setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
        ...step,
        title: `Validated ${found.length} of ${unique.length} locations`,
        status: undefined,
      } : step))
      if (!found.length) setStatus('No matching locations. Try adding a country name.')
    } catch (error) {
      setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
        ...step,
        title: 'Failed to validate locations',
        status: 'error',
      } : step))
      setStatus(error instanceof Error ? error.message : 'Location lookup failed. Try again.')
    } finally { setBusy(false) }
  }

  function chooseCityMatch(queryText: string, selectedId: number) {
    const ambiguity = ambiguities.find((entry) => entry.query === queryText)
    const selected = ambiguity?.matches.find((match) => match.id === selectedId)
    if (!ambiguity || !selected) return
    setVerifiedCount(null)
    setResults((current) => current.map((entry, index) => index === ambiguity.rowId ? selected : entry))
    setCities((current) => current.map((entry, index) => index === ambiguity.rowId ? selected : entry))
    setAmbiguities((current) => current.map((entry) => entry.rowId === ambiguity.rowId ? { ...entry, chosenId: selected.id } : entry))
    if (activeIndex === ambiguity.rowId) setCity(selected)
  }

  function removeLocation(removed: City) {
    const index = results.findIndex((entry) => entry.id === removed.id)
    if (index === -1) return
    setVerifiedCount(null)
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
    setVerifiedCount(null)
    const candidates = continentCities[continent] ?? []
    const target = count === 'custom' ? customCount : Number(count)
    const found: City[] = []
    setTraceSteps([{
      id: 'discover',
      title: `Validating city candidates across ${continent}`,
      status: 'running',
    }])
    setBusy(true)
    setStatus(`Validating city candidates across ${continent}…`)
    let currentCandidate: string | null = null
    try {
      for (const candidate of candidates) {
        if (found.length >= target) break
        currentCandidate = candidate
        setTraceSteps((current) => appendTraceChild(current, 'discover', {
          id: `candidate-${candidate}`,
          title: `Checking ${candidate}`,
          status: 'running',
        }))
        const match = (await resolveCity(candidate))[0]
        setTraceSteps((current) => updateTraceStep(current, `candidate-${candidate}`, (step) => ({
          ...step,
          status: match ? undefined : 'error',
          description: match ? `${[match.name, match.region, match.country].filter(Boolean).join(', ')}` : 'No match found',
          detail: `Geocoded ${candidate} with /api/geocode.`,
        })))
        if (match && !found.some((entry) => entry.id === match.id)) found.push(match)
      }
      setCities(found)
      setResults(found)
      setAmbiguities([])
      if (found[0]) { setCity(found[0]); setActiveIndex(0) }
      setStatus(`Validated ${found.length} cities. Review the list, then generate your maps.`)
      setTraceSteps((current) => updateTraceStep(current, 'discover', (step) => ({
        ...step,
        title: `Found ${found.length} cities in ${continent}`,
        status: undefined,
      })))
    } catch (error) {
      if (currentCandidate) {
        setTraceSteps((current) => updateTraceStep(current, `candidate-${currentCandidate}`, (step) => ({
          ...step,
          status: 'error',
          description: error instanceof Error ? error.message : 'Lookup failed',
        })))
      }
      setTraceSteps((current) => updateTraceStep(current, 'discover', (step) => ({
        ...step,
        title: `Failed to validate cities in ${continent}`,
        status: 'error',
      })))
      setStatus('City discovery could not reach the geographic data service. Try again.')
    }
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

  async function renderArtwork(selected: City, view: MapView, report?: (name: string, status?: TraceStepStatus, description?: string) => void) {
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
    report?.('render', 'running')
    const exportMapCanvas = await renderMapAtResolution({
      width: mapWidth,
      height: mapHeight,
      center: view.center,
      zoom: view.zoom,
      styleId: style.id,
      preferences: { streetLabels, showRailways, showTrails, backgroundColor },
    })
    report?.('render', undefined)
    report?.('compose', 'running')
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
    report?.('compose', undefined)
    report?.('upload', 'running')
    const form = new FormData()
    form.set('file', new File([blob], `${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-map.png`, { type: 'image/png' }))
    const upload = await fetch('/api/uploads', { method: 'POST', body: form })
    if (!upload.ok) {
      const failure = await upload.json().catch(() => ({})) as { error?: string }
      throw new Error(failure.error ?? 'The poster could not be saved to the image library.')
    }
    const saved = await upload.json() as { url: string }
    report?.('upload', undefined)
    const item: AlbumItem = {
      id: `map-${selected.id}-${Date.now()}`,
      image: saved.url,
      sourceUrl: saved.url,
      title: selected.name,
      subtitle: selected.country ?? '',
      year: '',
    }
    report?.('album', 'running')
    if (onAddToAlbum) onAddToAlbum(item)
    else await savePosterToCollection(saved.url, selected)
    report?.('album', undefined)
    return saved.url
  }

  async function generateBatch() {
    if (!cities.length) { setStatus('Validate a city list before generating maps.'); return }
    const available = onAddToAlbum ? Math.max(0, 200 - albumCount) : cities.length
    if (available === 0) { setStatus('This album has reached the 200 map limit. Remove a map before generating more.'); return }
    const recordRecent = verifiedCount !== null
    const batch = cities.slice(0, available)
    setBusy(true)
    setBatchProgress(0)
    const pendingCityId = settingsRef.current.city.id
    let activeStepId: string | null = null
    setTraceSteps([{
      id: 'generate',
      title: `Generating ${batch.length} poster${batch.length === 1 ? '' : 's'}`,
      status: 'running',
      children: batch.map((selected) => ({
        id: `poster-${selected.id}`,
        title: `Preparing ${selected.name}`,
        status: 'pending',
        children: [
          { id: `camera-${selected.id}`, title: 'Settling preview camera', status: selected.id === pendingCityId ? 'running' : 'pending' },
          { id: `render-${selected.id}`, title: 'Rendering map tiles', status: 'pending' },
          { id: `compose-${selected.id}`, title: 'Composing poster', status: 'pending' },
          { id: `upload-${selected.id}`, title: 'Uploading PNG', status: 'pending' },
          { id: `album-${selected.id}`, title: onAddToAlbum ? 'Adding to this album' : 'Saving to image library', status: 'pending' },
        ],
      })),
    }])
    // A city selection starts a 700 ms camera move. Exporting before it ends
    // would pair an in-between center with the newly selected city.
    await waitForCameraSettled(() => pendingCityMove.current)
    const activeCityId = settingsRef.current.city.id
    setTraceSteps((current) => {
      let next = updateTraceStep(current, `camera-${pendingCityId}`, (step) => ({
        ...step,
        status: undefined,
        description: 'Preview camera settled',
      }))
      if (activeCityId !== pendingCityId) {
        next = updateTraceStep(next, `camera-${activeCityId}`, (step) => ({
          ...step,
          status: undefined,
          description: 'Preview camera settled',
        }))
      }
      return next
    })
    const previewView: MapView | null = mapRef.current
      ? {
          center: [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat],
          zoom: mapRef.current.getZoom(),
        }
      : null
    const output: Artwork[] = []
    const reportStep = (city: City) => (name: string, status?: TraceStepStatus, description?: string) => {
      const id = `${name}-${city.id}`
      if (status === 'running') activeStepId = id
      setTraceSteps((current) => updateTraceStep(current, id, (step) => ({
        ...step,
        status,
        description: description ?? step.description,
      })))
    }
    let currentCity: City | null = null
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const selected = batch[index]
        currentCity = selected
        activeStepId = `render-${selected.id}`
        setCity(selected)
        setActiveIndex(index)
        setStatus(`Rendering and saving ${index + 1} of ${batch.length}: ${selected.name}…`)
        const view = resolveExportView(selected, activeCityId, previewView, settingsRef.current.zoom)
        const url = await renderArtwork(selected, view, reportStep(selected))
        if (recordRecent) {
          setRecent(appendRecentLocation(getRecentLocations(settingsRef.current), selected))
        }
        setTraceSteps((current) => updateTraceStep(current, `poster-${selected.id}`, (step) => ({
          ...step,
          status: undefined,
          title: `Generated poster for ${selected.name}`,
          detail: `Style: ${style.label}. Zoom: ${view.zoom.toFixed(1)}.`,
        })))
        output.push({ city: selected, url, style: style.label, createdAt: Date.now() })
        setArtworks((current) => [...current, output[output.length - 1]])
        setBatchProgress(index + 1)
      }
      setTraceSteps((current) => updateTraceStep(current, 'generate', (step) => ({
        ...step,
        title: `Generated ${output.length} poster${output.length === 1 ? '' : 's'}`,
        status: undefined,
      })))
      setStatus(`${output.length} map${output.length === 1 ? '' : 's'} ${onAddToAlbum ? 'added to this album' : 'saved to the image library'}.${batch.length < cities.length ? ' Album limit reached; remove maps to generate more.' : ''}`)
    } catch (error) {
      setTraceSteps((current) => {
        let next = current
        if (activeStepId) {
          next = updateTraceStep(next, activeStepId, (step) => ({
            ...step,
            status: 'error',
            description: error instanceof Error ? error.message : 'Step failed',
          }))
        }
        if (currentCity) {
          next = updateTraceStep(next, `poster-${currentCity.id}`, (step) => ({ ...step, status: 'error' }))
        }
        return updateTraceStep(next, 'generate', (step) => ({
          ...step,
          title: 'Poster generation failed',
          status: 'error',
        }))
      })
      setStatus(error instanceof Error ? error.message : 'Map generation failed.')
    }
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

  const presets = ['Streets', 'Minimal', 'Topographic', 'Vintage atlas', 'Dark']
  const progressMax = Math.max(1, onAddToAlbum ? Math.min(cities.length, 200 - albumCount) : cities.length)
  const generateLabel = busy ? 'Generating…' : `Generate ${cities.length || ''} map${cities.length === 1 ? '' : 's'}`.replace('  ', ' ')
  const slides = cities.length ? cities : [city]
  // Keep the live map on the visible slide. Two queries can resolve to the same
  // city id, so an id lookup here can pin the map to the wrong (hidden) slide;
  // id lookup is only used when selecting gallery artwork.
  const liveIndex = cities.length ? Math.max(0, Math.min(activeIndex, cities.length - 1)) : 0
  const carouselOpts = useMemo(() => ({
    loop: slides.length > 1,
    // Dragging on the map pans it; dragging on the poster margin swipes. No swiping while generating.
    watchDrag: (_api: unknown, event: MouseEvent | TouchEvent) =>
      !busyRef.current && !(event.target as Element | null)?.closest?.('.maplibregl-canvas'),
  }), [slides.length > 1])
  // Mirrors the colours used in renderArtwork so the preview matches the exported PNG.
  const ink = style.id === 'dark'
    ? { title: '#f1eee5', sub: '#d1cec5', small: '#dedbd1' }
    : { title: '#262522', sub: '#56534d', small: '#69655d' }
  const coords = (entry: City) => `${Math.abs(entry.lat).toFixed(4)}° ${entry.lat < 0 ? 'S' : 'N'} · ${Math.abs(entry.lon).toFixed(4)}° ${entry.lon < 0 ? 'W' : 'E'}`
  const renderPoster = (entry: City, live: boolean) => (
    <div className={`map-art-poster ${orientation}`} data-style={style.id} style={{ backgroundColor }}>
      <div className="map-art-map-area">
        {live
          ? <div key="live" ref={attachMapSlot} className="absolute inset-0" />
          : <div className="absolute inset-0 grid place-items-center bg-black/5"><MapPin className="size-6 opacity-40" style={{ color: ink.sub }} /></div>}
        <span className="map-art-map-credit">© OpenFreeMap · OpenMapTiles · OpenStreetMap contributors</span>
      </div>
      {title && (
        <div className="map-art-title">
          <h2 style={{ color: ink.title }}>{entry.name}</h2>
          <p style={{ color: ink.sub }}>{entry.country}</p>
          {showCoords && <small style={{ color: ink.small }}>{coords(entry)}</small>}
          {customText && <small style={{ color: ink.small }}>{customText}</small>}
        </div>
      )}
    </div>
  )
  const resetView = () => { mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: 12 }); setZoom(12) }
  const stepZoom = (delta: number) => { const next = Math.min(16, Math.max(8, zoom + delta)); setZoom(next); mapRef.current?.setZoom(next) }

  return (
    <div className={embedded ? 'map-art-shell map-art-embedded' : 'map-art-shell'}>
      <header className="map-art-topbar">
        <a className="map-art-wordmark" href="/" aria-label="Return to frame editor">MURAL</a>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2 text-sm font-medium"><MapPin className="size-4 text-muted-foreground" />Map Art Generator</div>
        <div className="ml-auto flex items-center gap-2">
          <a href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'max-sm:hidden' })}><ArrowLeft data-icon="inline-start" /> Frame editor</a>
        </div>
      </header>
      <div className="map-art-body">
        <aside className="map-art-left [@media(max-width:700px)]:pb-20">
          <Tabs value={tab} onValueChange={(next) => setTab(next as 'locations' | 'style')}>
            <TabsList className="mx-4 my-4 grid w-auto grid-cols-2">
              <TabsTrigger value="locations">Locations</TabsTrigger>
              <TabsTrigger value="style">Style</TabsTrigger>
            </TabsList>
            <TabsContent value="locations">
              <LocationsTab
                mode={mode}
                query={query}
                continent={continent}
                count={count}
                customCount={customCount}
                continentOptions={Object.keys(continentCities)}
                results={results}
                ambiguities={ambiguities}
                verifiedCount={verifiedCount}
                recentLocations={recentLocations}
                busy={busy}
                onModeChange={setMode}
                onQueryChange={(value) => { setQuery(value); persistField('query', value) }}
                onContinentChange={setContinent}
                onCountChange={setCount}
                onCustomCountChange={setCustomCount}
                onValidate={() => void validateCities()}
                onDiscover={() => void discoverCities()}
                onChooseMatch={chooseCityMatch}
                onRemoveLocation={removeLocation}
                onConfirm={() => setVerifiedCount(results.length)}
                onUseRecent={(city) => {
                  const next = selectOrAppendCity(cities, city)
                  if (!next) {
                    setStatus(`This batch already has ${CITY_BATCH_LIMIT} cities. Remove one before adding another.`)
                    return
                  }
                  setCity(city)
                  setActiveIndex(next.index)
                  if (!next.added) {
                    setStatus(`${city.name} is already in this batch.`)
                    return
                  }
                  setVerifiedCount(null)
                  setCities(next.cities)
                  setResults(next.cities)
                }}
                onRemoveRecent={(city) => setRecent(recentLocations.filter((entry) => entry.id !== city.id))}
              />
            </TabsContent>
            <TabsContent value="style">
              <StyleTab
                values={{
                  styleId: style.id as MapArtSettings['styleId'],
                  orientation,
                  backgroundColor,
                  zoom,
                  streetLabels,
                  title,
                  showCoords,
                  showRailways,
                  showTrails,
                  customText,
                }}
                styles={styles as readonly StyleOption[]}
                presets={presets}
                onStyleChange={setStyle}
                onOrientationChange={setOrientation}
                onBackgroundChange={setBackgroundColor}
                onZoomChange={(value) => { setZoom(value); mapRef.current?.setZoom(value) }}
                onZoomPreset={(value) => {
                  setZoom(value)
                  mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: value, duration: 300 })
                }}
                onStreetLabelsChange={setStreetLabels}
                onTitleChange={setTitle}
                onCoordsChange={setShowCoords}
                onRailwaysChange={setShowRailways}
                onTrailsChange={setShowTrails}
                onCustomTextChange={setCustomTextValue}
              />
            </TabsContent>
          </Tabs>
          {(verifiedCount !== null || traceSteps.length > 0) && (
            <section aria-label="Generation status" className="border-t p-4">
              {verifiedCount !== null && (
                <div className={`flex items-center gap-2 rounded-md border bg-muted/40 py-1.5 pl-3 pr-1.5${traceSteps.length > 0 ? ' mb-3' : ''}`}>
                  <CircleCheck className="size-4 text-primary" />
                  <span className="flex-1 text-sm">{verifiedCount} location{verifiedCount === 1 ? '' : 's'} ready</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVerifiedCount(null)}>
                    <Pencil data-icon="inline-start" /> Edit
                  </Button>
                </div>
              )}
              <GenerationTrace steps={traceSteps} />
            </section>
          )}
          <div className="sticky bottom-0 z-10 border-t bg-inherit p-4 [@media(max-width:700px)]:fixed [@media(max-width:700px)]:inset-x-0 [@media(max-width:700px)]:z-50 [@media(max-width:700px)]:bg-[var(--paper)]">
            <Button className="w-full" onClick={() => void generateBatch()} disabled={busy || !cities.length}>
              <Download data-icon="inline-start" /> {generateLabel}
            </Button>
          </div>
        </aside>
        <main className="map-art-stage">
          <section aria-label="Map preview" className="flex w-full max-w-[720px] flex-col items-center gap-4">
            <p className="self-start text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</p>
            <Carousel setApi={setCarouselApi} opts={carouselOpts} className="w-full px-12">
              <CarouselContent>
                {slides.map((entry, index) => {
                  const live = slides.length === 1 || index === liveIndex
                  return (
                    <CarouselItem key={`${entry.id}-${index}`} className="flex justify-center">
                      {renderPoster(live ? city : entry, live)}
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
              <CarouselPrevious className="left-0" aria-label="Previous city" disabled={busy || slides.length < 2} />
              <CarouselNext className="right-0" aria-label="Next city" disabled={busy || slides.length < 2} />
            </Carousel>
            <div className="flex flex-col items-center gap-0.5 text-center">
              <h1 className="text-base font-semibold leading-tight">
                {city.name}{city.country && <span className="font-normal">, {city.country}</span>}
              </h1>
              <p className="text-sm text-muted-foreground">
                {style.label} · {orientation === 'portrait' ? '11 MP portrait' : '8 MP landscape'}
                {cities.length > 1 && <span className="tabular-nums"> · {activeIndex + 1} of {cities.length}</span>}
              </p>
            </div>
            <ButtonGroup aria-label="Map zoom and view controls">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom out"
                onClick={() => stepZoom(-0.5)}
                disabled={zoom <= 8}
              >
                <Minus />
              </Button>
              <ButtonGroupText className="w-10 justify-center bg-background px-0 text-xs font-normal tabular-nums">
                {zoom.toFixed(1)}
              </ButtonGroupText>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom in"
                onClick={() => stepZoom(0.5)}
                disabled={zoom >= 16}
              >
                <Plus />
              </Button>
              <ButtonGroupSeparator />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Reset map position"
                title="Recentre"
                onClick={resetView}
              >
                <RotateCcw />
              </Button>
            </ButtonGroup>
          </section>
          {status && (
            <div className="map-art-status flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" role="status">
              <span>{status}</span>
              {busy && <Progress aria-label="Map generation progress" max={progressMax} value={batchProgress} />}
            </div>
          )}
          {artworks.length > 0 && (
            <section className="map-art-gallery">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Collection</p>
                  <h2 className="text-base font-semibold">{artworks.length} finished map{artworks.length === 1 ? '' : 's'}</h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => void downloadAll()} disabled={busy}><Download data-icon="inline-start" /> Download ZIP</Button>
              </div>
              <div className="map-art-gallery-grid">
                {artworks.map((artwork) => (
                  <article key={`${artwork.city.id}-${artwork.createdAt}`} className="group min-w-0">
                    <button type="button" className="block aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted outline-none transition hover:ring-2 hover:ring-ring/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60" disabled={busy} onClick={() => {
                      // Resolve against the current batch: artworks outlive location
                      // edits, so the artwork's city may no longer be in `cities`.
                      const resolved = selectOrAppendCity(cities, artwork.city)
                      if (resolved) {
                        setCities(resolved.cities)
                        setCity(resolved.cities[resolved.index])
                        setActiveIndex(resolved.index)
                        if (resolved.added) {
                          // Keep the review list in step with the batch, like the
                          // recent-location handler, so the city can be reviewed
                          // and removed there.
                          setVerifiedCount(null)
                          setResults(resolved.cities)
                        }
                      } else {
                        // Batch is full and the city is absent; show it on the current slide.
                        setCity(artwork.city)
                      }
                    }}>
                      <img className="size-full object-cover" src={artwork.url} alt={`Map poster of ${artwork.city.name}, ${artwork.city.country}`} />
                    </button>
                    <div className="mt-1.5 flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{artwork.city.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{artwork.city.country}</p>
                      </div>
                      <a href={artwork.url} download={`${artwork.city.name}-map.png`} aria-label={`Download ${artwork.city.name} map`} className={buttonVariants({ variant: 'ghost', size: 'icon-xs' })}><Download /></a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
        <aside className="map-art-right">
          <section className="flex flex-col gap-3 border-b p-4">
            <h2 className="text-sm font-medium">Palette</h2>
            <p className="text-xs text-muted-foreground">{style.label}</p>
            {(['Paper', 'Roads', 'Accent'] as const).map((label, index) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span>{label}</span>
                <span className="flex items-center gap-2 font-mono uppercase text-muted-foreground">{style.swatches[index]}<i className="size-3.5 rounded-sm border" style={{ background: style.swatches[index] }} /></span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-1.5 border-b p-4">
            <h2 className="text-sm font-medium">Labels</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">City title, country and coordinates are typeset on the final poster at full resolution.</p>
          </section>
          <section className="flex flex-col gap-1.5 border-b p-4">
            <h2 className="text-sm font-medium">Export</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">PNG posters are saved to the frame image library. Batches render one at a time to limit tile requests.</p>
          </section>
          <p className="mt-auto p-4 text-[11px] leading-relaxed text-muted-foreground">Vector tiles by OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors</p>
        </aside>
      </div>
    </div>
  )
}
