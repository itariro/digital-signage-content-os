import { describe, it, expect } from 'vitest'
import { parseOsRelease, isSupportedDebian, checkPrerequisites } from '../device'

describe('device', () => {
  it('parses os-release', () => {
    const text = 'ID=debian\nVERSION_ID="12"\nPRETTY_NAME="Debian GNU/Linux 12"\n'
    const p = parseOsRelease(text)
    expect(p.id).toBe('debian')
    expect(p.versionId).toBe('12')
    expect(p.prettyName).toBe('Debian GNU/Linux 12')
  })
  it('supports debian 12/13', () => {
    expect(isSupportedDebian({ id: 'debian', versionId: '12' })).toBe(true)
    expect(isSupportedDebian({ id: 'ubuntu', versionId: '22.04' })).toBe(false)
  })
  it('checks prerequisites', () => {
    const errors = checkPrerequisites({ osId: 'debian', versionId: '12', prettyName: 'Debian', arch: 'x86_64', ramKb: 500000, freeDiskKb: 2000000, hostname: 'h' })
    expect(errors).toContain('need at least 1 GB RAM')
  })
})
