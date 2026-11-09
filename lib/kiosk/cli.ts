import { defaultConfig, configFromJson, configToJson, validateConfig, setConfigValue, redactConfig, validateUrl, DEFAULT_FRAME_URL } from './config'
import { isInStandbyWindow, nextTransition, validateSchedule } from './schedule'
import { evaluateHealth } from './health'
import { planSync, redactEndpoint } from './sync'
import { compareVersions, isUpdateAvailable, isUpdateAvailableFor } from './updates'
import {
  fetchLatestRelease,
  switchRelease,
  rollbackRelease,
  stagingDir,
  backupDir,
  validateStaging,
  acquireUpdateLock,
  lockFile,
  stateFile,
  readAppVersion,
  readInstallerVersion,
  parseInstallerVersion,
  installerVersionFile,
  runtimeBackupDir,
  runtimeFiles,
  backupRuntimeFiles,
  restoreRuntimeFiles,
  isRuntimeBackupIncomplete,
  markRuntimeBackupComplete,
  MANAGED_TIMERS,
  readTimerState,
  writeTimerState,
} from './updater'
import { parseOsRelease, isSupportedDebian, checkPrerequisites, formatBytes } from './device'
import { normalizeBuildSymlinks } from '../release/archive'

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

// Undo shell quoting without executing anything. serializeShellConfig emits
// single-quoted values, so an apostrophe becomes 'it'\''s'. A plain
// slice(1,-1) would leave the escape behind and `config show` (or any later
// read) would see mangles instead of the operator's text.
function unquoteShellValue(raw: string): string {
  let out = ''
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === "'") {
      i++
      while (i < raw.length && raw[i] !== "'") { out += raw[i]; i++ }
      i++
      if (raw[i] === '\\' && raw[i + 1] === "'") { out += "'"; i += 2 }
    } else if (ch === '"') {
      i++
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\' && i + 1 < raw.length) { i++; out += raw[i] } else out += raw[i]
        i++
      }
      i++
    } else if (ch === '\\' && i + 1 < raw.length) {
      out += raw[i + 1]
      i += 2
    } else {
      out += ch
      i++
    }
  }
  return out
}

