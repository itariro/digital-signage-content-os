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