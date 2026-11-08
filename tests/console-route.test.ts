import { afterEach, describe, expect, it, vi } from 'vitest'

const { auth, redirect } = vi.hoisted(() => ({
  auth: { protect: vi.fn() },
  redirect: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth }))
vi.mock('next/navigation', () => ({ redirect }))

import ConsolePage from '@/app/console/page'

const env = process.env as Record<string, string | undefined>
const originalConsoleAdminRole = env.CONSOLE_ADMIN_ROLE

afterEach(() => {
  vi.clearAllMocks()
  if (originalConsoleAdminRole === undefined) delete env.CONSOLE_ADMIN_ROLE
  else env.CONSOLE_ADMIN_ROLE = originalConsoleAdminRole
})

describe('/console route', () => {
  it('awaits role-aware protection before redirecting to the Frames panel', async () => {
    env.CONSOLE_ADMIN_ROLE = 'org:admin'
    let releaseProtection!: () => void
    const protection = new Promise<void>((resolve) => {
      releaseProtection = resolve
    })
    const has = vi.fn(() => true)
    auth.protect.mockImplementation(async (checkRole) => {
      expect(checkRole(has)).toBe(true)
      expect(has).toHaveBeenCalledWith({ role: 'org:admin' })
      await protection
    })

    const page = ConsolePage()
    await Promise.resolve()
    expect(redirect).not.toHaveBeenCalled()

    releaseProtection()
    await page
    expect(redirect).toHaveBeenCalledWith('/?panel=frames')
  })

  it('allows the configured protection check when no console role is set', async () => {
    delete env.CONSOLE_ADMIN_ROLE
    auth.protect.mockImplementation(async (checkRole) => {
      expect(checkRole(() => false)).toBe(true)
    })

    await ConsolePage()

    expect(redirect).toHaveBeenCalledWith('/?panel=frames')
  })

  it('does not redirect when authorization rejects', async () => {
    auth.protect.mockRejectedValue(new Error('unauthorized'))

    await expect(ConsolePage()).rejects.toThrow('unauthorized')

    expect(redirect).not.toHaveBeenCalled()
  })
})
