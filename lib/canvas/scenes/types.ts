import type { LucideIcon } from 'lucide-react'
import type { z } from 'zod'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { CanvasSceneType } from '@/lib/types'

export type SceneContext = {
  bounds: { width: number; height: number }
  geometry: ResolvedGeometry
  tMs: number
  seed: number
  slot: ResolvedSlot
}

export type SceneStateContext = Omit<SceneContext, 'slot'>

type FieldBase = { key: string; label: string; help?: string }

export type SceneField =
  | (FieldBase & { kind: 'number'; min: number; max: number; step?: number })
  | (FieldBase & { kind: 'slider'; min: number; max: number; step: number })
  | (FieldBase & { kind: 'text'; maxLength: number; placeholder?: string })
  | (FieldBase & { kind: 'textarea'; maxLength: number; rows?: number })
  | (FieldBase & { kind: 'lines'; maxLines: number; maxLength: number })
  | (FieldBase & { kind: 'select'; options: { value: string; label: string }[] })
  | (FieldBase & { kind: 'color' })
  | (FieldBase & { kind: 'toggle' })
  | (FieldBase & { kind: 'font' })
  | (FieldBase & { kind: 'style' })
  | (FieldBase & { kind: 'image'; accept: string[]; maxBytes: number })

export type SceneDefinition<TType extends CanvasSceneType, TConfig, TState> = {
  type: TType
  label: string
  description: string
  icon: LucideIcon
  defaultConfig(geometry: ResolvedGeometry): TConfig
  schema: z.ZodType<TConfig>
  fields: SceneField[]
  stateAt(config: TConfig, ctx: SceneStateContext): TState
}
