import { auth } from '@clerk/nextjs/server'
import type { OrganizationCustomRoleKey } from '@clerk/shared/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  const role = process.env.CONSOLE_ADMIN_ROLE
  await auth.protect((has) => (role ? has({ role: role as OrganizationCustomRoleKey }) : true))
  redirect('/?panel=frames')
}
