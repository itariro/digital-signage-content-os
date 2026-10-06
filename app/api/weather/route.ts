import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { WeatherData } from '@/lib/types'

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  units: z.enum(['metric', 'imperial']).default('metric'),
})

function sample(units: 'metric' | 'imperial'): WeatherData {
  const f = (c: number) => (units === 'imperial' ? Math.round(c * 1.8 + 32) : c)
  const today = new Date()
  const iso = (h: number, m: number) => {
    const d = new Date(today)
    d.setHours(h, m, 0, 0)
    return d.toISOString().slice(0, 16)
  }
  return {
    sample: true,
    current: { temp: f(18), code: 2, isDay: true, uv: 4 },
    today: { high: f(21), low: f(11), uvMax: 6, sunrise: iso(6, 48), sunset: iso(19, 12) },
    daily: [2, 3, 61, 1, 0].map((code, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      return { date: d.toISOString().slice(0, 10), code, max: f(21 - i), min: f(11 - (i % 2)) }
    }),
    hourly: Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today)
      d.setHours(today.getHours() + i, 0, 0, 0)
      const hour = d.getHours()
      return {
        time: d.toISOString().slice(0, 16),
        code: [2, 2, 3, 61, 61, 3, 2, 1, 0, 0, 1, 2][i],
        temp: f(Math.round(14 + 5 * Math.sin(((hour - 8) / 24) * Math.PI * 2))),
        isDay: hour >= 7 && hour < 19,
        precip: [5, 10, 30, 70, 60, 25, 10, 5, 0, 0, 5, 10][i],
      }
    }),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
  const { lat, lon, units } = parsed.data

  const api = new URL('https://api.open-meteo.com/v1/forecast')
  api.searchParams.set('latitude', String(lat))
  api.searchParams.set('longitude', String(lon))
  api.searchParams.set('current', 'temperature_2m,weather_code,is_day,uv_index')
  api.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max')
  api.searchParams.set('timezone', 'auto')
  api.searchParams.set('hourly', 'temperature_2m,weather_code,is_day,precipitation_probability')
  api.searchParams.set('forecast_days', '5')
  api.searchParams.set('forecast_hours', '12')
  if (units === 'imperial') api.searchParams.set('temperature_unit', 'fahrenheit')

  try {
    const res = await fetch(api, { next: { revalidate: 900 } })
    if (!res.ok) throw new Error(`Weather ${res.status}`)
    const json = await res.json()
    const daily = json.daily
    const data: WeatherData = {
      sample: false,
      current: {
        temp: Math.round(json.current.temperature_2m),
        code: json.current.weather_code,
        isDay: json.current.is_day === 1,
        uv: Math.round((json.current.uv_index ?? 0) * 10) / 10,
      },
      today: {
        high: Math.round(daily.temperature_2m_max[0]),
        low: Math.round(daily.temperature_2m_min[0]),
        uvMax: Math.round((daily.uv_index_max[0] ?? 0) * 10) / 10,
        sunrise: daily.sunrise[0],
        sunset: daily.sunset[0],
      },
      daily: daily.time.map((date: string, i: number) => ({
        date,
        code: daily.weather_code[i],
        max: Math.round(daily.temperature_2m_max[i]),
        min: Math.round(daily.temperature_2m_min[i]),
      })),
      hourly: (json.hourly?.time ?? []).map((time: string, i: number) => ({
        time,
        code: json.hourly.weather_code[i],
        temp: Math.round(json.hourly.temperature_2m[i]),
        isDay: json.hourly.is_day[i] === 1,
        precip: json.hourly.precipitation_probability?.[i] ?? 0,
      })),
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(sample(units))
  }
}
