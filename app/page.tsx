import { auth } from '@clerk/nextjs/server'
import type { OrganizationCustomRoleKey } from '@clerk/shared/types'
import { readStore } from '@/lib/store'
import { Editor } from '@/components/editor/editor'
import { FrameAdminGate } from '@/components/frame-admin-gate'
import { Hero } from '@/components/landing/hero'
import { canManageFrames as canManageFramesForUser } from '@/lib/console/access'

const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ frame?: string; panel?: string }> }) {
  let canManageFrames = false
  if (hasClerk) {
    const { userId, has } = await auth()
    if (!userId) {
      return <Hero />
    }
    const role = process.env.CONSOLE_ADMIN_ROLE
    canManageFrames = canManageFramesForUser({
      signedIn: Boolean(userId),
      roleConfigured: Boolean(role),
      hasRole: role ? has({ role: role as OrganizationCustomRoleKey }) : false,
    })
  }
  const { frame, panel } = await searchParams
  const frameId = frame || undefined
  const initialPanel = panel === 'frames' && canManageFrames ? 'frames' : null
  const store = await readStore(frameId)
  if (!store) return <main className="flex h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Store not found.</p></main>
  return (
    <FrameAdminGate enabled={Boolean(process.env.KIOSK_MGMT_PORT)}>
      <Editor
        initialStore={store}
        frameId={frameId}
        singleFrame={Boolean(process.env.INSTANCE_ID)}
        canManageFrames={canManageFrames}
        initialPanel={initialPanel}
      />
    </FrameAdminGate>
  )
}
