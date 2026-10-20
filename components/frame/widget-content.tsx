'use client'

import type { CSSProperties, SyntheticEvent } from 'react'
import {
  Cake,
  Camera,
  Coffee,
  Flower2,
  Heart,
  House,
  Leaf,
  Moon,
  Mountain,
  Music,
  Plane,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Sunset,
  type LucideIcon,
} from 'lucide-react'
import type { ActiveSlide, DisplayDecision, LayoutSettings, WeatherData, Widget } from '@/lib/types'
import { themeMeta } from '@/lib/albums'
import { fontStack } from '@/lib/fonts'
import { BOB_FALLBACK_EXPRESSION, BOB_PLACEHOLDER, bobAsset, isBobExpression } from '@/lib/bob'
import { STICKER_SPACE, stickerFit } from '@/lib/text-stickers'
import {
  daysBetween,
  formatTime,
  hexToRgba,
  moonPath,
  moonPhase,
  parseDateOnly,
  parseLocalTime,
  shortTime,
  uvLevel,
  weatherInfo,
  zonedTime,
} from '@/lib/frame-utils'
import { TIME_ZONES } from '@/lib/widgets'
import { quoteForDate } from '@/lib/quotes'
import { cn } from '@/lib/utils'

export type WidgetContext = {
  now: Date
  weather: WeatherData | null
  settings: LayoutSettings
  hideSeconds?: boolean
  slide?: ActiveSlide | null
  decision?: DisplayDecision | null
}

const ICONS: Record<string, LucideIcon> = {
  heart: Heart,
  star: Star,
  sparkles: Sparkles,
  flower: Flower2,
  leaf: Leaf,
  mountain: Mountain,
  sun: Sun,
  moon: Moon,
  home: House,
  coffee: Coffee,
  music: Music,
  camera: Camera,
  plane: Plane,
  cake: Cake,
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const

function fit(text: string, maxCqh: number, widthFactor = 190) {
  return `min(${maxCqh}cqh, ${(widthFactor / Math.max(1, text.length)).toFixed(2)}cqw)`
}

const muted: CSSProperties = { opacity: 0.72 }

function handleBobError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.bobFallback) return
  img.dataset.bobFallback = '1'
  img.src = BOB_PLACEHOLDER
}

function BobWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const source = (widget.props.source as string) || 'fixed'
  const decisionExpression = ctx.decision?.bob?.expression
  const widgetExpression = widget.props.expression
  const expression =
    source === 'decision'
      ? isBobExpression(decisionExpression)
        ? decisionExpression
        : isBobExpression(widgetExpression)
          ? widgetExpression
          : BOB_FALLBACK_EXPRESSION
      : isBobExpression(widgetExpression)
        ? widgetExpression
        : BOB_FALLBACK_EXPRESSION
  const speech =
    source === 'decision'
      ? (ctx.decision?.bob?.speech ?? String(widget.props.speech ?? ''))
      : String(widget.props.speech ?? '')
  const animate = Boolean(widget.props.animate)
  const src = bobAsset(expression)

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={expression} className="h-full w-full object-contain" onError={handleBobError} />
  )

  return (
    <div className={cn('relative flex h-full w-full flex-col items-center justify-center', animate && 'animate-in fade-in')}>
      {widget.template === 'badge' ? (
        <div
          className="flex aspect-square h-full max-h-full items-center justify-center overflow-hidden rounded-full"
          style={{ background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
        >
          {image}
        </div>
      ) : (
        image
      )}
      {speech && widget.template === 'speech' && (
        <div className="absolute left-1/2 top-2 max-w-[90%] -translate-x-1/2 rounded-xl bg-white px-3 py-1 text-center text-sm font-medium text-gray-900 shadow-lg">
          {speech}
        </div>
      )}
    </div>
  )
}

export function WidgetContent({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  switch (widget.type) {
    case 'clock-digital':
      return <DigitalClock widget={widget} now={ctx.now} hideSeconds={ctx.hideSeconds} />
    case 'clock-analog':
      return <AnalogClock widget={widget} now={ctx.now} hideSeconds={ctx.hideSeconds} />
    case 'world-clock':
      return <WorldClock widget={widget} now={ctx.now} />
    case 'hourly':
      return <HourlyWidget widget={widget} ctx={ctx} />
    case 'moon':
      return <MoonWidget widget={widget} now={ctx.now} />
    case 'countdown':
      return <CountdownWidget widget={widget} now={ctx.now} />
    case 'quote':
      return <QuoteWidget widget={widget} now={ctx.now} />
    case 'now-showing':
      return <NowShowingWidget widget={widget} slide={ctx.slide ?? null} />
    case 'date':
      return <DateWidget widget={widget} now={ctx.now} />
    case 'weather':
      return <WeatherWidget widget={widget} ctx={ctx} />
    case 'uv':
      return <UvWidget widget={widget} ctx={ctx} />
    case 'sun':
      return <SunWidget widget={widget} ctx={ctx} />
    case 'calendar':
      return <CalendarWidget widget={widget} now={ctx.now} />
    case 'text':
      return <TextWidget widget={widget} />
    case 'icon':
      return <IconWidget widget={widget} />
    case 'bob':
      return <BobWidget widget={widget} ctx={ctx} />
    case 'sticker':
      return <StickerWidget widget={widget} />
  }
}

function DigitalClock({ widget, now, hideSeconds }: { widget: Widget; now: Date; hideSeconds?: boolean }) {
  const { style, props } = widget
  const template = hideSeconds && widget.template === 'seconds' ? 'classic' : widget.template
  const hour12 = Boolean(props.hour12)
  const t = formatTime(now, hour12)
  const showMeridiem = hour12 && Boolean(props.meridiem)
  const justify = JUSTIFY[style.align]
  const numeric: CSSProperties = { fontVariantNumeric: 'tabular-nums', lineHeight: 0.92 }

  if (template === 'stacked') {
    return (
      <div className="flex h-full w-full flex-col justify-center" style={{ alignItems: justify }}>
        <span style={{ ...numeric, fontSize: 'min(48cqh, 62cqw)' }}>{t.hours}</span>
        <span style={{ ...numeric, fontSize: 'min(48cqh, 62cqw)', color: style.accent }}>{t.minutes}</span>
      </div>
    )
  }

  const main = `${t.hours}:${t.minutes}`
  const size = fit(main, 84, 175)

  return (
    <div className="flex h-full w-full items-center gap-[2cqw]" style={{ justifyContent: justify }}>
      {template === 'split' ? (
        <span style={{ ...numeric, fontSize: size }}>
          <span style={{ fontWeight: 800 }}>{t.hours}</span>
          <span style={{ fontWeight: 200, color: style.accent }}>{t.minutes}</span>
        </span>
      ) : (
        <span
          style={{
            ...numeric,
            fontSize: size,
            ...(template === 'outline'
              ? { color: 'transparent', WebkitTextStroke: `max(2px, 0.9cqh) ${style.accent}` }
              : {}),
          }}
        >
          {main}
        </span>
      )}
      {template === 'seconds' && (
        <span style={{ ...numeric, fontSize: 'min(30cqh, 12cqw)', color: style.accent, alignSelf: 'flex-end', marginBottom: '14cqh' }}>
          {t.seconds}
        </span>
      )}
      {showMeridiem && (
        <span style={{ fontSize: 'min(18cqh, 7cqw)', ...muted, alignSelf: 'flex-start', marginTop: '14cqh' }}>{t.meridiem}</span>
      )}
    </div>
  )
}

function AnalogClock({ widget, now, hideSeconds }: { widget: Widget; now: Date; hideSeconds?: boolean }) {
  const { style, template, props } = widget
  const h = now.getHours() % 12
  const m = now.getMinutes()
  const s = now.getSeconds()
  const hourAngle = (h + m / 60) * 30
  const minuteAngle = (m + s / 60) * 6
  const secondAngle = s * 6

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Analog clock showing ${shortTime(now)}`}>
      {template === 'ring' && <circle cx="100" cy="100" r="94" fill="none" stroke={style.accent} strokeWidth="3" />}
      {(template === 'ticks' || template === 'ring') &&
        Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0
          if (template === 'ring' && !major) return null
          return (
            <line
              key={i}
              x1="100"
              y1={template === 'ring' ? 14 : 8}
              x2="100"
              y2={major ? (template === 'ring' ? 24 : 22) : 14}
              stroke="currentColor"
              strokeOpacity={major ? 1 : 0.45}
              strokeWidth={major ? 3 : 1.2}
              strokeLinecap="round"
              transform={`rotate(${i * 6} 100 100)`}
            />
          )
        })}
      {template === 'numerals' &&
        Array.from({ length: 12 }, (_, i) => {
          const n = i + 1
          const angle = (n * 30 * Math.PI) / 180
          return (
            <text
              key={n}
              x={100 + Math.sin(angle) * 76}
              y={100 - Math.cos(angle) * 76}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              fontSize={n % 3 === 0 ? 22 : 15}
              opacity={n % 3 === 0 ? 1 : 0.6}
            >
              {n}
            </text>
          )
        })}
      <line x1="100" y1="108" x2="100" y2="52" stroke="currentColor" strokeWidth="7" strokeLinecap="round" transform={`rotate(${hourAngle} 100 100)`} />
      <line x1="100" y1="110" x2="100" y2="28" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" transform={`rotate(${minuteAngle} 100 100)`} />
      {Boolean(props.seconds) && !hideSeconds && (
        <line x1="100" y1="118" x2="100" y2="22" stroke={style.accent} strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${secondAngle} 100 100)`} />
      )}
      <circle cx="100" cy="100" r="5" fill={style.accent} />
    </svg>
  )
}

