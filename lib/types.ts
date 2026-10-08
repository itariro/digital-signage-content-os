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
  'world-clock',
  'hourly',
  'moon',
  'countdown',
  'quote',
  'now-showing',
  'bob',
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
  albumId: string | null
}

export const ALBUM_THEMES = ['movies', 'tv', 'books', 'music', 'photos'] as const
export type AlbumTheme = (typeof ALBUM_THEMES)[number]

export const PRESENTATIONS = ['fill', 'poster', 'book', 'vinyl', 'gallery'] as const
export type Presentation = (typeof PRESENTATIONS)[number]

export type AlbumItem = {
  id: string
  image: string
  sourceUrl: string
  title: string
  subtitle: string
  year: string
  genre?: string
  description?: string
  director?: string
  rating?: string
}

export type Slideshow = {
  presentation: Presentation
  transition: 'fade' | 'slide' | 'zoom' | 'none'
  kenBurns: boolean
  interval: number
  order: 'sequence' | 'shuffle'
  artSize: number
  artPosition: 'top' | 'center' | 'bottom'
  backdrop: 'blur' | 'solid'
  backdropColor: string
}

export type Album = {
  id: string
  name: string
  theme: AlbumTheme
  items: AlbumItem[]
  slideshow: Slideshow
  createdAt: string
  updatedAt: string
}

export type ActiveSlide = {
  item: AlbumItem
  theme: AlbumTheme
  albumName: string
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

export type ScheduleRule = {
  id: string
  layoutId: string
  days: number[]
  start: string
  end: string
}

export type NightMode = {
  enabled: boolean
  start: string
  end: string
  brightness: number
  warmth: number
  hideSeconds: boolean
}

export type FrameSchedule = {
  enabled: boolean
  rules: ScheduleRule[]
  night: NightMode
}

export type FrameStore = {
  activeId: string | null
  layouts: Layout[]
  presets: Preset[]
  customFonts: string[]
  schedule: FrameSchedule
  albums: Album[]
  experiences: Experiences
}

// Bob Engine types
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export type DisplayState =
  | 'ambient' | 'information' | 'action' | 'celebration'
  | 'activity' | 'gallery' | 'weather' | 'family'

export type BobExpression =
  | 'thinking' | 'action' | 'celebrate' | 'idea' | 'reminder' | 'success'
  | 'exercise' | 'talking' | 'planning' | 'building' | 'reading' | 'happy'

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { days: Weekday[] }
  | { time: { from: string; to: string } }
  | { schoolDay: boolean }
  | { weather: {
      rainProbabilityAbove?: number
      temperatureAbove?: number
      temperatureBelow?: number
      uvAbove?: number
    } }
  | { specialTag: string }

export interface ExperienceRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  when: Condition
  then: {
    layoutId: string
    state: DisplayState
    bob?: { expression: BobExpression; speech?: string }
    score: number
    durationMs: number
    reason?: string
  }
}

export interface ExperienceSettings {
  schoolHolidays: string[]
  timezone?: string
}

export interface Experiences {
  enabled: boolean
  rules: ExperienceRule[]
  settings: ExperienceSettings
}

export interface DisplayDecision {
  id: string
  state: DisplayState
  layoutId: string
  bob?: { expression: BobExpression; speech?: string } | null
  priority: number
  score: number
  reason: string
  ruleId: string | null
  durationMs: number
  generatedAt: string
}

export interface ExperienceContext {
  now: string
  date: { iso: string; day: string; dayNumber: number; month: string; year: number }
  weekday: Weekday
  period: 'night' | 'morning' | 'day' | 'welcome-home' | 'evening' | 'wind-down'
  schoolDay: boolean
  weather?: import('./types').WeatherData
  specialTags: string[]
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
  daily: { date: string; code: number; max: number; min: number; rainProbability?: number }[]
  hourly: { time: string; code: number; temp: number; isDay: boolean; precip: number }[]
}
