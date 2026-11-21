'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Box, CalendarClock, ListTodo, Signpost, Split } from 'lucide-react'
import type { FrameNotification } from '@/lib/types'
import { FRAME_WIDTH } from '@/lib/types'
import { useNotifications } from './notification-provider'

/* -------------------------------------------------------------------------
 * Design tokens
 *
 * The notice is drawn in the frame's own coordinate space (1080 x 1920), not
 * the browser viewport. FrameScene renders that space at
 * `scale = min(viewport / frame)`, so every length below grows with the frame
 * and the kiosk, the editor canvas, and the full-screen preview all show the
 * same proportions. Never use `vw`/`vh` here: those follow the browser window,
 * not the frame, and drift as soon as the frame is scaled.
 *
 * `u(n)` converts a frame pixel measured on the reference 1080-wide frame to
 * a length that follows FRAME_WIDTH if it ever changes.
 *   --frame-w = the frame's logical width (1080)
 *   --card-w  = 0.833 * --frame-w (900 at the reference size)
 *   --u       = --frame-w / 1080
 * ----------------------------------------------------------------------- */
const u = (n: number) => `calc(${n} * var(--u))`

// System stack only: no webfont is loaded for the frame, so naming one here
// would silently fall back and vary between macOS, Windows, and kiosk Linux.
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const T = {
  cardInset: 16,
  cardRadius: 44,
  bannerRadius: 30,
  bannerPadX: 44,
  bannerPadTop: 44,
  bannerPadBottom: 44,
  pillHeight: 56,
  pillPadX: 30,
  pillToTitle: 34,
  metaTop: 170, // text block min-height so the first metadata row starts at the same y in every layout
  descToMeta: 30,
  titleIndent: 6,
  descIndent: 8,
  descMaxWidth: 470,
  titleSize: 58,
  titleLeading: 68,
  pillSize: 26,
  bodySize: 31,
  bodyLeading: 42,
  metaIcon: 44,
  metaGap: 22,
  metaRowGap: 26,
  listGap: 18,
  listInset: 8,
  listRadius: 22,
  rowTile: 76,
  rowTileRadius: 18,
  footerHeight: 68,
  footerWidth: 246,
  footerProgress: 154,
  footerGapAfterList: 26,
  footerGapAfterBanner: 30,
  footerBottom: 18,
  mascotRight: 32, // visual edge sits ~60 from the banner edge (stand-in mascots carry 6 of padding)
  qrRight: 44,
  qrBottom: 26,
  qrWidth: 292,
  qrPadX: 24,
  qrPadTop: 24,
  qrCode: 244,
  qrBar: 72,
} as const

/** Keeps long author content inside the card so the overlay never clips. */
const clampLines = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const COLOR = {
  pink: '#FAE2F2',
  blue: '#E7F6FD',
  yellow: '#FDFDD1',
  pill: '#D9E7EE',
  pillWarning: '#EBD3E3',
  text: '#000000',
  muted: '#5E5E5E',
  border: '#D5D5D5',
  track: '#F1F0F4',
  tilePink: '#FCEDF2',
  tileGreen: '#DCF2E6',
  urgentPurple: '#93478F',
  eventGreen: '#6DAA85',
  tag: '#616CF6',
} as const

const MASCOT_URL = {
  warning: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_question-OdunhW9uNu1kPr4rCJsBe02fK8cX6P.png',
  reminder: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_reminder-Dc0ETqgLImrwnyAvw42SIgIzwdehIc.png',
  custom: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_talking-cYnxVoO3XjmYrjUkonG5UudECS9cLR.png',
  calendar: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_planning-ezfCxbQyuDAwprCpdbMxzXudAPeeEC.png',
} as const

type Layout = 'warning' | 'calendar' | 'reminder' | 'system' | 'custom'

