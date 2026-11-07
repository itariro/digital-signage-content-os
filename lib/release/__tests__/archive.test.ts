import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createReleaseArchive, verifyReleaseArchive } from '../archive'

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}

function makeRepo(version = '0.9.0'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-repo-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Release Test'])
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.next/\nuntracked.txt\n')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }, null, 2))
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
  fs.writeFileSync(path.join(root, 'next.config.mjs'), 'export default {}\n')
  fs.mkdirSync(path.join(root, 'lib/kiosk'), { recursive: true })
  fs.writeFileSync(path.join(root, 'lib/kiosk/cli.ts'), '// cli\n')
  fs.writeFileSync(path.join(root, 'install-kiosk.sh'), '#!/usr/bin/env bash\n')
  fs.mkdirSync(path.join(root, '.next/cache'), { recursive: true })
  fs.writeFileSync(path.join(root, '.next/BUILD_ID'), 'build-1\n')
  fs.writeFileSync(path.join(root, '.next/cache/ignored.bin'), 'x')
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules/ignored.js'), 'x')
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'x')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'fixture'])
  return root
}

describe('release archive', () => {
  it('packages tracked files and the build output without a wrapping directory', () => {
    const root = makeRepo()
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    const archive = createReleaseArchive({ root, version: '0.9.0', outDir: out })

    expect(archive.path).toBe(path.join(out, 'dscos-0.9.0.tar.gz'))
    expect(archive.entries).toContain('package.json')
    expect(archive.entries).toContain('.next/BUILD_ID')
    expect(archive.entries).not.toContain('untracked.txt')
    expect(archive.entries.some((entry) => entry.startsWith('node_modules'))).toBe(false)
    expect(archive.entries.some((entry) => entry.startsWith('.next/cache'))).toBe(false)
    expect(archive.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(() => verifyReleaseArchive({ path: archive.path, version: '0.9.0' })).not.toThrow()
  })

  it('rejects a version mismatch', () => {
    const root = makeRepo('0.9.0')
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    expect(() => createReleaseArchive({ root, version: '0.9.1', outDir: out })).toThrow(
      /does not match/,
    )
  })

  it('rejects a tracked node_modules entry', () => {
    const root = makeRepo()
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules/evil.js'), 'x')
    git(root, ['add', '-f', 'node_modules/evil.js'])
    git(root, ['commit', '-qm', 'force node_modules'])
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    expect(() => createReleaseArchive({ root, version: '0.9.0', outDir: out })).toThrow(
      /node_modules/,
    )
  })

  it('rejects a missing required file', () => {
    const root = makeRepo()
    fs.rmSync(path.join(root, 'install-kiosk.sh'))
    git(root, ['add', '-A'])
    git(root, ['commit', '-qm', 'remove installer'])
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    expect(() => createReleaseArchive({ root, version: '0.9.0', outDir: out })).toThrow(
      /install-kiosk\.sh/,
    )
  })
})

describe('build output symlink shims', () => {
  // Turbopack externalizes native modules as alias symlinks under
  // .next/node_modules/. If the build machine writes absolute targets
  // (observed on GitHub Actions runners), the archive cannot resolve them on
  // a frame and every request 500s. Packaging must rewrite them relative,
  // and verification must reject absolute ones outright.
  it('rewrites absolute shim symlinks to relative targets in the archive', () => {
    const root = makeRepo()
    const shims = path.join(root, '.next/node_modules')
    fs.mkdirSync(shims, { recursive: true })
    const absTarget = path.join(root, 'node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3')
    fs.symlinkSync(absTarget, path.join(shims, 'better-sqlite3-bfc5648742806807'))

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    const archive = createReleaseArchive({ root, version: '0.9.0', outDir: out })

    const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-extract-'))
    execFileSync('tar', ['-xzf', archive.path, '-C', extract], { stdio: 'pipe' })
    const target = fs.readlinkSync(
      path.join(extract, '.next/node_modules/better-sqlite3-bfc5648742806807'),
    )
    expect(target).not.toMatch(/^\//)
    expect(target).toBe('../../node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3')
    expect(() => verifyReleaseArchive({ path: archive.path, version: '0.9.0' })).not.toThrow()
  })

  it('keeps relative shim symlinks untouched', () => {
    const root = makeRepo()
    const shims = path.join(root, '.next/node_modules')
    fs.mkdirSync(shims, { recursive: true })
    fs.symlinkSync(
      '../../node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3',
      path.join(shims, 'better-sqlite3-bfc5648742806807'),
    )

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    const archive = createReleaseArchive({ root, version: '0.9.0', outDir: out })

    const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-extract-'))
    execFileSync('tar', ['-xzf', archive.path, '-C', extract], { stdio: 'pipe' })
    expect(
      fs.readlinkSync(path.join(extract, '.next/node_modules/better-sqlite3-bfc5648742806807')),
    ).toBe('../../node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3')
  })

  it('rewrites a foreign CI-runner target (the v0.9.3 failure) to a relative link', () => {
    const root = makeRepo()
    const shims = path.join(root, '.next/node_modules')
    fs.mkdirSync(shims, { recursive: true })
    fs.symlinkSync(
      '/home/runner/work/digital-signage-content-os/digital-signage-content-os/node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3',
      path.join(shims, 'better-sqlite3-bfc5648742806807'),
    )

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    const archive = createReleaseArchive({ root, version: '0.9.0', outDir: out })

    const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-extract-'))
    execFileSync('tar', ['-xzf', archive.path, '-C', extract], { stdio: 'pipe' })
    expect(
      fs.readlinkSync(path.join(extract, '.next/node_modules/better-sqlite3-bfc5648742806807')),
    ).toBe('../../node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3')
  })

  it('rejects an archive that ships an absolute shim symlink', () => {
    const root = makeRepo()
    const shims = path.join(root, '.next/node_modules')
    fs.mkdirSync(shims, { recursive: true })
    fs.symlinkSync(
      '/home/runner/work/node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3',
      path.join(shims, 'better-sqlite3-bfc5648742806807'),
    )
    git(root, ['add', '-f', '.next/node_modules'])
    git(root, ['commit', '-qm', 'ship absolute shim'])
    // The hand-built tarball mirrors the whole tree; the forbidden node_modules
    // check fires before the symlink check otherwise.
    fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true })

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dscos-release-out-'))
    // Git-tracked symlinks still get copied by the build output pass and
    // normalized, so verify against a hand-built archive where copyBuildOutput
    // is bypassed: tar the original tree directly.
    const handBuilt = path.join(out, 'hand.tar.gz')
    execFileSync('tar', ['-czf', handBuilt, '-C', root, '.'], { stdio: 'pipe' })
    expect(() => verifyReleaseArchive({ path: handBuilt, version: '0.9.0' })).toThrow(
      /absolute symlink/,
    )
  })
})
