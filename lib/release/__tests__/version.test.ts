import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ReleaseError,
  assertPackageVersion,
  checkRelease,
  parseReleaseVersion,
  readPackageVersion,
} from '../version'

describe('release version', () => {
  it('parses a stable version', () => {
    expect(parseReleaseVersion('0.9.0')).toEqual({
      version: '0.9.0',
      tag: 'v0.9.0',
      prerelease: false,
    })
  })

  it('parses a prerelease and strips a leading v', () => {
    expect(parseReleaseVersion('v0.9.0-rc.1')).toEqual({
      version: '0.9.0-rc.1',
      tag: 'v0.9.0-rc.1',
      prerelease: true,
    })
  })

  it('rejects invalid versions', () => {
    for (const value of [
      '0.9',
      '0.9.0.1',
      '01.9.0',
      '0.9.0+build',
      ' 0.9.0',
      '0.9.0-',
      '0.9.0-rc..1',
    ]) {
      expect(() => parseReleaseVersion(value)).toThrow(ReleaseError)
    }
  })

  it('rejects an empty version', () => {
    expect(() => parseReleaseVersion('')).toThrow(/required/)
  })

  it('rejects a package version mismatch', () => {
    const release = parseReleaseVersion('0.9.0')
    expect(() => assertPackageVersion('0.8.0', release)).toThrow(/does not match/)
  })

  it('reads and checks the package version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-version-'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.9.0' }))
    expect(readPackageVersion(root)).toBe('0.9.0')
    expect(checkRelease(root, '0.9.0').tag).toBe('v0.9.0')
    expect(() => checkRelease(root, '0.9.1')).toThrow(/does not match/)
  })
})