type LayoutSpec = {
  background: string
  pill: string
  label: string
  minHeight: number
  padBottom: number
  pillMinWidth?: number
  metaIndent: number
  textRight: number // right limit of the text column, in banner units (keeps copy clear of the mascot / QR)
  descGap: number
  descIndent: number
  mascot?: { key: keyof typeof MASCOT_URL; width: number; dy: number }
}

const LAYOUTS: Record<Layout, LayoutSpec> = {
  // textRight is measured from the banner's left edge and reserved so copy
  // never runs under the mascot or QR panel at the larger type scale.
  warning: { background: COLOR.pink, pill: COLOR.pillWarning, label: 'Warning', minHeight: 560, padBottom: T.bannerPadBottom, pillMinWidth: 186, metaIndent: 8, textRight: 520, descGap: 16, descIndent: 8, mascot: { key: 'warning', width: 280, dy: -14 } },
  calendar: { background: COLOR.blue, pill: COLOR.pill, label: 'Calendar', minHeight: 540, padBottom: T.bannerPadBottom, pillMinWidth: 214, metaIndent: 8, textRight: 515, descGap: 16, descIndent: 8, mascot: { key: 'calendar', width: 300, dy: -14 } },
  reminder: { background: COLOR.yellow, pill: COLOR.pill, label: 'Today’s the day', minHeight: 560, padBottom: T.bannerPadBottom, pillMinWidth: 236, metaIndent: 8, textRight: 540, descGap: 28, descIndent: 8, mascot: { key: 'reminder', width: 272, dy: -8 } },
  system: { background: COLOR.pink, pill: COLOR.pill, label: 'System Message', minHeight: 520, padBottom: 40, metaIndent: 24, textRight: 508, descGap: 26, descIndent: 8 },
  custom: { background: COLOR.blue, pill: COLOR.pill, label: 'Hey there!', minHeight: 540, padBottom: T.bannerPadBottom, pillMinWidth: 196, metaIndent: 8, textRight: 490, descGap: 40, descIndent: 6, mascot: { key: 'custom', width: 334, dy: -4 } },
}

/** Optional extras a notification may carry. All are optional so existing payloads render unchanged. */
type NoticeItem = { id?: string; title: string; time?: string; tag?: string; urgent?: boolean }
type NoticeData = FrameNotification & { label?: string; urgent?: boolean; items?: NoticeItem[] }

const FALLBACK_EVENTS: NoticeItem[] = [
  { title: 'Event Name, Location', time: '14:00 – 15:30', tag: 'Work', urgent: true },
  { title: 'Event Name, Location', time: '14:00 – 15:30', tag: 'School' },
]
const FALLBACK_WHEN = 'Sun, 11 Oct 2026 09:21'
const FALLBACK_WHERE = 'Clifton Springs, VIC'

function layoutOf(n: FrameNotification): Layout {
  switch (n.variant) {
    case 'warning':
    case 'error':
      return 'warning'
    case 'success':
      return 'calendar'
    case 'reminder':
      return 'reminder'
    default:
      return n.actionUrl ? 'system' : 'custom'
  }
}

/* ----------------------------- small icons ------------------------------ */

type SvgProps = { style?: CSSProperties; strokeWidth?: number }
const svgBase = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

/** Rounded square with an exclamation mark (the "Important/Urgent" glyph). */
function UrgentIcon({ style, strokeWidth = 2 }: SvgProps) {
  return (
    <svg {...svgBase} strokeWidth={strokeWidth} style={style}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.6v.01" />
    </svg>
  )
}

/* Paths from lucide (ISC) inlined so they do not depend on the installed lucide version. */
function BellCheckIcon({ style, strokeWidth = 2 }: SvgProps) {
  return (
    <svg {...svgBase} strokeWidth={strokeWidth} style={style}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="m15 8 2 2 4-4" />
      <path d="M16.8607 4.4824A6 6 0 0 0 6 8C6 12.499 4.589 13.956 3.262 15.326" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17H20A1 1 0 0 0 20.74 15.327C20.209 14.779 19.665 14.218 19.203 13.454" />
    </svg>
  )
}

