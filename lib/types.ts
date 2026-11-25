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
  'sticker',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

export type Align = 'start' | 'center' | 'end'

export type GradientDef = { type: 'linear' | 'radial'; angle: number; stops: { color: string; position: number }[] }
export type ImageFillDef = { url: string; fit: 'cover' | 'contain' | 'repeat'; scale: number; position: number }
export type TextFill = { kind: 'solid'; color: string } | { kind: 'gradient'; gradient: GradientDef } | { kind: 'image'; image: ImageFillDef }
export type TextStrokeCfg = { enabled: boolean; color: string; thickness: number; opacity: number; align: 'inside' | 'outside' | 'center' }
export type ShadowPresetId = 'none' | 'drop' | 'contact' | 'long' | 'curved'
export type LightingShadow = { preset: ShadowPresetId; distance: number; blur: number; opacity: number; angle: number; color: string; steps?: number; spread?: number }

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
  fill?: TextFill
  textStrokeCfg?: TextStrokeCfg
  lightingShadow?: LightingShadow
}

export type WidgetProps = Record<string, string | number | boolean>

export type StickerLayer = {
  id: string
  text: string
  x: number
  y: number
  w: number
  h: number
  style: WidgetStyle
}

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
  layers?: StickerLayer[]
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

export const ALBUM_THEMES = ['movies', 'tv', 'books', 'music', 'photos', 'map-art', 'canvas'] as const
export type AlbumTheme = (typeof ALBUM_THEMES)[number]

export const PRESENTATIONS = ['fill', 'poster', 'book', 'vinyl', 'gallery', 'mosaic', 'reveal', 'canvas'] as const
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
  artist?: string
}

export type MapArtLocation = {
  id: number
  name: string
  lat: number
  lon: number
  country?: string
  region?: string
}

export type MapArtAmbiguity = {
  query: string
  rowId: number
  chosenId: number
  matches: MapArtLocation[]
}

export type MapArtSettings = {
  mode: 'cities' | 'continent'
  query: string
  continent: string
  count: string
  customCount: number
  cities: MapArtLocation[]
  results: MapArtLocation[]
  ambiguities: MapArtAmbiguity[]
  city: MapArtLocation
  activeIndex: number
  styleId: 'classic' | 'minimal' | 'topographic' | 'vintage' | 'dark'
  title: boolean
  showCoords: boolean
  orientation: 'portrait' | 'landscape'
  zoom: number
  backgroundColor: string
  streetLabels: 'major' | 'all' | 'none'
  showRailways: boolean
  showTrails: boolean
  customText: string
}

export type Mosaic = {
  tilesAcross: number
  gap: number
  effect: 'flip' | 'fade' | 'zoom' | 'none'
}

export type RevealGroup = 'single' | 'pair' | 'quad' | 'row'
export type RevealEffect = 'fade' | 'none'

export type Reveal = {
  tilesAcross: number
  tilesDown: number
  gap: number
  group: RevealGroup
  effect: RevealEffect
}

export type SubjectPortrait = {
  name: string
  type: 'search' | 'upload'
  image: string
  sourceUrl: string
  imagePosition: 'top' | 'center' | 'bottom'
  artist?: string
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
  mosaic?: Mosaic
  reveal?: Reveal
  canvas?: { crossfadeMs: number }
}

