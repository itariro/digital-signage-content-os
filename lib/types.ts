export const FRAME_WIDTH = 1080
export const FRAME_HEIGHT = 1920

export const WIDGET_TYPES = [
  'clock-digital',
  'clock-analog',
  'date',
  'weather',
  'uv',
  'sun',
  'calendar',
  'text',
  'icon',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

export type Align = 'start' | 'center' | 'end'

export type WidgetStyle = {
  fontFamily: string
  fontWeight: number
  letterSpacing: number
  align: Align
  color: string
  accent: string
  bg: string
  bgOpacity: number
  blur: number
  radius: number
  stroke: string
  strokeWidth: number
  textStroke: number
  opacity: number
  shadow: boolean
}

export type WidgetProps = Record<string, string | number | boolean>

export type Widget = {
  id: string
  type: WidgetType
  template: string
  x: number
  y: number
  w: number
  h: number
  locked: boolean
  hidden: boolean
  groupId: string | null
  style: WidgetStyle
  props: WidgetProps
}

export type Resolution = '1080x1920' | '1440x2560'

export type LayoutSettings = {
  resolution: Resolution
  background: string
  dim: number
  locationName: string
  lat: number
  lon: number
  units: 'metric' | 'imperial'
  snap: boolean
  gridSize: number
}

export type Layout = {
  id: string
  name: string
  widgets: Widget[]
  settings: LayoutSettings
  createdAt: string
  updatedAt: string
}

export type Preset = {
  id: string
  name: string
  widgets: Widget[]
  createdAt: string
}

export type FrameStore = {
  activeId: string | null
  layouts: Layout[]
  presets: Preset[]
  customFonts: string[]
}

export type WeatherData = {
  sample: boolean
  current: {
    temp: number
    code: number
    isDay: boolean
    uv: number
  }
  today: {
    high: number
    low: number
    uvMax: number
    sunrise: string
    sunset: string
  }
  daily: { date: string; code: number; max: number; min: number }[]
}
