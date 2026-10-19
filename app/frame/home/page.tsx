import type { Metadata } from 'next'
import { readStore } from '@/lib/store'
import { FrameDisplay } from '@/components/frame/frame-display'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Frame display',
  robots: { index: false, follow: false },
}

export default async function FrameHomePage() {
  const store = await readStore('home')
  if (!store) {
    return <main className="flex h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Frame store not found.</p></main>
  }
  return <FrameDisplay initialStore={store} frameId="home" />
}
