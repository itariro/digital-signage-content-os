import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weather'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '47.3769')
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '8.5417')
  const units = req.nextUrl.searchParams.get('units') || 'metric'

  const data = await fetchWeather(lat, lon, units)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
