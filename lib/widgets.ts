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
  type LucideIcon,
} from 'lucide-react'
import type { Widget, WidgetStyle, WidgetType, WidgetProps } from './types'
import { FRAME_WIDTH } from './types'

export type PropField =
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'text' }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }

export type WidgetDefinition = {
  type: WidgetType
  label: string
  description: string
  category: 'Time' | 'Weather' | 'Planner' | 'Decor'
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
