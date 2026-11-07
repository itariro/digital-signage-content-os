import { describe, it, expect, afterEach } from 'vitest'
import { decideRequest, isLocalDevBypass } from '@/lib/frame-gate'

const env = process.env as Record<string, string | undefined>
const origNodeEnv = process.env.NODE_ENV
afterEach(() => {
  delete env.KIOSK_MGMT_PORT
  delete env.INSTANCE_ID
  delete env.FRAME_ADMIN_HASH
  delete env.FRAME_ADMIN_SECRET
  delete env.ALLOW_INSECURE_LOCAL_WRITES
  if (origNodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = origNodeEnv
})

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
    expect(decideRequest(req('127.0.0.1:3000', 'GET', '/api/uploads/abc.png'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('127.0.0.1:3000', 'POST', '/api/uploads'))).toEqual({ kind: 'not_found' })
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

  it('management port: upload read allowed, upload write still admin_required', () => {
    env.KIOSK_MGMT_PORT = '8808'
    expect(decideRequest(req('192.168.1.5:8808', 'GET', '/api/uploads/abc.png'))).toEqual({ kind: 'allow' })
    expect(decideRequest(req('192.168.1.5:8808', 'POST', '/api/uploads'))).toEqual({ kind: 'admin_required' })
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

  it('loopback mgmt write bypasses when no admin configured', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    expect(decideRequest({ host: '127.0.0.1:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'allow' })
    expect(decideRequest({ host: 'localhost:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'allow' })
    expect(decideRequest({ host: '[::1]:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'allow' })
  })

  it('LAN mgmt write is denied when no admin configured', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    expect(decideRequest({ host: '192.168.1.10:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'admin_required' })
    expect(decideRequest({ host: '192.168.1.10:8808', method: 'PUT', path: '/api/layouts/1' })).toEqual({ kind: 'admin_required' })
  })

  it('partial admin config denies bypass (gate stays active)', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    env.FRAME_ADMIN_HASH = 'configured'
    delete env.FRAME_ADMIN_SECRET
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    expect(decideRequest({ host: '127.0.0.1:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'admin_required' })
    delete env.FRAME_ADMIN_HASH
    env.FRAME_ADMIN_SECRET = 'a'.repeat(32)
    expect(decideRequest({ host: '127.0.0.1:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'admin_required' })
  })

  it('env override ALLOW_INSECURE_LOCAL_WRITES=1 allows LAN when no admin configured', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'production'
    env.ALLOW_INSECURE_LOCAL_WRITES = '1'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    expect(decideRequest({ host: '192.168.1.10:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'allow' })
  })

  it('env override still denied when admin hash is configured', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'production'
    env.ALLOW_INSECURE_LOCAL_WRITES = '1'
    env.FRAME_ADMIN_HASH = 'configured'
    delete env.FRAME_ADMIN_SECRET
    expect(decideRequest({ host: '192.168.1.10:8808', method: 'POST', path: '/api/layouts' })).toEqual({ kind: 'admin_required' })
  })

  it('loopback mgmt read on display surface is unaffected (FRAME_NEVER still 404)', () => {
    env.KIOSK_MGMT_PORT = '8808'
    env.NODE_ENV = 'development'
    delete env.FRAME_ADMIN_HASH
    delete env.FRAME_ADMIN_SECRET
    expect(decideRequest({ host: '127.0.0.1:8808', method: 'GET', path: '/console' })).toEqual({ kind: 'not_found' })
    expect(decideRequest({ host: '127.0.0.1:8808', method: 'POST', path: '/api/instances' })).toEqual({ kind: 'not_found' })
  })

  it('isLocalDevBypass is true for loopback in dev and false for LAN in dev', () => {
    env.NODE_ENV = 'development'
    delete env.ALLOW_INSECURE_LOCAL_WRITES
    expect(isLocalDevBypass({ host: '127.0.0.1:8808', method: 'POST', path: '/api/layouts' })).toBe(true)
    expect(isLocalDevBypass({ host: '192.168.1.10:8808', method: 'POST', path: '/api/layouts' })).toBe(false)
  })
})
