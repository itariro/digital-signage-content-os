import type { ImageFillDef, TextFill } from './types'

// Task 2 curated image library. Images are procedurally generated locally
// (see task-2 report) and bundled under public/curated/text-fills/.
export type CuratedFill = { id: string; label: string; url: string; tags: string[] }

export const CURATED_FILLS: CuratedFill[] = [
  { id: 'marble-01', label: 'Marble', url: '/curated/text-fills/marble-01.jpg', tags: ['stone', 'light'] },
  { id: 'marble-02', label: 'Marble Dark', url: '/curated/text-fills/marble-02.jpg', tags: ['stone', 'dark'] },
  { id: 'nebula-01', label: 'Nebula', url: '/curated/text-fills/nebula-01.jpg', tags: ['space', 'colour'] },
  { id: 'nebula-02', label: 'Nebula Deep', url: '/curated/text-fills/nebula-02.jpg', tags: ['space', 'dark', 'colour'] },
  { id: 'wood-01', label: 'Wood Light', url: '/curated/text-fills/wood-01.jpg', tags: ['wood', 'warm', 'natural'] },
  { id: 'wood-02', label: 'Wood Dark', url: '/curated/text-fills/wood-02.jpg', tags: ['wood', 'dark', 'natural'] },
  { id: 'neon-01', label: 'Neon Cyan', url: '/curated/text-fills/neon-01.jpg', tags: ['neon', 'dark', 'colour', 'glow'] },
  { id: 'neon-02', label: 'Neon Magenta', url: '/curated/text-fills/neon-02.jpg', tags: ['neon', 'dark', 'colour', 'glow'] },
  { id: 'concrete-01', label: 'Concrete Light', url: '/curated/text-fills/concrete-01.jpg', tags: ['stone', 'grey', 'texture'] },
  { id: 'concrete-02', label: 'Concrete Dark', url: '/curated/text-fills/concrete-02.jpg', tags: ['stone', 'grey', 'dark', 'texture'] },
  { id: 'floral-01', label: 'Floral Pink', url: '/curated/text-fills/floral-01.jpg', tags: ['floral', 'colour', 'soft'] },
  { id: 'floral-02', label: 'Floral Peach', url: '/curated/text-fills/floral-02.jpg', tags: ['floral', 'warm', 'soft'] },
]

// Wiring to Task 1 ImageFillDef: curated picks map to a cover fill
// (spec §2.5: { url, fit: 'cover', scale: 100, position: 50 }).
export function curatedFillToImageFill(fill: CuratedFill): ImageFillDef {
  return { url: fill.url, fit: 'cover', scale: 100, position: 50 }
}

export function curatedFillToTextFill(fill: CuratedFill): TextFill {
  return { kind: 'image', image: curatedFillToImageFill(fill) }
}
