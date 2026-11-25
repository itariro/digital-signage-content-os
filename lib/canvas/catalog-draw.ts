import { canvasAssetUrl, parseCanvasAssetRef } from '@/lib/canvas/asset-refs'
import type { DrawCommand } from '@/lib/canvas/draw'
import {
  CATALOG_DEFAULT_COLORS,
  type CatalogCell,
  type CatalogSceneRenderState,
} from '@/lib/canvas/catalog-kit'

function palette(model: CatalogSceneRenderState): string[] {
  return model.config.colors?.length ? model.config.colors : CATALOG_DEFAULT_COLORS
}

function colorFor(model: CatalogSceneRenderState, cell: CatalogCell, index: number): string {
  return cell.color ?? palette(model)[index % palette(model).length]
}

function imageSrc(ref: string | undefined): string | null {
  const hash = parseCanvasAssetRef(ref)
  return hash ? canvasAssetUrl(hash) : null
}

function rectCells(model: CatalogSceneRenderState, cells: CatalogCell[], useImages = false): DrawCommand[] {
  return cells.flatMap((cell, index) => {
    if (model.type === 'life' && cell.value <= 0) return []
    const src = useImages ? imageSrc(cell.image) : null
    if (src) {
      return { kind: 'image', src, x: cell.x, y: cell.y, w: cell.w, h: cell.h, fit: 'cover' }
    }
    return {
      kind: 'rect', x: cell.x, y: cell.y, w: cell.w, h: cell.h,
      fill: colorFor(model, cell, index),
      opacity: 0.35 + cell.value * 0.65,
    }
  })
}

function circleCells(model: CatalogSceneRenderState, cells: CatalogCell[], centered = false): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'circle',
    x: centered ? cell.x : cell.x + cell.w / 2,
    y: centered ? cell.y : cell.y + cell.h / 2,
    r: Math.max(0, cell.w / 2),
    stroke: colorFor(model, cell, index),
    lineWidth: Math.max(1, Math.min(8, cell.w / 20)),
    opacity: 0.25 + cell.value * 0.75,
  }))
}

function lineCells(model: CatalogSceneRenderState, cells: CatalogCell[]): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'line',
    x1: cell.x,
    y1: cell.y,
    x2: cell.x + cell.w,
    y2: cell.y + cell.h,
    color: colorFor(model, cell, index),
    width: Math.max(1, cell.h),
    opacity: 0.4 + cell.value * 0.6,
  }))
}

function textCells(model: CatalogSceneRenderState, cells: CatalogCell[]): DrawCommand[] {
  return cells.map((cell, index) => ({
    kind: 'text',
    text: cell.text ?? ' ',
    x: cell.x + cell.w / 2,
    y: cell.y + cell.h / 2,
    fontFamily: model.config.fontFamily ?? 'mono',
    fontSize: model.config.fontSize ?? Math.max(16, Math.min(180, cell.h * 0.7)),
    color: colorFor(model, cell, index),
    align: 'center',
    baseline: 'middle',
    opacity: 0.5 + cell.value * 0.5,
  }))
}

function labels(model: CatalogSceneRenderState): DrawCommand[] {
  const color = palette(model)[0]
  const size = model.config.fontSize ?? 96
  return model.state.texts.slice(0, 4).map((text, index) => ({
    kind: 'text' as const,
    text,
    x: 100,
    y: 120 + index * (size + 20),
    fontFamily: model.config.fontFamily ?? 'mono',
    fontSize: size,
    color,
  }))
}

function background(model: CatalogSceneRenderState): DrawCommand {
  const colors = palette(model)
  return {
    kind: 'gradient',
    x: 0,
    y: 0,
    w: 100000,
    h: 100000,
    colors: [colors[colors.length - 1] ?? '#000000', '#000000'],
    angleDeg: model.config.angle ?? 0,
  }
}

export function catalogDraw(model: CatalogSceneRenderState): DrawCommand[] {
  const cells = model.state.cells.slice(0, 38)
  let body: DrawCommand[] = []

  switch (model.type) {
    case 'panorama':
    case 'gallery-wall':
      body = rectCells(model, cells, true)
      break
    case 'exhibit':
      body = [...rectCells(model, cells, true), ...labels(model)]
      break
    case 'mosaic-wall':
    case 'tile-reveal':
      body = rectCells(model, cells, true)
      break
    case 'kinetic-type':
    case 'split-flap':
    case 'multi-lane-marquee':
    case 'matrix-rain':
      body = textCells(model, cells)
      break
    case 'wall-clock':
    case 'countdown':
      body = labels(model)
      break
    case 'gradient-flow':
      body = [
        { kind: 'gradient', x: 0, y: 0, w: 100000, h: 100000, colors: palette(model), angleDeg: model.config.angle ?? 0 },
        ...rectCells(model, cells),
      ]
      break
    case 'color-field':
      body = rectCells(model, cells)
      break
    case 'light-sweep':
      body = [
        { kind: 'gradient', x: 0, y: 0, w: 100000, h: 100000, colors: palette(model), angleDeg: 0 },
        ...rectCells(model, cells),
      ]
      break
    case 'ripples':
    case 'moire':
      body = circleCells(model, cells, true)
      break
    case 'metaballs':
    case 'starfield':
    case 'fireworks':
    case 'bouncing-balls':
    case 'chase-lights':
      body = circleCells(model, cells)
      break
    case 'lissajous':
    case 'flow-lines':
      body = lineCells(model, cells)
      break
    case 'breakout':
    case 'snake':
    case 'sprite-parade':
      body = rectCells(model, cells, model.type === 'sprite-parade')
      break
    case 'life':
      body = rectCells(model, cells.filter((cell) => Boolean(cell.value)), false)
      break
    case 'calibration':
      body = [...rectCells(model, cells), ...labels(model)]
      break
  }

  return [background(model), ...body].slice(0, 40)
}
