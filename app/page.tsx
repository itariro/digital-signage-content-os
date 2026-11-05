import { auth } from '@clerk/nextjs/server'
import { readStore } from '@/lib/store'
import { Editor } from '@/components/editor/editor'
import { Hero } from '@/components/landing/hero'

const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ frame?: string }> }) {
  if (hasClerk) {
    const { userId } = await auth()
    if (!userId) {
      return <Hero />
    }
  }
  const { frame } = await searchParams
  const frameId = frame || undefined
  const store = await readStore(frameId)
  if (!store) return <main className="flex h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Store not found.</p></main>
  return <Editor initialStore={store} frameId={frameId} singleFrame={Boolean(process.env.INSTANCE_ID)} />
}
