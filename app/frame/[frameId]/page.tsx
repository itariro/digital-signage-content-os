import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { readStore } from '@/lib/store'
import { FrameDisplay } from '@/components/frame/frame-display'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Frame display',
  robots: { index: false, follow: false },
}

export default async function FramePage({ params }: { params: Promise<{ frameId: string }> }) {
  const { frameId } = await params
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) notFound()
  const store = await readStore(frameId)
  return <FrameDisplay initialStore={store} frameId={frameId} />
}
