export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initInstance } = await import('./lib/lifecycle')
    await initInstance()
  }
}
