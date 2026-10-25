import { describe, it, expect } from 'vitest'
import net from 'node:net'
import { startMgmtForwarder } from '@/lib/mgmt-port'

function listen(server: net.Server): Promise<number> {
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res((server.address() as net.AddressInfo).port)))
}

describe('startMgmtForwarder', () => {
  it('proxies TCP bytes both ways to the app port', async () => {
    const echo = await new Promise<net.Server>((res) => {
      const s = net.createServer((sock) => sock.on('data', (d) => sock.write(`echo:${d}`)))
      res(s)
    })
    const appPort = await listen(echo)
    const mgmt = await startMgmtForwarder({ mgmtPort: 0, appPort, bind: '127.0.0.1' })
    const mgmtPort = mgmt.address() as net.AddressInfo
    expect(mgmtPort.port).toBeGreaterThan(0)

    const reply = await new Promise<string>((res, rej) => {
      const c = net.connect(mgmtPort.port, '127.0.0.1')
      c.on('error', rej)
      c.on('connect', () => c.write('hi'))
      c.once('data', (d) => { res(String(d)); c.destroy() })
    })
    expect(reply).toBe('echo:hi')
    mgmt.close(); echo.close()
  })

  it('is a no-op when KIOSK_MGMT_PORT is unset', async () => {
    const { maybeStartMgmtForwarder } = await import('@/lib/mgmt-port')
    const res = await maybeStartMgmtForwarder({ ...process.env, KIOSK_MGMT_PORT: undefined } as any)
    expect(res).toBeNull()
  })
})
