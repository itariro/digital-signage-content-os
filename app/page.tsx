import { readStore } from '@/lib/store'
import { Editor } from '@/components/editor/editor'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const store = await readStore()
  return <Editor initialStore={store} />
}
