import { nanoid } from 'nanoid'
import {
  CalendarDays,
  Clock,
  Clock3,
  CloudSun,
  Shapes,
  Sunrise,
  SunMedium,
  Type,
  CalendarClock,
  CloudSunRain,
  Globe,
  MoonStar,
  Quote,
  Timer,
  GalleryHorizontalEnd,
  Smile,
  type LucideIcon,
} from 'lucide-react'
import type { Widget, WidgetStyle, WidgetType, WidgetProps } from './types'
import { FRAME_WIDTH } from './types'

export type PropField = (
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'date' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
) & { showWhen?: { key: string; value: string } }

export type WidgetDefinition = {
  type: WidgetType
  label: string
  description: string
  category: 'Time' | 'Weather' | 'Planner' | 'Decor' | 'Family'
  icon: LucideIcon
  size: { w: number; h: number }
  minSize: { w: number; h: number }
  lockAspect: boolean
  templates: { id: string; label: string }[]
  props: WidgetProps
  fields: PropField[]
  style?: Partial<WidgetStyle>
}

export const DEFAULT_STYLE: WidgetStyle = {
  fontFamily: 'inter',
  fontWeight: 500,
  letterSpacing: 0,
  align: 'center',
  color: '#ffffff',
  accent: '#7cc4ff',
  bg: '#0b0c10',
  bgOpacity: 0,
  blur: 0,
  radius: 32,
  stroke: '#ffffff',
  strokeWidth: 0,
  textStroke: 0,
  opacity: 100,
  shadow: true,
}

export const ICON_CHOICES = [
  'heart',
  'star',
  'sparkles',
  'flower',
  'leaf',
  'mountain',
  'sun',
  'moon',
  'home',
  'coffee',
  'music',
  'camera',
  'plane',
  'cake',
] as const

