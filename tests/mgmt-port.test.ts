import { describe, it, expect, afterEach, vi } from 'vitest'
import net from 'node:net'
import { maybeStartMgmtForwarder, parsePort, startMgmtForwarder } from '@/lib/mgmt-port'

function listen(server: net.Server, host = '127.0.0.1'): Promise<number> {
  return new Promise((res) => server.listen(0, host, () => res((server.address() as net.AddressInfo).port)))
}

function close(server: net.Server): Promise<void> {
  return new Promise((res) => server.close(() => res()))
}

function echoServer(): net.Server {
  return net.createServer((sock) => sock.on('data', (d) => sock.write(`echo:${d}`)))
}

afterEach(() => { vi.restoreAllMocks() })

describe('parsePort', () => {
  it('accepts integers from 0 to 65535 and uses the fallback when missing or empty', () => {
    expect(parsePort(undefined, 3000)).toBe(3000)
    expect(parsePort('', 3000)).toBe(3000)
    expect(parsePort(undefined)).toBeNull()
    expect(parsePort('0')).toBe(0)
    expect(parsePort('65535')).toBe(65535)
    for (const value of ['-1', '65536', '1.5', 'abc', '', ' 80', '+80']) {
      expect(parsePort(value)).toBeNull()
    }
  })
})

describe('startMgmtForwarder', () => {
  it('proxies TCP bytes both ways to the app port', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const mgmt = await startMgmtForwarder({ mgmtPort: 0, appPort, bind: '127.0.0.1' })
    expect(mgmt.maxConnections).toBe(256)
    const mgmtPort = mgmt.address() as net.AddressInfo
    expect(mgmtPort.port).toBeGreaterThan(0)

    const reply = await new Promise<string>((res, rej) => {
      const c = net.connect(mgmtPort.port, '127.0.0.1')
      c.on('error', rej)
      c.on('connect', () => c.write('hi'))
      c.once('data', (d) => { res(String(d)); c.destroy() })
    })
    expect(reply).toBe('echo:hi')
    await close(mgmt)
    await close(echo)
  })

  it('throws on invalid explicit ports', () => {
    expect(() => startMgmtForwarder({ mgmtPort: -1, appPort: 3000 })).toThrow(RangeError)
    expect(() => startMgmtForwarder({ mgmtPort: 3000, appPort: 70000 })).toThrow(RangeError)
  })

  it('destroys both sockets when the upstream is dead', async () => {
    const dead = net.createServer()
    const deadPort = await listen(dead)
    await close(dead)
    const mgmt = await startMgmtForwarder({ mgmtPort: 0, appPort: deadPort, bind: '127.0.0.1' })
    const port = (mgmt.address() as net.AddressInfo).port

    await new Promise<void>((resolve, reject) => {
      const client = net.connect(port, '127.0.0.1')
      const timer = setTimeout(() => {
        client.destroy()
        reject(new Error('socket did not close'))
      }, 2_000)
      client.on('error', () => { /* reset is expected */ })
      client.on('close', () => { clearTimeout(timer); resolve() })
      client.on('connect', () => client.write('hi'))
    })
    await close(mgmt)
  })
})

describe('maybeStartMgmtForwarder', () => {
  it('is a no-op when KIOSK_MGMT_PORT is unset', async () => {
    expect(await maybeStartMgmtForwarder({ ...process.env, KIOSK_MGMT_PORT: undefined } as any)).toBeNull()
  })

  it('logs and returns null for a non-numeric management port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: 'abc' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid KIOSK_MGMT_PORT'))
  })

  it('logs and returns null for a non-numeric app port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '0', PORT: 'abc' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid PORT'))
  })

  it('logs and returns null when the management port equals the app port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '8808', PORT: '8808' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('must differ'))
  })

  it('returns null for an out-of-range management port', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '70000' } as any)).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid KIOSK_MGMT_PORT'))
  })

  it('opens the forwarder through the enabled env path and echoes bytes', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const mgmt = await maybeStartMgmtForwarder({ KIOSK_MGMT_PORT: '0', PORT: String(appPort) } as any)
    expect(mgmt).not.toBeNull()
    const mgmtPort = (mgmt as net.Server).address() as net.AddressInfo
    expect(mgmtPort.port).toBeGreaterThan(0)

    const reply = await new Promise<string>((res, rej) => {
      const c = net.connect(mgmtPort.port, '127.0.0.1')
      c.on('error', rej)
      c.on('connect', () => c.write('hi'))
      c.once('data', (d) => { res(String(d)); c.destroy() })
    })
    expect(reply).toBe('echo:hi')
    await close(mgmt!)
    await close(echo)
  })

  it('returns null and leaves the app unaffected when the port is busy', async () => {
    const echo = echoServer()
    const appPort = await listen(echo)
    const blocker = net.createServer()
    const busyPort = await listen(blocker, '0.0.0.0')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await maybeStartMgmtForwarder({
      KIOSK_MGMT_PORT: String(busyPort),
      PORT: String(appPort),
    } as any)).toBeNull()
    expect(spy).toHaveBeenCalled()
    await close(blocker)
    await close(echo)
  })
})
