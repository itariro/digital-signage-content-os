'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Box, CalendarClock, ListTodo, Signpost, Split } from 'lucide-react'
import type { FrameNotification } from '@/lib/types'
import { useNotifications } from './notification-provider'

/* -------------------------------------------------------------------------
 * Design tokens
 *
 * Every measurement below comes from the reference artboards, where the
 * colour banner is 1306 units wide. `u(n)` converts a reference unit into a
 * length that scales with the card, so the layout is identical at any
 * resolution (the kiosk is a 1440-wide portrait screen).
 *   card width      = --card-w
 *   1 unit (--u)    = card width / 1332   (banner 1306 + 13 inset each side)
 * ----------------------------------------------------------------------- */
const u = (n: number) => `calc(${n} * var(--u))`

const FONT = "Montserrat, 'Montserrat Variable', ui-sans-serif, system-ui, sans-serif"

const T = {
  cardInset: 13,
  cardRadius: 53,
  bannerRadius: 40,
  bannerPadX: 57,
  bannerPadTop: 59,
  bannerPadBottom: 65,
  pillHeight: 84,
  pillPadX: 44,
  pillToTitle: 52,
  metaTop: 225, // text block min-height so the first metadata row starts at the same y in every layout
  descToMeta: 40,
  titleIndent: 17,
  descIndent: 22,
  descMaxWidth: 700,
  titleSize: 60,
  titleLeading: 72,
  pillSize: 36,
  bodySize: 30,
  bodyLeading: 33,
  metaIcon: 60,
  metaGap: 39,
  metaRowGap: 44,
  listGap: 17,
  listInset: 7,
  listRadius: 24,
  rowTile: 112,
  rowTileRadius: 26,
  footerHeight: 70,
  footerWidth: 273,
  footerProgress: 167,
  footerGapAfterList: 32,
  footerGapAfterBanner: 28,
  footerBottom: 20,
  mascotRight: 54, // visual edge sits ~60 from the banner edge (stand-in mascots carry 6 of padding)
  qrRight: 78,
  qrBottom: 38,
  qrWidth: 308,
  qrPadX: 31,
  qrPadTop: 30,
  qrCode: 245,
  qrBar: 85,
} as const

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
  warning: { background: COLOR.pink, pill: COLOR.pillWarning, label: 'Warning', minHeight: 690, padBottom: T.bannerPadBottom, pillMinWidth: 272, metaIndent: 12, textRight: 820, descGap: 15, descIndent: 22, mascot: { key: 'warning', width: 415, dy: -29 } },
  calendar: { background: COLOR.blue, pill: COLOR.pill, label: 'Calendar', minHeight: 690, padBottom: T.bannerPadBottom, pillMinWidth: 329, metaIndent: 12, textRight: 800, descGap: 15, descIndent: 22, mascot: { key: 'calendar', width: 442, dy: -28 } },
  reminder: { background: COLOR.yellow, pill: COLOR.pill, label: 'Today’s the day', minHeight: 704, padBottom: T.bannerPadBottom, metaIndent: 12, textRight: 830, descGap: 35, descIndent: 22, mascot: { key: 'reminder', width: 404, dy: -18 } },
  system: { background: COLOR.pink, pill: COLOR.pill, label: 'System Message', minHeight: 618, padBottom: 53, metaIndent: 33, textRight: 880, descGap: 32, descIndent: 22 },
  custom: { background: COLOR.blue, pill: COLOR.pill, label: 'Hey there!', minHeight: 690, padBottom: T.bannerPadBottom, metaIndent: 12, textRight: 775, descGap: 65, descIndent: 17, mascot: { key: 'custom', width: 495, dy: -6 } },
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
        fontWeight: 400,
        color: COLOR.text,
        whiteSpace: 'nowrap',
      }}
    >
      {withIcon && (
        <span style={{ ...iconBox(74), display: 'grid', placeItems: 'center', borderRadius: 9999, background: '#fff' }}>
          <CalendarClock style={iconBox(44)} strokeWidth={2} aria-hidden />
        </span>
      )}
      {label}
    </div>
  )
}

