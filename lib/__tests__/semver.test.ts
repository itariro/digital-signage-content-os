import { describe, it, expect } from 'vitest'
import { compareVersions, parseSemver } from '../semver'

describe('semver', () => {
  it('compares core versions', () => {
    expect(compareVersions('0.8.0', '0.9.0')).toBe(-1)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
  })

  it('orders prereleases before the final release', () => {
    expect(compareVersions('0.9.0-rc.1', '0.9.0')).toBe(-1)
    expect(compareVersions('0.9.0-beta', '0.9.0')).toBe(-1)
    expect(compareVersions('0.9.0', '0.9.0-rc.1')).toBe(1)
    expect(compareVersions('0.9.1-rc.1', '0.9.0')).toBe(1)
  })

  it('orders numeric prerelease identifiers numerically', () => {
    expect(compareVersions('0.9.0-rc.2', '0.9.0-rc.10')).toBe(-1)
    expect(compareVersions('0.9.0-rc.10', '0.9.0-rc.2')).toBe(1)
  })

  it('orders alpha, alpha.1, and beta', () => {
    expect(compareVersions('0.9.0-alpha', '0.9.0-alpha.1')).toBe(-1)
    expect(compareVersions('0.9.0-alpha.1', '0.9.0-beta')).toBe(-1)
    expect(compareVersions('0.9.0-beta', '0.9.0-alpha.1')).toBe(1)
  })

  it('tolerates legacy partial and unknown versions', () => {
    expect(compareVersions('v0.8', '0.8.0')).toBe(0)
    expect(compareVersions('2.0', '2.0.0')).toBe(0)
    expect(compareVersions('unknown', '0.1.0')).toBe(-1)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build.1', '1.0.0+build.2')).toBe(0)
    expect(compareVersions('1.0.0-alpha+one', '1.0.0-alpha+two')).toBe(0)
  })

  it('parses strict semver', () => {
    expect(parseSemver('0.9.0-rc.1+build.5')).toEqual({
      major: 0,
      minor: 9,
      patch: 0,
      prerelease: ['rc', '1'],
      build: ['build', '5'],
    })
    expect(parseSemver('0.9')).toBeNull()
    expect(parseSemver('v0.9.0')).toBeNull()
    expect(parseSemver('01.9.0')).toBeNull()
    expect(parseSemver('0.9.0-01')).toBeNull()
  })
})
