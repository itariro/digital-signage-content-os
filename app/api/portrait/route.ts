import { NextResponse } from 'next/server'

export type PortraitResult = { id: string; name: string; subtitle: string; thumb: string; image: string; pageUrl: string }

type SearchResponse = { results: PortraitResult[]; queryId: string }
const UA = { 'User-Agent': 'FrameStudio/1.0 (digital photo frame)' }
const PAGE_SIZE = 24
const MAX_QUERY_LENGTH = 200

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Upstream ${res.status}`)
  return res.json() as Promise<T>
}

/** Wikipedia search for biographies, returning the article's lead portrait. */
async function searchPortraits(q: string): Promise<PortraitResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${q} hastemplate:"Infobox person"`,
    gsrlimit: String(PAGE_SIZE),
    prop: 'pageimages|description|info',
    piprop: 'thumbnail',
    pithumbsize: '1600',
    pilicense: 'any',
    inprop: 'url',
  })
  type Page = { pageid: number; index: number; title: string; description?: string; thumbnail?: { source: string }; fullurl?: string }
  const data = await getJson<{ query?: { pages: Page[] } }>(`https://en.wikipedia.org/w/api.php?${params}`)
  return (data.query?.pages ?? [])
    .filter((p) => p.thumbnail?.source)
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const image = p.thumbnail!.source.split('?')[0]
      return { id: `wiki-${p.pageid}`, name: p.title, subtitle: p.description ?? '', thumb: image, image, pageUrl: p.fullurl ?? '' }
    })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawQuery = (searchParams.get('q') ?? '').trim()
  if (rawQuery.length > MAX_QUERY_LENGTH) return NextResponse.json({ error: 'Search query is too long' }, { status: 400 })
  if (rawQuery.length < 2) {
    return NextResponse.json({ results: [], queryId: crypto.randomUUID() } satisfies SearchResponse)
  }
  try {
    const results = await searchPortraits(rawQuery)
    return NextResponse.json({ results, queryId: crypto.randomUUID() } satisfies SearchResponse)
  } catch {
    return NextResponse.json({ error: 'Portrait search is unavailable right now' }, { status: 502 })
  }
}
