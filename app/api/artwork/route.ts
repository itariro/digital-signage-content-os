import { NextResponse } from 'next/server'
import { z } from 'zod'

export type ArtworkResult = {
  id: string
  title: string
  subtitle: string
  year: string
  thumb: string
  image: string
  genre?: string
  description?: string
  director?: string
  rating?: string
}

type SearchResponse = { results: ArtworkResult[]; page: number; hasMore: boolean; partialFailures?: string[]; queryId: string }
const UA = { 'User-Agent': 'FrameStudio/1.0 (digital photo frame)' }
const PAGE_SIZE = 24
const MAX_QUERY_LENGTH = 2000
const MAX_ADVANCED_ITEMS = 20
const MAX_ADVANCED_BYTES = 12_000
const FIELD_LIMIT = 120

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Upstream ${res.status}`)
  return res.json() as Promise<T>
}

async function searchMovies(q: string, page: number): Promise<ArtworkResult[]> {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${q} hastemplate:"Infobox film"`, gsrlimit: String(PAGE_SIZE), gsrstart: String((page - 1) * PAGE_SIZE), prop: 'pageimages|description|info', piprop: 'thumbnail', pithumbsize: '2000', pilicense: 'any', inprop: 'url' })
  type Page = { pageid: number; index: number; title: string; description?: string; thumbnail?: { source: string } }
  const data = await getJson<{ query?: { pages: Page[] } }>(`https://en.wikipedia.org/w/api.php?${params}`)
  return (data.query?.pages ?? []).filter((p) => p.thumbnail?.source).sort((a, b) => a.index - b.index).map((p) => {
    const image = p.thumbnail!.source.split('?')[0]
    const year = p.title.match(/\((\d{4})/)?.[1] ?? p.description?.match(/\b(18|19|20)\d{2}\b/)?.[0] ?? ''
    return { id: `wiki-${p.pageid}`, title: p.title.replace(/\s*\((\d{4} )?(American |British )?film\)$/i, ''), subtitle: p.description ?? '', year, thumb: image, image, description: p.description }
  })
}

