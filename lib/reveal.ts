// Pure portrait-reveal engine. No React/DOM imports.
//
// A reveal "cycle" covers every grid cell with album artwork, then opens
// cells at fixed wall-clock offsets until the portrait underneath is fully
// visible. One interval of completed portrait is held before the next cycle
// re-covers the grid. Cycles are uniform in length so any nowMs resolves in
// O(cells) work without replaying history.

export type RevealRect = { x: number; y: number; w: number; h: number }
export type RevealGroup = 'single' | 'pair' | 'quad' | 'row'

export type RevealCellState = {
  cell: number
  item: number
  group: number
  openedAtMs: number | null
  progress: number
}

export type RevealState = {
  cycle: number
  event: number
  groups: number
  cells: RevealCellState[]
  newlyOpened: { cells: number[]; item: number } | null
  lastChanged: { cells: number[]; item: number } | null
  complete: boolean
  nextEventAtMs: number
  cycleStartMs: number
  cycleEndMs: number
  transitionMs: number
}

export const REVEAL_TILE_MIN = 2
export const REVEAL_TILE_MAX = 10
export const REVEAL_GAP_MAX = 12
const CACHE_LIMIT = 8

function trimCache<T>(cache: Map<string, T>) {
  while (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value
    if (first === undefined) break
    cache.delete(first)
  }
}

function hash32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

export function hash01(seed: number, k: number): number {
  const combined = (seed ^ Math.imul(k | 0, 0x9e3779b9)) | 0
  return hash32(combined) / 4294967296
}

export function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

/** Clamp arbitrary stored config into the range the engine and schema accept. */
export function clampReveal(input: Partial<RevealConfig> | Record<string, unknown> | null | undefined): RevealConfig {
  const readTile = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(REVEAL_TILE_MAX, Math.max(REVEAL_TILE_MIN, n)) : fallback
  }
  const across = readTile(input?.tilesAcross, 6)
  const down = readTile(input?.tilesDown, 5)
  const gapNum = Math.round(Number(input?.gap))
  const group = (['single', 'pair', 'quad', 'row'] as const).includes(input?.group as RevealGroup) ? (input!.group as RevealGroup) : 'single'
  const effect = input?.effect === 'none' ? ('none' as const) : ('fade' as const)
  const gap = Math.min(REVEAL_GAP_MAX, Math.max(0, Number.isFinite(gapNum) ? gapNum : 2))
  return { tilesAcross: across, tilesDown: down, gap, group, effect }
}

export type RevealConfig = {
  tilesAcross: number
  tilesDown: number
  gap: number
  group: RevealGroup
  effect: 'fade' | 'none'
}

function blockDims(group: RevealGroup, cols: number): { w: number; h: number } {
  switch (group) {
    case 'pair':
      return { w: 1, h: 2 }
    case 'quad':
      return { w: 2, h: 2 }
    case 'row':
      return { w: cols, h: 1 }
    case 'single':
    default:
      return { w: 1, h: 1 }
  }
}

const partitionCache = new Map<string, RevealRect[]>()

/**
 * Split the grid into rectangular brick groups for the given shape. Every
 * cell belongs to exactly one rectangle; edge remainders shrink to smaller
 * rectangles rather than overlapping or losing cells.
 */
export function revealPartition(cols: number, rows: number, group: RevealGroup): RevealRect[] {
  const c = Math.min(REVEAL_TILE_MAX, Math.max(1, cols))
  const r = Math.min(REVEAL_TILE_MAX, Math.max(1, rows))
  const key = `${c}x${r}:${group}`
  const cached = partitionCache.get(key)
  if (cached) return cached
  const dims = blockDims(group, c)
  const rects: RevealRect[] = []
  let y = 0
  while (y < r) {
    const h = Math.min(dims.h, r - y)
    let x = 0
    while (x < c) {
      const w = Math.min(dims.w, c - x)
      rects.push({ x, y, w, h })
      x += w
    }
    y += h
  }
  partitionCache.set(key, rects)
  trimCache(partitionCache)
  return rects
}

function rectCells(rect: RevealRect, cols: number): number[] {
  const cells: number[] = []
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      cells.push((rect.y + dy) * cols + (rect.x + dx))
    }
  }
  return cells
}

