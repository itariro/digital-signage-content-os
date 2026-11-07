import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReleaseError } from './version'

export interface ReleaseArchive {
  path: string
  sha256: string
  entries: string[]
}

export const REQUIRED_ENTRIES = [
  'package.json',
  'pnpm-lock.yaml',
  '.next/BUILD_ID',
  'next.config.mjs',
  'lib/kiosk/cli.ts',
  'install-kiosk.sh',
]

const FORBIDDEN_PREFIXES = ['node_modules/', '.git/', '.next/cache/']
const FORBIDDEN_EXACT = ['node_modules', '.git', '.next/cache']

function normalizeEntry(entry: string): string {
  let value = entry.replace(/\\/g, '/')
  while (value.startsWith('./')) value = value.slice(2)
  return value.replace(/\/$/, '')
}

function listArchive(archivePath: string): string[] {
  const output = execFileSync('tar', ['-tzf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

// Tar's verbose listing renders a link as `<name> -> <target>`, and neither
// field survives a parse back out: entry names may embed the arrow itself.
// The reliable source of symlink metadata is the extracted tree, so verify
// by extracting to a temp dir and walking it with lstat/readlink, which
// round-trips any name or target byte for byte. Called only after the entry
// checks have rejected absolute and parent traversal names, so extraction
// stays inside the temp dir.
function verifyArchiveSymlinks(archivePath: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-verify-'))
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', dir], { stdio: 'pipe' })
    rejectBadSymlinks(dir, dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Every symlink in a release must be relative and resolve inside the tree.
// An absolute target is the packaging-failure signature that made v0.9.3
// unbootable on frames; a target resolving outside the tree cannot resolve
// on the consuming install either.
function rejectBadSymlinks(root: string, dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(entryPath)
      const display = path.relative(root, entryPath)
      if (path.isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target)) {
        throw new ReleaseError(`release archive contains an absolute symlink: ${display} -> ${target}`)
      }
      const resolved = path.resolve(path.dirname(entryPath), target)
      const inside = path.relative(root, resolved)
      if (inside.startsWith('..') || path.isAbsolute(inside)) {
        throw new ReleaseError(
          `release archive contains a symlink escaping the release tree: ${display} -> ${target}`,
        )
      }
    } else if (entry.isDirectory()) {
      rejectBadSymlinks(root, entryPath)
    }
  }
}

function copyBuildOutput(root: string, destination: string): void {
  const source = path.join(root, '.next')
  if (!fs.existsSync(source)) {
    throw new ReleaseError(`build output not found at ${source}; run the build first`)
  }
  fs.cpSync(source, destination, {
    recursive: true,
    // Keep symlinks as symlinks, with their targets spelled exactly as on
    // disk. The default re-resolves targets into absolute paths of the build
    // machine, which makes the archive unresolvable elsewhere.
    dereference: false,
    verbatimSymlinks: true,
    filter: (entry) => {
      const relative = path.relative(source, entry)
      return relative !== 'cache' && !relative.startsWith(`cache${path.sep}`)
    },
  })
}

// Turbopack (and Next externals generally) resolve native packages through
// alias shims: .next/node_modules/<package>-<hash> must point at the real
// package inside the tree that installs the release. A shim built on CI with
// an absolute target (/home/runner/work/...) cannot be resolved on a frame
// and every request 500s (v0.9.3 startup failure). Rewriting targets
// relative to each shim keeps them valid wherever the archive lands. The
// absolute target's real package starts at its first node_modules segment,
// which is the same layout the consuming tree gets from pnpm install, so the
// rewrite does not depend on the target being reachable on this machine.
// Returns how many targets were rewritten.
export function normalizeBuildSymlinks(buildOutputDir: string): number {
  const shims = path.join(buildOutputDir, 'node_modules')
  let fixed = 0
  let entries: string[]
  try {
    entries = fs.readdirSync(shims, { recursive: true, encoding: 'utf8' })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const linkPath = path.join(shims, entry)
    let stat
    try {
      stat = fs.lstatSync(linkPath)
    } catch {
      continue
    }
    if (!stat.isSymbolicLink()) continue
    let target: string
    try {
      target = fs.readlinkSync(linkPath)
    } catch {
      continue
    }
    if (!path.isAbsolute(target)) continue
    const suffix = nodeModulesSuffix(target)
    if (!suffix) continue
    const candidate = path.join(path.dirname(buildOutputDir), suffix)
    const relative = path.relative(path.dirname(linkPath), candidate)
    if (!relative || path.isAbsolute(relative)) continue
    fs.rmSync(linkPath)
    fs.symlinkSync(relative, linkPath)
    fixed++
  }
  return fixed
}

// Extract `node_modules/...` from an absolute target. The pnpm store marker
// is preferred; within each marker, successive occurrences are scanned until
// one sits at a segment boundary, so a decoy like `v0-node_modules/` earlier
// in the path never hides the store segment. Keeps only a boundary match so
// `my-node_modules/` is never taken for the store root.
function nodeModulesSuffix(target: string): string | null {
  for (const marker of ['node_modules/.pnpm/', 'node_modules/']) {
    let idx = target.indexOf(marker)
    while (idx >= 0) {
      const previous = target[idx - 1]
      if (previous === '/' || previous === '\\') return target.slice(idx)
      idx = target.indexOf(marker, idx + 1)
    }
  }
  return null
}

export function verifyReleaseArchive(opts: { path: string; version: string }): void {
  const rawEntries = listArchive(opts.path)
  const entries = rawEntries.map(normalizeEntry).filter(Boolean)
  const entrySet = new Set(entries)

  for (const entry of entries) {
    if (entry.startsWith('/') || /^[A-Za-z]:\//.test(entry)) {
      throw new ReleaseError(`release archive contains an absolute path: ${entry}`)
    }
    if (entry === '..' || entry.startsWith('../') || entry.includes('/../')) {
      throw new ReleaseError(`release archive contains a parent path: ${entry}`)
    }
  }

  const missing = REQUIRED_ENTRIES.filter((entry) => !entrySet.has(entry))
  if (missing.length > 0) {
    throw new ReleaseError(`release archive is missing: ${missing.join(', ')}`)
  }

  for (const entry of entries) {
    if (FORBIDDEN_EXACT.includes(entry)) {
      throw new ReleaseError(`release archive contains a forbidden path: ${entry}`)
    }
    if (FORBIDDEN_PREFIXES.some((prefix) => entry.startsWith(prefix))) {
      throw new ReleaseError(`release archive contains a forbidden path: ${entry}`)
    }
  }

  const packageEntry = rawEntries.find((entry) => normalizeEntry(entry) === 'package.json')
  if (!packageEntry) {
    throw new ReleaseError('release archive has no package.json')
  }
  const packageText = execFileSync('tar', ['-xOzf', opts.path, packageEntry], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })

  let packageJson: { version?: unknown }
  try {
    packageJson = JSON.parse(packageText)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ReleaseError(`release archive has an invalid package.json: ${reason}`)
  }
  if (packageJson.version !== opts.version) {
    throw new ReleaseError(
      `release archive version ${String(packageJson.version)} does not match ${opts.version}`,
    )
  }

  verifyArchiveSymlinks(opts.path)
}

export function createReleaseArchive(opts: {
  root: string
  version: string
  outDir: string
}): ReleaseArchive {
  const root = path.resolve(opts.root)
  const outDir = path.resolve(opts.outDir)
  const assetPath = path.join(outDir, `dscos-${opts.version}.tar.gz`)
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-'))

  try {
    fs.mkdirSync(outDir, { recursive: true })
    const sourceTar = path.join(temporary, 'source.tar')
    const sourceDir = path.join(temporary, 'source')
    fs.mkdirSync(sourceDir, { recursive: true })

    execFileSync(
      'git',
      ['-C', root, 'archive', '--format=tar', `--output=${sourceTar}`, 'HEAD'],
      { stdio: 'pipe' },
    )
    execFileSync('tar', ['-xf', sourceTar, '-C', sourceDir], { stdio: 'pipe' })
    copyBuildOutput(root, path.join(sourceDir, '.next'))
    normalizeBuildSymlinks(path.join(sourceDir, '.next'))
    execFileSync('tar', ['-czf', assetPath, '-C', sourceDir, '.'], { stdio: 'pipe' })

    verifyReleaseArchive({ path: assetPath, version: opts.version })
    return {
      path: assetPath,
      sha256: sha256File(assetPath),
      entries: listArchive(assetPath).map(normalizeEntry).filter(Boolean),
    }
  } catch (error) {
    fs.rmSync(assetPath, { force: true })
    throw error
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}