import { NextResponse } from 'next/server'
import { fontInputSchema } from '@/lib/schema'
import { googleFontHref } from '@/lib/fonts'
import { mutateStore } from '@/lib/store'

export async function POST(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? undefined
  const parsed = fontInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid font' }, { status: 400 })
  }
  const family = parsed.data.family.replace(/\s+/g, ' ')
  const check = await fetch(googleFontHref(family), { cache: 'no-store' }).catch(() => null)
  if (!check?.ok) {
    return NextResponse.json({ error: `"${family}" was not found on Google Fonts` }, { status: 404 })
  }
  const store = await mutateStore((s) => {
    if (!s.customFonts.some((f) => f.toLowerCase() === family.toLowerCase())) {
      s.customFonts = [...s.customFonts, family].slice(0, 40)
    }
  }, frameId)
  return NextResponse.json({ store })
}

export async function DELETE(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? undefined
  const parsed = fontInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid font' }, { status: 400 })
  const store = await mutateStore((s) => {
    s.customFonts = s.customFonts.filter((f) => f !== parsed.data.family)
  }, frameId)
  return NextResponse.json({ store })
}
