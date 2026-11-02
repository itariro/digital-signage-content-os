// Pure mosaic presentation engine. No React/DOM imports.

export type MosaicGrid = { cols: number; rows: number; fallback: boolean }

export type MosaicTileState = {
  tile: number
  item: number
  previousItem: number
  changedAtMs: number
  progress: number
}

export type MosaicState = {
  event: number
  tiles: MosaicTileState[]
  lastChanged: { tile: number; item: number } | null
  nextEventAtMs: number
}

const PERM_CACHE_LIMIT = 8
const permCache = new Map<string, number[]>()
const itemOrderCache = new Map<number, number[]>()

function trimCache(cache: Map<string, number[]>) {
  while (cache.size > PERM_CACHE_LIMIT) {
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

function seededPermutation(n: number, seed: number, round: number): number[] {
  const key = `${seed}:${round}:${n}`
  const cached = permCache.get(key)
  if (cached) return cached
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const r = hash01(seed, round * 997 + i * 31 + 7)
    const j = Math.floor(r * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  permCache.set(key, arr)
  trimCache(permCache)
  return arr
}

function itemOrderFor(M: number, seed: number): number[] {
  const cached = itemOrderCache.get(seed)
  if (cached && cached.length === M) return cached
  const arr = Array.from({ length: M }, (_, i) => i)
  const s = seed ^ 0x5a5a5a5a
  for (let i = M - 1; i > 0; i--) {
    const r = hash01(s, i * 13 + 11)
    const j = Math.floor(r * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  itemOrderCache.set(seed, arr)
  // bound itemOrderCache too
  if (itemOrderCache.size > PERM_CACHE_LIMIT) {
    const first = itemOrderCache.keys().next().value
    if (first !== undefined) itemOrderCache.delete(first)
  }
  return arr
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

function eventTime(k: number, S: number, seed: number, jitter: number): number {
  const j = (hash01(seed, k) - 0.5) * jitter * S
  return k * S + j
}

export function mosaicGrid(params: {
  width: number
  height: number
  tileAspect: number
  tilesAcross: number
  itemCount: number
}): MosaicGrid {
  const { width, height, tileAspect, itemCount } = params
  let ta = params.tilesAcross
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { cols: 2, rows: 2, fallback: true }
  }
  if (!Number.isFinite(tileAspect) || tileAspect <= 0) {
    return { cols: 2, rows: 2, fallback: true }
  }
  const aspect = tileAspect
  const tryGrid = (t: number): { cols: number; rows: number; N: number } => {
    const short = Math.min(width, height)
    const long = Math.max(width, height)
    const tileShort = short / t
    // tile's long dimension:
    const tileLong = tileShort / aspect
    const longCount = Math.max(t, Math.round(long / tileLong))
    if (width <= height) {
      return { cols: t, rows: longCount, N: t * longCount }
    }
    return { cols: longCount, rows: t, N: longCount * t }
  }

  // reduce tilesAcross until N <= itemCount-1
  let chosen: { cols: number; rows: number; N: number } | null = null
  let t = Math.min(10, Math.max(2, Math.floor(ta)))
  for (; t >= 2; t--) {
    const g = tryGrid(t)
    if (g.N <= itemCount - 1) {
      chosen = g
      break
    }
  }
  if (!chosen) {
    // no valid grid with N>=4? signal fallback
    const g = tryGrid(Math.min(10, Math.max(2, Math.floor(ta))))
    if (g.N < 4 || itemCount < 5) {
      return { cols: 2, rows: 2, fallback: true }
    }
    return { cols: g.cols, rows: g.rows, fallback: true }
  }
  if (chosen.cols * chosen.rows < 4) {
    return { cols: 2, rows: 2, fallback: true }
  }
  if (itemCount < 5) {
    return { cols: chosen.cols, rows: chosen.rows, fallback: true }
  }
  return { cols: chosen.cols, rows: chosen.rows, fallback: false }
}

export function mosaicAt(params: {
  nowMs: number
  offset: number
  seed: number
  itemCount: number
  intervalSec: number
  jitter?: number
  cols: number
  rows: number
}): MosaicState {
  const { cols, rows } = params
  const N = cols * rows
  const M = params.itemCount
  if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(M) || M <= 0) {
    return { event: -1, tiles: [], lastChanged: null, nextEventAtMs: params.nowMs + 1000 }
  }
  const S = Math.max(3, params.intervalSec) * 1000
  const jitter = params.jitter ?? 0.2
  const seed = params.seed
  const permSeed = seed ^ 0xa5a5a5a5

  const freshMode = M >= 2 * N

  const transitionMs = Math.min(1200, 0.5 * S * (1 - jitter))

  // find current k
  let baseK = Math.floor(params.nowMs / S)
  const candidates = [baseK - 1, baseK, baseK + 1]
  let currentK = -1
  for (const c of candidates) {
    if (eventTime(c, S, seed, jitter) <= params.nowMs) {
      if (c > currentK) currentK = c
    }
  }

  // offset
  let effectiveNow = params.nowMs
  if (params.offset !== 0) {
    currentK = currentK + params.offset
    if (currentK < 0) currentK = -1 // keep simple
    if (currentK >= 0) {
      const tk = eventTime(currentK, S, seed, jitter)
      if (tk > effectiveNow) effectiveNow = tk
    }
  }

  const seq = (j: number): number => {
    const order = itemOrderFor(M, seed)
    return order[mod(j, M)]
  }

  const target = (k: number): number => {
    const r = Math.floor(k / N)
    const round = freshMode ? r : 0
    const perm = seededPermutation(N, permSeed, round)
    const pos = mod(k, N)
    return perm[pos]
  }

  // initial round permutation (the round just before the first event)
  const initialRound = freshMode ? -1 : 0
  const initialPerm = seededPermutation(N, permSeed, initialRound)
  const posByTile: number[] = new Array(N)
  for (let pos = 0; pos < N; pos++) posByTile[initialPerm[pos]] = pos

  const lastChanged =
    currentK >= 0
      ? { tile: target(currentK), item: seq(currentK) }
      : N > 0
        ? { tile: 0, item: seq(posByTile[0] - N) }
        : null

  // resolve each tile
  const tiles: MosaicTileState[] = []
  for (let t = 0; t < N; t++) {
    // find latest event <= currentK targeting t
    let lastEvt = -1
    let prevEvt = -1
    if (currentK >= 0) {
      for (let k = currentK; k >= currentK - 2 * N; k--) {
        if (target(k) === t) {
          if (lastEvt === -1) lastEvt = k
          else if (prevEvt === -1) {
            prevEvt = k
            break
          }
        }
      }
    }
    let item: number
    let previousItem: number
    let changedAtMs: number
    let progress: number
    if (lastEvt >= 0) {
      item = seq(lastEvt)
      if (prevEvt >= 0) previousItem = seq(prevEvt)
      else previousItem = seq(posByTile[t] - N)
      changedAtMs = eventTime(lastEvt, S, seed, jitter)
      progress = Math.min(1, Math.max(0, (effectiveNow - changedAtMs) / transitionMs))
    } else {
      item = seq(posByTile[t] - N)
      previousItem = item
      changedAtMs = Number.NEGATIVE_INFINITY
      progress = 1
    }
    tiles.push({ tile: t, item, previousItem, changedAtMs: Number.isFinite(changedAtMs) ? changedAtMs : effectiveNow, progress })
  }

  const nextEventAtMs =
    currentK >= 0
      ? eventTime(currentK + 1, S, seed, jitter)
      : eventTime(0, S, seed, jitter)

  return {
    event: currentK,
    tiles,
    lastChanged,
    nextEventAtMs,
  }
}