function MetaRow({ icon, children, bold, indent }: { icon: ReactNode; children: ReactNode; bold?: boolean; indent: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: u(T.metaIcon), gap: u(T.metaGap), marginLeft: u(indent) }}>
      <span style={{ ...iconBox(T.metaIcon), display: 'grid', placeItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: u(T.bodySize), lineHeight: 1.2, fontWeight: bold ? 700 : 400 }}>{children}</span>
    </div>
  )
}

/* lucide glyphs fill ~83% of their 24px box; scale up so the ink matches the 60-unit reference icon */
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
      <div style={{ padding: `${u(T.qrPadTop)} ${u(T.qrPadX)} ${u(45)}` }}>
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
          fontFamily: "'DIN Condensed','Bahnschrift','Barlow Condensed','Arial Narrow',Montserrat,sans-serif",
          fontSize: u(50),
          fontWeight: 600,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        <span aria-hidden style={{ position: 'absolute', top: u(-14), left: '50%', width: 0, height: 0, transform: 'translateX(-50%)', borderLeft: `${u(14)} solid transparent`, borderRight: `${u(14)} solid transparent`, borderBottom: `${u(14)} solid #000` }} />
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
    <div style={{ display: 'flex', alignItems: 'center', gap: u(30), minHeight: u(height), padding: `${u(shift)} ${u(46)} 0 ${u(37)}`, borderBottom: last ? 'none' : `1px solid ${COLOR.border}`, fontSize: u(T.bodySize), lineHeight: 1.2 }}>
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
      {items.map((item, index) => (
        <Row
          key={item.id ?? index}
          height={167}
          shift={22}
          last={index === items.length - 1}
          tile={<Tile tone={item.urgent ? 'pink' : 'green'}>{item.urgent ? <UrgentIcon style={{ ...iconBox(60), color: COLOR.urgentPurple }} /> : <CalendarClock style={{ ...iconBox(60), color: COLOR.eventGreen }} strokeWidth={2} aria-hidden />}</Tile>}
          trailing={item.time ? <span style={{ whiteSpace: 'nowrap', alignSelf: 'flex-start', marginTop: u(26) }}>{item.time}</span> : undefined}
        >
          <div style={{ fontWeight: 700 }}>{item.title}</div>
          {item.tag && (
            <span style={{ display: 'inline-block', marginTop: u(14), padding: `${u(8)} ${u(15)}`, borderRadius: 9999, background: COLOR.tag, color: '#fff', fontSize: u(24), fontWeight: 500, lineHeight: 1.1 }}>{item.tag}</span>
          )}
        </Row>
      ))}
    </ListBox>
  )
}

function TaskRows({ items }: { items: NoticeItem[] }) {
  return (
    <ListBox>
      {items.map((item, index) => (
        <Row key={item.id ?? index} height={167} shift={24} last={index === items.length - 1} tile={<Tile tone={index % 2 === 0 ? 'pink' : 'green'}><ListTodo style={iconBox(60)} strokeWidth={2} aria-hidden /></Tile>}>
          {item.title}
        </Row>
      ))}
    </ListBox>
  )
}

function ResolutionRow({ text }: { text: string }) {
  return (
    <ListBox>
      <Row height={158} last tile={<Tile tone="green"><ExtinguisherIcon style={iconBox(60)} strokeWidth={2} /></Tile>}>{text}</Row>
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
    if (done) completeRef.current()
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
          <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `calc(${progress} * ${u(T.footerProgress)})`, borderRadius: 9999, background: '#000', opacity: paused ? 0.55 : 1 }} />
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
    '--card-w': 'min(calc(100vw - 72px), 1440px)',
    '--u': 'calc(var(--card-w) / 1332)',
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
          <h2 style={{ margin: 0, fontSize: u(T.titleSize), lineHeight: u(T.titleLeading),fontWeight: 500, letterSpacing: 0 }}>{notification.title}</h2>
          {notification.message && (
            <p style={{ margin: 0, marginTop: u(spec.descGap), paddingLeft: u(spec.descIndent - T.titleIndent), maxWidth: u(T.descMaxWidth), fontSize: u(T.bodySize), lineHeight: u(T.bodyLeading), fontWeight: 400, color: COLOR.muted, whiteSpace: 'pre-line' }}>{notification.message}</p>
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
    <section aria-label="Frame notifications" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden">
      {notifications.slice(0, 1).map((notification) => (
        <NoticeCard key={notification.id} notification={notification as NoticeData} onDismiss={dismiss} />
      ))}
    </section>
  )
}