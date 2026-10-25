import { describe, it, expect, afterEach } from 'vitest'
import { clientKey, LOCAL_CLIENT } from '../request-ip'

const env = process.env as Record<string, string | undefined>

afterEach(() => { delete env.TRUST_PROXY })

function request(headers: Record<string, string>): Request {
  return new Request('http://frame.local/api/admin/login', { headers })
}

describe('clientKey', () => {
  it('uses one local bucket when TRUST_PROXY is unset', () => {
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '5.6.7.8' }), env)).toBe(LOCAL_CLIENT)
  })

  it('uses distinct forwarded addresses when TRUST_PROXY=1', () => {
    env.TRUST_PROXY = '1'
    expect(clientKey(request({ 'x-forwarded-for': '1.2.3.4' }), env)).toBe('1.2.3.4')
    expect(clientKey(request({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }), env)).toBe('5.6.7.8')
  })

  it('accepts TRUST_PROXY=true and falls back to x-real-ip', () => {
    env.TRUST_PROXY = 'true'
    expect(clientKey(request({ 'x-real-ip': '9.8.7.6' }), env)).toBe('9.8.7.6')
  })

  it('falls back to local for invalid or overlong values', () => {
    env.TRUST_PROXY = '1'
    expect(clientKey(request({ 'x-forwarded-for': 'not-an-ip' }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '1'.repeat(65) }), env)).toBe(LOCAL_CLIENT)
    expect(clientKey(request({ 'x-forwarded-for': '[::1]' }), env)).toBe(LOCAL_CLIENT)
  })

  it('ignores proxy headers entirely when untrusted', () => {
    expect(clientKey(request({ 'x-real-ip': '9.8.7.6' }), env)).toBe(LOCAL_CLIENT)
  })
})
