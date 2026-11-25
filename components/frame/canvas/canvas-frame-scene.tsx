import type { CSSProperties, ReactNode } from 'react'
import type { Align, BounceConfig, MarqueeConfig, PongConfig, SyncTestConfig } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { SceneRenderState } from '@/lib/canvas/scenes/registry'
import type { BounceState } from '@/lib/canvas/scenes/bounce'
import type { MarqueeState } from '@/lib/canvas/scenes/marquee'
import type { PongState } from '@/lib/canvas/scenes/pong'
import type { SyncTestState } from '@/lib/canvas/scenes/sync-test'
import { copyPosition, visibleCopies, visibleSegments } from '@/lib/canvas/scenes/marquee'
import { pongBallRect, pongNetRect, pongPaddleRect, projectRect, type Rect } from '@/lib/canvas/project'
import { fontStack } from '@/lib/fonts'
import { textEffectCss } from '@/lib/text-effects'

export type CanvasElementRefs = Map<string, HTMLElement | null>

const MARQUEE_POOL = 4
const TRAIL_POOL = 12

type ViewProps<TConfig, TState> = {
  config: TConfig
  state: TState
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refs: CanvasElementRefs
}

const JUSTIFY: Record<Align, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
}

function ref(key: string, refs: CanvasElementRefs) {
  return (element: HTMLElement | null) => { refs.set(key, element) }
}