export const TIME_ZONES = [
  { value: 'local', label: 'Frame local time' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
]

function defaultCountdownTarget() {
  const d = new Date()
  d.setMonth(11, 25)
  if (d.getTime() < Date.now()) d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'clock-digital',
    label: 'Digital clock',
    description: 'Large lockscreen time',
    category: 'Time',
    icon: Clock3,
    size: { w: 760, h: 300 },
    minSize: { w: 160, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'classic', label: 'Classic' },
      { id: 'stacked', label: 'Stacked' },
      { id: 'split', label: 'Split weight' },
      { id: 'outline', label: 'Outline' },
      { id: 'seconds', label: 'With seconds' },
    ],
    props: { hour12: false, meridiem: true },
    fields: [
      { key: 'hour12', label: '12-hour time', kind: 'toggle' },
      { key: 'meridiem', label: 'Show AM / PM', kind: 'toggle' },
    ],
    style: { fontWeight: 600, letterSpacing: -2 },
  },
  {
    type: 'clock-analog',
    label: 'Analog clock',
    description: 'Watch face with hands',
    category: 'Time',
    icon: Clock,
    size: { w: 420, h: 420 },
    minSize: { w: 80, h: 80 },
    lockAspect: true,
    templates: [
      { id: 'minimal', label: 'Minimal' },
      { id: 'ticks', label: 'Ticks' },
      { id: 'numerals', label: 'Numerals' },
      { id: 'ring', label: 'Ring' },
    ],
    props: { seconds: true },
    fields: [{ key: 'seconds', label: 'Second hand', kind: 'toggle' }],
    style: { bgOpacity: 25, blur: 20, radius: 210 },
  },
  {
    type: 'date',
    label: 'Date',
    description: 'Day, date and month',
    category: 'Time',
    icon: CalendarClock,
    size: { w: 700, h: 80 },
    minSize: { w: 120, h: 30 },
    lockAspect: false,
    templates: [
      { id: 'long', label: 'Long' },
      { id: 'compact', label: 'Compact' },
      { id: 'stacked', label: 'Stacked' },
    ],
    props: { uppercase: false },
    fields: [{ key: 'uppercase', label: 'Uppercase', kind: 'toggle' }],
    style: { fontWeight: 500 },
  },
  {
    type: 'weather',
    label: 'Weather',
    description: 'Current conditions & forecast',
    category: 'Weather',
    icon: CloudSun,
    size: { w: 480, h: 200 },
    minSize: { w: 120, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'compact', label: 'Compact' },
      { id: 'detailed', label: 'Detailed' },
      { id: 'forecast', label: '5-day' },
    ],
    props: { showLocation: true },
    fields: [{ key: 'showLocation', label: 'Show location', kind: 'toggle' }],
    style: { bgOpacity: 30, blur: 24 },
  },
  {
    type: 'uv',
    label: 'UV index',
    description: 'Sun exposure gauge',
    category: 'Weather',
    icon: SunMedium,
    size: { w: 280, h: 280 },
    minSize: { w: 80, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'ring', label: 'Ring' },
      { id: 'bar', label: 'Bar' },
    ],
    props: {},
    fields: [],
    style: { bgOpacity: 30, blur: 24, accent: '#ffd36e' },
  },
  {
    type: 'sun',
    label: 'Sunrise & sunset',
    description: 'Daylight tracker',
    category: 'Weather',
    icon: Sunrise,
    size: { w: 620, h: 280 },
    minSize: { w: 160, h: 80 },
    lockAspect: false,
    templates: [
      { id: 'arc', label: 'Arc' },
      { id: 'times', label: 'Times' },
    ],
    props: {},
    fields: [],
    style: { bgOpacity: 30, blur: 24, accent: '#ffb86b' },
  },
  {
    type: 'calendar',
    label: 'Calendar',
    description: 'Month or week view',
    category: 'Planner',
    icon: CalendarDays,
    size: { w: 600, h: 560 },
    minSize: { w: 160, h: 80 },
    lockAspect: false,
    templates: [
      { id: 'month', label: 'Month' },
      { id: 'week', label: 'Week' },
    ],
    props: { weekStart: 'mon' },
    fields: [
      {
        key: 'weekStart',
        label: 'Week starts on',
        kind: 'select',
        options: [
          { value: 'mon', label: 'Monday' },
          { value: 'sun', label: 'Sunday' },
        ],
      },
    ],
    style: { bgOpacity: 30, blur: 24 },
  },
  {
    type: 'text',
    label: 'Text',
    description: 'Caption or greeting',
    category: 'Decor',
    icon: Type,
    size: { w: 640, h: 110 },
    minSize: { w: 80, h: 30 },
    lockAspect: false,
    templates: [
      { id: 'plain', label: 'Plain' },
      { id: 'caption', label: 'Caption' },
    ],
    props: { text: 'Good morning' },
    fields: [{ key: 'text', label: 'Text', kind: 'text' }],
    style: { fontFamily: 'instrument', fontWeight: 400 },
  },
  {
    type: 'icon',
    label: 'Icon',
    description: 'Decorative symbol',
    category: 'Decor',
    icon: Shapes,
    size: { w: 160, h: 160 },
    minSize: { w: 40, h: 40 },
    lockAspect: true,
    templates: [
      { id: 'line', label: 'Line' },
      { id: 'badge', label: 'Badge' },
    ],
    props: { icon: 'heart' },
    fields: [
      {
        key: 'icon',
        label: 'Symbol',
        kind: 'select',
        options: ICON_CHOICES.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })),
      },
    ],
  },
  {
    type: 'world-clock',
    label: 'World clock',
    description: 'Time in other cities',
    category: 'Time',
    icon: Globe,
    size: { w: 640, h: 260 },
    minSize: { w: 200, h: 80 },
    lockAspect: false,
    templates: [
      { id: 'cards', label: 'Cards' },
      { id: 'list', label: 'List' },
    ],
    props: { zone1: 'Europe/London', zone2: 'America/New_York', zone3: 'Asia/Tokyo', hour12: false },
    fields: [
      { key: 'zone1', label: 'City 1', kind: 'select', options: TIME_ZONES },
      { key: 'zone2', label: 'City 2', kind: 'select', options: [{ value: 'none', label: 'None' }, ...TIME_ZONES] },
      { key: 'zone3', label: 'City 3', kind: 'select', options: [{ value: 'none', label: 'None' }, ...TIME_ZONES] },
      { key: 'hour12', label: '12-hour time', kind: 'toggle' },
    ],
    style: { bgOpacity: 30, blur: 24 },
  },
  {
    type: 'hourly',
    label: 'Hourly forecast',
    description: 'Next hours at a glance',
    category: 'Weather',
    icon: CloudSunRain,
    size: { w: 800, h: 240 },
    minSize: { w: 240, h: 80 },
    lockAspect: false,
    templates: [
      { id: 'row', label: 'Row' },
      { id: 'chart', label: 'Chart' },
    ],
    props: { hours: '6', showRain: true },
    fields: [
      {
        key: 'hours',
        label: 'Hours shown',
        kind: 'select',
        options: [
          { value: '4', label: '4 hours' },
          { value: '6', label: '6 hours' },
          { value: '8', label: '8 hours' },
          { value: '12', label: '12 hours' },
        ],
      },
      { key: 'showRain', label: 'Chance of rain', kind: 'toggle' },
    ],
    style: { bgOpacity: 30, blur: 24 },
  },
  {
    type: 'moon',
    label: 'Moon phase',
    description: 'Tonight’s moon',
    category: 'Weather',
    icon: MoonStar,
    size: { w: 280, h: 280 },
    minSize: { w: 80, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'disc', label: 'Disc' },
      { id: 'details', label: 'Details' },
    ],
    props: { showName: true },
    fields: [{ key: 'showName', label: 'Show phase name', kind: 'toggle' }],
    style: { bgOpacity: 30, blur: 24, accent: '#f3ecd2' },
  },
  {
    type: 'countdown',
    label: 'Countdown',
    description: 'Days until an event',
    category: 'Planner',
    icon: Timer,
    size: { w: 480, h: 220 },
    minSize: { w: 140, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'big', label: 'Big number' },
      { id: 'ring', label: 'Ring' },
      { id: 'inline', label: 'Inline' },
    ],
    props: { label: 'Christmas', target: defaultCountdownTarget(), start: new Date().toISOString().slice(0, 10) },
    fields: [
      { key: 'label', label: 'Event name', kind: 'text' },
      { key: 'target', label: 'Event date', kind: 'date' },
      { key: 'start', label: 'Counting from', kind: 'date' },
    ],
    style: { bgOpacity: 30, blur: 24, accent: '#ff8fa3' },
  },
  {
    type: 'quote',
    label: 'Daily quote',
    description: 'A new line every day',
    category: 'Decor',
    icon: Quote,
    size: { w: 840, h: 240 },
    minSize: { w: 200, h: 60 },
    lockAspect: false,
    templates: [
      { id: 'serif', label: 'Editorial' },
      { id: 'marks', label: 'Quote marks' },
    ],
    props: { mode: 'daily', text: 'The best things in life are the people we love.', author: '' },
    fields: [
      {
        key: 'mode',
        label: 'Source',
        kind: 'select',
        options: [
          { value: 'daily', label: 'Rotate daily' },
          { value: 'custom', label: 'My own words' },
        ],
      },
      { key: 'text', label: 'Custom quote', kind: 'text', showWhen: { key: 'mode', value: 'custom' } },
      { key: 'author', label: 'Attribution', kind: 'text', showWhen: { key: 'mode', value: 'custom' } },
    ],
    style: { fontFamily: 'instrument', fontWeight: 400 },
  },
  {
    type: 'now-showing',
    label: 'Now showing',
    description: 'Caption for the current album slide',
    category: 'Decor',
    icon: GalleryHorizontalEnd,
    size: { w: 840, h: 220 },
    minSize: { w: 200, h: 50 },
    lockAspect: false,
    templates: [
      { id: 'card', label: 'Title card' },
      { id: 'marquee', label: 'Marquee' },
      { id: 'title', label: 'Title only' },
    ],
    props: { showLabel: true, label: '', showYear: true, showGenre: false, showDescription: false, showDirector: false, showRating: false },
    fields: [
      { key: 'showLabel', label: 'Show label', kind: 'toggle' },
      { key: 'label', label: 'Label (blank uses theme)', kind: 'text' },
      { key: 'showYear', label: 'Show year', kind: 'toggle' },
      { key: 'showGenre', label: 'Show genre', kind: 'toggle' },
      { key: 'showDescription', label: 'Show synopsis / summary', kind: 'toggle' },
      { key: 'showDirector', label: 'Show director', kind: 'toggle' },
      { key: 'showRating', label: 'Show rating', kind: 'toggle' },
    ],
  },
  {
    type: 'bob',
    label: 'Bob',
    description: 'FamilyOS Bob character',
    category: 'Family',
    icon: Smile,
    size: { w: 360, h: 480 },
    minSize: { w: 120, h: 160 },
    lockAspect: true,
    templates: [
      { id: 'plain', label: 'Plain' },
      { id: 'speech', label: 'Speech' },
      { id: 'badge', label: 'Badge' },
    ],
    props: {
      source: 'fixed',
      expression: 'happy',
      speech: '',
      animate: false,
    },
    fields: [
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        options: [
          { value: 'fixed', label: 'Fixed' },
          { value: 'decision', label: 'Follow Decision' },
        ],
      },
      {
        key: 'expression',
        label: 'Expression',
        kind: 'select',
        options: [
          { value: 'thinking', label: 'Thinking' },
          { value: 'action', label: 'Action' },
          { value: 'celebrate', label: 'Celebrate' },
          { value: 'idea', label: 'Idea' },
          { value: 'reminder', label: 'Reminder' },
          { value: 'success', label: 'Success' },
          { value: 'exercise', label: 'Exercise' },
          { value: 'talking', label: 'Talking' },
          { value: 'planning', label: 'Planning' },
          { value: 'building', label: 'Building' },
          { value: 'reading', label: 'Reading' },
          { value: 'happy', label: 'Happy' },
        ],
        showWhen: { key: 'source', value: 'fixed' },
      },
      { key: 'speech', label: 'Speech', kind: 'text' },
      { key: 'animate', label: 'Animate', kind: 'toggle' },
    ],
  },
]

