import net from 'node:net'

// Spec §4.2: the only thing listening on the LAN. Raw TCP (no HTTP parsing)
// keeps the client's Host header intact so proxy.ts can gate by port.
// Failures bind-critical: a busy port logs loudly, it must not kill the app.

export interface ForwarderOptions { mgmtPort: number; appPort: number; bind?: string }

export function startMgmtForwarder(opts: ForwarderOptions): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((incoming) => {
      const upstream = net.connect(opts.appPort, '127.0.0.1')
      incoming.pipe(upstream)
      upstream.pipe(incoming)
      const drop = () => { incoming.destroy(); upstream.destroy() }
      incoming.on('error', drop)
      upstream.on('error', drop)
    })
    server.once('error', reject)
    server.listen(opts.mgmtPort, opts.bind ?? '0.0.0.0', () => resolve(server))
  })
}

// Called from instrumentation.ts on the node runtime. Console deployments
// leave KIOSK_MGMT_PORT unset and get nothing.
export async function maybeStartMgmtForwarder(env: NodeJS.ProcessEnv): Promise<net.Server | null> {
  if (!env.KIOSK_MGMT_PORT) return null
  if (env.NEXT_PHASE && env.NEXT_PHASE.startsWith('phase-production-build')) return null
  try {
    return await startMgmtForwarder({ mgmtPort: Number(env.KIOSK_MGMT_PORT), appPort: Number(env.PORT || 3000) })
  } catch (e: unknown) {
    console.error('management port forwarder failed to start:', e)
    return null
  }
}
