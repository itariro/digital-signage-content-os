import type { Metadata } from 'next'
import { readStore } from '@/lib/store'
import { FrameDisplay } from '@/components/frame/frame-display'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Frame display',
  robots: { index: false, follow: false },
}

export default async function FramePage() {
  const store = await readStore()
  return <FrameDisplay initialStore={store} />
}
