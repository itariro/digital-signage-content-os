import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'

export function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function weatherInfo(code: number, isDay = true): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: 'Clear', icon: isDay ? Sun : Moon }
  if (code <= 2) return { label: 'Partly cloudy', icon: isDay ? CloudSun : CloudMoon }
  if (code === 3) return { label: 'Overcast', icon: Cloud }
  if (code <= 48) return { label: 'Fog', icon: CloudFog }
  if (code <= 57) return { label: 'Drizzle', icon: CloudDrizzle }
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Rain', icon: CloudRain }
  if (code <= 77 || code === 85 || code === 86) return { label: 'Snow', icon: CloudSnow }
  return { label: 'Thunderstorm', icon: CloudLightning }
}

export function uvLevel(uv: number) {
  if (uv < 3) return 'Low'
  if (uv < 6) return 'Moderate'
  if (uv < 8) return 'High'
  if (uv < 11) return 'Very high'
  return 'Extreme'
}

export function formatTime(date: Date, hour12: boolean) {
  const h = date.getHours()
  const m = date.getMinutes()
  const s = date.getSeconds()
  const displayHour = hour12 ? h % 12 || 12 : h
  return {
    hours: hour12 ? String(displayHour) : String(displayHour).padStart(2, '0'),
    minutes: String(m).padStart(2, '0'),
    seconds: String(s).padStart(2, '0'),
    meridiem: h < 12 ? 'AM' : 'PM',
  }
}

export function parseLocalTime(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function shortTime(date: Date | null) {
  if (!date) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const SYNODIC_MONTH = 29.530588853
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

export function moonPhase(date: Date) {
  const days = (date.getTime() - REFERENCE_NEW_MOON) / 86_400_000
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  const fraction = age / SYNODIC_MONTH
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  const name = names[Math.floor(fraction * 8 + 0.5) % 8]
  const toFull = (((0.5 - fraction + 1) % 1) * SYNODIC_MONTH) || SYNODIC_MONTH
  const toNew = ((1 - fraction) % 1) * SYNODIC_MONTH || SYNODIC_MONTH
  return { fraction, illumination, name, age, daysToFull: Math.round(toFull), daysToNew: Math.round(toNew) }
}

export function moonPath(fraction: number, r = 40, cx = 50, cy = 50) {
  const waxing = fraction < 0.5
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2
  const rx = r * Math.abs(Math.cos(2 * Math.PI * fraction))
  const crescent = illumination < 0.5
  const outer = waxing ? 1 : 0
  const inner = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0
  return `M${cx} ${cy - r} A${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A${rx.toFixed(2)} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`
}

export function zonedTime(date: Date, timeZone: string, hour12: boolean) {
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12 }
  if (timeZone !== 'local') options.timeZone = timeZone
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const hour = hour12 ? get('hour') : get('hour').padStart(2, '0')
  const dayOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
  if (timeZone !== 'local') dayOptions.timeZone = timeZone
  const there = new Intl.DateTimeFormat('en-CA', dayOptions).format(date)
  const here = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const dayOffset = there === here ? 0 : there > here ? 1 : -1
  return { time: `${hour}:${get('minute')}`, meridiem: get('dayPeriod'), dayOffset }
}

export function daysBetween(from: Date, to: Date) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86_400_000)
}

export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export async function downscaleImage(file: File, maxW = 1080, maxH = 1920): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const ratio = Math.max(maxW / img.width, maxH / img.height)
    const scale = Math.min(1, ratio)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}
