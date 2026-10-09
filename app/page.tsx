import { readStore } from '@/lib/store'
import { Editor } from '@/components/editor/editor'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const store = await readStore()
  if (!store) return <main className="flex h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Store not found.</p></main>
  return <Editor initialStore={store} />
}