export type Album = {
  id: string
  name: string
  theme: AlbumTheme
  items: AlbumItem[]
  slideshow: Slideshow
  mapArt?: MapArtSettings
  subject?: SubjectPortrait | null
  subjects?: SubjectPortrait[]
  scenes?: CanvasScene[]
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
  kind?: LayoutKind
  canvas?: CanvasConfig
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Multi-frame canvas
// ---------------------------------------------------------------------------

export type LayoutKind = 'frame' | 'canvas'
export type CanvasArrangement = 'row' | 'column' | 'grid'

export type CanvasSlot = {
  id: string
  frameId: string | null
  label?: string
  offset: { x: number; y: number }
  scale: number
  rotation?: 0 | 90 | 180 | 270
}

export type CanvasConfig = {
  arrangement: CanvasArrangement
  gridColumns?: number
  gap: number
  align: Align
  slots: CanvasSlot[]
  background: string
  markers: 'identify' | 'always' | 'never'
  notifications: 'suppress' | 'show'
  nightMode: 'inherit' | 'ignore'
  maxFps: 15 | 24 | 30 | 60
  bezelMode?: 'show' | 'hide' | 'collapse'
  unitMode?: 'pixels' | 'physical'
  screenWidthMm?: number
  screenHeightMm?: number
}

export type CanvasSceneType = 'marquee' | 'bounce' | 'pong' | 'sync-test'

export type MarqueeStrip = {
  lengthPx: number
  crossPx: number
  segments: { text: string; at: number; w: number }[]
}

export type MarqueeConfig = {
  lines: string[]
  layout: 'line' | 'block'
  separator: string
  direction: 'left' | 'right' | 'up' | 'down'
  orientation: 'upright' | 'rotated'
  speed: number
  repeat: boolean
  gap: number
  lineHeight: number
  fontSize: number
  align: Align
  crossOffset: number
  style: WidgetStyle
  strip?: MarqueeStrip
}

export type BounceLogo =
  | { kind: 'text'; text: string; shape: 'none' | 'ellipse' | 'pill' | 'rounded'; style: WidgetStyle; w: number; h: number }
  | { kind: 'image'; src: string; w: number; h: number }

export type BounceConfig = {
  logo: BounceLogo
  speed: number
  angleDeg: number | null
  startMode: 'seed' | 'center'
  tint: { mode: 'cycle' | 'fixed' | 'none'; colors: string[]; fixed: string }
  cornerCelebration: boolean
  trail: { enabled: boolean; length: number; spacingMs: number }
}

export type PongConfig = {
  axis: 'auto' | 'horizontal' | 'vertical'
  paddle: { w: number; h: number; inset: number }
  ballSize: number
  baseSpeed: number
  rallyHits: [number, number]
  pointsPerMatch: number
  serveDelayMs: number
  pointPauseMs: number
  showScore: boolean
  colors: { ball: string; paddles: string; net: string; text: string }
  scoreStyle: WidgetStyle
}

export type SyncTestConfig = {
  periodSec: number
  showGrid: boolean
  showBezels: boolean
}

export type CanvasSceneBase = {
  id: string
  name: string
  enabled: boolean
  durationSec: number
  seed: number
}

export type CanvasScene =
  | (CanvasSceneBase & { type: 'marquee'; config: MarqueeConfig })
  | (CanvasSceneBase & { type: 'bounce'; config: BounceConfig })
  | (CanvasSceneBase & { type: 'pong'; config: PongConfig })
  | (CanvasSceneBase & { type: 'sync-test'; config: SyncTestConfig })

export type DeploymentAlbum = {
  id: string
  name: string
  scenes: CanvasScene[]
  order: 'sequence' | 'shuffle'
  crossfadeMs: number
}

export type CanvasDeployment = {
  canvasId: string
  name: string
  revision: number
  effectiveAt: number
  releaseAt: number | null
  slotId: string
  config: CanvasConfig
  album: DeploymentAlbum | null
}

export type CanvasIdentify = {
  until: number
  canvasName: string
  frameId: string
  label: string | null
  marker: number
  count: number
}

export type CanvasState = {
  v: 1
  active: CanvasDeployment | null
  pending: CanvasDeployment | null
  identify: CanvasIdentify | null
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

export type FrameNotification = {
  id: string
  title: string
  message?: string
  variant: 'info' | 'success' | 'warning' | 'error' | 'reminder'
  durationMs: number
  createdAt: string
  eventKey?: string
  resolution?: string
  actionUrl?: string
}

export type FrameStore = {
  activeId: string | null
  layouts: Layout[]
  presets: Preset[]
  customFonts: string[]
  schedule: FrameSchedule
  albums: Album[]
  experiences: Experiences
  notifications?: FrameNotification[]
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
