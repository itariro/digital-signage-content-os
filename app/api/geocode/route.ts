import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = z.string().trim().min(2).max(80).safeParse(q)
  if (!parsed.success) return NextResponse.json({ results: [] })

  const api = new URL('https://geocoding-api.open-meteo.com/v1/search')
  api.searchParams.set('name', parsed.data)
  api.searchParams.set('count', '6')
  api.searchParams.set('language', 'en')

  try {
    const res = await fetch(api, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error('geocode failed')
    const json = await res.json()
    const results = (json.results ?? []).map(
      (r: { id: number; name: string; country?: string; admin1?: string; latitude: number; longitude: number }) => ({
        id: r.id,
        name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        lat: r.latitude,
        lon: r.longitude,
      }),
    )
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
