import type { WeatherData } from './types'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const cache = new Map<string, { data: WeatherData; expiresAt: number }>()

function cacheKey(lat: number, lon: number, units: string): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${units}`
}

export async function fetchWeather(lat: number, lon: number, units: string): Promise<WeatherData> {
  const key = cacheKey(lat, lon, units)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=5`
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)
    const json = await res.json()

    const data: WeatherData = {
      sample: false,
      current: {
        temp: json.current.temperature_2m,
        code: json.current.weather_code,
        isDay: json.current.is_day === 1,
        uv: json.current.uv_index,
      },
      today: {
        high: json.daily.temperature_2m_max[0],
        low: json.daily.temperature_2m_min[0],
        uvMax: json.daily.uv_index_max[0],
        sunrise: json.daily.sunrise[0],
        sunset: json.daily.sunset[0],
      },
      daily: json.daily.time.map((date: string, i: number) => ({
        date,
        code: json.daily.weather_code?.[i] ?? 0,
        max: json.daily.temperature_2m_max[i],
        min: json.daily.temperature_2m_min[i],
        rainProbability: json.daily.precipitation_probability_max?.[i] ?? 0,
      })),
      hourly: (json.hourly?.time ?? []).slice(0, 12).map((time: string, i: number) => ({
        time,
        code: json.hourly.weather_code[i],
        temp: json.hourly.temperature_2m[i],
        isDay: true,
        precip: json.hourly.precipitation_probability?.[i] ?? 0,
      })),
    }

    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  } catch (error) {
    console.error('Weather fetch failed:', error)
    return getSampleWeather()
  }
}

function getSampleWeather(): WeatherData {
  const today = new Date()
  const iso = (h: number, m: number) => {
    const d = new Date(today)
    d.setHours(h, m, 0, 0)
    return d.toISOString().slice(0, 16)
  }
  return {
    sample: true,
    current: { temp: 20, code: 1, isDay: true, uv: 5 },
    today: { high: 25, low: 15, uvMax: 6, sunrise: iso(6, 48), sunset: iso(19, 12) },
    daily: [],
    hourly: [],
  }
}
