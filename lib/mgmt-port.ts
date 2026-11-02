import net from 'node:net'

// Spec §4.2: the only thing listening on the LAN. Raw TCP (no HTTP parsing)
// keeps the client's Host header intact so proxy.ts can gate by port.
// Failures bind-critical: a busy port logs loudly, it must not kill the app.

export interface ForwarderOptions { mgmtPort: number; appPort: number; bind?: string }

const CONNECT_TIMEOUT_MS = 10_000
export const MAX_FORWARDER_CONNECTIONS = 256

export function parsePort(value: string | undefined, fallback?: number): number | null {
  if (value === undefined || value === '') return fallback ?? null
  if (!/^\d+$/.test(value)) return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return port
}

function assertPort(port: number, name: string): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(`${name} must be an integer from 0 to 65535`)
  }
}

export function startMgmtForwarder(opts: ForwarderOptions): Promise<net.Server> {
  assertPort(opts.mgmtPort, 'mgmtPort')
  assertPort(opts.appPort, 'appPort')
  return new Promise((resolve, reject) => {
    const server = net.createServer((incoming) => {
      const upstream = net.connect({ port: opts.appPort, host: '127.0.0.1' })
      const drop = () => { incoming.destroy(); upstream.destroy() }

      incoming.on('error', drop)
      incoming.on('close', drop)
      upstream.on('error', drop)
      upstream.on('close', drop)

      // A dead app port must not leave a half-open connection behind. The
      // timeout is for connect only; clear it once the socket is connected.
      upstream.setTimeout(CONNECT_TIMEOUT_MS, drop)
      upstream.once('connect', () => upstream.setTimeout(0, drop))

      incoming.pipe(upstream)
      upstream.pipe(incoming)
    })

    server.maxConnections = MAX_FORWARDER_CONNECTIONS
    const rejectOnError = (error: Error) => reject(error)
    server.once('error', rejectOnError)
    // Keep a permanent handler after listen: an operational error should be
    // logged, not become an unhandled 'error' event that kills the process.
    server.on('error', (error) => console.error('management port forwarder error:', error))
    server.listen(opts.mgmtPort, opts.bind ?? '0.0.0.0', () => {
      server.off('error', rejectOnError)
      resolve(server)
    })
  })
}

// Called from instrumentation.ts on the node runtime. Console deployments
// leave KIOSK_MGMT_PORT unset and get nothing.
export async function maybeStartMgmtForwarder(env: NodeJS.ProcessEnv): Promise<net.Server | null> {
  if (!env.KIOSK_MGMT_PORT) return null
  if (env.NEXT_PHASE && env.NEXT_PHASE.startsWith('phase-production-build')) return null

  const mgmtPort = parsePort(env.KIOSK_MGMT_PORT)
  if (mgmtPort === null) {
    console.error(`invalid KIOSK_MGMT_PORT: ${env.KIOSK_MGMT_PORT}`)
    return null
  }
  const appPort = parsePort(env.PORT, 3000)
  if (appPort === null || appPort === 0) {
    console.error(`invalid PORT: ${env.PORT}`)
    return null
  }
  if (mgmtPort !== 0 && mgmtPort === appPort) {
    console.error(`KIOSK_MGMT_PORT (${mgmtPort}) must differ from PORT (${appPort})`)
    return null
  }

  try {
    return await startMgmtForwarder({ mgmtPort, appPort })
  } catch (e: unknown) {
    console.error('management port forwarder failed to start:', e)
    return null
  }
}