export const STYLE_THEMES: { id: string; name: string; style: Partial<WidgetStyle> }[] = [
  { id: 'frost', name: 'Frost', style: { color: '#ffffff', accent: '#7cc4ff', bg: '#0b0c10', stroke: '#ffffff' } },
  { id: 'ember', name: 'Ember', style: { color: '#fff4e6', accent: '#ffb86b', bg: '#2a1508', stroke: '#ffd9b0' } },
  { id: 'bloom', name: 'Bloom', style: { color: '#fff1f4', accent: '#ff8fa3', bg: '#2b0d17', stroke: '#ffc7d2' } },
  { id: 'meadow', name: 'Meadow', style: { color: '#f1fff8', accent: '#9be7c4', bg: '#0a2018', stroke: '#c9f5e0' } },
  { id: 'ink', name: 'Ink', style: { color: '#0b0c10', accent: '#3a5bd9', bg: '#ffffff', stroke: '#0b0c10' } },
]

export function getDefinition(type: WidgetType) {
  return WIDGETS.find((w) => w.type === type) ?? WIDGETS[0]
}

export function createWidget(type: WidgetType, center?: { x: number; y: number }): Widget {
  const def = getDefinition(type)
  const cx = center?.x ?? FRAME_WIDTH / 2
  const cy = center?.y ?? 700
  return {
    id: nanoid(10),
    type,
    template: def.templates[0].id,
    x: Math.round(cx - def.size.w / 2),
    y: Math.round(cy - def.size.h / 2),
    w: def.size.w,
    h: def.size.h,
    locked: false,
    hidden: false,
    groupId: null,
    style: { ...DEFAULT_STYLE, ...def.style },
    props: { ...def.props },
  }
}

