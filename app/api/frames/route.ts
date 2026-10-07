import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { frameDocuments } from '@/lib/db/schema'
import { resolveDisplay, clockParts } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

export async function GET() {
  const documents = await getDb().select().from(frameDocuments).orderBy(desc(frameDocuments.updatedAt))
  const now = new Date()
  return NextResponse.json(
    documents.map((document) => {
      const store = document.data as Parameters<typeof resolveDisplay>[0]
      const display = resolveDisplay(store, clockParts(now))
      return {
        id: document.identifier,
        name: document.name,
        layoutId: display.layout?.id ?? null,
        layoutName: display.layout?.name ?? null,
        updatedAt: document.updatedAt,
      }
    }),
  )
}
