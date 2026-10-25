import { defaultConfig, configFromJson, configToJson, validateConfig, setConfigValue, redactConfig, validateUrl, DEFAULT_FRAME_URL } from './config'
import { isInStandbyWindow, nextTransition, validateSchedule } from './schedule'
import { evaluateHealth } from './health'
import { planSync, redactEndpoint } from './sync'
import { compareVersions, isUpdateAvailable } from './updates'
import { parseOsRelease, isSupportedDebian, checkPrerequisites, formatBytes } from './device'

export function configPath(): string { return process.env.KIOSK_CONFIG_PATH || '/etc/kiosk/kiosk.conf' }
export const APP_SERVICE = 'dscos'
export const KIOSK_SERVICE = 'lightdm'

export interface RunResult { exitCode: number; stdout: string; stderr: string }

interface Ctx {
  argv: string[]
  stdout: string[]
  stderr: string[]
  json: boolean
  yes: boolean
}

function out(ctx: Ctx, msg: string) { ctx.stdout.push(msg) }
function err(ctx: Ctx, msg: string) { ctx.stderr.push(msg) }

function parseShellConfig(text: string): any {
  const cfg = defaultConfig()
  const vars: Record<string,string> = {}
  for (const line of text.split(/\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1,-1)
    vars[m[1]] = val
  }
  if (vars.KIOSK_URL) cfg.frameUrl = vars.KIOSK_URL
  if (vars.KIOSK_ROTATE) cfg.rotate = vars.KIOSK_ROTATE as any
  if (vars.KIOSK_OUTPUT !== undefined) cfg.output = vars.KIOSK_OUTPUT
  if (vars.KIOSK_MODE !== undefined) cfg.mode = vars.KIOSK_MODE
  if (vars.KIOSK_SCALE !== undefined) cfg.scale = vars.KIOSK_SCALE
  if (vars.KIOSK_TOUCH !== undefined) cfg.touch = vars.KIOSK_TOUCH === '1'
  if (vars.KIOSK_RESTART_HOURS !== undefined) cfg.restartHours = parseInt(vars.KIOSK_RESTART_HOURS,10) || 0
  if (vars.KIOSK_PORT) cfg.appPort = parseInt(vars.KIOSK_PORT,10) || cfg.appPort
  if (vars.KIOSK_MGMT_PORT) cfg.mgmtPort = parseInt(vars.KIOSK_MGMT_PORT,10) || cfg.mgmtPort
  if (vars.KIOSK_TIMEZONE) cfg.timezone = vars.KIOSK_TIMEZONE
  if (vars.KIOSK_LOG_LEVEL) cfg.logLevel = vars.KIOSK_LOG_LEVEL as any
  if (vars.KIOSK_UPDATE_CHANNEL) cfg.updateChannel = vars.KIOSK_UPDATE_CHANNEL
  if (vars.KIOSK_CLOUD_ENDPOINT) cfg.cloudEndpoint = vars.KIOSK_CLOUD_ENDPOINT
  if (vars.KIOSK_SYNC_ENABLED !== undefined) cfg.syncEnabled = vars.KIOSK_SYNC_ENABLED === '1'
  if (vars.KIOSK_SYNC_INTERVAL) cfg.syncIntervalMinutes = parseInt(vars.KIOSK_SYNC_INTERVAL,10) || cfg.syncIntervalMinutes
  if (vars.KIOSK_NET_WAIT) cfg.netWait = parseInt(vars.KIOSK_NET_WAIT,10) || cfg.netWait
  if (vars.KIOSK_DISPLAY_WAIT) cfg.displayWait = parseInt(vars.KIOSK_DISPLAY_WAIT,10) || cfg.displayWait
  if (vars.KIOSK_EXTRA_FLAGS !== undefined) cfg.extraFlags = vars.KIOSK_EXTRA_FLAGS
  if (vars.KIOSK_STANDBY_ENABLED !== undefined) cfg.standby.enabled = vars.KIOSK_STANDBY_ENABLED === '1'
  if (vars.KIOSK_STANDBY_START) cfg.standby.start = vars.KIOSK_STANDBY_START
  if (vars.KIOSK_STANDBY_END) cfg.standby.end = vars.KIOSK_STANDBY_END
  if (vars.KIOSK_STANDBY_MODE) cfg.standby.mode = vars.KIOSK_STANDBY_MODE as any
  for (const [k,v] of Object.entries(vars)) {
    const m = k.match(/^KIOSK_SECRET_(.+)$/)
    if (m) cfg.secrets[m[1].toLowerCase()] = v
  }
  return cfg
}

