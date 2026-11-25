import { nanoid } from 'nanoid'
import { CircleDot, Crosshair, Gamepad2, Type, type LucideIcon } from 'lucide-react'
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
import { DEFAULT_STYLE } from '@/lib/widgets'
import { coerceDirection, ensureStrip, marqueeState, type MarqueeState } from './marquee'
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
}

export type SceneRenderState =
  | { type: 'marquee'; config: MarqueeConfig; state: MarqueeState }
  | { type: 'bounce'; config: BounceConfig; state: BounceState }
  | { type: 'pong'; config: PongConfig; state: PongState }
  | { type: 'sync-test'; config: SyncTestConfig; state: SyncTestState }

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

  const config: SyncTestConfig = { periodSec: 4, showGrid: true, showBezels: true }
  return { ...base, type: 'sync-test', durationSec: 30, config }
}

export function coerceScene(scene: CanvasScene, arrangement: CanvasArrangement, geometry: ResolvedGeometry): CanvasScene {
  if (scene.type !== 'marquee') return scene
  const direction = coerceDirection(scene.config.direction, arrangement)
  const config = { ...scene.config, direction }
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
    default: {
      const exhaustive: never = scene
      return exhaustive
    }
  }
}

export function sceneStateAt(scene: CanvasScene, ctx: SceneContext): SceneRenderState {
  return computeSceneState(scene, ctx)
}
