export type HealthState = 'healthy' | 'degraded' | 'failed' | 'unknown'

export interface HealthCheck {
  name: string
  ok: boolean
  critical: boolean
  detail: string
}

export interface HealthReport {
  state: HealthState
  checks: HealthCheck[]
  summary: string
}

export interface HealthInput {
  processRunning: boolean
  portOpen: boolean
  httpOk: boolean
  configValid: boolean
  databaseOk?: boolean
  cloudOk?: boolean
}

export function evaluateHealth(input: HealthInput): HealthReport {
  const checks: HealthCheck[] = [
    { name: 'process', ok: input.processRunning, critical: true, detail: input.processRunning ? 'running' : 'not running' },
    { name: 'port', ok: input.portOpen, critical: true, detail: input.portOpen ? 'open' : 'closed' },
    { name: 'http', ok: input.httpOk, critical: true, detail: input.httpOk ? 'responding' : 'no response' },
    { name: 'config', ok: input.configValid, critical: true, detail: input.configValid ? 'valid' : 'invalid' },
  ]
  if (input.databaseOk !== undefined) {
    checks.push({ name: 'database', ok: input.databaseOk, critical: false, detail: input.databaseOk ? 'connected' : 'unreachable' })
  }
  if (input.cloudOk !== undefined) {
    checks.push({ name: 'cloud', ok: input.cloudOk, critical: false, detail: input.cloudOk ? 'reachable' : 'unreachable' })
  }

  const criticalFailed = checks.some(c => c.critical && !c.ok)
  const anyFailed = checks.some(c => !c.ok)
  const state: HealthState = criticalFailed ? 'failed' : anyFailed ? 'degraded' : 'healthy'
  const failedNames = checks.filter(c => !c.ok).map(c => c.name)
  const summary = failedNames.length ? `issues: ${failedNames.join(', ')}` : 'all checks passed'
  return { state, checks, summary }
}

export function isHealthy(report: HealthReport): boolean {
  return report.state === 'healthy'
}