function serializeShellConfig(config: any): string {
  const lines = [
    `KIOSK_URL='${config.frameUrl}'`,
    `KIOSK_ROTATE='${config.rotate}'`,
    `KIOSK_OUTPUT='${config.output}'`,
    `KIOSK_MODE='${config.mode}'`,
    `KIOSK_SCALE='${config.scale}'`,
    `KIOSK_TOUCH=${config.touch ? 1 : 0}`,
    `KIOSK_RESTART_HOURS=${config.restartHours}`,
    `KIOSK_PORT=${config.appPort}`,
    `KIOSK_MGMT_PORT=${config.mgmtPort}`,
    `KIOSK_TIMEZONE='${config.timezone}'`,
    `KIOSK_LOG_LEVEL='${config.logLevel}'`,
    `KIOSK_UPDATE_CHANNEL='${config.updateChannel}'`,
    `KIOSK_CLOUD_ENDPOINT='${config.cloudEndpoint}'`,
    `KIOSK_SYNC_ENABLED=${config.syncEnabled ? 1 : 0}`,
    `KIOSK_SYNC_INTERVAL=${config.syncIntervalMinutes}`,
    `KIOSK_NET_WAIT=${config.netWait}`,
    `KIOSK_DISPLAY_WAIT=${config.displayWait}`,
    `KIOSK_EXTRA_FLAGS='${config.extraFlags}'`,
    `KIOSK_STANDBY_ENABLED=${config.standby.enabled ? 1 : 0}`,
    `KIOSK_STANDBY_START='${config.standby.start}'`,
    `KIOSK_STANDBY_END='${config.standby.end}'`,
    `KIOSK_STANDBY_MODE='${config.standby.mode}'`,
  ]
  for (const [k,v] of Object.entries(config.secrets)) {
    lines.push(`KIOSK_SECRET_${k.toUpperCase()}='${String(v).replace(/'/g, "'\\''")}'`)
  }
  return lines.join('\n') + '\n'
}

function readConfig(ctx: Ctx): any {
  const fs = require('node:fs')
  const p = configPath()
  try {
    const text = fs.readFileSync(p, 'utf8')
    if (p.endsWith('.conf')) return parseShellConfig(text)
    try { return configFromJson(text) } catch { return parseShellConfig(text) }
  } catch {
    return defaultConfig()
  }
}

function writeConfig(ctx: Ctx, config: any): void {
  const fs = require('node:fs')
  const path = require('node:path')
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  const p = configPath()
  const content = p.endsWith('.conf') ? serializeShellConfig(config) : JSON.stringify(config, null, 2)
  fs.writeFileSync(p, content, { mode: 0o600 })
}

function execCmd(cmd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const cp = require('node:child_process')
  try {
    const r = cp.spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 })
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  } catch (e: any) {
    return { status: 1, stdout: '', stderr: String(e) }
  }
}