function parseShellConfig(text: string): any {
  const cfg = defaultConfig()
  const vars: Record<string,string> = {}
  for (const line of text.split(/\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const raw = m[2].trim()
    // Only parse quoting when the value actually starts with a quote. An
    // unquoted legacy value (for example a hand-edited KIOSK_EXTRA_FLAGS=don't)
    // stays literal instead of losing its apostrophe.
    vars[m[1]] = raw.startsWith("'") || raw.startsWith('"') ? unquoteShellValue(raw) : raw
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

function shellQuote(value: unknown): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function serializeShellConfig(config: any): string {
  const lines = [
    `KIOSK_URL=${shellQuote(config.frameUrl)}`,
    `KIOSK_ROTATE=${shellQuote(config.rotate)}`,
    `KIOSK_OUTPUT=${shellQuote(config.output)}`,
    `KIOSK_MODE=${shellQuote(config.mode)}`,
    `KIOSK_SCALE=${shellQuote(config.scale)}`,
    `KIOSK_TOUCH=${config.touch ? 1 : 0}`,
    `KIOSK_RESTART_HOURS=${config.restartHours}`,
    `KIOSK_PORT=${config.appPort}`,
    `KIOSK_MGMT_PORT=${config.mgmtPort}`,
    `KIOSK_TIMEZONE=${shellQuote(config.timezone)}`,
    `KIOSK_LOG_LEVEL=${shellQuote(config.logLevel)}`,
    `KIOSK_UPDATE_CHANNEL=${shellQuote(config.updateChannel)}`,
    `KIOSK_CLOUD_ENDPOINT=${shellQuote(config.cloudEndpoint)}`,
    `KIOSK_SYNC_ENABLED=${config.syncEnabled ? 1 : 0}`,
    `KIOSK_SYNC_INTERVAL=${config.syncIntervalMinutes}`,
    `KIOSK_NET_WAIT=${config.netWait}`,
    `KIOSK_DISPLAY_WAIT=${config.displayWait}`,
    `KIOSK_EXTRA_FLAGS=${shellQuote(config.extraFlags)}`,
    `KIOSK_STANDBY_ENABLED=${config.standby.enabled ? 1 : 0}`,
    `KIOSK_STANDBY_START=${shellQuote(config.standby.start)}`,
    `KIOSK_STANDBY_END=${shellQuote(config.standby.end)}`,
    `KIOSK_STANDBY_MODE=${shellQuote(config.standby.mode)}`,
  ]
  for (const [k,v] of Object.entries(config.secrets)) {
    lines.push(`KIOSK_SECRET_${k.toUpperCase()}=${shellQuote(v)}`)
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

function withConfig(ctx: Ctx, fn: (config: any) => Promise<number> | number): Promise<number> | number {
  const config = readConfig(ctx)
  const errors = validateConfig(config)
  if (errors.length) {
    if (ctx.json) out(ctx, JSON.stringify({ configErrors: errors }, null, 2))
    else for (const e of errors) err(ctx, `${e.field}: ${e.message}`)
    return 1
  }
  return fn(config)
}

function writeConfig(ctx: Ctx, config: any): void {
  const fs = require('node:fs')
  const path = require('node:path')
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  const p = configPath()
  const content = p.endsWith('.conf') ? serializeShellConfig(config) : JSON.stringify(config, null, 2)
  fs.writeFileSync(p, content, { mode: 0o600 })
}

interface ExecOpts {
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}
function execCmd(cmd: string, args: string[], opts: ExecOpts = {}): { status: number; stdout: string; stderr: string } {
  const cp = require('node:child_process')
  try {
    const r = cp.spawnSync(cmd, args, {
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 30000,
      env: opts.env,
    })
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  } catch (e: any) {
    return { status: 1, stdout: '', stderr: String(e) }
  }
}
function execCmdLong(cmd: string, args: string[], opts: ExecOpts = {}): { status: number; stdout: string; stderr: string } {
  return execCmd(cmd, args, { ...opts, timeoutMs: opts.timeoutMs ?? 600000 })
}

function helpText(): string {
  return `kiosk - Digital frame management CLI

Usage: kiosk <command> [subcommand] [options]

Top-level:
  install [--url URL] [--rotate DIR] [--yes]   Install/configure the frame
  setup                                       Alias for install
  status                                      Overall device + app status
  doctor                                      Diagnostics and remediation
  version                                     Show app/installer/os versions
  logs [--lines N] [--unit U]                 Show journal logs
  reset --yes                                 Reset config to defaults
  uninstall --yes                             Remove kiosk services

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
  update apply [--version V] [--yes]           Apply an update
  update rollback                             Roll back to last known good
  update enable|disable                       Toggle the daily update timer
  update status                               Show timer state and last run

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
    if (r.status !== 0) { err(ctx, r.stderr || `failed to start ${APP_SERVICE}`); return r.status }
    reloadBrowserWhenReady(ctx)
    out(ctx, r.stdout || `started ${APP_SERVICE}`)
    return 0
  }
  if (sub === 'stop') {
    const r = execCmd('systemctl', ['stop', APP_SERVICE])
    if (r.status !== 0) { err(ctx, r.stderr || `failed to stop ${APP_SERVICE}`); return r.status }
    out(ctx, r.stdout || `stopped ${APP_SERVICE}`)
    return 0
  }
  if (sub === 'restart') {
    const r = execCmd('systemctl', ['restart', APP_SERVICE])
    if (r.status !== 0) { err(ctx, r.stderr || `failed to restart ${APP_SERVICE}`); return r.status }
    reloadBrowserWhenReady(ctx)
    out(ctx, r.stdout || `restarted ${APP_SERVICE}`)
    return 0
  }
  if (sub === 'health') {
    const config: any = readConfig(ctx)
    const port = Number(config.appPort)
    if (!Number.isInteger(port) || port < 1) { err(ctx, 'invalid app port'); return 1 }
    const r = execCmd('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://127.0.0.1:${port}/api/health`])
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
  const repairing = sub === 'schedule' && args[0] === 'set'
  if (!repairing) {
    const _errs = validateConfig(config)
    if (_errs.length) { if (ctx.json) out(ctx, JSON.stringify({ configErrors: _errs }, null, 2)); else for (const e of _errs) err(ctx, `${e.field}: ${e.message}`); return 1 }
  }
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

// The nodejs floor of the current release (better-sqlite3 13 / Next 16). The
// app service runs /usr/bin/node by absolute path, so the check probes that
// binary, not whatever `node` happens to resolve to on PATH.
const MIN_NODE_MAJOR = 24

function usrBinDir(): string {
  const path = require('node:path')
  const root = process.env.KIOSK_RUNTIME_ROOT || ''
  return root ? path.join(root, 'usr', 'bin') : '/usr/bin'
}

function checkNodeRuntime(): { ok: boolean; error?: string } {
  const fs = require('node:fs')
  const path = require('node:path')
  const bin = usrBinDir()
  const nodeBin = path.join(bin, 'node')
  const found = fs.existsSync(nodeBin)
    ? execCmd(nodeBin, ['-p', 'process.versions.node']).stdout.trim()
    : ''
  const major = parseInt(found.split('.')[0], 10)
  const hasNpm = fs.existsSync(path.join(bin, 'npm'))
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR || !hasNpm) {
    return { ok: false, error: `Node >=24 required (found ${found || 'unknown'}); run installer` }
  }
  return { ok: true }
}

// Best-effort browser refresh after the app is healthy. The session only
// relaunches surf when its process dies, so a surf that loaded while the
// app was down never reloads unless we kill it. Never fail the caller
// when pkill/surf/the kiosk user is absent (dev hosts, tests).
function refreshBrowserAfterApp(ctx?: Ctx): void {
  const pkill = execCmd('pkill', ['-TERM', '-u', 'kiosk', '-x', 'surf'])
  if (pkill.status === 0) {
    if (ctx) out(ctx, 'browser restarted to reload frame page')
    return
  }
  // pkill exits 1 both when nothing matched and when a match could not be
  // signalled, so ask pgrep which case this is instead of claiming the
  // browser is not running while a stale page is still on screen.
  const pgrep = execCmd('pgrep', ['-u', 'kiosk', '-x', 'surf'])
  const pids = pgrep.stdout.trim()
  if (pgrep.status === 0 && pids) {
    if (ctx) err(ctx, `browser refresh not confirmed: could not signal surf (pid ${pids.split(/\s+/).join(', ')}); check the display or: journalctl -t kiosk`)
    return
  }
  if (ctx) out(ctx, 'browser not running; session will start it')
}

// Poll until the URL answers 2xx. Reloading Surf before Next.js can render
// leaves the boot-time error page on screen until the next reload, so callers
// signal the browser only after this returns ok.
function waitForAppHealthy(url: string, opts: { attempts: number; delayMs: number; deadlineMs: number }): { ok: boolean; lastCode: string } {
  let lastCode = '000'
  let inactivePolls = 0
  const deadline = Date.now() + opts.deadlineMs
  for (let i = 0; i < opts.attempts && Date.now() < deadline; i++) {
    const state = execCmd('systemctl', ['is-active', APP_SERVICE]).stdout.trim()
    const activeish = state === 'active' || state === 'activating' || state === 'deactivating' || state === 'reloading'
    if (!activeish) {
      // A restart queued behind another job can report `inactive` for a poll
      // or two. Anything else (failed, or no systemctl at all) bails at once.
      const transient = state === 'inactive' && ++inactivePolls < 3
      if (!transient) return { ok: false, lastCode }
      if (i < opts.attempts - 1) execCmd('sleep', [String(opts.delayMs / 1000)])
      continue
    }
    inactivePolls = 0
    // -L: Next.js may redirect a frame URL with or without the trailing slash.
    const hr = execCmd('curl', ['-sSL', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', url])
    const code = parseInt(hr.stdout.trim(), 10)
    lastCode = Number.isInteger(code) ? (code === 0 ? '000' : String(code)) : '000'
    if (code >= 200 && code < 300) return { ok: true, lastCode }
    if (i < opts.attempts - 1) execCmd('sleep', [String(opts.delayMs / 1000)])
  }
  return { ok: false, lastCode }
}

// What Surf will actually load, so a failing frame page (not just a failing
// /api/health) keeps the reload back. A remote or file:// frameUrl is not this
// process's page, so fall back to the local health endpoint.
function frameProbeUrl(config: any): string {
  const fallback = `http://127.0.0.1:${Number(config?.appPort) || 3000}/api/health`
  const raw = typeof config?.frameUrl === 'string' ? config.frameUrl : ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

// Reload Surf only once a restarted app serves the frame page, and say why the
// reload was skipped when it does not.
function reloadBrowserWhenReady(ctx: Ctx): void {
  const config: any = readConfig(ctx)
  const url = frameProbeUrl(config)
  const health = waitForAppHealthy(url, { attempts: 30, delayMs: 2000, deadlineMs: 60000 })
  if (health.ok) { refreshBrowserAfterApp(ctx); return }
  err(ctx, `browser left on its current page: ${url} is not ready (HTTP ${health.lastCode}); run: kiosk app health`)
}

function restartAndCheckHealth(config: any): { ok: boolean; error?: string } {
  const port = Number(config.appPort) || 3000
  const rr = execCmd('systemctl', ['restart', APP_SERVICE])
  if (rr.status !== 0) return { ok: false, error: `restart failed: ${rr.stderr || rr.status}` }
  // Next.js cold start on a thin client can exceed a short poll window, so
  // probe up to ~90s. The attempt cap also bounds test doubles where sleeps
  // return immediately.
  const health = waitForAppHealthy(`http://127.0.0.1:${port}/api/health`, { attempts: 45, delayMs: 2000, deadlineMs: 90000 })
  if (health.ok) { refreshBrowserAfterApp(); return { ok: true } }
  return { ok: false, error: `health check failed (HTTP ${health.lastCode} on 127.0.0.1:${port}); see: journalctl -u dscos -n 30` }
}

function readUpdateState(): any {
  try {
    return JSON.parse(require('node:fs').readFileSync(stateFile(), 'utf8'))
  } catch {
    return null
  }
}

function writeUpdateState(state: Record<string, unknown>): void {
  const fs = require('node:fs')
  const path = require('node:path')
  const p = stateFile()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(state, null, 2))
}

// Snapshot systemd's enabled/active view of the managed timers. The files are
// saved separately; this records the state that only systemd holds so rollback
// can put it back. An absent unit is a known state; a unit that exists but
// answers nothing means systemd could not be asked, so the update aborts
// rather than guessing "disabled" and stopping a timer on rollback.
const TIMER_UNIT_DIRS = ['/etc/systemd/system', '/run/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system']

function timerUnitFile(unit: string): string | null {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = process.env.KIOSK_RUNTIME_ROOT || ''
  for (const dir of TIMER_UNIT_DIRS) {
    const file = root ? path.join(root, dir, unit) : path.join(dir, unit)
    if (fs.existsSync(file)) return file
  }
  return null
}

function captureTimerState(dest: string): string | null {
  try {
    const entries = MANAGED_TIMERS.map((unit) => {
      const enabled = execCmd('systemctl', ['is-enabled', unit])
      const state = enabled.stdout.trim()
      if (!state) {
        if (!timerUnitFile(unit)) return { unit, enabled: 'absent', active: 'inactive' }
        throw new Error(`could not read the enablement state of ${unit} (${enabled.stderr.trim() || `exit ${enabled.status}`})`)
      }
      const active = execCmd('systemctl', ['is-active', unit]).stdout.trim() || 'unknown'
      return { unit, enabled: state, active }
    })
    const saved = writeTimerState(dest, entries)
    return saved.ok ? null : saved.error ?? 'could not write timer state'
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e)
  }
}

// "not loaded"/"not found" answers are expected while restoring a unit that was
// absent before the update; anything else is a real failure worth reporting.
function timerCommandError(r: { status: number; stderr: string }, unit: string, verb: string, tolerateMissing = false): string | null {
  if (r.status === 0) return null
  if (tolerateMissing && /not (loaded|found)|No such file|does not exist/i.test(r.stderr)) return null
  return `${verb} ${unit}: ${r.stderr.trim() || r.status}`
}

function restoreTimerState(dest: string): string | null {
  const entries = readTimerState(dest)
  if (!entries.length) return null
  const errors: string[] = []
  const add = (message: string | null) => { if (message) errors.push(message) }
  for (const entry of entries) {
    switch (entry.enabled) {
      case 'enabled':
      case 'enabled-runtime': {
        add(timerCommandError(execCmd('systemctl', ['enable', entry.unit]), entry.unit, 'enable'))
        if (entry.active === 'active') {
          add(timerCommandError(execCmd('systemctl', ['start', entry.unit]), entry.unit, 'start'))
        } else if (entry.active === 'inactive') {
          // enable --now in the installer may have started a timer that was
          // stopped before the update; put it back to stopped.
          add(timerCommandError(execCmd('systemctl', ['stop', entry.unit]), entry.unit, 'stop'))
        }
        break
      }
      case 'masked':
      case 'masked-runtime':
        add(timerCommandError(execCmd('systemctl', ['mask', '--now', entry.unit]), entry.unit, 'mask'))
        break
      case 'disabled':
        add(timerCommandError(execCmd('systemctl', ['disable', '--now', entry.unit]), entry.unit, 'disable', true))
        break
      case 'absent':
        // The file is gone again; just drop the enablement symlink an update
        // may have created.
        add(timerCommandError(execCmd('systemctl', ['disable', entry.unit]), entry.unit, 'disable', true))
        break
      default:
        // static/indirect/alias timers get their state from the restored unit
        // files; there is nothing to replay.
        break
    }
  }
  return errors.length ? errors.join('; ') : null
}

function restoreRuntimeSnapshot(snapshot: string | null): string | null {
  if (!snapshot) return null
  const result = restoreRuntimeFiles(snapshot)
  if (!result.ok) return result.error ?? 'runtime restore failed'
  const reload = execCmd('systemctl', ['daemon-reload'])
  if (reload.status !== 0) return `daemon-reload failed: ${reload.stderr || reload.status}`
  return restoreTimerState(snapshot)
}

function discardRuntimeSnapshot(snapshot: string | null): void {
  if (!snapshot) return
  try { require('node:fs').rmSync(snapshot, { recursive: true, force: true }) } catch {}
}

// The compiled CLI is rebuilt before an app switch, from the old app. The
// active app changed after the switch (or rollback), so rebuild again from
// it; otherwise `kiosk` keeps running the previous app's CLI. Best-effort:
// the update itself is already done and healthy at this point, and the
// wrapper falls back to tsx when no build exists.
function refreshCompiledCli(ctx: Ctx, appDir: string): void {
  const path = require('node:path')
  const r = execCmd('bash', [path.join(appDir, 'install-kiosk.sh'), '--build-cli'], {
    timeoutMs: 120000,
    env: { ...process.env, DSCOS_APP_DIR: appDir },
  })
  if (r.status !== 0) err(ctx, 'warning: compiled CLI refresh failed; kiosk falls back to tsx')
}

// Put the previous app and runtime back after a post-switch failure. The
// caller reports the original error; this returns why recovery itself failed,
// if it did.
function restorePreviousCheckout(opts: {
  appDir: string
  backup: string
  currentVersion: string
  runtimeSnapshot: string | null
  config: any
}): { ok: boolean; error?: string } {
  const rollback = rollbackRelease({ appDir: opts.appDir, backup: opts.backup })
  // Keep the new app with its matching runtime if the app move fails. The
  // state still points at both backups, so `update rollback` can retry.
  if (!rollback.ok) return { ok: false, error: `rollback failed: ${rollback.error}` }
  const runtimeError = restoreRuntimeSnapshot(opts.runtimeSnapshot)
  const health = restartAndCheckHealth(opts.config)
  if (runtimeError) {
    // The app is back but its helpers are not. Keep the snapshot recorded so
    // `update rollback` can finish restoring them.
    try {
      writeUpdateState({
        lastBackup: null,
        runtimeBackup: opts.runtimeSnapshot,
        installedVersion: opts.currentVersion,
      })
    } catch {}
    return { ok: false, error: `runtime restore failed: ${runtimeError} (snapshot: ${opts.runtimeSnapshot})` }
  }
  try { writeUpdateState({ lastBackup: null, installedVersion: opts.currentVersion }) } catch {}
  discardRuntimeSnapshot(opts.runtimeSnapshot)
  if (!health.ok) return { ok: false, error: 'rolled back but restored app failed its health check' }
  return { ok: true }
}

async function applyUpdate(ctx: Ctx, args: string[], config: any): Promise<number> {
  const versionIdx = args.indexOf('--version')
  const targetVersion = versionIdx >= 0 ? args[versionIdx + 1] : null
  if (versionIdx >= 0 && !targetVersion) {
    err(ctx, '--version requires a value')
    return 2
  }
  if (!ctx.yes && process.stdin.isTTY) {
    err(ctx, 'apply requires --yes (or run non-interactively)')
    return 2
  }

  let info: any
  try {
    info = await fetchLatestRelease(globalThis.fetch, targetVersion || undefined)
  } catch (e: unknown) {
    err(ctx, `fetch failed: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  const version = targetVersion || info.version
  if (!version || version === 'unknown') {
    err(ctx, 'could not resolve release version')
    return 1
  }

  const appDir = process.env.DSCOS_APP_DIR || '/opt/dscos'
  const currentVersion = readAppVersion(appDir)
  if (currentVersion === version) {
    out(ctx, `already up to date (${version})`)
    return 0
  }

  const fs = require('node:fs')
  const path = require('node:path')
  const staging = stagingDir(version)
  const backup = backupDir(version)

  // Never trust pre-existing staging, even though its parent is root-owned.
  try { fs.rmSync(staging, { recursive: true, force: true }) } catch {}
  fs.mkdirSync(staging, { recursive: true })

  const tarPath = path.join(staging, 'release.tar.gz')
  if (!info.assetUrl) {
    err(ctx, 'no release asset found')
    return 1
  }
  try {
    const res = await globalThis.fetch(info.assetUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(tarPath, buf)
  } catch (e: unknown) {
    err(ctx, `download failed: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  const ex = execCmd('tar', ['-xzf', tarPath, '-C', staging])
  if (ex.status !== 0) {
    err(ctx, `extract failed: ${ex.stderr}`)
    return 1
  }
  fs.rmSync(tarPath, { force: true })

  // Releases exclude node_modules; install them before touching the live app.
  if (!fs.existsSync(path.join(staging, 'node_modules'))) {
    const r = execCmdLong('pnpm', ['install', '--frozen-lockfile', '--dir', staging])
    if (r.status !== 0) {
      err(ctx, `dependency install failed: ${r.stderr}`)
      return 1
    }
  }
  // Defend against build artifacts whose external-module shims carry targets
  // from the packaging machine (v0.9.3 shipped /home/runner/... links that
  // 500ed every request on the frame). Whatever the archive contains, the
  // staged tree must resolve its own .next/node_modules aliases.
  normalizeBuildSymlinks(path.join(staging, '.next'))
  if (!validateStaging(staging, version)) {
    err(ctx, 'staging validation failed (missing package.json/.next/node_modules/lib or version mismatch)')
    return 1
  }

  // Refresh installed helpers and unit files from the release's installer.
  // This preserves /etc/kiosk/kiosk.conf and /etc/dscos/frame.env.
  const downloadedInstaller = path.join(staging, 'install-kiosk.sh')
  const nextInstallerVersion = parseInstallerVersion(downloadedInstaller)
  if (!nextInstallerVersion) {
    err(ctx, 'release installer has no readable INSTALLER_VERSION')
    return 1
  }

  // Save every helper the installer is about to replace. The union of the
  // known list and the release installer's own list covers files that either
  // side adds or drops.
  const previousInstallerVersion = readInstallerVersion()
  const runtimeSnapshot = runtimeBackupDir(version)
  // An earlier attempt for this version may have stopped during
  // --update-runtime. Put its clean snapshot back before taking a new one, or
  // the retry would save half-updated helpers as the rollback target. A
  // snapshot without the marker belongs to a finished update and is only a
  // rollback target, so leave the current helpers alone.
  if (isRuntimeBackupIncomplete(runtimeSnapshot)) {
    const recovered = restoreRuntimeSnapshot(runtimeSnapshot)
    if (recovered) {
      err(ctx, `could not recover the interrupted update: ${recovered}`)
      return 1
    }
  }
  const runtimeFileList = new Set(runtimeFiles())
  const listed = execCmd('bash', [downloadedInstaller, '--runtime-files'])
  if (listed.status === 0) {
    for (const line of listed.stdout.split('\n')) {
      const file = line.trim()
      if (file) runtimeFileList.add(file)
    }
  }
  const savedRuntime = backupRuntimeFiles([...runtimeFileList], runtimeSnapshot)
  if (!savedRuntime.ok) {
    err(ctx, `could not save runtime files: ${savedRuntime.error}`)
    return 1
  }
  const savedTimers = captureTimerState(runtimeSnapshot)
  if (savedTimers) {
    err(ctx, `could not save timer state: ${savedTimers}`)
    return 1
  }

  // --update-runtime can install Surf (or Node) with apt before it writes the
  // session, so a fixed 2-minute window is too tight on a slow link. Give it
  // the long ceiling; the update lock already serialises concurrent applies.
  const r = execCmdLong('bash', [downloadedInstaller, '--update-runtime', '--yes'], {
    timeoutMs: 600000,
    env: { ...process.env, KIOSK_RUNTIME_UPDATE: '1', DSCOS_APP_DIR: appDir },
  })
  if (r.status !== 0) {
    const restoreError = restoreRuntimeSnapshot(runtimeSnapshot)
    if (restoreError) {
      err(ctx, `runtime update failed: ${r.stderr || r.status}; runtime restore failed: ${restoreError} (snapshot: ${runtimeSnapshot})`)
    } else {
      discardRuntimeSnapshot(runtimeSnapshot)
      err(ctx, `runtime update failed; previous runtime restored: ${r.stderr || r.status}`)
    }
    return 1
  }

  // The new bundle needs Node >=24 (and /usr/bin/node|npm for the service).
  // Check after --update-runtime so an installer upgrade counts, then abort
  // before the app switch instead of rolling back after a failed health probe.
  const nodeCheck = checkNodeRuntime()
  if (!nodeCheck.ok) {
    const restoreError = restoreRuntimeSnapshot(runtimeSnapshot)
    if (restoreError) {
      err(ctx, `${nodeCheck.error}; runtime restore failed: ${restoreError} (snapshot: ${runtimeSnapshot})`)
    } else {
      discardRuntimeSnapshot(runtimeSnapshot)
      err(ctx, `${nodeCheck.error}; previous runtime restored`)
    }
    return 1
  }

  const sw = switchRelease({ appDir, staging, backup, expectedVersion: version })
  if (!sw.ok) {
    const restoreError = restoreRuntimeSnapshot(runtimeSnapshot)
    if (restoreError) {
      err(ctx, `switch failed: ${sw.error}; runtime restore failed: ${restoreError} (snapshot: ${runtimeSnapshot})`)
    } else {
      discardRuntimeSnapshot(runtimeSnapshot)
      err(ctx, `switch failed: ${sw.error}; previous runtime restored`)
    }
    return 1
  }

  try {
    writeUpdateState({
      lastBackup: backup,
      runtimeBackup: runtimeSnapshot,
      previousVersion: currentVersion,
      installedVersion: version,
      previousInstallerVersion,
      installerVersion: nextInstallerVersion,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const recovery = restorePreviousCheckout({ appDir, backup, currentVersion, runtimeSnapshot, config })
    err(ctx, `could not record update state: ${message}; ${recovery.ok ? `rolled back to ${currentVersion}` : recovery.error}`)
    return 1
  }

  const health = restartAndCheckHealth(config)
  if (!health.ok) {
    const recovery = restorePreviousCheckout({ appDir, backup, currentVersion, runtimeSnapshot, config })
    err(ctx, `${health.error}; ${recovery.ok ? `rolled back to ${currentVersion}` : recovery.error}`)
    return 1
  }

  if (nextInstallerVersion) {
    try {
      fs.mkdirSync(path.dirname(installerVersionFile()), { recursive: true })
      fs.writeFileSync(installerVersionFile(), `${nextInstallerVersion}\n`, { mode: 0o644 })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      const recovery = restorePreviousCheckout({ appDir, backup, currentVersion, runtimeSnapshot, config })
      err(ctx, `could not record installer version: ${message}; ${recovery.ok ? `rolled back to ${currentVersion}` : recovery.error}`)
      return 1
    }
  }
  // The update is complete, so the snapshot is now a finished rollback target
  // rather than a possible half-refreshed helper set.
  const finalized = markRuntimeBackupComplete(runtimeSnapshot)
  if (!finalized.ok) {
    err(ctx, `warning: could not finalize runtime backup: ${finalized.error}`)
  }
  refreshCompiledCli(ctx, appDir)
  out(ctx, `updated to ${version}`)
  return 0
}

async function rollbackUpdate(ctx: Ctx, config: any): Promise<number> {
  const appDir = process.env.DSCOS_APP_DIR || '/opt/dscos'
  const state = readUpdateState()
  const backup = state?.lastBackup
  const runtimeSnapshot = typeof state?.runtimeBackup === 'string' ? state.runtimeBackup : null
  const previousVersion = state?.previousVersion ?? 'unknown'

  // A failed apply can put the app back and then fail to restore helpers.
  // Finish that recovery instead of claiming there is no backup.
  if (!backup && runtimeSnapshot) {
    const runtimeError = restoreRuntimeSnapshot(runtimeSnapshot)
    if (runtimeError) {
      err(ctx, `runtime restore failed: ${runtimeError} (snapshot: ${runtimeSnapshot})`)
      return 1
    }
    const health = restartAndCheckHealth(config)
    writeUpdateState({ lastBackup: null, installedVersion: state?.installedVersion ?? 'unknown' })
    discardRuntimeSnapshot(runtimeSnapshot)
    if (!health.ok) {
      err(ctx, `restored app failed: ${health.error}`)
      return 1
    }
    refreshCompiledCli(ctx, appDir)
    out(ctx, 'rolled back')
    return 0
  }
  if (!backup) {
    err(ctx, 'no saved backup; nothing to roll back')
    return 1
  }

  const rb = rollbackRelease({ appDir, backup })
  if (!rb.ok) {
    err(ctx, `rollback failed: ${rb.error}`)
    return 1
  }
  const runtimeError = restoreRuntimeSnapshot(runtimeSnapshot)
  const health = restartAndCheckHealth(config)
  const fs = require('node:fs')
  if (state?.previousInstallerVersion && state.previousInstallerVersion !== 'unknown') {
    try { fs.writeFileSync(installerVersionFile(), `${state.previousInstallerVersion}\n`, { mode: 0o644 }) } catch {}
  }
  if (runtimeError) {
    // The app is back but the helpers still need restoring. Keep the snapshot
    // recorded so a later rollback can finish the job.
    try {
      writeUpdateState({ lastBackup: null, runtimeBackup: runtimeSnapshot, installedVersion: previousVersion })
    } catch {}
    err(ctx, `app rolled back, but runtime restore failed: ${runtimeError} (snapshot: ${runtimeSnapshot})`)
    return 1
  }
  writeUpdateState({ lastBackup: null, installedVersion: previousVersion })
  discardRuntimeSnapshot(runtimeSnapshot)
  if (!health.ok) {
    err(ctx, `restored app failed: ${health.error}`)
    return 1
  }
  refreshCompiledCli(ctx, appDir)
  out(ctx, 'rolled back')
  return 0
}

async function cmdUpdate(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  const configErrors = validateConfig(config)
  if (configErrors.length) {
    if (ctx.json) out(ctx, JSON.stringify({ configErrors }, null, 2))
    else for (const e of configErrors) err(ctx, `${e.field}: ${e.message}`)
    return 1
  }
  if (sub === 'status') {
    const active = execCmd('systemctl', ['is-active', 'kiosk-update.timer']).stdout.trim() === 'active'
    const enabled = execCmd('systemctl', ['is-enabled', 'kiosk-update.timer']).stdout.trim() === 'enabled'
    const last = execCmd('systemctl', ['show', 'kiosk-update.timer', '--property=LastTriggerUSec', '--value'])
    const payload = { timerActive: active, timerEnabled: enabled, lastTrigger: last.stdout.trim() || 'never' }
    if (ctx.json) out(ctx, JSON.stringify(payload, null, 2))
    else out(ctx, `timer: ${active ? 'active' : 'inactive'}  enabled: ${enabled ? 'yes' : 'no'}  last: ${payload.lastTrigger}`)
    return 0
  }
  if (sub === 'check') {
    let latest = 'unknown'
    let updateAvailable = false
    let assetUrl: string | null = null
    const appVersion = readAppVersion(process.env.DSCOS_APP_DIR || '/opt/dscos')
    const installerVersion = readInstallerVersion()
    try {
      const info = await fetchLatestRelease(globalThis.fetch)
      latest = info.version
      assetUrl = info.assetUrl
      updateAvailable = isUpdateAvailableFor(appVersion, installerVersion, latest)
    } catch (e: unknown) {
      err(ctx, `update check failed: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
    const payload = { channel: config.updateChannel, current: appVersion, installerVersion, latest, updateAvailable, assetUrl }
    if (ctx.json) out(ctx, JSON.stringify(payload, null, 2))
    else out(ctx, updateAvailable ? `latest: ${latest}  update available` : `already up to date (${latest})`)
    return 0
  }
  if (sub === 'enable') {
    const r = execCmd('systemctl', ['enable', '--now', 'kiosk-update.timer'])
    if (r.status !== 0) { err(ctx, r.stderr || 'failed to enable timer'); return r.status || 1 }
    out(ctx, 'auto-update enabled')
    return 0
  }
  if (sub === 'disable') {
    const r = execCmd('systemctl', ['disable', '--now', 'kiosk-update.timer'])
    if (r.status !== 0) { err(ctx, r.stderr || 'failed to disable timer'); return r.status || 1 }
    out(ctx, 'auto-update disabled')
    return 0
  }
  if (sub === 'apply') {
    const lock = await acquireUpdateLock(lockFile())
    if (!lock) { err(ctx, 'another update is already running'); return 1 }
    try {
      return await applyUpdate(ctx, args, config)
    } finally {
      lock.release()
    }
  }
  if (sub === 'rollback') {
    const lock = await acquireUpdateLock(lockFile())
    if (!lock) { err(ctx, 'another update is already running'); return 1 }
    try {
      return await rollbackUpdate(ctx, config)
    } finally {
      lock.release()
    }
  }
  err(ctx, `unknown update subcommand: ${sub}`)
  return 2
}

async function cmdSync(ctx: Ctx, sub: string, args: string[]): Promise<number> {
  const config: any = readConfig(ctx)
  const _errs = validateConfig(config)
  if (_errs.length) { if (ctx.json) out(ctx, JSON.stringify({ configErrors: _errs }, null, 2)); else for (const e of _errs) err(ctx, `${e.field}: ${e.message}`); return 1 }
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
  if (res.warning) err(ctx, res.warning)
  // systemctl only exists on the Linux frame image; dev/test machines skip the
  // restart gracefully so install-time calls are safe before the unit exists.
  if (process.platform === 'linux' && !process.env.VITEST) {
    const restart = execCmd('systemctl', ['restart', APP_SERVICE])
    if (restart.status !== 0) { err(ctx, `app restart failed (exit ${restart.status}); run: systemctl restart ${APP_SERVICE}`); return 1 }
    reloadBrowserWhenReady(ctx)
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
  if (process.platform === 'linux' && !process.env.VITEST) {
    const restart = execCmd('systemctl', ['restart', APP_SERVICE])
    if (restart.status !== 0) { err(ctx, `app restart failed (exit ${restart.status}); run: systemctl restart ${APP_SERVICE}`); return 1 }
    reloadBrowserWhenReady(ctx)
  }
  return 0
}

async function cmdVersion(ctx: Ctx): Promise<number> {
  const fs = require('node:fs')
  let appVersion = process.env.DSCOS_VERSION || 'unknown'
  const candidatePaths = [
    process.env.DSCOS_APP_DIR ? `${process.env.DSCOS_APP_DIR}/package.json` : null,
    require('node:path').join(__dirname, '..', '..', 'package.json'),
    '/opt/dscos/package.json',
  ].filter(Boolean) as string[]
  for (const cp of candidatePaths) {
    try {
      const pkg = JSON.parse(fs.readFileSync(cp, 'utf8'))
      if (pkg?.version) { appVersion = pkg.version; break }
    } catch { /* try next */ }
  }
  const storedInstallerVersion = readInstallerVersion()
  const installerVersion = storedInstallerVersion === 'unknown' ? '2.0' : storedInstallerVersion
  const osRelease = fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : ''
  const osPretty = (osRelease.match(/^PRETTY_NAME=(.*)$/m)?.[1] || '').replace(/^"|"$/g, '') || 'unknown'
  const info = { appVersion, installerVersion, os: osPretty }
  if (ctx.json) out(ctx, JSON.stringify(info, null, 2))
  else {
    out(ctx, `app:        ${appVersion}`)
    out(ctx, `installer:  ${installerVersion}`)
    out(ctx, `os:         ${osPretty}`)
  }
  return 0
}

async function cmdLogs(ctx: Ctx, args: string[]): Promise<number> {
  const idx = args.indexOf('--lines')
  const n = idx >= 0 ? String(parseInt(args[idx + 1], 10) || 100) : '100'
  const unitIdx = args.indexOf('--unit')
  const unit = unitIdx >= 0 ? args[unitIdx + 1] : APP_SERVICE
  const allowed = [APP_SERVICE, KIOSK_SERVICE]
  if (!allowed.includes(unit)) { err(ctx, `unknown unit: ${unit}`); return 2 }
  const r = execCmd('journalctl', ['-u', unit, '-n', n, '--no-pager'])
  if (r.status !== 0) { err(ctx, r.stderr || 'journalctl failed'); return r.status || 1 }
  out(ctx, r.stdout)
  return 0
}

async function cmdReset(ctx: Ctx): Promise<number> {
  if (!ctx.yes) { err(ctx, 'reset requires --yes'); return 2 }
  const fs = require('node:fs')
  const p = configPath()
  if (fs.existsSync(p)) {
    try { fs.copyFileSync(p, p + '.bak') }
    catch (e: unknown) { err(ctx, `could not back up config: ${e instanceof Error ? e.message : String(e)}`); return 1 }
  }
  writeConfig(ctx, defaultConfig())
  out(ctx, `config reset to defaults; backup at ${p}.bak`)
  return 0
}

async function cmdUninstall(ctx: Ctx): Promise<number> {
  if (process.platform !== 'linux') { err(ctx, 'uninstall only supported on Linux frames'); return 1 }
  const fs = require('node:fs')
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    err(ctx, 'uninstall requires root privileges (run with sudo)')
    return 1
  }
  const failures: string[] = []
  const run = (cmd: string, args: string[]) => {
    const r = execCmd(cmd, args)
    if (r.status !== 0) failures.push(`${cmd} ${args.join(' ')}: ${r.stderr || r.status}`)
  }
  run('systemctl', ['stop', 'kiosk-update.timer'])
  run('systemctl', ['disable', 'kiosk-update.timer'])
  // Stop a oneshot update that may already be running before files disappear.
  run('systemctl', ['stop', 'kiosk-update.service'])
  run('systemctl', ['stop', APP_SERVICE])
  run('systemctl', ['disable', APP_SERVICE])
  run('systemctl', ['stop', KIOSK_SERVICE])
  run('systemctl', ['disable', KIOSK_SERVICE])
  const files = [
    '/etc/systemd/system/dscos.service',
    '/etc/systemd/system/kiosk-update.service',
    '/etc/systemd/system/kiosk-update.timer',
    '/etc/systemd/system/kiosk-standby-on.service',
    '/etc/systemd/system/kiosk-standby-on.timer',
    '/etc/systemd/system/kiosk-standby-off.service',
    '/etc/systemd/system/kiosk-standby-off.timer',
    '/etc/lightdm/lightdm.conf.d/50-kiosk.conf',
    '/usr/share/xsessions/kiosk.desktop',
    '/etc/chromium/policies/managed/kiosk.json',
  ]
  for (const f of files) {
    try { fs.rmSync(f, { force: true }) } catch (e: unknown) { failures.push(`rm ${f}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  run('systemctl', ['daemon-reload'])
  try { fs.rmSync('/etc/kiosk', { recursive: true, force: true }) } catch (e: unknown) { failures.push(`/etc/kiosk: ${e instanceof Error ? e.message : String(e)}`) }
  try { fs.rmSync('/usr/local/lib/kiosk', { recursive: true, force: true }) } catch (e: unknown) { failures.push(`/usr/local/lib/kiosk: ${e instanceof Error ? e.message : String(e)}`) }
  try { fs.rmSync('/var/lib/dscos-updates', { recursive: true, force: true }) } catch (e: unknown) { failures.push(`/var/lib/dscos-updates: ${e instanceof Error ? e.message : String(e)}`) }
  run('userdel', ['-r', 'kiosk'])
  if (failures.length) {
    for (const f of failures) err(ctx, f)
    err(ctx, `uninstall completed with ${failures.length} failure(s)`)
    return 1
  }
  out(ctx, 'kiosk uninstalled')
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
      const r = withConfig(ctx, (config) => {
        const healthR = execCmd('systemctl', ['is-active', APP_SERVICE])
        out(ctx, JSON.stringify({ app: healthR.stdout.trim(), config: redactConfig(config) }, null, 2))
        return 0
      })
      code = typeof r === 'number' ? r : 0
    } else if (cmd === 'doctor') {
      const r = withConfig(ctx, (config) => {
        const errors = validateConfig(config)
        const proc = execCmd('systemctl', ['is-active', APP_SERVICE])
        const processRunning = proc.stdout.trim() === 'active'
        const portR = execCmd('bash', ['-c', ` (echo > /dev/tcp/127.0.0.1/${config.appPort}) >/dev/null 2>&1`])
        const portOpen = portR.status === 0
        let httpOk = false
        if (portOpen) {
          const hr = execCmd('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://127.0.0.1:${config.appPort}/api/health`])
          const c = parseInt(hr.stdout.trim(), 10)
          httpOk = c >= 200 && c < 300
        }
        const report = evaluateHealth({ processRunning, portOpen, httpOk, configValid: errors.length === 0 })
        out(ctx, JSON.stringify({ configErrors: errors, health: report }, null, 2))
        return errors.length || report.state !== 'healthy' ? 1 : 0
      })
      code = typeof r === 'number' ? r : 0
    } else if (cmd === 'uninstall') {
      if (!ctx.yes) { err(ctx, 'uninstall requires --yes'); code = 2 }
      else { code = await cmdUninstall(ctx) }
    } else if (cmd === 'version') {
      code = await cmdVersion(ctx)
    } else if (cmd === 'logs') {
      code = await cmdLogs(ctx, args.slice(1))
    } else if (cmd === 'reset') {
      code = await cmdReset(ctx)
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

if (process.env.KIOSK_CLI_ENTRY === '1') {
  runCli(process.argv.slice(2))
    .then((r) => {
      if (r.stdout) process.stdout.write(r.stdout + '\n')
      if (r.stderr) process.stderr.write(r.stderr + '\n')
      process.exitCode = r.exitCode
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    })
}
