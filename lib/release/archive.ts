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

function copyBuildOutput(root: string, destination: string): void {
  const source = path.join(root, '.next')
  if (!fs.existsSync(source)) {
    throw new ReleaseError(`build output not found at ${source}; run the build first`)
  }
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry)
      return relative !== 'cache' && !relative.startsWith(`cache${path.sep}`)
    },
  })
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