function ExtinguisherIcon({ style, strokeWidth = 2 }: SvgProps) {
  return (
    <svg {...svgBase} strokeWidth={strokeWidth} style={style}>
      <path d="M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5" />
      <path d="M9 18h8" />
      <path d="M18 3h-3" />
      <path d="M11 3a6 6 0 0 0-6 6v11" />
      <path d="M5 13h4" />
      <path d="M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z" />
    </svg>
  )
}

const iconBox = (n: number): CSSProperties => ({ width: u(n), height: u(n), flexShrink: 0 })

/* ------------------------------- pieces --------------------------------- */

function CategoryPill({ layout, label }: { layout: Layout; label: string }) {
  const spec = LAYOUTS[layout]
  const withIcon = layout === 'calendar'
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        minWidth: spec.pillMinWidth ? u(spec.pillMinWidth) : undefined,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        height: u(T.pillHeight),
        padding: withIcon ? `0 ${u(T.pillPadX)} 0 ${u(5)}` : `0 ${u(T.pillPadX)}`,
        gap: u(20),
        borderRadius: 9999,
        background: spec.pill,
        fontSize: u(T.pillSize),
        lineHeight: 1,
        fontWeight: 500,
        color: COLOR.text,
        whiteSpace: 'nowrap',
      }}
    >
      {withIcon && (
        <span style={{ ...iconBox(50), display: 'grid', placeItems: 'center', borderRadius: 9999, background: '#fff' }}>
          <CalendarClock style={iconBox(30)} strokeWidth={2} aria-hidden />
        </span>
      )}
      {label}
    </div>
  )
}

function MetaRow({ icon, children, bold, indent }: { icon: ReactNode; children: ReactNode; bold?: boolean; indent: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: u(T.metaIcon), gap: u(T.metaGap), marginLeft: u(indent), minWidth: 0 }}>
      <span style={{ ...iconBox(T.metaIcon), display: 'grid', placeItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: u(T.bodySize), lineHeight: 1.2, fontWeight: bold ? 700 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  )
}

/* lucide glyphs fill ~83% of their 24px box; scale up so the ink matches the meta icon box */
const metaIcon: CSSProperties = { width: '120%', height: '120%' }

function Metadata({ layout, notification, items }: { layout: Layout; notification: NoticeData; items: NoticeItem[] }) {
  let rows: ReactNode[] = []
  const ind = LAYOUTS[layout].metaIndent
  if (layout === 'warning') {
    rows = [
      <MetaRow indent={ind} key="code" icon={<Split style={metaIcon} strokeWidth={2} aria-hidden />}>{notification.eventKey ? `Error ${notification.eventKey}` : 'Error Code'}</MetaRow>,
      <MetaRow indent={ind} key="module" icon={<Box style={metaIcon} strokeWidth={2} aria-hidden />}>Module with the code</MetaRow>,
    ]
  } else if (layout === 'calendar') {
    // Totals cover every item, including any past the three-row limit, so the
    // summary does not understate the list. EventRows still renders three rows.
    const urgent = items.filter((item) => item.urgent).length
    rows = [
      <MetaRow indent={ind} key="count" icon={<ListTodo style={metaIcon} strokeWidth={2} aria-hidden />}>{items.length} {items.length === 1 ? 'item' : 'items'}</MetaRow>,
      <MetaRow indent={ind} key="urgent" icon={<UrgentIcon style={metaIcon} />}>{urgent} marked as <strong style={{ fontWeight: 700 }}>Important/Urgent</strong></MetaRow>,
    ]
  } else if (layout === 'reminder') {
    rows = [
      <MetaRow indent={ind} key="time" icon={<CalendarClock style={metaIcon} strokeWidth={2} aria-hidden />}>{FALLBACK_WHEN}</MetaRow>,
      <MetaRow indent={ind} key="place" icon={<Signpost style={metaIcon} strokeWidth={2} aria-hidden />}>{FALLBACK_WHERE}</MetaRow>,
    ]
    if (notification.urgent) rows.push(<MetaRow indent={ind} key="urgent" bold icon={<UrgentIcon style={metaIcon} />}>Important/Urgent</MetaRow>)
  } else if (layout === 'system') {
    rows = [<MetaRow indent={ind} key="urgent" bold icon={<UrgentIcon style={metaIcon} />}>Important/Urgent</MetaRow>]
  }
  if (rows.length === 0) return null
  return <div style={{ display: 'flex', flexDirection: 'column', gap: u(T.metaRowGap) }}>{rows}</div>
}

