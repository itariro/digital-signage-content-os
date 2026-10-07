'use client'

import useSWR from 'swr'
import type { FrameStore, LayoutSettings, WeatherData } from '@/lib/types'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

type MutationResult = { store: FrameStore; id?: string }

export function useFrameStore(fallbackData: FrameStore) {
  const { data, mutate } = useSWR<FrameStore>('/api/store', fetcher, {
    fallbackData,
    revalidateOnFocus: false,
  })

  async function call(url: string, method: string, body?: unknown): Promise<MutationResult> {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
    await mutate(json.store, { revalidate: false })
    return json as MutationResult
  }

  return { store: data ?? fallbackData, call }
}

export function useWeather(settings: Pick<LayoutSettings, 'lat' | 'lon' | 'units'>) {
  const key = `/api/weather?lat=${settings.lat}&lon=${settings.lon}&units=${settings.units}`
  const { data } = useSWR<WeatherData>(key, fetcher, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  return data ?? null
}

export type ArtworkResult = { id: string; title: string; subtitle: string; year: string; thumb: string; image: string; genre?: string; description?: string; director?: string; rating?: string }

export function useArtworkSearch(theme: string, query: string, page: number) {
  const trimmed = query.trim()
  const { data, error, isLoading } = useSWR<{ results: ArtworkResult[]; hasMore: boolean }>(
    trimmed.length >= 2 ? `/api/artwork?theme=${theme}&q=${encodeURIComponent(trimmed)}&page=${page}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, keepPreviousData: true },
  )
  return { results: data?.results ?? [], hasMore: data?.hasMore ?? false, error: Boolean(error), isLoading }
}

export function useGeocode(query: string) {
  const trimmed = query.trim()
  const { data, isLoading } = useSWR<{ results: { id: number; name: string; lat: number; lon: number }[] }>(
    trimmed.length >= 2 ? `/api/geocode?q=${encodeURIComponent(trimmed)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  return { results: data?.results ?? [], isLoading }
}