function helpText(): string {
  return `kiosk - Digital frame management CLI

Usage: kiosk <command> [subcommand] [options]

Top-level:
  install [--url URL] [--rotate DIR] [--yes]   Install/configure the frame
  setup                                       Alias for install
  status                                      Overall device + app status
  doctor                                      Diagnostics and remediation
  uninstall [--yes]                           Remove kiosk services

config:
  config show                                 Show configuration (secrets redacted)
  config validate                             Validate configuration
  config set <key> <value>                    Set a configuration value
  config export                               Print config as JSON
  config restore <file>                       Restore config from file

app:
  app start|stop|restart                      Manage the application service
  app logs [--lines N]                        Show application logs
  app health                                  Check application health

device:
  device info                                 Show device information
  device restart                              Restart the device
  device shutdown                             Shut down the device safely

standby:
  standby status                              Show standby status + next transition
  standby enable|disable                      Toggle standby schedule
  standby schedule                            Show schedule
  standby schedule set <start> <end>          Set schedule (HH:MM HH:MM)

update:
  update check                                Check for updates
  update apply [--version V]                  Apply an update
  update rollback                             Roll back to last known good

sync:
  sync status                                 Show sync status
  sync now                                    Trigger synchronization
  sync configure --endpoint URL [--interval N] [--enable|--disable]

enroll:
  enroll <console-url> <CODE>                Pull the frame bundle, write /etc/dscos/frame.env, restart app
  password <secret>                          Set the frame-local admin password (management-port mutations)

Global options:
  --json                                      Machine-readable output
  --yes                                       Skip confirmations
  --help                                      Show help

Examples:
  kiosk install
  kiosk config set standby.start 22:00
  kiosk standby schedule set 22:00 06:00
  kiosk app health
  kiosk sync now
`
}

async function cmdConfig(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  if (sub === 'show') {
    out(ctx, JSON.stringify(redactConfig(config), null, 2))
    return 0
  }
  if (sub === 'validate') {
    const errors = validateConfig(config)
    if (errors.length) {
      for (const e of errors) err(ctx, `${e.field}: ${e.message}`)
      return 1
    }
    out(ctx, 'configuration valid')
    return 0
  }
  if (sub === 'set') {
    const [key, value] = args
    if (!key || value === undefined) { err(ctx, 'usage: config set <key> <value>'); return 2 }
    try {
      const next = setConfigValue(config, key, value)
      const errors = validateConfig(next)
      if (errors.length) { for (const e of errors) err(ctx, `${e.field}: ${e.message}`); return 1 }
      writeConfig(ctx, next)
      out(ctx, `set ${key} = ${value}`)
      return 0
    } catch (e: any) {
      err(ctx, String(e?.message ?? e))
      return 1
    }
  }
  if (sub === 'export') {
    out(ctx, JSON.stringify(redactConfig(config), null, 2))
    return 0
  }
  if (sub === 'restore') {
    const file = args[0]
    if (!file) { err(ctx, 'usage: config restore <file>'); return 2 }
    const fs = require('node:fs')
    try {
      const next = configFromJson(fs.readFileSync(file, 'utf8'))
      const errors = validateConfig(next)
      if (errors.length) { for (const e of errors) err(ctx, `${e.field}: ${e.message}`); return 1 }
      writeConfig(ctx, next)
      out(ctx, 'configuration restored')
      return 0
    } catch (e: any) {
      err(ctx, String(e?.message ?? e))
      return 1
    }
  }
  err(ctx, `unknown config subcommand: ${sub}`)
  return 2
}