async function searchTv(q: string, page: number): Promise<ArtworkResult[]> {
  type Show = { show: { id: number; name: string; premiered: string | null; genres: string[]; summary?: string; rating?: { average?: number }; network?: { name: string } | null; webChannel?: { name: string } | null; image?: { medium: string; original: string } | null } }
  const data = await getJson<Show[]>(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`)
  const start = (page - 1) * PAGE_SIZE
  return data.slice(start, start + PAGE_SIZE).filter((r) => r.show.image?.original).map(({ show }) => ({ id: `tvmaze-${show.id}`, title: show.name, subtitle: show.network?.name ?? show.webChannel?.name ?? '', year: show.premiered?.slice(0, 4) ?? '', genre: show.genres.slice(0, 3).join(', '), description: show.summary?.replace(/<[^>]+>/g, ''), rating: show.rating?.average ? String(show.rating.average) : undefined, thumb: show.image!.medium, image: show.image!.original }))
}

async function searchBooks(q: string, page: number): Promise<ArtworkResult[]> {
  type Doc = { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; subject?: string[]; first_sentence?: string | string[] }
  const params = new URLSearchParams({ q, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE), fields: 'key,title,author_name,first_publish_year,cover_i,subject,first_sentence' })
  const data = await getJson<{ docs: Doc[] }>(`https://openlibrary.org/search.json?${params}`)
  return data.docs.filter((d) => d.cover_i).map((d) => ({ id: `ol-${d.key.split('/').pop()}`, title: d.title, subtitle: d.author_name?.join(', ') ?? '', year: d.first_publish_year ? String(d.first_publish_year) : '', genre: d.subject?.slice(0, 3).join(', '), description: Array.isArray(d.first_sentence) ? d.first_sentence[0] : d.first_sentence, thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, image: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false` }))
}

async function searchMusic(q: string, page: number): Promise<ArtworkResult[]> {
  type Album = { collectionId: number; collectionName: string; artistName: string; releaseDate?: string; primaryGenreName?: string; artworkUrl100?: string }
  const params = new URLSearchParams({ term: q, media: 'music', entity: 'album', limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })
  const data = await getJson<{ results: Album[] }>(`https://itunes.apple.com/search?${params}`)
  return data.results.filter((a) => a.artworkUrl100).map((a) => { const image = a.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1400x1400bb.jpg'); return { id: `itunes-${a.collectionId}`, title: a.collectionName, subtitle: a.artistName, year: a.releaseDate?.slice(0, 4) ?? '', genre: a.primaryGenreName, thumb: image.replace('/1400x1400bb.', '/300x300bb.'), image } })
}

const SEARCHERS: Record<string, (q: string, page: number) => Promise<ArtworkResult[]>> = { movies: searchMovies, tv: searchTv, books: searchBooks, music: searchMusic }
const fieldSchema = z.object({ title: z.string().trim().max(FIELD_LIMIT).optional(), artist: z.string().trim().max(FIELD_LIMIT).optional(), album: z.string().trim().max(FIELD_LIMIT).optional(), actor: z.string().trim().max(FIELD_LIMIT).optional(), director: z.string().trim().max(FIELD_LIMIT).optional(), author: z.string().trim().max(FIELD_LIMIT).optional() }).strict()
const advancedSchema = z.array(z.union([z.string().trim().min(2).max(FIELD_LIMIT), fieldSchema])).min(1).max(MAX_ADVANCED_ITEMS)

function structuredQuery(theme: string, entry: string | z.infer<typeof fieldSchema>) {
  if (typeof entry === 'string') return entry
  const allowed: Record<string, string[]> = { music: ['artist', 'album', 'title'], movies: ['title', 'actor', 'director'], tv: ['title', 'actor', 'director'], books: ['title', 'author'] }
  const keys = allowed[theme] ?? []
  return keys.filter((key) => entry[key as keyof typeof entry]).map((key) => `${key}: ${entry[key as keyof typeof entry]}`).join(' ')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const theme = searchParams.get('theme') ?? ''
  const rawQuery = (searchParams.get('q') ?? '').trim()
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const search = SEARCHERS[theme]
  if (!search) return NextResponse.json({ error: 'Unknown theme' }, { status: 400 })
  if (rawQuery.length > MAX_QUERY_LENGTH) return NextResponse.json({ error: 'Search query is too long' }, { status: 400 })
  if (rawQuery.length < 2) return NextResponse.json({ results: [], page, hasMore: false, queryId: crypto.randomUUID() } satisfies SearchResponse)
  try {
    let results: ArtworkResult[]
    let partialFailures: string[] = []
    if (rawQuery.startsWith('[')) {
      if (new TextEncoder().encode(rawQuery).length > MAX_ADVANCED_BYTES) return NextResponse.json({ error: 'Advanced search JSON is too large' }, { status: 400 })
      const entries = advancedSchema.parse(JSON.parse(rawQuery))
      const queries = entries.map((entry) => structuredQuery(theme, entry)).filter((value) => value.length >= 2)
      const settled = await Promise.allSettled(queries.map((query) => search(query, 1)))
      partialFailures = settled.map((result, index) => result.status === 'rejected' ? `Item ${index + 1} could not be searched` : '').filter(Boolean)
      const merged = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      const seen = new Set<string>()
      results = merged.filter((result) => !seen.has(result.id) && seen.add(result.id)).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      const hasMore = merged.filter((result, index, all) => all.findIndex((candidate) => candidate.id === result.id) === index).length > page * PAGE_SIZE
      return NextResponse.json({ results, page, hasMore, partialFailures, queryId: crypto.randomUUID() } satisfies SearchResponse)
    }
    results = await search(rawQuery.slice(0, MAX_QUERY_LENGTH), page)
    return NextResponse.json({ results, page, hasMore: results.length === PAGE_SIZE, queryId: crypto.randomUUID() } satisfies SearchResponse)
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ error: 'Advanced search must be a valid array of supported items' }, { status: 400 })
    return NextResponse.json({ error: 'Artwork search is unavailable right now' }, { status: 502 })
  }
}
