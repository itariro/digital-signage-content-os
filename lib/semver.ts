export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
  build: string[]
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export function parseSemver(input: string): ParsedVersion | null {
  const match = SEMVER_RE.exec(input)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  }
}

interface TolerantVersion {
  core: number[]
  prerelease: string[]
}

function parseTolerant(input: string): TolerantVersion {
  const value = String(input ?? '').trim().replace(/^v/i, '')
  const withoutBuild = value.split('+')[0]
  const dash = withoutBuild.indexOf('-')
  const coreText = dash >= 0 ? withoutBuild.slice(0, dash) : withoutBuild
  const prereleaseText = dash >= 0 ? withoutBuild.slice(dash + 1) : ''
  const core = coreText.split('.').map((part) => {
    const number = Number.parseInt(part, 10)
    return Number.isFinite(number) ? number : 0
  })
  if (core.length === 0) core.push(0)
  return { core, prerelease: prereleaseText ? prereleaseText.split('.') : [] }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.min(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const a = left[i]
    const b = right[i]
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)

    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    if (aNumeric) return -1
    if (bNumeric) return 1
    if (a !== b) return a < b ? -1 : 1
  }

  if (left.length === right.length) return 0
  return left.length < right.length ? -1 : 1
}

export function compareVersions(a: string, b: string): number {
  const left = parseTolerant(a)
  const right = parseTolerant(b)
  const length = Math.max(left.core.length, right.core.length)

  for (let i = 0; i < length; i++) {
    const x = left.core[i] ?? 0
    const y = right.core[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }

  return comparePrerelease(left.prerelease, right.prerelease)
}