function textStyle(style: MarqueeConfig['style'], color = style.color): CSSProperties {
  return {
    fontFamily: fontStack(style.fontFamily),
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing / 100}em`,
    color,
    opacity: style.opacity / 100,
    ...textEffectCss(style),
  }
}

function box(rect: Rect, extra: CSSProperties = {}): CSSProperties {
  return { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...extra }
}

function placed(el: HTMLElement | null, rect: Rect): void {
  if (!el) return
  el.style.left = `${rect.x}px`
  el.style.top = `${rect.y}px`
  el.style.width = `${rect.w}px`
  el.style.height = `${rect.h}px`
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function MarqueeView({ config, state, refs }: ViewProps<MarqueeConfig, MarqueeState>) {
  const rotate = state.axis === 'y' && state.orientation === 'upright' ? (state.direction === 'up' ? -90 : 90) : 0
  const text = textStyle(state.style)
  const height = state.layout === 'block' ? state.lineHeight : state.strip.crossPx

  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: MARQUEE_POOL }, (_, j) =>
        state.strip.segments.map((segment, index) => (
          <div
            key={`${j}:${index}`}
            ref={ref(`marquee:${j}:${index}`, refs)}
            style={box({ x: 0, y: 0, w: segment.w, h: height }, {
              display: 'none',
              alignItems: 'center',
              justifyContent: JUSTIFY[config.align],
              overflow: 'hidden',
            })}
          >
            <span
              style={{
                ...text,
                fontSize: state.fontSize,
                lineHeight: state.layout === 'block' ? `${state.lineHeight}px` : undefined,
                whiteSpace: 'pre',
                display: 'inline-block',
                transform: rotate ? `rotate(${rotate}deg)` : undefined,
                writingMode: state.axis === 'y' && state.orientation === 'rotated' ? 'vertical-rl' : undefined,
              }}
            >
              {segment.text}
            </span>
          </div>
        )),
      )}
    </div>
  )
}

function logoShape(shape: 'none' | 'ellipse' | 'pill' | 'rounded'): CSSProperties {
  if (shape === 'ellipse') return { borderRadius: '50%', border: '4px solid currentColor' }
  if (shape === 'pill') return { borderRadius: 9999, border: '4px solid currentColor' }
  if (shape === 'rounded') return { borderRadius: 24, border: '4px solid currentColor' }
  return {}
}

function BounceView({ config, state, refs }: ViewProps<BounceConfig, BounceState>) {
  const color = state.color ?? (config.logo.kind === 'text' ? config.logo.style.color : '#ffffff')
  return (
    <>
      {Array.from({ length: TRAIL_POOL }, (_, index) => (
        <div
          key={index}
          ref={ref(`bounce:trail:${index}`, refs)}
          style={box({ x: 0, y: 0, w: state.w, h: state.h }, {
            display: 'none',
            borderRadius: config.logo.kind === 'text' ? 9999 : 12,
            background: color,
          })}
        />
      ))}
      <div
        ref={ref('bounce:logo', refs)}
        style={box({ x: 0, y: 0, w: state.w, h: state.h }, {
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        })}
      >
        {config.logo.kind === 'text' ? (
          <div
            style={{
              ...textStyle(config.logo.style, color),
              ...logoShape(config.logo.shape),
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.min(config.logo.h * 0.6, (config.logo.w / Math.max(1, config.logo.text.length)) * 1.6),
              textAlign: 'center',
            }}
          >
            {config.logo.text}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logo.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div
        ref={ref('bounce:corner', refs)}
        style={box({ x: 0, y: 0, w: state.w + 32, h: state.h + 32 }, {
          display: 'none', borderRadius: 24, border: `6px solid ${color}`, boxShadow: `0 0 48px ${color}`,
        })}
      />
    </>
  )
}

function scoreBox(axis: 'horizontal' | 'vertical'): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: axis === 'horizontal' ? 'row' : 'column',
    justifyContent: 'space-between',
    padding: axis === 'horizontal' ? '32px 56px' : '56px 32px',
    pointerEvents: 'none',
  }
}

function PongView({ config, state, geometry, refs }: ViewProps<PongConfig, PongState>) {
  const axis = state.axis
  const score = textStyle(config.scoreStyle, config.colors.text)
  const scoreFont = Math.min(geometry.width, geometry.height) * 0.09

  return (
    <>
      <div
        ref={ref('pong:net', refs)}
        style={box(pongNetRect(axis, geometry), {
          opacity: 0.55,
          backgroundImage:
            axis === 'horizontal'
              ? `repeating-linear-gradient(to bottom, ${config.colors.net} 0 14px, transparent 14px 28px)`
              : `repeating-linear-gradient(to right, ${config.colors.net} 0 14px, transparent 14px 28px)`,
        })}
      />
      {config.showScore && (
        <div style={scoreBox(axis)}>
          <span ref={ref('pong:score:0', refs)} style={{ ...score, fontSize: scoreFont }}>{state.score[0]}</span>
          <span ref={ref('pong:score:1', refs)} style={{ ...score, fontSize: scoreFont }}>{state.score[1]}</span>
        </div>
      )}
      <div ref={ref('pong:paddle:0', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: config.colors.paddles, borderRadius: config.paddle.w / 2 })} />
      <div ref={ref('pong:paddle:1', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: config.colors.paddles, borderRadius: config.paddle.w / 2 })} />
      <div ref={ref('pong:ball', refs)} style={box({ x: 0, y: 0, w: config.ballSize, h: config.ballSize }, { display: 'none', background: config.colors.ball, borderRadius: '50%' })} />
      <div
        ref={ref('pong:banner', refs)}
        className="absolute inset-0 flex items-center justify-center"
        style={{
          display: 'none',
          ...score,
          color: config.colors.text,
          fontSize: Math.min(geometry.width, geometry.height) * 0.07,
          letterSpacing: '0.12em',
        }}
      />
    </>
  )
}

function SyncTestView({ config, geometry, refs }: ViewProps<SyncTestConfig, SyncTestState>) {
  return (
    <>
      {config.showGrid && (
        <div className="absolute inset-0">
          {Array.from({ length: Math.floor(geometry.width / 120) + 1 }, (_, index) => (
            <div
              key={`v${index}`}
              style={{ position: 'absolute', left: index * 120, top: 0, width: 1, height: geometry.height, background: 'rgba(255,255,255,0.16)' }}
            />
          ))}
          {Array.from({ length: Math.floor(geometry.height / 120) + 1 }, (_, index) => (
            <div
              key={`h${index}`}
              style={{ position: 'absolute', left: 0, top: index * 120, width: geometry.width, height: 1, background: 'rgba(255,255,255,0.16)' }}
            />
          ))}
        </div>
      )}
      {config.showBezels &&
        geometry.gaps.map((gap, index) => (
          <div
            key={`gap${index}`}
            style={box(gap, { border: '2px solid rgba(255,180,0,0.65)', background: 'rgba(255,180,0,0.08)' })}
          />
        ))}
      {geometry.slots.map((entry) => (
        <div
          key={entry.slotId}
          style={{
            position: 'absolute',
            left: entry.x,
            top: entry.y,
            width: entry.w,
            height: entry.h,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(120,200,255,0.45)',
            color: '#dbeafe',
            fontFamily: fontStack('mono'),
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {entry.marker} · {entry.slotId}
        </div>
      ))}
      <div ref={ref('sync:bar', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: '#ffffff', boxShadow: '0 0 32px rgba(255,255,255,0.9)' })} />
    </>
  )
}

export function CanvasFrameScene({
  model,
  geometry,
  slot,
  refs,
}: {
  model: SceneRenderState
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refs: CanvasElementRefs
}): ReactNode {
  switch (model.type) {
    case 'marquee':
      return <MarqueeView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'bounce':
      return <BounceView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'pong':
      return <PongView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'sync-test':
      return <SyncTestView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
  }
}

/**
 * Called once per rendered frame by CanvasStage. Only element styles change;
 * no React state is touched here.
 */
export function paintScene(
  model: SceneRenderState,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
  refs: CanvasElementRefs,
): void {
  if (model.type === 'marquee') {
    const { config, state } = model
    const axisStart = state.axis === 'x' ? slot.x : slot.y
    const axisEnd = axisStart + (state.axis === 'x' ? slot.w : slot.h)
    const copies = visibleCopies(config, geometry, slot, state.tauPx)
    const height = state.layout === 'block' ? state.lineHeight : state.strip.crossPx
    for (let j = 0; j < MARQUEE_POOL; j++) {
      for (let i = 0; i < state.strip.segments.length; i++) {
        const el = refs.get(`marquee:${j}:${i}`)
        if (!el) continue
        const copy = copies[j]
        if (copy === undefined) {
          el.style.display = 'none'
          continue
        }
        const origin = copyPosition(config, geometry, state.tauPx, copy)
        const segment = state.strip.segments[i]
        const shown = visibleSegments(state.strip, origin, axisStart, axisEnd).includes(segment)
        el.style.display = shown ? 'flex' : 'none'
        if (shown) {
          placed(el, projectRect(
            state.axis === 'x' ? 'horizontal' : 'vertical',
            origin + segment.at,
            state.crossStart,
            segment.w,
            height,
          ))
        }
      }
    }
    return
  }

  if (model.type === 'bounce') {
    const { config, state } = model
    const color = state.color ?? (config.logo.kind === 'text' ? config.logo.style.color : '#ffffff')
    const allowDecorative = !reducedMotion()
    const logo = refs.get('bounce:logo')
    if (logo) {
      logo.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`
      logo.style.color = color
    }
    for (let i = 0; i < TRAIL_POOL; i++) {
      const el = refs.get(`bounce:trail:${i}`)
      if (!el) continue
      const point = state.trail[i]
      const show = allowDecorative && config.trail.enabled && state.trail.length > 0 && Boolean(point)
      el.style.display = show ? 'block' : 'none'
      if (show && point) {
        el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
        el.style.opacity = String(Math.max(0.04, 0.18 - i * 0.03))
        el.style.background = color
      }
    }
    const corner = refs.get('bounce:corner')
    if (corner) {
      const show = allowDecorative && config.cornerCelebration && state.cornerAgeMs !== null && state.cornerAgeMs < 1200
      corner.style.display = show ? 'block' : 'none'
      if (show && state.cornerAgeMs !== null) {
        corner.style.transform = `translate3d(${state.x - 16}px, ${state.y - 16}px, 0)`
        corner.style.opacity = String(1 - state.cornerAgeMs / 1200)
      }
    }
    return
  }

  if (model.type === 'pong') {
    const { config, state } = model
    const axis = state.axis
    placed(refs.get('pong:net') ?? null, pongNetRect(axis, geometry))
    placed(refs.get('pong:paddle:0') ?? null, pongPaddleRect(axis, 0, config.paddle, state.paddles[0], geometry))
    placed(refs.get('pong:paddle:1') ?? null, pongPaddleRect(axis, 1, config.paddle, state.paddles[1], geometry))
    const ball = refs.get('pong:ball')
    if (ball) {
      ball.style.display = state.ball.visible ? 'block' : 'none'
      if (state.ball.visible) placed(ball, pongBallRect(axis, state.ball, config.ballSize))
    }
    for (const side of [0, 1] as const) {
      const score = refs.get(`pong:score:${side}`)
      if (score) score.textContent = String(state.score[side])
    }
    const banner = refs.get('pong:banner')
    if (banner) {
      banner.style.display = state.banner ? 'flex' : 'none'
      if (state.banner) banner.textContent = state.banner
    }
    return
  }

  const bar: Rect =
    model.state.axis === 'x'
      ? { x: model.state.bar - 3, y: 0, w: 6, h: geometry.height }
      : { x: 0, y: model.state.bar - 3, w: geometry.width, h: 6 }
  placed(refs.get('sync:bar') ?? null, bar)
}