async function cmdApp(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  if (sub === 'start') {
    const r = execCmd('systemctl', ['start', APP_SERVICE])
    out(ctx, r.stdout || `started ${APP_SERVICE}`)
    return r.status
  }
  if (sub === 'stop') {
    const r = execCmd('systemctl', ['stop', APP_SERVICE])
    out(ctx, r.stdout || `stopped ${APP_SERVICE}`)
    return r.status
  }
  if (sub === 'restart') {
    const r = execCmd('systemctl', ['restart', APP_SERVICE])
    out(ctx, r.stdout || `restarted ${APP_SERVICE}`)
    return r.status
  }
  if (sub === 'health') {
    const config: any = readConfig(ctx)
    const port = Number(config.appPort)
    if (!Number.isInteger(port) || port < 1) { err(ctx, 'invalid app port'); return 1 }
    const r = execCmd('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://localhost:${port}/api/health`])
    const code = parseInt(r.stdout.trim(), 10)
    const httpOk = code >= 200 && code < 300
    const proc = execCmd('systemctl', ['is-active', APP_SERVICE])
    const processRunning = proc.stdout.trim() === 'active'
    const report = evaluateHealth({ processRunning, portOpen: httpOk, httpOk, configValid: validateConfig(config).length === 0 })
    out(ctx, JSON.stringify(report, null, 2))
    return report.state === 'healthy' ? 0 : 1
  }
  if (sub === 'logs') {
    const idx = args.indexOf('--lines')
    const raw = idx >= 0 ? args[idx + 1] : '100'
    const lines = Number(raw)
    const n = Number.isInteger(lines) && lines > 0 ? String(lines) : '100'
    const r = execCmd('journalctl', ['-u', APP_SERVICE, '-n', n, '--no-pager'])
    out(ctx, r.stdout)
    return r.status
  }
  err(ctx, `unknown app subcommand: ${sub}`)
  return 2
}

async function cmdDevice(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  if (sub === 'info') {
    const fs = require('node:fs')
    const osRelease = fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : ''
    const parsed = parseOsRelease(osRelease)
    const info = {
      ...parsed,
      arch: execCmd('uname', ['-m']).stdout.trim(),
      hostname: execCmd('hostname', []).stdout.trim(),
    }
    out(ctx, JSON.stringify(info, null, 2))
    return 0
  }
  if (sub === 'restart') {
    if (!ctx.yes) { err(ctx, 'device restart requires --yes'); return 2 }
    const r = execCmd('systemctl', ['reboot'])
    return r.status
  }
  if (sub === 'shutdown') {
    if (!ctx.yes) { err(ctx, 'device shutdown requires --yes'); return 2 }
    const r = execCmd('systemctl', ['poweroff'])
    return r.status
  }
  err(ctx, `unknown device subcommand: ${sub}`)
  return 2
}

async function cmdStandby(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  if (sub === 'status') {
    const sched = config.standby
    const now = new Date()
    const inStandby = isInStandbyWindow(now, sched)
    const nt = nextTransition(now, sched)
    out(ctx, JSON.stringify({ schedule: sched, inStandby, nextTransition: nt }, null, 2))
    return 0
  }
  if (sub === 'enable') {
    config.standby.enabled = true
    writeConfig(ctx, config)
    out(ctx, 'standby enabled')
    return 0
  }
  if (sub === 'disable') {
    config.standby.enabled = false
    writeConfig(ctx, config)
    out(ctx, 'standby disabled')
    return 0
  }
  if (sub === 'schedule') {
    const nested = args[0]
    if (nested === 'set') {
      const [start, end] = args.slice(1)
      if (!start || !end) { err(ctx, 'usage: standby schedule set <start> <end>'); return 2 }
      const sched = { enabled: config.standby.enabled, start, end }
      const errors = validateSchedule(sched)
      if (errors.length) { for (const e of errors) err(ctx, e); return 1 }
      config.standby.start = start
      config.standby.end = end
      writeConfig(ctx, config)
      out(ctx, `schedule set to ${start}-${end}`)
      return 0
    }
    out(ctx, JSON.stringify(config.standby, null, 2))
    return 0
  }
  err(ctx, `unknown standby subcommand: ${sub}`)
  return 2
}

async function cmdUpdate(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  if (sub === 'check') {
    out(ctx, JSON.stringify({ channel: config.updateChannel, current: 'unknown', latest: 'unknown', updateAvailable: false, note: 'update server not configured' }, null, 2))
    return 0
  }
  if (sub === 'apply') {
    err(ctx, 'update apply is not supported in this environment (no update server configured)')
    return 1
  }
  if (sub === 'rollback') {
    err(ctx, 'rollback is not supported in this environment (no update server configured)')
    return 1
  }
  err(ctx, `unknown update subcommand: ${sub}`)
  return 2
}

async function cmdSync(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  if (sub === 'status') {
    out(ctx, JSON.stringify({ enabled: config.syncEnabled, endpoint: redactEndpoint(config.cloudEndpoint || ''), intervalMinutes: config.syncIntervalMinutes }, null, 2))
    return 0
  }
  if (sub === 'now') {
    // Connectivity check
    if (!config.cloudEndpoint) { err(ctx, 'no cloud endpoint configured'); return 1 }
    const r = execCmd('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10', config.cloudEndpoint])
    const code = parseInt(r.stdout.trim(), 10)
    if (code >= 200 && code < 400) {
      out(ctx, 'synchronization OK')
      return 0
    }
    err(ctx, `cloud unreachable (HTTP ${code || 'none'})`)
    return 1
  }
  if (sub === 'configure') {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--endpoint') {
        const v = args[++i]
        if (!v || !validateUrl(v)) { err(ctx, 'invalid endpoint URL'); return 1 }
        config.cloudEndpoint = v
      } else if (args[i] === '--interval') {
        const n = parseInt(args[++i], 10)
        if (!Number.isInteger(n) || n < 1) { err(ctx, 'interval must be a positive integer'); return 1 }
        config.syncIntervalMinutes = n
      } else if (args[i] === '--enable') { config.syncEnabled = true }
      else if (args[i] === '--disable') { config.syncEnabled = false }
    }
    const errors = validateConfig(config)
    if (errors.length) { for (const e of errors) err(ctx, `${e.field}: ${e.message}`); return 1 }
    writeConfig(ctx, config)
    out(ctx, 'sync configuration updated')
    return 0
  }
  err(ctx, `unknown sync subcommand: ${sub}`)
  return 2
}

