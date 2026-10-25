// Frame port-gate decisions, spec §4.2. Pure: takes plain strings so vitest
// can test it without Next request plumbing. proxy.ts adapts req → input.
// Active only when KIOSK_MGMT_PORT is set (frames). The app binds
// 127.0.0.1:PORT (display) and the forwarder exposes 0.0.0.0:MGMT; a request
// whose Host carries any other port cannot have arrived on a listener we
// intend, so it is rejected.

export type GateInput = { host: string; method: string; path: string }
export type GateDecision =
  | { kind: 'allow' }
  | { kind: 'not_found' }
  | { kind: 'admin_required' }

// Verified against the frame display page (app/frame/[frameId] → FrameDisplay):
// it polls /api/store and /api/display/state via SWR and /api/weather via
// useWeather. /api/active, /api/assets, /api/health, /api/media, /api/fonts
// are shown here defensively; the display page itself only needs the first
// three prefixes.
const DISPLAY_GET_ONLY = ['/api/active', '/api/store', '/api/assets', '/api/health', '/api/media', '/api/fonts', '/api/display', '/api/weather']
const FRAME_NEVER = ['/console', '/api/instances', '/api/enroll'] // console-only surfaces; never served by a frame
const ADMIN_EXEMPT_MUTATIONS = ['/api/sync', '/api/admin/login']

export function hostPort(host: string): string | null {
  const m = host.match(/:(\d+)$/)
  return m ? m[1] : null
}

export function decideRequest(input: GateInput): GateDecision {
  const mgmt = process.env.KIOSK_MGMT_PORT
  if (!mgmt) return { kind: 'allow' } // console deployments: gate inert (spec §4.2)

  const { path: rawPath, method, host } = input
  // Real display fetches carry query strings (/api/store?frame=…, /api/weather?lat=…);
  // match on the bare path so they aren't dropped.
  const path = rawPath.replace(/[?#].*$/, '')
  const write = method !== 'GET' && method !== 'HEAD'

  if (FRAME_NEVER.some((p) => path === p || path.startsWith(`${p}/`))) return { kind: 'not_found' }

  const port = hostPort(host)
  if (port === mgmt) {
    if (!write) return { kind: 'allow' }
    if (ADMIN_EXEMPT_MUTATIONS.some((p) => path === p || path.startsWith(`${p}/`))) return { kind: 'allow' }
    return { kind: 'admin_required' }
  }

  const appPort = process.env.PORT || '3000'
  if (port !== null && port !== appPort) return { kind: 'not_found' }
  // Display listener: frame pages + their GET feeds. Everything else 404s.
  if (path.startsWith('/frame')) return { kind: 'allow' }
  if (path === '/sw.js') return { kind: 'allow' }
  if (!write && DISPLAY_GET_ONLY.some((p) => path === p || path.startsWith(`${p}/`))) return { kind: 'allow' }
  return { kind: 'not_found' }
}
