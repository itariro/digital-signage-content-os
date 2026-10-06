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