async function cmdEnroll(ctx: Ctx, url: string | undefined, code: string | undefined): Promise<number> {
  if (!url || !code) { err(ctx, 'usage: kiosk enroll <console-url> <CODE>'); return 2 }
  const { enroll } = await import('./enroll')
  const res = await enroll(url, code, { fetch: globalThis.fetch })
  if (!res.ok) { err(ctx, res.message ?? 'enroll failed'); return 1 }
  out(ctx, `enrolled: wrote ${res.written}`)
  // systemctl only exists on the Linux frame image; dev/test machines skip the
  // restart gracefully so install-time calls are safe before the unit exists.
  if (process.platform === 'linux') {
    const restart = execCmd('systemctl', ['restart', APP_SERVICE])
    if (restart.status !== 0) { err(ctx, `app restart failed (exit ${restart.status}); run: systemctl restart ${APP_SERVICE}`); return 1 }
  }
  return 0
}

async function cmdPassword(ctx: Ctx, secret: string | undefined): Promise<number> {
  if (!secret) { err(ctx, 'usage: kiosk password <secret>'); return 2 }
  const { hashAdminPassword, isValidAdminSecret } = await import('../frame-admin')
  const { writeFrameEnv, frameEnvPath, parseFrameEnv } = await import('./frame-env')
  const fs = require('node:fs')
  const crypto = require('node:crypto')
  const file = process.env.FRAME_ENV_PATH || frameEnvPath()
  if (secret.length < 8) { err(ctx, 'password too short (min 8)'); return 1 }

  const existing = fs.existsSync(file) ? parseFrameEnv(fs.readFileSync(file, 'utf8')) : {}
  const storedSecret = existing.FRAME_ADMIN_SECRET
  if (storedSecret && !isValidAdminSecret(storedSecret)) {
    err(ctx, `warning: replaced invalid FRAME_ADMIN_SECRET in ${file}`)
  }

  let adminSecret: string
  if (isValidAdminSecret(storedSecret)) {
    adminSecret = storedSecret
  } else if (isValidAdminSecret(process.env.FRAME_ADMIN_SECRET)) {
    adminSecret = process.env.FRAME_ADMIN_SECRET
  } else {
    adminSecret = crypto.randomBytes(32).toString('base64url')
    out(ctx, `generated FRAME_ADMIN_SECRET in ${file}`)
  }

  // One write: a crash cannot leave a new secret with the old hash.
  writeFrameEnv(file, {
    ...existing,
    FRAME_ADMIN_SECRET: adminSecret,
    FRAME_ADMIN_HASH: hashAdminPassword(secret),
  })
  out(ctx, `admin password set in ${file}; restart the app to apply`)
  if (process.platform === 'linux') {
    execCmd('systemctl', ['restart', APP_SERVICE])
  }
  return 0
}

