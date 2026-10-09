import { BookOpen, Clapperboard, Disc3, Images, Tv, type LucideIcon } from 'lucide-react'
import type { Album, AlbumItem, AlbumTheme, Presentation, Slideshow } from './types'

export type ThemeMeta = {
  label: string
  noun: string
  nowLabel: string
  icon: LucideIcon
  aspect: number
  searchable: boolean
  source: string
  placeholder: string
  suggestions: string[]
}

export const THEME_META: Record<AlbumTheme, ThemeMeta> = {
  movies: {
    label: 'Movie posters',
    noun: 'poster',
    nowLabel: 'Now showing',
    icon: Clapperboard,
    aspect: 2 / 3,
    searchable: true,
    source: 'Wikipedia',
    placeholder: 'Search films or directors',
    suggestions: ['Studio Ghibli', 'Christopher Nolan', 'Pixar', 'Alfred Hitchcock', 'Wes Anderson'],
  },
  tv: {
    label: 'TV series',
    noun: 'poster',
    nowLabel: 'Now streaming',
    icon: Tv,
    aspect: 2 / 3,
    searchable: true,
    source: 'TVmaze',
    placeholder: 'Search TV shows',
    suggestions: ['Doctor Who', 'The Office', 'Severance', 'Planet Earth', 'Star Trek'],
  },
  books: {
    label: 'Book covers',
    noun: 'cover',
    nowLabel: 'Now reading',
    icon: BookOpen,
    aspect: 2 / 3,
    searchable: true,
    source: 'Open Library',
    placeholder: 'Search titles or authors',
    suggestions: ['Tolkien', 'Agatha Christie', 'Jane Austen', 'Ursula K. Le Guin', 'Haruki Murakami'],
  },
  music: {
    label: 'Album art',
    noun: 'record',
    nowLabel: 'Now playing',
    icon: Disc3,
    aspect: 1,
    searchable: true,
    source: 'Apple Music',
    placeholder: 'Search albums or artists',
    suggestions: ['Miles Davis', 'The Beatles', 'Daft Punk', 'Fleetwood Mac', 'Nina Simone'],
  },
  photos: {
    label: 'Photos',
    noun: 'photo',
    nowLabel: 'Memory',
    icon: Images,
    aspect: 9 / 16,
    searchable: false,
    source: 'Your uploads',
    placeholder: '',
    suggestions: [],
  },
}

/** Safe lookup: legacy/imported albums may carry an unknown theme. */
export function themeMeta(theme: AlbumTheme | undefined): ThemeMeta {
  return (theme && THEME_META[theme]) || THEME_META.photos
}

export const PRESENTATION_META: Record<Presentation, { label: string; description: string }> = {
  fill: { label: 'Full bleed', description: 'Edge to edge, cropped to fill' },
  poster: { label: 'Poster', description: 'Framed one-sheet over a blurred wash' },
  book: { label: 'Book', description: 'Cover with spine and page edge' },
  vinyl: { label: 'Vinyl', description: 'Sleeve with a spinning record' },
  gallery: { label: 'Gallery mat', description: 'Matted print on a solid wall' },
}

const THEME_PRESENTATION: Record<AlbumTheme, Presentation> = {
  movies: 'poster',
  tv: 'poster',
  books: 'book',
  music: 'vinyl',
  photos: 'fill',
}

export function defaultSlideshow(theme: AlbumTheme): Slideshow {
  const presentation = THEME_PRESENTATION[theme]
  return {
    presentation,
    transition: presentation === 'fill' ? 'fade' : 'slide',
    kenBurns: presentation === 'fill',
    interval: presentation === 'fill' ? 20 : 30,
    order: 'sequence',
    artSize: presentation === 'vinyl' ? 68 : 74,
    artPosition: 'center',
    backdrop: 'blur',
    backdropColor: '#14161b',
  }
}

function hash(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffledIndex(cycle: number, count: number) {
  const round = Math.floor(cycle / count)
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(hash(round * 977 + i) * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order[((cycle % count) + count) % count]
}

export type SlideState = {
  cycle: number
  current: AlbumItem
  previous: AlbumItem
  next: AlbumItem
  progress: number
}

export function slideAt(album: Album, time: number, offset = 0): SlideState | null {
  const count = album.items.length
  if (count === 0) return null
  const intervalMs = Math.max(3, album.slideshow.interval) * 1000
  const cycle = Math.floor(time / intervalMs) + offset
  const pick = (c: number) =>
    album.items[album.slideshow.order === 'shuffle' && count > 1 ? shuffledIndex(c, count) : ((c % count) + count) % count]
  return {
    cycle,
    current: pick(cycle),
    previous: pick(cycle - 1),
    next: pick(cycle + 1),
    progress: (time % intervalMs) / intervalMs,
  }
}

const ARTWORK_HOSTS = ['upload.wikimedia.org', 'static.tvmaze.com', 'covers.openlibrary.org']

export function isAllowedArtworkHost(hostname: string) {
  return ARTWORK_HOSTS.includes(hostname) || /^is\d-ssl\.mzstatic\.com$/.test(hostname)
}