function place(type: WidgetType, x: number, y: number, w: number, h: number, extra?: Partial<Widget>): Widget {
  const base = createWidget(type)
  return { ...base, x, y, w, h, ...extra, style: { ...base.style, ...extra?.style }, props: { ...base.props, ...extra?.props } }
}

export type BuiltinCombo = { id: string; name: string; description: string; build: () => Widget[] }

export const BUILTIN_COMBOS: BuiltinCombo[] = [
  {
    id: 'combo-lockscreen',
    name: 'Lockscreen stack',
    description: 'Date over a big clock',
    build: () => [
      place('date', 0, 0, 640, 70, { template: 'long' }),
      place('clock-digital', 0, 80, 640, 260, { template: 'classic' }),
    ],
  },
  {
    id: 'combo-weather-strip',
    name: 'Weather strip',
    description: 'Weather, UV and daylight',
    build: () => [
      place('weather', 0, 0, 420, 200, { template: 'compact' }),
      place('uv', 440, 0, 200, 200, { template: 'ring' }),
      place('sun', 0, 220, 640, 240, { template: 'arc' }),
    ],
  },
  {
    id: 'combo-desk',
    name: 'Desk companion',
    description: 'Analog clock with calendar',
    build: () => [
      place('clock-analog', 0, 0, 300, 300, { template: 'ticks' }),
      place('calendar', 320, 0, 320, 300, { template: 'month' }),
    ],
  },
  {
    id: 'combo-forecast',
    name: 'Forecast deck',
    description: 'Now, next hours and the week',
    build: () => [
      place('weather', 0, 0, 800, 200, { template: 'detailed' }),
      place('hourly', 0, 220, 800, 220, { template: 'row' }),
      place('weather', 0, 460, 800, 240, { template: 'forecast', props: { showLocation: false } }),
    ],
  },
  {
    id: 'combo-night-sky',
    name: 'Night sky',
    description: 'Clock, moon and sunrise',
    build: () => [
      place('clock-digital', 0, 0, 640, 220, { template: 'classic', style: { fontWeight: 300 } as WidgetStyle }),
      place('moon', 0, 240, 310, 220, { template: 'disc' }),
      place('sun', 330, 240, 310, 220, { template: 'times' }),
    ],
  },
  {
    id: 'combo-family',
    name: 'Family board',
    description: 'Countdown with a daily quote',
    build: () => [
      place('countdown', 0, 0, 640, 220, { template: 'ring' }),
      place('quote', 0, 240, 640, 220, { template: 'marks' }),
    ],
  },
]

export function instantiateGroup(widgets: Widget[], center: { x: number; y: number }): Widget[] {
  const minX = Math.min(...widgets.map((w) => w.x))
  const minY = Math.min(...widgets.map((w) => w.y))
  const maxX = Math.max(...widgets.map((w) => w.x + w.w))
  const maxY = Math.max(...widgets.map((w) => w.y + w.h))
  const offsetX = center.x - (maxX - minX) / 2 - minX
  const offsetY = center.y - (maxY - minY) / 2 - minY
  const groupId = widgets.length > 1 ? nanoid(8) : null
  return widgets.map((w) => ({
    ...structuredClone(w),
    id: nanoid(10),
    x: Math.round(w.x + offsetX),
    y: Math.round(w.y + offsetY),
    groupId,
  }))
}

export function normalizeGroup(widgets: Widget[]): Widget[] {
  const minX = Math.min(...widgets.map((w) => w.x))
  const minY = Math.min(...widgets.map((w) => w.y))
  return widgets.map((w) => ({ ...structuredClone(w), x: w.x - minX, y: w.y - minY, groupId: null }))
}