export async function runCli(argv: string[]): Promise<RunResult> {
  const ctx: Ctx = { argv: [...argv], stdout: [], stderr: [], json: false, yes: false }
  // global flags
  const filtered: string[] = []
  for (const a of argv) {
    if (a === '--json') ctx.json = true
    else if (a === '--yes' || a === '-y') ctx.yes = true
    else filtered.push(a)
  }
  const args = filtered

  let code = 0
  try {
    const cmd = args[0]
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      out(ctx, helpText())
      code = 0
    } else if (cmd === 'install' || cmd === 'setup') {
      out(ctx, 'Run install-kiosk.sh to install; use `kiosk setup` on device after install.')
      code = 0
    } else if (cmd === 'status') {
      const config: any = readConfig(ctx)
      const healthR = execCmd('systemctl', ['is-active', APP_SERVICE])
      out(ctx, JSON.stringify({ app: healthR.stdout.trim(), config: redactConfig(config) }, null, 2))
      code = 0
    } else if (cmd === 'doctor') {
      const config: any = readConfig(ctx)
      const errors = validateConfig(config)
      const proc = execCmd('systemctl', ['is-active', APP_SERVICE])
      const processRunning = proc.stdout.trim() === 'active'
      const portR = execCmd('bash', ['-c', ` (echo > /dev/tcp/127.0.0.1/${config.appPort}) >/dev/null 2>&1`])
      const portOpen = portR.status === 0
      let httpOk = false
      if (portOpen) {
        const hr = execCmd('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://localhost:${config.appPort}/api/health`])
        const c = parseInt(hr.stdout.trim(), 10)
        httpOk = c >= 200 && c < 300
      }
      const report = evaluateHealth({ processRunning, portOpen, httpOk, configValid: errors.length === 0 })
      out(ctx, JSON.stringify({ configErrors: errors, health: report }, null, 2))
      code = errors.length || report.state !== 'healthy' ? 1 : 0
    } else if (cmd === 'uninstall') {
      if (!ctx.yes) { err(ctx, 'uninstall requires --yes'); code = 2 }
      else { out(ctx, 'uninstall requested'); code = 0 }
    } else if (cmd === 'config') {
      code = await cmdConfig(ctx, args[1] || 'show', args.slice(2))
    } else if (cmd === 'app') {
      code = await cmdApp(ctx, args[1] || 'status', args.slice(2))
    } else if (cmd === 'device') {
      code = await cmdDevice(ctx, args[1] || 'info', args.slice(2))
    } else if (cmd === 'standby') {
      code = await cmdStandby(ctx, args[1] || 'status', args.slice(2))
    } else if (cmd === 'update') {
      code = await cmdUpdate(ctx, args[1] || 'check', args.slice(2))
    } else if (cmd === 'sync') {
      code = await cmdSync(ctx, args[1] || 'status', args.slice(2))
    } else if (cmd === 'enroll') {
      code = await cmdEnroll(ctx, args[1], args[2])
    } else if (cmd === 'password') {
      code = await cmdPassword(ctx, args[1])
    } else {
      err(ctx, `unknown command: ${cmd}`)
      out(ctx, helpText())
      code = 2
    }
  } catch (e: any) {
    err(ctx, String(e?.message ?? e))
    code = 1
  }
  return { exitCode: code, stdout: ctx.stdout.join('\n'), stderr: ctx.stderr.join('\n') }
}
