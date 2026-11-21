import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { Hero } from '@/components/landing/hero'
import { MapArtStudio } from '@/components/map-art/map-art-studio'

export const metadata: Metadata = {
  title: 'Map Art Generator · mural',
  description: 'Create and save high-resolution city map posters for your digital frame.',
}

const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default async function MapArtPage({ searchParams }: { searchParams: Promise<{ frame?: string }> }) {
  if (hasClerk) {
    const { userId } = await auth()
    if (!userId) return <Hero />
  }
  const { frame } = await searchParams
  const frameId = frame && /^[a-zA-Z0-9_-]{1,64}$/.test(frame) ? frame : undefined
  return <MapArtStudio frameId={frameId} />
}