function DateWidget({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const upper: CSSProperties = props.uppercase ? { textTransform: 'uppercase' } : {}
  const justify = JUSTIFY[style.align]
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const dayMonth = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

  if (template === 'stacked') {
    return (
      <div className="flex h-full w-full flex-col justify-center" style={{ alignItems: justify, ...upper }}>
        <span style={{ fontSize: fit(weekday, 30, 260), color: style.accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {weekday}
        </span>
        <span style={{ fontSize: fit(dayMonth, 58, 190), lineHeight: 1.05 }}>{dayMonth}</span>
      </div>
    )
  }

  if (template === 'compact') {
    const wd = now.toLocaleDateString(undefined, { weekday: 'short' })
    const rest = now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    const text = `${wd} ${rest}`
    return (
      <div className="flex h-full w-full items-center gap-[0.35em]" style={{ justifyContent: justify, fontSize: fit(text, 74, 180), ...upper }}>
        <span style={{ color: style.accent }}>{wd}</span>
        <span>{rest}</span>
      </div>
    )
  }

  const text = `${weekday}, ${dayMonth}`
  return (
    <div className="flex h-full w-full items-center whitespace-nowrap" style={{ justifyContent: justify, fontSize: fit(text, 74, 185), ...upper }}>
      {text}
    </div>
  )
}

function temp(value: number | undefined) {
  return value === undefined ? '--' : `${value}°`
}

function WeatherWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const { style, template, props } = widget
  const w = ctx.weather
  const info = weatherInfo(w?.current.code ?? 2, w?.current.isDay ?? true)
  const Icon = info.icon
  const location = ctx.settings.locationName.split(',')[0]
  const justify = JUSTIFY[style.align]

  if (template === 'forecast') {
    return (
      <div className="flex h-full w-full flex-col gap-[3cqh]">
        {Boolean(props.showLocation) && (
          <span style={{ fontSize: 'min(11cqh, 5cqw)', ...muted }}>{location}</span>
        )}
        <div className="grid flex-1 grid-cols-5 items-center">
          {(w?.daily ?? []).slice(0, 5).map((d, i) => {
            const DayIcon = weatherInfo(d.code).icon
            const label = i === 0 ? 'Today' : new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short' })
            return (
              <div key={d.date} className="flex flex-col items-center gap-[3cqh]">
                <span style={{ fontSize: 'min(11cqh, 4cqw)', ...muted }}>{label}</span>
                <DayIcon style={{ width: 'min(22cqh, 9cqw)', height: 'min(22cqh, 9cqw)', color: style.accent }} strokeWidth={1.6} aria-hidden />
                <span style={{ fontSize: 'min(14cqh, 5cqw)' }}>{temp(d.max)}</span>
                <span style={{ fontSize: 'min(11cqh, 4cqw)', ...muted }}>{temp(d.min)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (template === 'detailed') {
    return (
      <div className="flex h-full w-full items-center justify-between gap-[4cqw]">
        <div className="flex min-w-0 flex-col justify-center">
          {Boolean(props.showLocation) && (
            <span className="truncate" style={{ fontSize: 'min(13cqh, 6cqw)', ...muted }}>{location}</span>
          )}
          <span style={{ fontSize: 'min(46cqh, 22cqw)', lineHeight: 1 }}>{temp(w?.current.temp)}</span>
          <span style={{ fontSize: 'min(12cqh, 5.5cqw)' }}>{info.label}</span>
          <span style={{ fontSize: 'min(11cqh, 5cqw)', ...muted }}>
            H {temp(w?.today.high)}  L {temp(w?.today.low)}
          </span>
        </div>
        <Icon style={{ width: 'min(60cqh, 34cqw)', height: 'min(60cqh, 34cqw)', color: style.accent, flexShrink: 0 }} strokeWidth={1.4} aria-hidden />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center gap-[4cqw]" style={{ justifyContent: justify }}>
      <Icon style={{ width: 'min(62cqh, 28cqw)', height: 'min(62cqh, 28cqw)', color: style.accent, flexShrink: 0 }} strokeWidth={1.4} aria-hidden />
      <div className="flex flex-col">
        <span style={{ fontSize: 'min(52cqh, 22cqw)', lineHeight: 1 }}>{temp(w?.current.temp)}</span>
        <span className="whitespace-nowrap" style={{ fontSize: 'min(14cqh, 6cqw)', ...muted }}>
          {props.showLocation ? location : info.label}
        </span>
      </div>
    </div>
  )
}

function UvWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const { style, template } = widget
  const uv = ctx.weather?.current.uv ?? 0
  const progress = Math.min(1, uv / 11)
  const level = uvLevel(uv)

  if (template === 'bar') {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-[5cqh]">
        <div className="flex items-baseline justify-between gap-2">
          <span style={{ fontSize: 'min(13cqh, 7cqw)', letterSpacing: '0.1em', ...muted }}>UV INDEX</span>
          <span style={{ fontSize: 'min(13cqh, 7cqw)', color: style.accent }}>{level}</span>
        </div>
        <span style={{ fontSize: 'min(40cqh, 26cqw)', lineHeight: 1 }}>{uv}</span>
        <div className="w-full overflow-hidden rounded-full" style={{ height: 'max(4px, 7cqh)', background: 'color-mix(in srgb, currentColor 22%, transparent)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(4, progress * 100)}%`, background: style.accent }} />
        </div>
      </div>
    )
  }

  const r = 40
  const circumference = 2 * Math.PI * r
  const arc = circumference * 0.75
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`UV index ${uv}, ${level}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arc} ${circumference}`} transform="rotate(135 50 50)" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={style.accent} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.max(1, arc * progress)} ${circumference}`} transform="rotate(135 50 50)" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="28">{uv}</text>
      <text x="50" y="72" textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.75">UV · {level}</text>
    </svg>
  )
}

function SunWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const { style, template } = widget
  const sunrise = ctx.weather ? parseLocalTime(ctx.weather.today.sunrise) : null
  const sunset = ctx.weather ? parseLocalTime(ctx.weather.today.sunset) : null
  const total = sunrise && sunset ? sunset.getTime() - sunrise.getTime() : 0
  const progress = sunrise && total ? (ctx.now.getTime() - sunrise.getTime()) / total : -1
  const daylightMinutes = Math.round(total / 60000)
  const daylight = `${Math.floor(daylightMinutes / 60)}h ${daylightMinutes % 60}m daylight`

  if (template === 'times') {
    return (
      <div className="grid h-full w-full grid-cols-2 items-center gap-[4cqw]">
        {[
          { label: 'Sunrise', time: sunrise, Icon: Sunrise },
          { label: 'Sunset', time: sunset, Icon: Sunset },
        ].map(({ label, time, Icon }) => (
          <div key={label} className="flex flex-col items-center gap-[3cqh]">
            <Icon style={{ width: 'min(30cqh, 14cqw)', height: 'min(30cqh, 14cqw)', color: style.accent }} strokeWidth={1.5} aria-hidden />
            <span style={{ fontSize: 'min(30cqh, 12cqw)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shortTime(time)}</span>
            <span style={{ fontSize: 'min(11cqh, 5cqw)', ...muted }}>{label}</span>
          </div>
        ))}
      </div>
    )
  }

  const angle = Math.PI * (1 - Math.min(1, Math.max(0, progress)))
  const sx = 150 + 125 * Math.cos(angle)
  const sy = 120 - 95 * Math.sin(angle)
  const isUp = progress >= 0 && progress <= 1

  return (
    <div className="flex h-full w-full flex-col">
      <svg viewBox="0 0 300 130" className="min-h-0 w-full flex-1" preserveAspectRatio="xMidYMax meet" role="img" aria-label={`Sun is ${isUp ? `${Math.round(progress * 100)}% through the day` : 'below the horizon'}`}>
        <path d="M25 120 A125 95 0 0 1 275 120" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" strokeDasharray="4 6" />
        <line x1="5" y1="120" x2="295" y2="120" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
        {isUp && (
          <>
            <circle cx={sx} cy={sy} r="16" fill={style.accent} opacity="0.25" />
            <circle cx={sx} cy={sy} r="9" fill={style.accent} />
          </>
        )}
      </svg>
      <div className="flex items-end justify-between" style={{ fontSize: 'min(12cqh, 5cqw)' }}>
        <div className="flex flex-col">
          <span style={muted}>Sunrise</span>
          <span style={{ fontSize: 'min(20cqh, 8cqw)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{shortTime(sunrise)}</span>
        </div>
        <span className="text-center" style={muted}>{total ? daylight : ''}</span>
        <div className="flex flex-col items-end">
          <span style={muted}>Sunset</span>
          <span style={{ fontSize: 'min(20cqh, 8cqw)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{shortTime(sunset)}</span>
        </div>
      </div>
    </div>
  )
}

function CalendarWidget({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const mondayFirst = props.weekStart !== 'sun'
  const labels = mondayFirst ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const todayStyle: CSSProperties = { background: style.accent, color: style.bg, fontWeight: 700 }
  const shift = (d: number) => (mondayFirst ? (d + 6) % 7 : d)

  if (template === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - shift(now.getDay()))
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
    return (
      <div className="grid h-full w-full grid-cols-7 items-stretch gap-[1.5cqw]">
        {days.map((d, i) => {
          const isToday = d.toDateString() === now.toDateString()
          return (
            <div key={i} className="flex flex-col items-center justify-center gap-[6cqh] rounded-[3cqw]" style={isToday ? todayStyle : undefined}>
              <span style={{ fontSize: 'min(18cqh, 4cqw)', opacity: isToday ? 1 : 0.7 }}>{labels[i]}</span>
              <span style={{ fontSize: 'min(32cqh, 6cqw)', fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const offset = shift(first.getDay())
  const cells = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const month = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="flex h-full w-full flex-col gap-[2cqh]" style={{ fontSize: 'min(7cqh, 5.4cqw)' }}>
      <span style={{ fontSize: '1.35em', color: style.accent, fontWeight: 600 }}>{month}</span>
      <div className="grid flex-1 grid-cols-7 place-items-center" style={{ gridAutoRows: '1fr' }}>
        {labels.map((l, i) => (
          <span key={`l${i}`} style={muted}>{l}</span>
        ))}
        {cells.map((day, i) => (
          <span
            key={i}
            className="flex aspect-square items-center justify-center rounded-full"
            style={{ width: '1.9em', fontVariantNumeric: 'tabular-nums', ...(day === now.getDate() ? todayStyle : {}) }}
          >
            {day ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function TextWidget({ widget }: { widget: Widget }) {
  const { style, template, props } = widget
  const text = String(props.text ?? '')
  const justify = JUSTIFY[style.align]
  return (
    <div className="flex h-full w-full items-center whitespace-nowrap" style={{ justifyContent: justify }}>
      {template === 'caption' ? (
        <span style={{ fontSize: fit(text, 54, 200), fontStyle: 'italic', color: style.accent }}>{text}</span>
      ) : (
        <span style={{ fontSize: fit(text, 80, 190) }}>{text}</span>
      )}
    </div>
  )
}

function StickerWidget({ widget }: { widget: Widget }) {
  const layers = widget.layers ?? []
  const fit = stickerFit(widget.w, widget.h)
  return (
    <div className="relative h-full w-full">
      <div
        style={{
          position: 'absolute',
          left: fit.offsetX,
          top: fit.offsetY,
          width: STICKER_SPACE.w,
          height: STICKER_SPACE.h,
          transform: `scale(${fit.scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {layers.map((layer) => {
          const s = layer.style
          const bg = s.bgOpacity > 0 ? hexToRgba(s.bg, s.bgOpacity / 100) : 'transparent'
          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left: layer.x,
                top: layer.y,
                width: layer.w,
                height: layer.h,
                color: s.color,
                fontFamily: fontStack(s.fontFamily),
                fontWeight: s.fontWeight,
                letterSpacing: `${s.letterSpacing / 100}em`,
                textAlign: s.align === 'start' ? 'left' : s.align === 'end' ? 'right' : 'center',
                background: bg,
                backdropFilter: s.blur > 0 ? `blur(${s.blur}px) saturate(1.4)` : undefined,
                WebkitBackdropFilter: s.blur > 0 ? `blur(${s.blur}px) saturate(1.4)` : undefined,
                border: s.strokeWidth > 0 ? `${s.strokeWidth}px solid ${s.stroke}` : undefined,
                borderRadius: s.radius,
                opacity: s.opacity / 100,
                WebkitTextStroke: s.textStroke > 0 ? `${s.textStroke}px ${s.stroke}` : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: s.align === 'start' ? 'flex-start' : s.align === 'end' ? 'flex-end' : 'center',
                overflow: 'hidden',
                padding: s.bgOpacity > 0 || s.strokeWidth > 0 ? '4%' : '1%',
                filter: s.shadow ? 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' : undefined,
              }}
            >
              <span
                style={{
                  fontSize: `${Math.max(12, layer.h * 0.72)}px`,
                  lineHeight: 1.05,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  width: '100%',
                }}
              >
                {layer.text}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IconWidget({ widget }: { widget: Widget }) {
  const { style, template, props } = widget
  const Icon = ICONS[String(props.icon)] ?? Heart
  if (template === 'badge') {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-full" style={{ background: style.accent }}>
        <Icon style={{ width: '55%', height: '55%', color: style.bg }} strokeWidth={1.8} aria-hidden />
      </div>
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Icon style={{ width: '100%', height: '100%' }} strokeWidth={1.4} aria-hidden />
    </div>
  )
}

function zoneLabel(zone: string) {
  return TIME_ZONES.find((z) => z.value === zone)?.label.replace('Frame local time', 'Home') ?? zone.split('/').pop()?.replace(/_/g, ' ') ?? zone
}

function dayOffsetLabel(offset: number) {
  return offset === 0 ? 'Today' : offset > 0 ? 'Tomorrow' : 'Yesterday'
}

function WorldClock({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const hour12 = Boolean(props.hour12)
  const zones = [props.zone1, props.zone2, props.zone3].map(String).filter((z) => z && z !== 'none')
  const entries = zones.map((zone) => ({ zone, label: zoneLabel(zone), ...zonedTime(now, zone, hour12) }))

  if (template === 'list') {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-[4cqh]">
        {entries.map((e) => (
          <div key={e.zone} className="flex items-baseline justify-between gap-[3cqw]" style={{ fontSize: `min(${60 / Math.max(1, entries.length)}cqh, 7cqw)` }}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate" style={{ lineHeight: 1.1 }}>{e.label}</span>
              <span style={{ fontSize: '0.55em', ...muted }}>{dayOffsetLabel(e.dayOffset)}</span>
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: style.accent, fontSize: '1.3em', lineHeight: 1 }}>
              {e.time}
              {hour12 && <span style={{ fontSize: '0.45em', marginLeft: '0.2em', ...muted }}>{e.meridiem}</span>}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid h-full w-full items-center gap-[3cqw]" style={{ gridTemplateColumns: `repeat(${Math.max(1, entries.length)}, minmax(0, 1fr))` }}>
      {entries.map((e) => (
        <div key={e.zone} className="flex min-w-0 flex-col items-center gap-[3cqh]">
          <span className="w-full truncate" style={{ fontSize: 'min(13cqh, 4.6cqw)', letterSpacing: '0.08em', textTransform: 'uppercase', ...muted }}>
            {e.label}
          </span>
          <span style={{ fontSize: `min(34cqh, ${30 / Math.max(1, entries.length)}cqw)`, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{e.time}</span>
          <span style={{ fontSize: 'min(11cqh, 4cqw)', color: style.accent }}>
            {hour12 ? `${e.meridiem} · ` : ''}
            {dayOffsetLabel(e.dayOffset)}
          </span>
        </div>
      ))}
    </div>
  )
}

function HourlyWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const { style, template, props } = widget
  const count = Number(props.hours) || 6
  const hours = (ctx.weather?.hourly ?? []).slice(0, count)
  const showRain = Boolean(props.showRain)
  const label = (time: string, i: number) => (i === 0 ? 'Now' : time.slice(11, 13))
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, hours.length)}, minmax(0, 1fr))` }
  const iconSize = `min(22cqh, ${40 / Math.max(1, count)}cqw)`

  if (template === 'chart') {
    const temps = hours.map((h) => h.temp)
    const max = Math.max(...temps, 1)
    const min = Math.min(...temps, 0)
    const range = max - min || 1
    const points = hours.map((h, i) => {
      const x = ((i + 0.5) / Math.max(1, hours.length)) * 100
      const y = 88 - ((h.temp - min) / range) * 76
      return { x, y }
    })
    return (
      <div className="flex h-full w-full flex-col">
        <div className="grid" style={{ ...cols, fontSize: 'min(13cqh, 4.6cqw)' }}>
          {hours.map((h) => (
            <span key={h.time} className="text-center">{temp(h.temp)}</span>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="min-h-0 w-full flex-1" aria-hidden>
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={style.accent}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {showRain &&
            hours.map((h, i) => (
              <rect
                key={h.time}
                x={(i / Math.max(1, hours.length)) * 100 + 100 / hours.length / 2 - 1.5}
                y={100 - h.precip / 4}
                width="3"
                height={h.precip / 4}
                fill="currentColor"
                opacity="0.35"
              />
            ))}
        </svg>
        <div className="grid" style={{ ...cols, fontSize: 'min(11cqh, 4cqw)', ...muted }}>
          {hours.map((h, i) => (
            <span key={h.time} className="text-center">{label(h.time, i)}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full w-full items-center" style={cols}>
      {hours.map((h, i) => {
        const HourIcon = weatherInfo(h.code, h.isDay).icon
        return (
          <div key={h.time} className="flex flex-col items-center gap-[4cqh]">
            <span style={{ fontSize: 'min(11cqh, 4cqw)', ...muted }}>{label(h.time, i)}</span>
            <HourIcon style={{ width: iconSize, height: iconSize, color: style.accent }} strokeWidth={1.6} aria-hidden />
            <span style={{ fontSize: 'min(15cqh, 5cqw)', fontVariantNumeric: 'tabular-nums' }}>{temp(h.temp)}</span>
            {showRain && <span style={{ fontSize: 'min(10cqh, 3.6cqw)', ...muted }}>{h.precip}%</span>}
          </div>
        )
      })}
    </div>
  )
}

function MoonDisc({ fraction, accent, label }: { fraction: number; accent: string; label: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={label}>
      <circle cx="50" cy="50" r="40" fill="currentColor" opacity="0.14" />
      <path d={moonPath(fraction)} fill={accent} />
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
    </svg>
  )
}

function MoonWidget({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const phase = moonPhase(now)
  const percent = Math.round(phase.illumination * 100)
  const label = `${phase.name}, ${percent}% illuminated`

  if (template === 'details') {
    return (
      <div className="flex h-full w-full items-center gap-[5cqw]">
        <div className="aspect-square h-full shrink-0">
          <MoonDisc fraction={phase.fraction} accent={style.accent} label={label} />
        </div>
        <div className="flex min-w-0 flex-col gap-[2cqh] text-left">
          {Boolean(props.showName) && <span className="truncate" style={{ fontSize: 'min(16cqh, 7cqw)', lineHeight: 1.1 }}>{phase.name}</span>}
          <span style={{ fontSize: 'min(12cqh, 5.4cqw)', ...muted }}>{percent}% lit</span>
          <span style={{ fontSize: 'min(11cqh, 5cqw)', color: style.accent }}>
            {phase.illumination > 0.97 ? 'Full tonight' : `Full in ${phase.daysToFull} day${phase.daysToFull === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[3cqh]">
      <div className="aspect-square min-h-0 flex-1">
        <MoonDisc fraction={phase.fraction} accent={style.accent} label={label} />
      </div>
      {Boolean(props.showName) && <span className="whitespace-nowrap" style={{ fontSize: 'min(11cqh, 8cqw)', ...muted }}>{phase.name}</span>}
    </div>
  )
}

function CountdownWidget({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const target = parseDateOnly(String(props.target))
  const start = parseDateOnly(String(props.start))
  const name = String(props.label || 'Event')
  const days = target ? daysBetween(now, target) : 0
  const caption = !target ? 'Pick a date' : days === 0 ? 'is today' : days > 0 ? `day${days === 1 ? '' : 's'} until ${name}` : `day${days === -1 ? '' : 's'} since ${name}`
  const value = days === 0 && target ? name : String(Math.abs(days))
  const justify = JUSTIFY[style.align]

  if (template === 'ring') {
    const total = target && start ? Math.max(1, daysBetween(start, target)) : 1
    const progress = Math.min(1, Math.max(0, 1 - days / total))
    const r = 42
    const c = 2 * Math.PI * r
    return (
      <div className="flex h-full w-full items-center gap-[5cqw]" style={{ justifyContent: justify }}>
        <svg viewBox="0 0 100 100" className="aspect-square h-full shrink-0" role="img" aria-label={`${Math.round(progress * 100)}% of the way to ${name}`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={style.accent} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.max(1, c * progress)} ${c}`} transform="rotate(-90 50 50)" />
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize={days === 0 ? 14 : 30}>
            {days === 0 ? 'Today' : Math.abs(days)}
          </text>
        </svg>
        <div className="flex min-w-0 flex-col text-left">
          <span className="truncate" style={{ fontSize: 'min(20cqh, 8cqw)', lineHeight: 1.1 }}>{name}</span>
          <span style={{ fontSize: 'min(12cqh, 5cqw)', ...muted }}>
            {target?.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) ?? 'No date set'}
          </span>
        </div>
      </div>
    )
  }

  if (template === 'inline') {
    const text = `${value} ${caption}`
    return (
      <div className="flex h-full w-full items-center gap-[0.3em] whitespace-nowrap" style={{ justifyContent: justify, fontSize: fit(text, 60, 190) }}>
        <span style={{ color: style.accent, fontWeight: 700 }}>{value}</span>
        <span>{caption}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col justify-center" style={{ alignItems: justify }}>
      <span style={{ fontSize: fit(value, 62, 120), lineHeight: 1, color: style.accent, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span className="max-w-full truncate" style={{ fontSize: fit(caption, 16, 160), ...muted }}>{caption}</span>
    </div>
  )
}

function NowShowingWidget({ widget, slide }: { widget: Widget; slide: ActiveSlide | null }) {
  const { style, template, props } = widget
  const justify = JUSTIFY[style.align]
  if (!slide) {
    return (
      <div className="flex h-full w-full items-center" style={{ justifyContent: justify, fontSize: 'min(16cqh, 4.4cqw)', opacity: 0.6 }}>
        Show an album on this layout
      </div>
    )
  }
  const { item, theme } = slide
  const label = String(props.label || '').trim() || themeMeta(theme).nowLabel
  const details = [
    item.subtitle,
    props.showYear ? item.year : '',
    props.showGenre ? item.genre : '',
    props.showDirector ? item.director : '',
    props.showRating ? (item.rating ? `Rating ${item.rating}` : '') : '',
  ].filter(Boolean).join(' · ')
  const description = props.showDescription ? item.description : ''
  const labelStyle: CSSProperties = {
    fontSize: 'min(11cqh, 3.4cqw)',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: style.accent,
    fontWeight: 600,
  }

  if (template === 'marquee') {
    return (
      <div className="flex h-full w-full items-center gap-[3cqw] whitespace-nowrap" style={{ justifyContent: justify }}>
        {props.showLabel && <span style={labelStyle}>{label}</span>}
        <span className="truncate" style={{ fontSize: 'min(30cqh, 5.4cqw)', lineHeight: 1.1 }}>
          {item.title}
          {details && <span style={muted}>{`  —  ${details}`}</span>}
        </span>
      </div>
    )
  }

  if (template === 'title') {
    return (
      <div className="flex h-full w-full items-center" style={{ justifyContent: justify }}>
        <p className="text-balance" style={{ fontSize: fit(item.title, 62, 165), lineHeight: 1.02 }}>
          {item.title}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col justify-center gap-[4cqh]" style={{ alignItems: justify }}>
      {props.showLabel && (
        <span className="flex items-center gap-[1.6cqw]" style={labelStyle}>
          <span aria-hidden className="inline-block rounded-full" style={{ width: '0.6em', height: '0.6em', background: style.accent }} />
          {label}
        </span>
      )}
      <p className="text-balance" style={{ fontSize: `min(${Math.max(16, 30 - item.title.length / 2.4)}cqh, ${Math.max(4.4, 9 - item.title.length / 9)}cqw)`, lineHeight: 1.08 }}>
        {item.title}
      </p>
      {details && <p style={{ ...muted, fontSize: 'min(12cqh, 3.8cqw)' }}>{details}</p>}
      {description && <p className="line-clamp-2 max-w-[80%]" style={{ ...muted, fontSize: 'min(10cqh, 3.2cqw)' }}>{description}</p>}
    </div>
  )
}

function QuoteWidget({ widget, now }: { widget: Widget; now: Date }) {
  const { style, template, props } = widget
  const daily = quoteForDate(now)
  const custom = props.mode === 'custom'
  const text = custom ? String(props.text || '') : daily.text
  const author = custom ? String(props.author || '') : daily.author
  const justify = JUSTIFY[style.align]
  const size = `min(${Math.max(9, 34 - text.length / 6)}cqh, ${Math.max(3.2, 11 - text.length / 18)}cqw)`

  return (
    <figure className="flex h-full w-full flex-col justify-center gap-[5cqh]" style={{ alignItems: justify }}>
      {template === 'marks' && (
        <span aria-hidden style={{ fontSize: 'min(40cqh, 14cqw)', lineHeight: 0.6, color: style.accent, height: '0.45em' }}>
          {'“'}
        </span>
      )}
      <blockquote className="text-balance" style={{ fontSize: size, lineHeight: 1.25, fontStyle: template === 'serif' ? 'italic' : 'normal' }}>
        {template === 'serif' ? `“${text}”` : text}
      </blockquote>
      {author && (
        <figcaption style={{ fontSize: 'min(11cqh, 3.6cqw)', letterSpacing: '0.12em', textTransform: 'uppercase', color: style.accent }}>
          {author}
        </figcaption>
      )}
    </figure>
  )
}