function QrPanel({ value }: { value: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=${encodeURIComponent(value)}`
  return (
    <div
      style={{
        position: 'absolute',
        right: u(T.qrRight),
        bottom: u(T.qrBottom),
        width: u(T.qrWidth),
        borderRadius: u(16),
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ padding: `${u(T.qrPadTop)} ${u(T.qrPadX)} ${u(24)}` }}>
        <img src={src} alt="Scannable notification QR code" style={{ display: 'block', width: u(T.qrCode), height: u(T.qrCode), imageRendering: 'pixelated' }} />
      </div>
      <div
        style={{
          position: 'relative',
          height: u(T.qrBar),
          background: '#000',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Arial Narrow', sans-serif",
          fontSize: u(36),
          fontWeight: 600,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        <span aria-hidden style={{ position: 'absolute', top: u(-10), left: '50%', width: 0, height: 0, transform: 'translateX(-50%)', borderLeft: `${u(10)} solid transparent`, borderRight: `${u(10)} solid transparent`, borderBottom: `${u(10)} solid #000` }} />
        SCAN ME
      </div>
    </div>
  )
}

/* ------------------------------ list panel ------------------------------ */

function Tile({ tone, children }: { tone: 'pink' | 'green'; children: ReactNode }) {
  return (
    <span style={{ ...iconBox(T.rowTile), display: 'grid', placeItems: 'center', borderRadius: u(T.rowTileRadius), background: tone === 'pink' ? COLOR.tilePink : COLOR.tileGreen }}>
      {children}
    </span>
  )
}

function Row({ tile, children, trailing, height, last, shift = 0 }: { tile: ReactNode; children: ReactNode; trailing?: ReactNode; height: number; last: boolean; shift?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: u(22), minHeight: u(height), padding: `${u(shift)} ${u(30)} 0 ${u(24)}`, borderBottom: last ? 'none' : `1px solid ${COLOR.border}`, fontSize: u(T.bodySize), lineHeight: 1.2 }}>
      {tile}
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      {trailing}
    </div>
  )
}

function ListBox({ children }: { children: ReactNode }) {
  return <div style={{ margin: `${u(T.listGap)} ${u(T.listInset)} 0`, border: `1px solid ${COLOR.border}`, borderRadius: u(T.listRadius), overflow: 'hidden', background: '#fff' }}>{children}</div>
}

function EventRows({ items }: { items: NoticeItem[] }) {
  return (
    <ListBox>
      {items.slice(0, 3).map((item, index, list) => (
        <Row
          key={item.id ?? index}
          height={132}
          shift={16}
          last={index === list.length - 1}
          tile={<Tile tone={item.urgent ? 'pink' : 'green'}>{item.urgent ? <UrgentIcon style={{ ...iconBox(40), color: COLOR.urgentPurple }} /> : <CalendarClock style={{ ...iconBox(40), color: COLOR.eventGreen }} strokeWidth={2} aria-hidden />}</Tile>}
          trailing={item.time ? <span style={{ whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: u(20) }}>{item.time}</span> : undefined}
        >
          <div style={{ fontWeight: 700, ...clampLines(2) }}>{item.title}</div>
          {item.tag && (
            <span style={{ display: 'inline-block', marginTop: u(10), padding: `${u(6)} ${u(12)}`, borderRadius: 9999, background: COLOR.tag, color: '#fff', fontSize: u(22), fontWeight: 500, lineHeight: 1.1 }}>{item.tag}</span>
          )}
        </Row>
      ))}
    </ListBox>
  )
}

