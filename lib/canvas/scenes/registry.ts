import { nanoid } from 'nanoid'
import {
  Atom,
  Bug,
  CircleDot,
  Columns3,
  Crosshair,
  Gamepad2,
  Grid2X2Check,
  Grid3X3,
  Images,
  Orbit,
  Palette,
  ScanLine,
  Sparkles,
  Spline,
  Target,
  Timer,
  Type,
  Waves,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type {
  BounceConfig,
  CanvasArrangement,
  CanvasScene,
  CanvasSceneType,
  MarqueeConfig,
  PongConfig,
  SyncTestConfig,
  WidgetStyle,
} from '@/lib/types'
import type { ResolvedGeometry } from '@/lib/canvas/geometry'
import { CATALOG_TYPES, type CatalogSceneConfig, type CatalogSceneRenderState, type CatalogSceneType } from '@/lib/canvas/catalog-kit'
import { DEFAULT_STYLE } from '@/lib/widgets'
import { panoramaState } from './catalog/panorama'
import { galleryWallState } from './catalog/gallery-wall'
import { exhibitState } from './catalog/exhibit'
import { mosaicWallState } from './catalog/mosaic-wall'
import { tileRevealState } from './catalog/tile-reveal'
import { kineticTypeState } from './catalog/kinetic-type'
import { splitFlapState } from './catalog/split-flap'
import { multiLaneMarqueeState } from './catalog/multi-lane-marquee'
import { wallClockState } from './catalog/wall-clock'
import { countdownState } from './catalog/countdown'
import { gradientFlowState } from './catalog/gradient-flow'
import { colorFieldState } from './catalog/color-field'
import { lightSweepState } from './catalog/light-sweep'
import { ripplesState } from './catalog/ripples'
import { metaballsState } from './catalog/metaballs'
import { lissajousState } from './catalog/lissajous'
import { flowLinesState } from './catalog/flow-lines'
import { moireState } from './catalog/moire'
import { starfieldState } from './catalog/starfield'
import { matrixRainState } from './catalog/matrix-rain'
import { fireworksState } from './catalog/fireworks'
import { bouncingBallsState } from './catalog/bouncing-balls'
import { chaseLightsState } from './catalog/chase-lights'
import { breakoutState } from './catalog/breakout'
import { snakeState } from './catalog/snake'
import { spriteParadeState } from './catalog/sprite-parade'
import { lifeState } from './catalog/life'
import { calibrationState } from './catalog/calibration'
import { coerceDirection, ensureStrip, marqueeState, travelAxis, type MarqueeState } from './marquee'
import { bounceState, type BounceState } from './bounce'
import { pongState, type PongState } from './pong'
import { syncTestState, type SyncTestState } from './sync-test'
import type { SceneContext, SceneStateContext } from './types'

export type SceneMeta = { label: string; description: string; icon: LucideIcon }

export const SCENE_META: Record<CanvasSceneType, SceneMeta> = {
  marquee: { label: 'Marquee', description: 'Scrolling text that crosses every bezel', icon: Type },
  bounce: { label: 'Bounce', description: 'A logo that bounces around the whole wall', icon: CircleDot },
  pong: { label: 'Pong', description: 'A scripted rally that spans the wall', icon: Gamepad2 },
  'sync-test': { label: 'Sync test', description: 'Sweep bar, grid and slot labels for calibration', icon: Crosshair },
  panorama: { label: 'Panorama', description: 'Images stretched across the whole wall', icon: Images },
  'gallery-wall': { label: 'Gallery wall', description: 'A deterministic grid of gallery images', icon: Grid3X3 },
  exhibit: { label: 'Exhibit', description: 'A single centred image with a caption', icon: Images },
  'mosaic-wall': { label: 'Mosaic wall', description: 'Shuffled tiles from the shared mosaic engine', icon: Grid2X2Check },
  'tile-reveal': { label: 'Tile reveal', description: 'Tiles open in seeded groups', icon: Sparkles },
  'kinetic-type': { label: 'Kinetic type', description: 'Large letters that drift in waves', icon: Type },
  'split-flap': { label: 'Split flap', description: 'Flap-board letters that flip in place', icon: Columns3 },
  'multi-lane-marquee': { label: 'Multi-lane marquee', description: 'Several independent marquee lanes', icon: Columns3 },
  'wall-clock': { label: 'Wall clock', description: 'A deterministic wall clock from a configured epoch', icon: Timer },
  countdown: { label: 'Countdown', description: 'A seeded countdown to zero', icon: Timer },
  'gradient-flow': { label: 'Gradient flow', description: 'Flowing colour bands across the wall', icon: Palette },
  'color-field': { label: 'Colour field', description: 'A slowly changing colour grid', icon: Grid3X3 },
  'light-sweep': { label: 'Light sweep', description: 'A bright band sweeping the wall', icon: ScanLine },
  ripples: { label: 'Ripples', description: 'Concentric rings from the wall centre', icon: CircleDot },
  metaballs: { label: 'Metaballs', description: 'Soft circles moving on seeded orbits', icon: Atom },
  lissajous: { label: 'Lissajous', description: 'Parametric curves across the wall', icon: Spline },
  'flow-lines': { label: 'Flow lines', description: 'Streamlines drifting across the wall', icon: Waypoints },
  moire: { label: 'Moiré', description: 'Overlapping rings that create interference', icon: Orbit },
  starfield: { label: 'Starfield', description: 'A slow star field', icon: Sparkles },
  'matrix-rain': { label: 'Matrix rain', description: 'Columns of seeded glyphs', icon: Waves },
  fireworks: { label: 'Fireworks', description: 'Seeded bursts of particles', icon: Zap },
  'bouncing-balls': { label: 'Bouncing balls', description: 'Analytic bouncing circles', icon: CircleDot },
  'chase-lights': { label: 'Chase lights', description: 'A running chain of lights', icon: Zap },
  breakout: { label: 'Breakout', description: 'A bounded deterministic breakout replay', icon: Gamepad2 },
  snake: { label: 'Snake', description: 'A bounded deterministic snake replay', icon: Bug },
  'sprite-parade': { label: 'Sprite parade', description: 'Sprites crossing the wall in a loop', icon: Gamepad2 },
  life: { label: 'Life', description: 'A bounded cellular automata replay', icon: Grid3X3 },
  calibration: { label: 'Calibration', description: 'Setup grid, crosshair and wall dimensions', icon: Target },
}

export type SceneRenderState =
  | { type: 'marquee'; config: MarqueeConfig; state: MarqueeState }
  | { type: 'bounce'; config: BounceConfig; state: BounceState }
  | { type: 'pong'; config: PongConfig; state: PongState }
  | { type: 'sync-test'; config: SyncTestConfig; state: SyncTestState }
  | CatalogSceneRenderState

const catalogStateAt: Record<
  (typeof CATALOG_TYPES)[number],
  (config: CatalogSceneConfig, ctx: SceneStateContext) => CatalogSceneRenderState['state']
> = {
  panorama: panoramaState,
  'gallery-wall': galleryWallState,
  exhibit: exhibitState,
  'mosaic-wall': mosaicWallState,
  'tile-reveal': tileRevealState,
  'kinetic-type': kineticTypeState,
  'split-flap': splitFlapState,
  'multi-lane-marquee': multiLaneMarqueeState,
  'wall-clock': wallClockState,
  countdown: countdownState,
  'gradient-flow': gradientFlowState,
  'color-field': colorFieldState,
  'light-sweep': lightSweepState,
  ripples: ripplesState,
  metaballs: metaballsState,
  lissajous: lissajousState,
  'flow-lines': flowLinesState,
  moire: moireState,
  starfield: starfieldState,
  'matrix-rain': matrixRainState,
  fireworks: fireworksState,
  'bouncing-balls': bouncingBallsState,
  'chase-lights': chaseLightsState,
  breakout: breakoutState,
  snake: snakeState,
  'sprite-parade': spriteParadeState,
  life: lifeState,
  calibration: calibrationState,
}

const CATALOG_DEFAULT_CONFIG: CatalogSceneConfig = {
  text: 'Hello, wall',
  lines: ['Hello, wall', 'Synced across every frame'],
  colors: ['#7cc4ff', '#e879f9', '#facc15', '#22c55e'],
  speed: 240,
  density: 12,
  scale: 0.7,
  cols: 6,
  rows: 4,
  gap: 8,
  size: 48,
  angle: 0,
  periodSec: 4,
  fontFamily: 'mono',
  fontSize: 96,
  epochMs: 0,
  remainingMs: 300000,
  tileMs: 1000,
  reversed: false,
  trail: true,
  opacity: 1,
}

const TEXT_STYLE: WidgetStyle = {
  ...DEFAULT_STYLE,
  fontFamily: 'bebas',
  fontWeight: 700,
  color: '#ffffff',
  accent: '#7cc4ff',
  shadow: false,
}

export function defaultScene(type: CanvasSceneType, geometry: ResolvedGeometry): CanvasScene {
  const base = { id: nanoid(8), name: SCENE_META[type].label, enabled: true, seed: Math.floor(Math.random() * 2_147_483_647) - 1_073_741_824 }

  if (type === 'marquee') {
    const config: MarqueeConfig = {
      lines: ['Hello, wall'],
      layout: 'line',
      separator: '   •   ',
      direction: geometry.width >= geometry.height ? 'left' : 'up',
      orientation: 'upright',
      speed: 240,
      repeat: true,
      gap: 600,
      lineHeight: 200,
      fontSize: 160,
      align: 'center',
      crossOffset: 0,
      style: TEXT_STYLE,
    }
    return { ...base, type, durationSec: 60, config }
  }

  if (type === 'bounce') {
    const config: BounceConfig = {
      logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style: TEXT_STYLE, w: 300, h: 140 },
      speed: 280,
      angleDeg: null,
      startMode: 'seed',
      tint: { mode: 'none', colors: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6'], fixed: '#ffffff' },
      cornerCelebration: true,
      trail: { enabled: false, length: 0, spacingMs: 80 },
    }
    return { ...base, type, durationSec: 120, config }
  }

  if (type === 'pong') {
    const config: PongConfig = {
      axis: 'auto',
      paddle: { w: 24, h: 220, inset: 40 },
      ballSize: 28,
      baseSpeed: 900,
      rallyHits: [2, 7],
      pointsPerMatch: 7,
      serveDelayMs: 900,
      pointPauseMs: 1200,
      showScore: true,
      colors: { ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
      scoreStyle: TEXT_STYLE,
    }
    return { ...base, type, durationSec: 300, config }
  }

  if ((CATALOG_TYPES as readonly string[]).includes(type)) {
    const config: CatalogSceneConfig = { ...CATALOG_DEFAULT_CONFIG }
    return { ...base, type: type as CatalogSceneType, durationSec: 60, config }
  }

  const config: SyncTestConfig = { periodSec: 4, showGrid: true, showBezels: true }
  return { ...base, type: 'sync-test', durationSec: 30, config }
}

export function coerceScene(scene: CanvasScene, arrangement: CanvasArrangement, geometry: ResolvedGeometry): CanvasScene {
  if (scene.type !== 'marquee') return scene
  const direction = coerceDirection(scene.config.direction, arrangement)
  const axisChanged = travelAxis(scene.config.direction) !== travelAxis(direction)
  const config = { ...scene.config, direction, strip: axisChanged ? undefined : scene.config.strip }
  const strip = ensureStrip(config, { width: geometry.width, height: geometry.height })
  return { ...scene, config: { ...config, strip } }
}

export function computeSceneState(scene: CanvasScene, ctx: SceneStateContext): SceneRenderState {
  switch (scene.type) {
    case 'marquee':
      return { type: 'marquee', config: scene.config, state: marqueeState(scene.config, ctx) }
    case 'bounce':
      return { type: 'bounce', config: scene.config, state: bounceState(scene.config, ctx) }
    case 'pong':
      return { type: 'pong', config: scene.config, state: pongState(scene.config, ctx) }
    case 'sync-test':
      return { type: 'sync-test', config: scene.config, state: syncTestState(scene.config, ctx) }
    case 'panorama':
    case 'gallery-wall':
    case 'exhibit':
    case 'mosaic-wall':
    case 'tile-reveal':
    case 'kinetic-type':
    case 'split-flap':
    case 'multi-lane-marquee':
    case 'wall-clock':
    case 'countdown':
    case 'gradient-flow':
    case 'color-field':
    case 'light-sweep':
    case 'ripples':
    case 'metaballs':
    case 'lissajous':
    case 'flow-lines':
    case 'moire':
    case 'starfield':
    case 'matrix-rain':
    case 'fireworks':
    case 'bouncing-balls':
    case 'chase-lights':
    case 'breakout':
    case 'snake':
    case 'sprite-parade':
    case 'life':
    case 'calibration':
      return { type: scene.type, config: scene.config, state: catalogStateAt[scene.type](scene.config, ctx) }
    default: {
      const exhaustive: never = scene
      return exhaustive
    }
  }
}

export function sceneStateAt(scene: CanvasScene, ctx: SceneContext): SceneRenderState {
  return computeSceneState(scene, ctx)
}
