export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initInstance } = await import('./lib/lifecycle')
    await initInstance()
    const { maybeStartMgmtForwarder } = await import('./lib/mgmt-port')
    await maybeStartMgmtForwarder(process.env)
  }
}
