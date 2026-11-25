'use client'

import { useCallback } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { useFrameStore } from '@/hooks/use-frame-store'
import { CANVAS_LIBRARY_ID } from '@/lib/canvas/ids'
import { emptyCanvasConfig } from '@/lib/canvas/defaults'
import type { Album, CanvasConfig, FrameStore, Slideshow } from '@/lib/types'

export const EMPTY_CANVAS_LIBRARY_STORE: FrameStore = {
  activeId: null,
  layouts: [],
  presets: [],
  customFonts: [],
  schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:30', end: '06:30', brightness: 35, warmth: 40, hideSeconds: true } },
  albums: [],
  experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
}

export type CanvasFrame = {
  id: string
  name: string
  lastSeenAt: string | null
  inCanvas: { canvasId: string; name: string; state: 'scheduled' | 'live' } | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error('Request failed')
  return response.json()
}

async function call(path: string, method: string, body?: unknown): Promise<any> {
  const framed = path.startsWith('/api/layouts') || path.startsWith('/api/albums')
    ? `${path}${path.includes('?') ? '&' : '?'}frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}`
    : path
  const response = await fetch(framed, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? 'Something went wrong')
  await Promise.all([
    mutateCache(`/api/store?frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}`),
    mutateCache('/api/canvas/library'),
  ])
  return json
}

export function useCanvasLibrary() {
  const { store } = useFrameStore(EMPTY_CANVAS_LIBRARY_STORE, CANVAS_LIBRARY_ID)
  const { data } = useSWR<{ store: FrameStore; frames: CanvasFrame[] }>('/api/canvas/library', fetcher, {
    revalidateOnFocus: false,
    fallbackData: { store: EMPTY_CANVAS_LIBRARY_STORE, frames: [] },
  })

  const createLayout = useCallback((name: string, canvas: CanvasConfig = emptyCanvasConfig()) =>
    call('/api/layouts', 'POST', {
      name, kind: 'canvas', canvas, widgets: [],
      settings: { ...EMPTY_CANVAS_LIBRARY_STORE.layouts[0]?.settings ?? {
        resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0,
        units: 'metric', snap: true, gridSize: 20, albumId: null,
      } },
    }), [])

  const updateLayout = useCallback((id: string, layout: any) => call(`/api/layouts/${id}`, 'PUT', {
    name: layout.name,
    kind: 'canvas',
    canvas: layout.canvas,
    widgets: [],
    settings: layout.settings,
  }), [])

  const deleteLayout = useCallback((id: string) => call(`/api/layouts/${id}`, 'DELETE'), [])

  const createAlbum = useCallback((name: string) => call('/api/albums', 'POST', {
    name, theme: 'canvas',
  }), [])

  const updateAlbum = useCallback((id: string, album: Album) => call(`/api/albums/${id}`, 'PUT', {
    name: album.name,
    theme: 'canvas',
    items: [],
    slideshow: album.slideshow,
    scenes: album.scenes ?? [],
  }), [])

  const deleteAlbum = useCallback((id: string) => call(`/api/albums/${id}`, 'DELETE'), [])

  const deploy = useCallback((layoutId: string, options: { leadMs?: number; releaseAt?: number | null } = {}) =>
    call('/api/canvas/deploy', 'POST', { layoutId, ...options }), [])

  const release = useCallback((layoutId: string, leadMs?: number) =>
    call('/api/canvas/release', 'POST', { layoutId, leadMs }), [])

  const identify = useCallback((layoutId: string, seconds: number) =>
    call('/api/canvas/identify', 'POST', { layoutId, seconds }), [])

  return {
    store,
    frames: data?.frames ?? [],
    createLayout,
    updateLayout,
    deleteLayout,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    deploy,
    release,
    identify,
  }
}

export function canvasSlideshow(overrides: Partial<Slideshow> = {}): Slideshow {
  return {
    presentation: 'canvas',
    transition: 'none',
    kenBurns: false,
    interval: 30,
    order: 'sequence',
    artSize: 74,
    artPosition: 'center',
    backdrop: 'blur',
    backdropColor: '#14161b',
    canvas: { crossfadeMs: 400 },
    ...overrides,
  }
}