function TaskRows({ items }: { items: NoticeItem[] }) {
  return (
    <ListBox>
      {items.slice(0, 3).map((item, index, list) => (
        <Row key={item.id ?? index} height={132} shift={18} last={index === list.length - 1} tile={<Tile tone={index % 2 === 0 ? 'pink' : 'green'}><ListTodo style={iconBox(40)} strokeWidth={2} aria-hidden /></Tile>}>
          <div style={clampLines(2)}>{item.title}</div>
        </Row>
      ))}
    </ListBox>
  )
}

function ResolutionRow({ text }: { text: string }) {
  return (
    <ListBox>
      <Row height={132} last tile={<Tile tone="green"><ExtinguisherIcon style={iconBox(40)} strokeWidth={2} /></Tile>}><div style={{ ...clampLines(2), paddingTop: u(12), paddingBottom: u(12) }}>{text}</div></Row>
    </ListBox>
  )
}

/* --------------------------- timer + controls ---------------------------- */

function TimerControls({ durationMs, paused, onTogglePause, onComplete, onDismiss }: { durationMs: number; paused: boolean; onTogglePause: () => void; onComplete: () => void; onDismiss: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const timed = durationMs > 0
  const done = timed && elapsed >= durationMs

  useEffect(() => {
    if (!timed || paused || done) return
    let last = Date.now()
    const timer = window.setInterval(() => {
      const now = Date.now()
      const delta = now - last
      last = now
      setElapsed((value) => Math.min(durationMs, value + delta))
    }, 50)
    return () => window.clearInterval(timer)
  }, [timed, durationMs, paused, done])

  // Dismiss from an effect (never inside a state updater) and always with the latest callback.
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  useEffect(() => {
    if (!done) return
    // Let the 100% progress state render before removing the card.
    const completionTimer = window.setTimeout(() => completeRef.current(), 350)
    return () => window.clearTimeout(completionTimer)
  }, [done])

  const progress = timed ? Math.min(1, elapsed / durationMs) : 0
  return (
    <div style={{ position: 'relative', display: 'flex', width: u(T.footerWidth), height: u(T.footerHeight), borderRadius: 9999, background: COLOR.track, overflow: 'hidden' }}>
      {timed ? (
        <button
          type="button"
          onClick={onTogglePause}
          aria-pressed={paused}
          aria-label={paused ? 'Resume notification timer' : 'Pause notification timer'}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          style={{ position: 'relative', width: u(T.footerProgress), height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
        >
          <span aria-hidden style={{ position: 'absolute', inset: 0, right: 'auto', width: `${Math.round(progress * 10000) / 100}%`, borderRadius: 9999, background: '#000', opacity: paused ? 0.55 : 1 }} />
        </button>
      ) : (
        <div aria-hidden style={{ width: u(T.footerProgress), height: '100%' }} />
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: '#000', cursor: 'pointer' }}>
        <BellCheckIcon style={iconBox(48)} strokeWidth={2} />
      </button>
    </div>
  )
}

/* -------------------------------- card ---------------------------------- */

type NoticeProps = { notification: NoticeData; onDismiss: (id: string) => void }

function NoticeCard({ notification, onDismiss }: NoticeProps) {
  const [paused, setPaused] = useState(false)
  const layout = layoutOf(notification)
  const spec = LAYOUTS[layout]
  const isWarning = layout === 'warning'
  const items = notification.items ?? (layout === 'calendar' ? FALLBACK_EVENTS : [])
  const hasList = isWarning || (layout === 'calendar' && items.length > 0) || (layout === 'reminder' && items.length > 0)
  const mascot = spec.mascot

  const cardVars = {
    '--frame-w': `${FRAME_WIDTH}px`,
    '--card-w': 'calc(var(--frame-w) * 0.833)',
    '--u': 'calc(var(--frame-w) / 1080)',
  } as CSSProperties

  return (
    <article
      role={isWarning ? 'alert' : 'status'}
      aria-live={isWarning ? 'assertive' : 'polite'}
      className="pointer-events-auto text-black shadow-2xl ring-1 ring-black/10"
      style={{ ...cardVars, width: 'var(--card-w)', boxSizing: 'border-box', padding: `${u(T.cardInset)} ${u(T.cardInset)} ${u(T.footerBottom)}`, borderRadius: u(T.cardRadius), background: '#fff', fontFamily: FONT, overflow: 'hidden' }}
    >
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: u(spec.minHeight), padding: `${u(T.bannerPadTop)} ${u(T.bannerPadX)} ${u(spec.padBottom)}`, borderRadius: u(T.bannerRadius), background: spec.background, overflow: 'hidden', boxSizing: 'border-box' }}>
        <CategoryPill layout={layout} label={notification.label ?? spec.label} />

        <div style={{ position: 'relative', zIndex: 1, marginTop: u(T.pillToTitle), maxWidth: u(spec.textRight - T.bannerPadX), minHeight: layout === 'system' || layout === 'custom' ? undefined : u(T.metaTop), paddingLeft: u(T.titleIndent) }}>
          <h2 style={{ margin: 0, fontSize: u(T.titleSize), lineHeight: u(T.titleLeading), fontWeight: 600, letterSpacing: 0, ...clampLines(3) }}>{notification.title}</h2>
          {notification.message && (
            <p style={{ margin: 0, marginTop: u(spec.descGap), paddingLeft: u(spec.descIndent - T.titleIndent), maxWidth: u(T.descMaxWidth), fontSize: u(T.bodySize), lineHeight: u(T.bodyLeading), fontWeight: 400, color: COLOR.muted, whiteSpace: 'pre-line', ...clampLines(5) }}>{notification.message}</p>
          )}
        </div>

        <div style={{ flexGrow: layout === 'system' ? 1 : 0, minHeight: layout === 'custom' ? 0 : u(T.descToMeta) }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Metadata layout={layout} notification={notification} items={items} />
        </div>

        {mascot && (
          <img
            src={MASCOT_URL[mascot.key]}
            alt=""
            aria-hidden
            style={{ position: 'absolute', right: u(T.mascotRight), top: `calc(50% + ${u(mascot.dy)})`, width: u(mascot.width), height: 'auto', maxHeight: '92%', transform: 'translateY(-50%)', objectFit: 'contain', pointerEvents: 'none' }}
          />
        )}
        {layout === 'system' && notification.actionUrl && <QrPanel value={notification.actionUrl} />}
      </div>

      {isWarning && <ResolutionRow text={notification.resolution ?? 'The resolution will appear here for the user to know how to fix it.'} />}
      {layout === 'calendar' && items.length > 0 && <EventRows items={items} />}
      {layout === 'reminder' && items.length > 0 && <TaskRows items={items} />}

      <footer style={{ display: 'flex', justifyContent: 'flex-end', marginTop: u(hasList ? T.footerGapAfterList : T.footerGapAfterBanner), paddingRight: u(T.listInset) }}>
        <TimerControls
          durationMs={notification.durationMs}
          paused={paused}
          onTogglePause={() => setPaused((value) => !value)}
          onComplete={() => onDismiss(notification.id)}
          onDismiss={() => onDismiss(notification.id)}
        />
      </footer>
    </article>
  )
}

export function FrameNoticeLayer() {
  const { notifications, dismiss } = useNotifications()
  if (notifications.length === 0) return null
  return (
    <section aria-label="Frame notifications" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden p-6 sm:p-8">
      {notifications.slice(0, 1).map((notification) => (
        <NoticeCard key={notification.id} notification={notification as NoticeData} onDismiss={dismiss} />
      ))}
    </section>
  )
}
