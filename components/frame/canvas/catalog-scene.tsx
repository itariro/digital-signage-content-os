'use client'

import { useMemo } from 'react'
import { Canvas2DLayer } from '@/components/frame/canvas/canvas-2d-layer'
import type { CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'

export type CatalogSlot = { x: number; y: number; w: number; h: number; rotation?: 0 | 90 | 180 | 270 }

export type CatalogRendererProps = {
  model: CatalogSceneRenderState
  slot: CatalogSlot
  refs?: Map<string, HTMLElement | null>
}

export function CatalogScene({ model, slot, refs }: CatalogRendererProps) {
  const commands = useMemo(() => catalogDraw(model), [model])
  return <Canvas2DLayer commands={commands} slot={slot} refs={refs} />
}
