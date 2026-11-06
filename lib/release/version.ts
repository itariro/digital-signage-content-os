import fs from 'node:fs'
import path from 'node:path'
import { parseSemver } from '../semver'

export interface ReleaseVersion {
  version: string
  tag: string
  prerelease: boolean
}

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReleaseError'
  }
}

export function parseReleaseVersion(input: string): ReleaseVersion {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ReleaseError('version is required')
  }
  if (input !== input.trim()) {
    throw new ReleaseError(`version has surrounding whitespace: "${input}"`)
  }

  const normalized = input.startsWith('v') ? input.slice(1) : input
  const parsed = parseSemver(normalized)
  if (!parsed) {
    throw new ReleaseError(
      `invalid release version: "${input}" (expected X.Y.Z or X.Y.Z-<prerelease>)`,
    )
  }
  if (parsed.build.length > 0) {
    throw new ReleaseError(`release version must not include build metadata: "${input}"`)
  }

  return {
    version: normalized,
    tag: `v${normalized}`,
    prerelease: parsed.prerelease.length > 0,
  }
}

export function readPackageVersion(root: string): string {
  const packagePath = path.join(root, 'package.json')
  let packageJson: unknown
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ReleaseError(`could not read ${packagePath}: ${reason}`)
  }

  const version = (packageJson as { version?: unknown })?.version
  if (typeof version !== 'string' || version.length === 0) {
    throw new ReleaseError(`${packagePath} has no version`)
  }
  return version
}

export function assertPackageVersion(packageVersion: string, release: ReleaseVersion): void {
  if (packageVersion !== release.version) {
    throw new ReleaseError(
      `package.json version ${packageVersion} does not match release ${release.version}`,
    )
  }
}

export function checkRelease(root: string, input: string): ReleaseVersion {
  const release = parseReleaseVersion(input)
  assertPackageVersion(readPackageVersion(root), release)
  return release
}
