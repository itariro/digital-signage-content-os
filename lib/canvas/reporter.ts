export type DisplayReport = {
  appliedRevision: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

const reports = new Map<string, DisplayReport>()
const MAX_REPORTS = 32

export function recordDisplayReport(instanceId: string, report: DisplayReport): void {
  if (!reports.has(instanceId) && reports.size >= MAX_REPORTS) {
    const oldest = reports.keys().next().value
    if (oldest !== undefined) reports.delete(oldest)
  }
  reports.set(instanceId, { ...report })
}

export function getDisplayReport(instanceId: string): DisplayReport | null {
  return reports.get(instanceId) ?? null
}

export function resetDisplayReport(): void {
  reports.clear()
}
