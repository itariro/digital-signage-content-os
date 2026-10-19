import type { NextRequest } from 'next/server'

export function adminOk(request: NextRequest): boolean {
  const token = process.env.CONSOLE_ADMIN_TOKEN
  if (!token) return true // dev mode open
  return request.headers.get('x-admin-token') === token
}
