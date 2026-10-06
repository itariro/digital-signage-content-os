import { NextResponse } from 'next/server'

export type ArtworkResult = {
  id: string
  title: string
  subtitle: string
  year: string
  thumb: string
  image: string
}

const UA = { 'User-Agent': 'FrameStudio/1.0 (digital photo frame)' }
const DAY = { revalidate: 86_400 }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, next: DAY, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Upstream ${res.status}`)
  return res.json() as Promise<T>
}

async function searchMovies(q: string): Promise<ArtworkResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${q} hastemplate:"Infobox film"`,
    gsrlimit: '24',
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '1000',
    pilicense: 'any',
  })
  type Page = { pageid: number; index: number; title: string; description?: string; thumbnail?: { source: string } }
  const data = await getJson<{ query?: { pages: Page[] } }>(`https://en.wikipedia.org/w/api.php?${params}`)
  return (data.query?.pages ?? [])
    .filter((p) => p.thumbnail?.source)
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const image = p.thumbnail!.source.split('?')[0]
      const year = p.title.match(/\((\d{4})/)?.[1] ?? p.description?.match(/\b(18|19|20)\d{2}\b/)?.[0] ?? ''
      return {
        id: `wiki-${p.pageid}`,
        title: p.title.replace(/\s*\((\d{4} )?(American |British )?film\)$/i, ''),
        subtitle: p.description ?? '',
        year,
        thumb: image,
        image,
      }
    })
}

async function searchTv(q: string): Promise<ArtworkResult[]> {
  type Show = {
    show: {
      id: number
      name: string
      premiered: string | null
      genres: string[]
      network?: { name: string } | null
      webChannel?: { name: string } | null
      image?: { medium: string; original: string } | null
    }
  }
  const data = await getJson<Show[]>(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`)
  return data
    .filter((r) => r.show.image?.original)
    .map(({ show }) => ({
      id: `tvmaze-${show.id}`,
      title: show.name,
      subtitle: show.network?.name ?? show.webChannel?.name ?? show.genres.slice(0, 2).join(', '),
      year: show.premiered?.slice(0, 4) ?? '',
      thumb: show.image!.medium,
      image: show.image!.original,
    }))
}

async function searchBooks(q: string): Promise<ArtworkResult[]> {
  type Doc = { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number }
  const params = new URLSearchParams({ q, limit: '30', fields: 'key,title,author_name,first_publish_year,cover_i' })
  const data = await getJson<{ docs: Doc[] }>(`https://openlibrary.org/search.json?${params}`)
  return data.docs
    .filter((d) => d.cover_i)
    .slice(0, 24)
    .map((d) => ({
      id: `ol-${d.key.split('/').pop()}`,
      title: d.title,
      subtitle: d.author_name?.[0] ?? '',
      year: d.first_publish_year ? String(d.first_publish_year) : '',
      thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      image: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
    }))
}

async function searchMusic(q: string): Promise<ArtworkResult[]> {
  type Album = { collectionId: number; collectionName: string; artistName: string; releaseDate?: string; artworkUrl100?: string }
  const params = new URLSearchParams({ term: q, media: 'music', entity: 'album', limit: '24' })
  const data = await getJson<{ results: Album[] }>(`https://itunes.apple.com/search?${params}`)
  return data.results
    .filter((a) => a.artworkUrl100)
    .map((a) => ({
      id: `itunes-${a.collectionId}`,
      title: a.collectionName,
      subtitle: a.artistName,
      year: a.releaseDate?.slice(0, 4) ?? '',
      thumb: a.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/300x300bb.jpg'),
      image: a.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1400x1400bb.jpg'),
    }))
}

const SEARCHERS: Record<string, (q: string) => Promise<ArtworkResult[]>> = {
  movies: searchMovies,
  tv: searchTv,
  books: searchBooks,
  music: searchMusic,
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const theme = searchParams.get('theme') ?? ''
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100)
  const search = SEARCHERS[theme]
  if (!search) return NextResponse.json({ error: 'Unknown theme' }, { status: 400 })
  if (q.length < 2) return NextResponse.json({ results: [] })
  try {
    return NextResponse.json({ results: await search(q) })
  } catch {
    return NextResponse.json({ error: 'Artwork search is unavailable right now' }, { status: 502 })
  }
}
