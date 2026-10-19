export interface DeviceInfo {
  osId: string
  versionId: string
  prettyName: string
  arch: string
  ramKb: number
  freeDiskKb: number
  hostname: string
}

export function parseOsRelease(text: string): { id: string; versionId: string; prettyName: string } {
  const get = (key: string) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (!m) return ''
    return m[1].replace(/^"|"$/g, '')
  }
  return { id: get('ID'), versionId: get('VERSION_ID'), prettyName: get('PRETTY_NAME') }
}

export function isSupportedDebian(info: { id: string; versionId: string }): boolean {
  if (info.id !== 'debian') return false
  return ['12', '13'].includes(info.versionId)
}

export function formatBytes(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

export function checkPrerequisites(info: DeviceInfo): string[] {
  const errors: string[] = []
  if (!isSupportedDebian({ id: info.osId, versionId: info.versionId })) {
    errors.push(`unsupported OS: ${info.osId} ${info.versionId}`)
  }
  if (info.ramKb < 1_000_000) errors.push('need at least 1 GB RAM')
  if (info.freeDiskKb < 1_500_000) errors.push('need at least 1.5 GB free disk')
  return errors
}
