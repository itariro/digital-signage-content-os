export const API_VERSION = '1.0'

export function parseVersion(v: string) {
  const parts = v.split('.').map(Number)
  return { major: parts[0] ?? NaN, minor: parts[1] ?? 0 }
}

export function checkCompatibility(instance: string, consoleVersion: string) {
  const a = parseVersion(instance)
  const b = parseVersion(consoleVersion)
  if (Number.isNaN(a.major) || Number.isNaN(b.major)) return false
  return a.major === b.major && a.minor <= b.minor
}
