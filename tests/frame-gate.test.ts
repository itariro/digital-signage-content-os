import { describe, it, expect, afterEach } from 'vitest'
import { decideRequest } from '@/lib/frame-gate'

const env = process.env as Record<string, string | undefined>
afterEach(() => { delete env.KIOSK_MGMT_PORT; delete env.INSTANCE_ID })

function req(host: string, method = 'GET', path = '/api/frames') {
  return { host, method, path }
}

describe('decideRequest', () => {
  it('inert when KIOSK_MGMT_PORT unset (console deployments)', () => {
    expect(decideRequest(req('console.example.com:443', 'POST', '/api/frames'))).toEqual({ kind: 'allow' })
  })

  it('display port serves display surface only', () => {
    env.KIOSK_MGMT_PORT = '8808'
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/frame/home'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/active'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/store'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/assets/a.png'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/health'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/weather?lat=0&lon=0&units=metric'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/'))).toEqual({ kind: 'not_found' })
    expect(decideRequest(req('127.0.0.1:3000', 'POST', '/api/frames'))).toEqual({ kind: 'not_found' })
  })

  it('display port blocks display mutations', () => {
    env.KIOSK_MGMT_PORT = '8808'
    expect(decideRequest(req('127.0.0.1:3000', 'PUT', '/api/active'))).toEqual({ kind: 'not_found' })
  })

  it('management port allows reads, requires admin session for mutations', () => {
    env.KIOSK_MGMT_PORT = '8808'
    expect(decideRequest(req('192.168.1.5:8808', 'GET', '/'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('192.168.1.5:8808', 'GET', '/frame/home'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('192.168.1.5:8808', 'POST', '/api/frames'))).toEqual({ kind: 'admin_required' })
    expect(decideRequest(req('192.168.1.5:8808', 'POST', '/api/admin/login'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('192.168.1.5:8808', 'POST', '/api/sync/push'))).toEqual({ kind: 'allow' })
  })

  it('console-only paths never resolve on a frame', () => {
    env.KIOSK_MGMT_PORT = '8808'
    expect(decideRequest(req('192.168.1.5:8808', 'GET', '/console'))).toEqual({ kind: 'not_found' })
    expect(decideRequest(req('192.168.1.5:8808', 'POST', '/api/instances'))).toEqual({ kind: 'not_found' })
  })

  it('non-standard ports on a frame (neither display nor mgmt) get nothing', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.INSTANCE_ID = 'inst-1'
    expect(decideRequest(req('evil.test:9999', 'GET', '/api/store'))).toEqual({ kind: 'not_found' })
  })
})