function seededPermutation(n: number, seed: number, cycle: number): number[] {
  const key = `${seed}:${cycle}:${n}`
  const cached = permCache.get(key)
  if (cached) return cached
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const r = hash01(seed, cycle * 977 + i * 31 + 7)
    const j = Math.floor(r * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  permCache.set(key, arr)
  trimCache(permCache)
  return arr
}

const permCache = new Map<string, number[]>()

/**
 * Shuffled-map artwork order, mirroring the mosaic item pattern: the order is
 * one seeded shuffle of 0..M-1 and positions wrap mod M so the sequence
 * continues seamlessly across cycles and never repeats before a full pass.
 */
const itemOrderCache = new Map<number, number[]>()
function itemOrderFor(itemCount: number, seed: number): number[] {
  const cached = itemOrderCache.get(seed)
  if (cached && cached.length === itemCount) return cached
  const arr = Array.from({ length: itemCount }, (_, i) => i)
  const s = seed ^ 0x5a5a5a5a
  for (let i = itemCount - 1; i > 0; i--) {
    const r = hash01(s, i * 13 + 11)
    const j = Math.floor(r * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  itemOrderCache.set(seed, arr)
  if (itemOrderCache.size > CACHE_LIMIT) {
    const first = itemOrderCache.keys().next().value
    if (first !== undefined) itemOrderCache.delete(first)
  }
  return arr
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

export function revealAt(params: {
  nowMs: number
  offset?: number
  seed: number
  intervalSec: number
  itemCount: number
  cols: number
  rows: number
  group: RevealGroup
}): RevealState {
  const cols = Math.min(REVEAL_TILE_MAX, Math.max(1, Math.round(params.cols)))
  const rows = Math.min(REVEAL_TILE_MAX, Math.max(1, Math.round(params.rows)))
  const N = cols * rows
  const rects = revealPartition(cols, rows, params.group)
  const G = rects.length
  const M = params.itemCount
  if (!Number.isFinite(N) || N <= 0) {
    return {
      cycle: 0,
      event: -1,
      groups: 0,
      cells: [],
      newlyOpened: null,
      lastChanged: null,
      complete: false,
      nextEventAtMs: params.nowMs + 1000,
      cycleStartMs: params.nowMs,
      cycleEndMs: params.nowMs + 1000,
      transitionMs: 600,
    }
  }
  const S = Math.max(3000, params.intervalSec * 1000)
  const cycleLen = (G + 1) * S
  // One hold interval at the end of each cycle shows the finished portrait.
  const shiftBy = Math.round(params.offset ?? 0)
  const effectiveNow = params.nowMs + shiftBy * cycleLen
  const cycle = Math.floor(effectiveNow / cycleLen)
  const cycleStart = cycle * cycleLen
  const tLocal = effectiveNow - cycleStart
  let j = Math.floor(tLocal / S)
  if (!Number.isFinite(j) || j < 0) j = 0
  const complete = j >= G
  const transitionMs = Math.min(1200, 0.4 * S)

  const order = itemOrderFor(Math.max(1, M), params.seed)
  const seq = (slot: number) => {
    const wrapped = mod(slot, order.length)
    return M > 0 ? order[wrapped] : -1
  }
  // Covered cells draw their artwork straight from a slot formula so the
  // item stream keeps flowing across cycle boundaries without replaying.
  const coveredItem = (cell: number) => seq(cycle * N + cell)

  const perm = seededPermutation(G, params.seed ^ 0x3c3c3c3c, cycle)
  const openedAt = new Map<number, number>()
  const eventsToResolve = Math.min(j, G)
  for (let e = 0; e < eventsToResolve; e++) {
    const groupId = perm[e]
    if (groupId === undefined || groupId < 0 || groupId >= G) continue
    const rect = rects[groupId]
    if (!rect) continue
    for (const cell of rectCells(rect, cols)) {
      openedAt.set(cell, cycleStart + e * S)
    }
  }

  const cells: RevealCellState[] = []
  const groupOf = new Map<number, number>()
  for (let e = 0; e < eventsToResolve; e++) {
    const groupId = perm[e]
    if (groupId === undefined) continue
    for (const cell of rectCells(rects[groupId], cols)) groupOf.set(cell, groupId)
  }
  for (let cell = 0; cell < N; cell++) {
    const opened = openedAt.get(cell)
    if (opened === undefined) {
      cells.push({ cell, item: coveredItem(cell), group: -1, openedAtMs: null, progress: 0 })
      continue
    }
    const p = Math.min(1, Math.max(0, (effectiveNow - opened) / transitionMs))
    cells.push({ cell, item: coveredItem(cell), group: groupOf.get(cell) ?? -1, openedAtMs: opened, progress: p })
  }

  const lastEvent = eventsToResolve > 0 ? eventsToResolve - 1 : -1
  const lastCells = lastEvent >= 0 ? rectCells(rects[perm[lastEvent]], cols) : []
  const newlyOpened = lastEvent >= 0 && j <= G ? { cells: lastCells, item: coveredItem(lastCells[0] ?? 0) } : null

  return {
    cycle,
    event: j,
    groups: G,
    cells,
    newlyOpened,
    lastChanged: lastEvent >= 0 ? { cells: lastCells, item: coveredItem(lastCells[0] ?? 0) } : null,
    complete,
    nextEventAtMs: complete ? cycleStart + cycleLen : cycleStart + (j + 1) * S,
    cycleStartMs: cycleStart,
    cycleEndMs: cycleStart + cycleLen,
    transitionMs,
  }
}
