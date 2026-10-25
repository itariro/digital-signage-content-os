import net from 'node:net'

// Rate-limit identity. A frame has no proxy in front of it, so trusting
// x-forwarded-for there only lets a client mint fresh buckets. Operators put a
// proxy that overwrites the header in front of a hosted console and set
// TRUST_PROXY=1.

export const LOCAL_CLIENT = 'local'

function firstHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name)?.split(',')[0]?.trim() || undefined
}

export function clientKey(request: Request, env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  const trusted = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true'
  if (!trusted) return LOCAL_CLIENT
  const candidate = firstHeader(request.headers, 'x-forwarded-for')
    ?? firstHeader(request.headers, 'x-real-ip')
  if (!candidate || candidate.length > 64 || net.isIP(candidate) === 0) return LOCAL_CLIENT
  return candidate
}
