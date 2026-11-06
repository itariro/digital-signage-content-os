# Kiosk Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut a reproducible GitHub release from a reviewed release PR, with a validated archive, a draft release, and correct stable/prerelease update behavior.

**Architecture:** A thin `Release` workflow orchestrates git and GitHub. Pure logic lives in `lib/semver.ts` and `lib/release/`, is tested with Vitest, and is exposed through `scripts/release.ts`. The kiosk updater reuses the shared semver comparison.

**Tech Stack:** TypeScript, Vitest, Node 22, GitHub Actions, `gh`, `git archive`, `tar`, pnpm 12.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/semver.ts` | Strict semver parsing plus tolerant version comparison for legacy values. |
| `lib/release/version.ts` | Release version parsing, tag naming, prerelease flag, `package.json` match. |
| `lib/release/notes.ts` | Extract the `## Release notes` section from a PR body. |
| `lib/release/archive.ts` | Build and verify `dscos-<version>.tar.gz`. |
| `scripts/release.ts` | Thin CLI used by the workflow and maintainers. |
| `.github/workflows/release.yml` | Manual release orchestration, checks, tag, draft. |
| `lib/kiosk/updates.ts` | Re-export the shared comparison for the kiosk updater. |
| `docs/releasing.md` | Maintainer runbook. |
| `docs/kiosk-cli.md` | Version policy and prerelease update behavior. |
| `README.md` | Link to the runbook. |
| `package.json` | Release scripts and `tsx` dev dependency. |
| `pnpm-lock.yaml` | Lockfile update for `tsx`. |
| `.gitignore` | Ignore local `dist/`. |

Tests:

- `lib/__tests__/semver.test.ts`
- `lib/release/__tests__/version.test.ts`
- `lib/release/__tests__/notes.test.ts`
- `lib/release/__tests__/archive.test.ts`
- `lib/kiosk/__tests__/updates.test.ts` (extend)

---

## Task 0: Capture the before state

**Files:** none.

- [ ] **Step 1: Record how the current comparison treats an rc followed by the final release**

Run:

```bash
node -e "const compare=(a,b)=>{const pa=a.replace(/^v/,'').split('.').map(n=>parseInt(n,10)||0);const pb=b.replace(/^v/,'').split('.').map(n=>parseInt(n,10)||0);const len=Math.max(pa.length,pb.length);for(let i=0;i<len;i++){const x=pa[i]??0;const y=pb[i]??0;if(x!==y)return x<y?-1:1}return 0};const latest='0.9.0';const current='0.9.0-rc.1';console.log('compare(latest, current) =', compare(latest,current));console.log('update available =', compare(latest,current)>0)"
```

Expected:

```text
compare(latest, current) = -1
update available = false
```

Save the output. It is the before evidence for the PR.

---

## Task 1: Shared semver comparison

**Files:**

- Create: `lib/semver.ts`
- Create: `lib/__tests__/semver.test.ts`
- Modify: `lib/kiosk/updates.ts`
- Modify: `lib/kiosk/__tests__/updates.test.ts`

- [ ] **Step 1: Write the failing semver tests**

Create `lib/__tests__/semver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compareVersions, parseSemver } from '../semver'

describe('semver', () => {
  it('compares core versions', () => {
    expect(compareVersions('0.8.0', '0.9.0')).toBe(-1)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
  })

  it('orders prereleases before the final release', () => {
    expect(compareVersions('0.9.0-rc.1', '0.9.0')).toBe(-1)
    expect(compareVersions('0.9.0-beta', '0.9.0')).toBe(-1)
    expect(compareVersions('0.9.0', '0.9.0-rc.1')).toBe(1)
    expect(compareVersions('0.9.1-rc.1', '0.9.0')).toBe(1)
  })

  it('orders numeric prerelease identifiers numerically', () => {
    expect(compareVersions('0.9.0-rc.2', '0.9.0-rc.10')).toBe(-1)
    expect(compareVersions('0.9.0-rc.10', '0.9.0-rc.2')).toBe(1)
  })

  it('orders alpha, alpha.1, and beta', () => {
    expect(compareVersions('0.9.0-alpha', '0.9.0-alpha.1')).toBe(-1)
    expect(compareVersions('0.9.0-alpha.1', '0.9.0-beta')).toBe(-1)
    expect(compareVersions('0.9.0-beta', '0.9.0-alpha.1')).toBe(1)
  })

  it('tolerates legacy partial and unknown versions', () => {
    expect(compareVersions('v0.8', '0.8.0')).toBe(0)
    expect(compareVersions('2.0', '2.0.0')).toBe(0)
    expect(compareVersions('unknown', '0.1.0')).toBe(-1)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build.1', '1.0.0+build.2')).toBe(0)
    expect(compareVersions('1.0.0-alpha+one', '1.0.0-alpha+two')).toBe(0)
  })

  it('parses strict semver', () => {
    expect(parseSemver('0.9.0-rc.1+build.5')).toEqual({
      major: 0,
      minor: 9,
      patch: 0,
      prerelease: ['rc', '1'],
      build: ['build', '5'],
    })
    expect(parseSemver('0.9')).toBeNull()
    expect(parseSemver('v0.9.0')).toBeNull()
    expect(parseSemver('01.9.0')).toBeNull()
    expect(parseSemver('0.9.0-01')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the semver tests to verify they fail**

Run:

```bash
npx vitest run lib/__tests__/semver.test.ts
```

Expected: FAIL with a module resolution error for `../semver`.

- [ ] **Step 3: Write `lib/semver.ts`**

```ts
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
  build: string[]
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export function parseSemver(input: string): ParsedVersion | null {
  const match = SEMVER_RE.exec(input)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  }
}

interface TolerantVersion {
  core: number[]
  prerelease: string[]
}

function parseTolerant(input: string): TolerantVersion {
  const value = String(input ?? '').trim().replace(/^v/i, '')
  const withoutBuild = value.split('+')[0]
  const dash = withoutBuild.indexOf('-')
  const coreText = dash >= 0 ? withoutBuild.slice(0, dash) : withoutBuild
  const prereleaseText = dash >= 0 ? withoutBuild.slice(dash + 1) : ''
  const core = coreText.split('.').map((part) => {
    const number = Number.parseInt(part, 10)
    return Number.isFinite(number) ? number : 0
  })
  if (core.length === 0) core.push(0)
  return { core, prerelease: prereleaseText ? prereleaseText.split('.') : [] }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.min(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const a = left[i]
    const b = right[i]
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)

    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff < 0 ? -1 : 1
      continue
    }
    if (aNumeric) return -1
    if (bNumeric) return 1
    if (a !== b) return a < b ? -1 : 1
  }

  if (left.length === right.length) return 0
  return left.length < right.length ? -1 : 1
}

export function compareVersions(a: string, b: string): number {
  const left = parseTolerant(a)
  const right = parseTolerant(b)
  const length = Math.max(left.core.length, right.core.length)

  for (let i = 0; i < length; i++) {
    const x = left.core[i] ?? 0
    const y = right.core[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }

  return comparePrerelease(left.prerelease, right.prerelease)
}
```

- [ ] **Step 4: Run the semver tests to verify they pass**

Run:

```bash
npx vitest run lib/__tests__/semver.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Replace the local comparison in `lib/kiosk/updates.ts`**

At the top of `lib/kiosk/updates.ts`, add:

```ts
import { compareVersions } from '../semver'
export { compareVersions }
```

Delete the old local function:

```ts
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}
```

The rest of the file stays the same.

- [ ] **Step 6: Add the rc to final release regression test**

Append this test inside the existing `describe('updates', ...)` block in `lib/kiosk/__tests__/updates.test.ts`:

```ts
  it('offers the final release to a frame on its rc', () => {
    expect(isUpdateAvailableFor('0.9.0-rc.1', '2.0', '0.9.0')).toBe(true)
  })
```

The existing import already has `isUpdateAvailableFor`. No new import is needed.

- [ ] **Step 7: Run the affected tests**

Run:

```bash
npx vitest run lib/__tests__/semver.test.ts lib/kiosk/__tests__/updates.test.ts
```

Expected: PASS, including the new rc test.

- [ ] **Step 8: Commit**

```bash
git add lib/semver.ts lib/__tests__/semver.test.ts lib/kiosk/updates.ts lib/kiosk/__tests__/updates.test.ts
git commit -m "feat(release): add semver comparison for prereleases"
```

---

## Task 2: Release version parsing

**Files:**

- Create: `lib/release/version.ts`
- Create: `lib/release/__tests__/version.test.ts`

- [ ] **Step 1: Write the failing version tests**

Create `lib/release/__tests__/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ReleaseError,
  assertPackageVersion,
  checkRelease,
  parseReleaseVersion,
  readPackageVersion,
} from '../version'

describe('release version', () => {
  it('parses a stable version', () => {
    expect(parseReleaseVersion('0.9.0')).toEqual({
      version: '0.9.0',
      tag: 'v0.9.0',
      prerelease: false,
    })
  })

  it('parses a prerelease and strips a leading v', () => {
    expect(parseReleaseVersion('v0.9.0-rc.1')).toEqual({
      version: '0.9.0-rc.1',
      tag: 'v0.9.0-rc.1',
      prerelease: true,
    })
  })

  it('rejects invalid versions', () => {
    for (const value of [
      '0.9',
      '0.9.0.1',
      '01.9.0',
      '0.9.0+build',
      ' 0.9.0',
      '0.9.0-',
      '0.9.0-rc..1',
    ]) {
      expect(() => parseReleaseVersion(value)).toThrow(ReleaseError)
    }
  })

  it('rejects an empty version', () => {
    expect(() => parseReleaseVersion('')).toThrow(/required/)
  })

  it('rejects a package version mismatch', () => {
    const release = parseReleaseVersion('0.9.0')
    expect(() => assertPackageVersion('0.8.0', release)).toThrow(/does not match/)
  })

  it('reads and checks the package version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-version-'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.9.0' }))
    expect(readPackageVersion(root)).toBe('0.9.0')
    expect(checkRelease(root, '0.9.0').tag).toBe('v0.9.0')
    expect(() => checkRelease(root, '0.9.1')).toThrow(/does not match/)
  })
})
```

- [ ] **Step 2: Run the version tests to verify they fail**

Run:

```bash
npx vitest run lib/release/__tests__/version.test.ts
```

Expected: FAIL with a module resolution error for `../version`.

- [ ] **Step 3: Write `lib/release/version.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { parseSemver } from '../semver'

export interface ReleaseVersion {
  version: string
  tag: string
  prerelease: boolean
}

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReleaseError'
  }
}

export function parseReleaseVersion(input: string): ReleaseVersion {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ReleaseError('version is required')
  }
  if (input !== input.trim()) {
    throw new ReleaseError(`version has surrounding whitespace: "${input}"`)
  }

  const normalized = input.startsWith('v') ? input.slice(1) : input
  const parsed = parseSemver(normalized)
  if (!parsed) {
    throw new ReleaseError(
      `invalid release version: "${input}" (expected X.Y.Z or X.Y.Z-<prerelease>)`,
    )
  }
  if (parsed.build.length > 0) {
    throw new ReleaseError(`release version must not include build metadata: "${input}"`)
  }

  return {
    version: normalized,
    tag: `v${normalized}`,
    prerelease: parsed.prerelease.length > 0,
  }
}

export function readPackageVersion(root: string): string {
  const packagePath = path.join(root, 'package.json')
  let packageJson: unknown
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ReleaseError(`could not read ${packagePath}: ${reason}`)
  }

  const version = (packageJson as { version?: unknown })?.version
  if (typeof version !== 'string' || version.length === 0) {
    throw new ReleaseError(`${packagePath} has no version`)
  }
  return version
}

export function assertPackageVersion(packageVersion: string, release: ReleaseVersion): void {
  if (packageVersion !== release.version) {
    throw new ReleaseError(
      `package.json version ${packageVersion} does not match release ${release.version}`,
    )
  }
}

export function checkRelease(root: string, input: string): ReleaseVersion {
  const release = parseReleaseVersion(input)
  assertPackageVersion(readPackageVersion(root), release)
  return release
}
```

- [ ] **Step 4: Run the version tests to verify they pass**

Run:

```bash
npx vitest run lib/release/__tests__/version.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/release/version.ts lib/release/__tests__/version.test.ts
git commit -m "feat(release): validate release versions"
```

---

## Task 3: Release notes extraction

**Files:**

- Create: `lib/release/notes.ts`
- Create: `lib/release/__tests__/notes.test.ts`

- [ ] **Step 1: Write the failing notes tests**

Create `lib/release/__tests__/notes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractReleaseNotes } from '../notes'

describe('release notes', () => {
  it('extracts the section until the next level-two heading', () => {
    const body = [
      '## Summary',
      'Some text',
      '',
      '## Release notes',
      '',
      '### Highlights',
      '- One',
      '',
      '## Test plan',
      '- Tests',
    ].join('\n')
    expect(extractReleaseNotes(body)).toBe('### Highlights\n- One')
  })

  it('matches the heading case-insensitively and trims it', () => {
    expect(extractReleaseNotes('##   RELEASE NOTES   \n\nHello\n')).toBe('Hello')
  })

  it('keeps heading-like lines inside fenced code blocks', () => {
    const body = [
      '## Release notes',
      '```md',
      '## not a heading',
      '```',
      'After',
      '## Next',
    ].join('\n')
    expect(extractReleaseNotes(body)).toBe('```md\n## not a heading\n```\nAfter')
  })

  it('handles CRLF line endings', () => {
    expect(extractReleaseNotes('## Release notes\r\n\r\nHello\r\n')).toBe('Hello')
  })

  it('throws when the section is missing', () => {
    expect(() => extractReleaseNotes('## Summary\nHello')).toThrow(/missing/)
  })

  it('throws when the section is empty', () => {
    expect(() => extractReleaseNotes('## Release notes\n\n## Test plan\n')).toThrow(/empty/)
  })
})
```

- [ ] **Step 2: Run the notes tests to verify they fail**

Run:

```bash
npx vitest run lib/release/__tests__/notes.test.ts
```

Expected: FAIL with a module resolution error for `../notes`.

- [ ] **Step 3: Write `lib/release/notes.ts`**

```ts
import { ReleaseError } from './version'

const HEADING = /^##\s+release notes\s*$/i
const NEXT_HEADING = /^##\s+/
const FENCE = /^\s*(```|~~~)/

function finish(lines: string[]): string {
  const text = lines.join('\n').trim()
  if (!text) {
    throw new ReleaseError('release PR "## Release notes" section is empty')
  }
  return text
}

export function extractReleaseNotes(prBody: string): string {
  if (typeof prBody !== 'string') {
    throw new ReleaseError('release PR body is empty')
  }

  const lines = prBody.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (start < 0) {
      if (HEADING.test(line)) start = i + 1
      continue
    }

    if (NEXT_HEADING.test(line)) {
      return finish(lines.slice(start, i))
    }
  }

  if (start < 0) {
    throw new ReleaseError('release PR body is missing a "## Release notes" section')
  }
  return finish(lines.slice(start))
}
```

- [ ] **Step 4: Run the notes tests to verify they pass**

Run:

```bash
npx vitest run lib/release/__tests__/notes.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/release/notes.ts lib/release/__tests__/notes.test.ts
git commit -m "feat(release): extract notes from the release PR"
```

---

## Task 4: Release archive

**Files:**

- Create: `lib/release/archive.ts`
- Create: `lib/release/__tests__/archive.test.ts`

- [ ] **Step 1: Write the failing archive tests**

Create `lib/release/__tests__/archive.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the archive tests to verify they fail**

Run:

```bash
npx vitest run lib/release/__tests__/archive.test.ts
```

Expected: FAIL with a module resolution error for `../archive`.

- [ ] **Step 3: Write `lib/release/archive.ts`**

```ts
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
```

- [ ] **Step 4: Run the archive tests to verify they pass**

Run:

```bash
npx vitest run lib/release/__tests__/archive.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/release/archive.ts lib/release/__tests__/archive.test.ts
git commit -m "feat(release): build and verify the frame archive"
```

---

## Task 5: Release CLI and tooling

**Files:**

- Create: `scripts/release.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Install `tsx` as a dev dependency**

Run:

```bash
npx --yes pnpm@12.3.4 add -D tsx@^4.23.15
```

Expected: `package.json` gains `"tsx": "^4.23.15"` under `devDependencies`, and `pnpm-lock.yaml` changes.

If pnpm reports a conflict with the existing npm `node_modules`, reset it and install again:

```bash
rm -rf node_modules package-lock.json
npx --yes pnpm@12.3.4 install
npx --yes pnpm@12.3.4 add -D tsx@^4.23.15
```

- [ ] **Step 2: Write `scripts/release.ts`**

```ts
import fs from 'node:fs'
import { createReleaseArchive } from '../lib/release/archive'
import { extractReleaseNotes } from '../lib/release/notes'
import { checkRelease } from '../lib/release/version'

function usage(): never {
  console.error('usage: release.ts check <version> | notes | package <version> --out <dir>')
  process.exit(2)
}

function main(argv: string[]): number {
  const [command, ...rest] = argv

  switch (command) {
    case 'check': {
      const input = rest[0]
      if (!input) usage()
      const release = checkRelease(process.cwd(), input)
      console.log(`version=${release.version}`)
      console.log(`tag=${release.tag}`)
      console.log(`prerelease=${release.prerelease}`)
      return 0
    }
    case 'notes': {
      const body = fs.readFileSync(0, 'utf8')
      process.stdout.write(`${extractReleaseNotes(body)}\n`)
      return 0
    }
    case 'package': {
      const input = rest[0]
      if (!input) usage()
      const outIndex = rest.indexOf('--out')
      const outDir = outIndex >= 0 ? rest[outIndex + 1] : 'dist'
      if (!outDir) usage()
      const release = checkRelease(process.cwd(), input)
      const archive = createReleaseArchive({
        root: process.cwd(),
        version: release.version,
        outDir,
      })
      console.log(`asset=${archive.path}`)
      console.log(`sha256=${archive.sha256}`)
      return 0
    }
    default:
      usage()
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
```

- [ ] **Step 3: Add the release scripts to `package.json`**

Add these entries to the `scripts` block:

```json
"release:check": "tsx scripts/release.ts check",
"release:notes": "tsx scripts/release.ts notes",
"release:package": "tsx scripts/release.ts package"
```

The full block becomes:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "release:check": "tsx scripts/release.ts check",
    "release:notes": "tsx scripts/release.ts notes",
    "release:package": "tsx scripts/release.ts package"
  },
```

- [ ] **Step 4: Ignore local release output**

Add to `.gitignore`:

```text
dist/
```

- [ ] **Step 5: Smoke-test the check and notes commands**

Run:

```bash
npx tsx scripts/release.ts check 0.8.0
```

Expected:

```text
version=0.8.0
tag=v0.8.0
prerelease=false
```

Run:

```bash
printf '## Release notes\n\nHello\n' | npx tsx scripts/release.ts notes
```

Expected:

```text
Hello
```

Run the negative case:

```bash
npx tsx scripts/release.ts check 0.8.0-rc.1
```

Expected: exit code 1 and a message containing `package.json version 0.8.0 does not match release 0.8.0-rc.1`.

- [ ] **Step 6: Commit**

```bash
git add scripts/release.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(release): add the release CLI"
```

---

## Task 6: Release workflow

**Files:**

- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version without the v prefix, for example 0.9.0 or 0.9.0-rc.1'
        required: true
        type: string
      release_pr:
        description: 'Merged release PR number with a ## Release notes section'
        required: true
        type: number
      dry_run:
        description: 'Validate, build, and package without tagging or creating a release'
        required: false
        default: false
        type: boolean

permissions:
  contents: write
  pull-requests: read

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      GH_TOKEN: ${{ github.token }}
      GH_REPO: ${{ github.repository }}
      VERSION_INPUT: ${{ inputs.version }}
      RELEASE_PR: ${{ inputs.release_pr }}

    steps:
      - name: Check out the dispatched commit
        uses: actions/checkout@v4
        with:
          ref: ${{ github.sha }}
          fetch-depth: 0

      - name: Require main
        run: |
          if [ "$GITHUB_REF" != "refs/heads/main" ]; then
            echo "release must be dispatched from main (got $GITHUB_REF)" >&2
            exit 1
          fi

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install pnpm
        run: |
          PNPM_VERSION=$(node -p "require('./package.json').packageManager.replace(/^pnpm@/, '')")
          npm install -g "pnpm@$PNPM_VERSION"
          pnpm --version

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Validate release
        id: release
        run: |
          set -o pipefail
          pnpm exec tsx scripts/release.ts check "$VERSION_INPUT" | tee -a "$GITHUB_OUTPUT"

      - name: Verify release PR and extract notes
        run: |
          set -o pipefail
          STATE=$(gh pr view "$RELEASE_PR" --json state --jq .state)
          if [ "$STATE" != "MERGED" ]; then
            echo "release PR #$RELEASE_PR is $STATE, not MERGED" >&2
            exit 1
          fi

          MERGE_SHA=$(gh pr view "$RELEASE_PR" --json mergeCommit --jq .mergeCommit.oid)
          if [ -z "$MERGE_SHA" ] || [ "$MERGE_SHA" = "null" ]; then
            echo "release PR #$RELEASE_PR has no merge commit" >&2
            exit 1
          fi
          if ! git merge-base --is-ancestor "$MERGE_SHA" "$GITHUB_SHA"; then
            echo "release PR #$RELEASE_PR merge commit $MERGE_SHA is not in $GITHUB_SHA" >&2
            exit 1
          fi

          gh pr view "$RELEASE_PR" --json body --jq .body \
            | pnpm exec tsx scripts/release.ts notes > release-notes.md
          if [ ! -s release-notes.md ]; then
            echo "release notes are empty" >&2
            exit 1
          fi

      - name: Typecheck
        run: pnpm exec tsc --noEmit

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

      - name: Package
        id: package
        run: |
          set -o pipefail
          pnpm exec tsx scripts/release.ts package "${{ steps.release.outputs.version }}" --out dist \
            | tee -a "$GITHUB_OUTPUT"

      - name: Smoke-install the archive
        env:
          ASSET: ${{ steps.package.outputs.asset }}
        run: |
          TMP=$(mktemp -d)
          trap 'rm -rf "$TMP"' EXIT
          tar -xzf "$ASSET" -C "$TMP"
          cd "$TMP"
          pnpm install --frozen-lockfile
          test -f package.json
          test -f .next/BUILD_ID
          test -f lib/kiosk/cli.ts
          test -f install-kiosk.sh

      - name: Report dry run
        if: ${{ inputs.dry_run }}
        env:
          ASSET: ${{ steps.package.outputs.asset }}
        run: |
          {
            echo "## Release dry run"
            echo ""
            echo "- Version: \`${{ steps.release.outputs.version }}\`"
            echo "- Tag: \`${{ steps.release.outputs.tag }}\`"
            echo "- Asset: \`${{ steps.package.outputs.asset }}\`"
            echo "- SHA-256: \`${{ steps.package.outputs.sha256 }}\`"
            echo ""
            echo "### Archive entries"
            echo ""
            tar -tzf "$ASSET" | sed 's/^/- /'
            echo ""
            echo "### Release notes"
            echo ""
            cat release-notes.md
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Create tag
        if: ${{ !inputs.dry_run }}
        env:
          TAG: ${{ steps.release.outputs.tag }}
        run: |
          git fetch --tags origin
          if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
            EXISTING=$(git rev-list -n1 "$TAG")
            if [ "$EXISTING" != "$GITHUB_SHA" ]; then
              echo "tag $TAG points at $EXISTING, expected $GITHUB_SHA" >&2
              exit 1
            fi
            echo "tag $TAG already points at $GITHUB_SHA"
          else
            git -c user.name="github-actions[bot]" \
              -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
              tag -a "$TAG" -m "$TAG" "$GITHUB_SHA"
            git push origin "$TAG"
          fi

      - name: Generate release notes
        if: ${{ !inputs.dry_run }}
        env:
          TAG: ${{ steps.release.outputs.tag }}
        run: |
          PREVIOUS=$(git describe --tags --abbrev=0 "$TAG^" 2>/dev/null || true)
          if [ -n "$PREVIOUS" ]; then
            gh api "repos/$GH_REPO/releases/generate-notes" \
              -f tag_name="$TAG" \
              -f previous_tag_name="$PREVIOUS" \
              --jq .body > generated-notes.md
          else
            gh api "repos/$GH_REPO/releases/generate-notes" \
              -f tag_name="$TAG" \
              --jq .body > generated-notes.md
          fi

          {
            cat release-notes.md
            if [ -s generated-notes.md ]; then
              printf '\n\n---\n\n'
              cat generated-notes.md
            fi
          } > full-release-notes.md

      - name: Create or update draft release
        if: ${{ !inputs.dry_run }}
        env:
          TAG: ${{ steps.release.outputs.tag }}
          PRERELEASE: ${{ steps.release.outputs.prerelease }}
          ASSET: ${{ steps.package.outputs.asset }}
        run: |
          if gh release view "$TAG" >/dev/null 2>&1; then
            IS_DRAFT=$(gh release view "$TAG" --json isDraft --jq .isDraft)
            if [ "$IS_DRAFT" != "true" ]; then
              echo "release $TAG is already published; refusing to change it" >&2
              exit 1
            fi
            gh release upload "$TAG" "$ASSET" --clobber
            gh release edit "$TAG" \
              --title "$TAG" \
              --notes-file full-release-notes.md \
              --prerelease="$PRERELEASE"
          else
            gh release create "$TAG" "$ASSET" \
              --verify-tag \
              --draft \
              --title "$TAG" \
              --notes-file full-release-notes.md \
              --prerelease="$PRERELEASE"
          fi

      - name: Report draft
        if: ${{ !inputs.dry_run }}
        env:
          TAG: ${{ steps.release.outputs.tag }}
        run: |
          URL=$(gh release view "$TAG" --json url --jq .url)
          {
            echo "## Draft release"
            echo ""
            echo "$URL"
            echo ""
            echo "- SHA-256: \`${{ steps.package.outputs.sha256 }}\`"
            echo ""
            echo 'Publish from the GitHub Releases page. Keep "Set as the latest release" checked for a stable release.'
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate the YAML parses**

Run:

```bash
ruby -ryaml -e 'YAML.load_file(ARGV[0]); puts "yaml ok"' .github/workflows/release.yml
```

Expected:

```text
yaml ok
```

- [ ] **Step 3: Check the workflow with `gh` syntax expectations**

Run:

```bash
grep -n "workflow_dispatch\|contents: write\|pull-requests: read\|cancel-in-progress\|refs/heads/main\|prerelease=" .github/workflows/release.yml
```

Expected: each required line is present. Read the file once more and confirm the `on`, `permissions`, `concurrency`, and `jobs` top-level keys are at column 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add the manual release workflow"
```

---

## Task 7: Documentation

**Files:**

- Create: `docs/releasing.md`
- Modify: `docs/kiosk-cli.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/releasing.md`**

````markdown
# Releasing a kiosk build

This runbook covers a stable release and a prerelease. The release workflow
does the checks and publishing mechanics. A maintainer decides when to run it
and when to publish the draft.

## Before you start

- You need write access to the repository. Only users with write access can
  run the Release workflow.
- The workflow runs from `main`. Merge the release PR first.
- If the repository protects `v*` tags, `GITHUB_TOKEN` cannot create them. Add
  a fine-grained token with contents write as `RELEASE_TOKEN`, then set
  `GH_TOKEN` to `${{ secrets.RELEASE_TOKEN }}` at the job level and pass
  `token: ${{ secrets.RELEASE_TOKEN }}` to `actions/checkout`. The default
  workflow uses `github.token`.

## 1. Open the release PR

1. Create a branch.
2. Set `package.json` `version` to the release version without `v`, for
   example `0.9.0` or `0.9.0-rc.1`.
3. Add a `## Release notes` section to the PR body. Everything until the next
   `##` heading becomes the top of the GitHub release.
4. Title the PR `chore(release): vX.Y.Z`.
5. Get it reviewed and merge it.

Example body:

```markdown
## Release notes

### Highlights

- Frames can now ...

### Upgrade notes

- ...
```

The section is required. The workflow fails if it is missing or empty.

## 2. Run a dry run

1. Open Actions, then Release, then Run workflow.
2. Choose `main`.
3. Enter the version without `v`, the release PR number, and set `dry_run` to
   true.
4. Run it.

The job installs dependencies, runs the type check, the full test suite, the
production build, packages the archive, and smoke-installs it into a temporary
directory. The summary shows the tag, asset, SHA-256, and the notes. No tag or
release is created.

## 3. Run the release

Run the same workflow with `dry_run` false.

The job:

1. Repeats every check.
2. Creates the annotated tag `vX.Y.Z` at the tested commit. If the tag already
   points at that commit, it continues.
3. Creates a draft GitHub release with the archive and the reviewed notes
   followed by GitHub's generated pull request list.
4. Prints the draft URL in the job summary.

The job refuses to touch a published release, a tag on another commit, or a
release that is not a draft.

## 4. Review and publish

Open the draft from the job summary.

- Check the notes, the title, and the asset.
- For a stable release, keep "Set as the latest release" checked when you
  publish. That makes `/releases/latest` return this version.
- For a prerelease, GitHub keeps it out of `/releases/latest`. Do not publish
  it as a normal release.

Publishing is the only step that makes the release visible to frames.

## Prereleases

Use a semver suffix such as `0.9.0-rc.1`. The workflow marks the GitHub release
as a prerelease. Frames on stable do not see it.

To test it on a frame:

```bash
sudo kiosk update apply --version 0.9.0-rc.1 --yes
```

A frame on `0.9.0-rc.1` is offered `0.9.0` after the final release is
published.

## Reruns and recovery

Rerun the workflow with the same version and PR if it fails before the draft is
published. The tag guard accepts the same commit, and the draft is updated in
place.

If the tag points at the wrong commit, or the draft is wrong and unpublished:

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

Then fix the cause and rerun. Never delete a published release or move a
published tag. Fix forward with a new patch release.

## What the workflow does not do

- It does not bump `package.json`. The release PR does that.
- It does not publish the draft. A maintainer publishes it.
- It does not update `INSTALLER_VERSION` or the sync `apiVersion`. Those have
  their own version spaces.
````

- [ ] **Step 2: Replace the versioning policy in `docs/kiosk-cli.md`**

Replace this block:

```markdown
### Versioning policy

The product is in beta until a polished release earns `v1.0`. Until then:

- Releases are tagged `v0.x` (for example `v0.8`). The `v1.0` tag is
  reserved for the first primetime release.
- `package.json` `version` moves with the tag: tag `v0.8` ships version
  `0.8.0`. Wire updates read the bundled `package.json` version and compare
  it against tags (`lib/kiosk/updates.ts`), so the two must not drift apart.
- Pins follow the same rule: `KIOSK_REF=v0.8`, never a `v1.0` example,
  until `v1.0` actually exists.

The installer's own `INSTALLER_VERSION` (in `install-kiosk.sh`) and the sync
wire protocol's `apiVersion` are separate version spaces and do not track
product tags.
```

with:

```markdown
### Versioning policy

The product is in beta until a polished release earns `v1.0`. Until then:

- Releases use full semver tags: `vX.Y.Z`, optionally with a prerelease
  suffix such as `v0.9.0-rc.1`. `package.json` `version` is the tag without
  the `v`, so tag `v0.9.0` ships version `0.9.0`.
- `v0.8` was the last two-part tag and is read as `0.8.0`. New releases always
  use three parts.
- Prereleases are GitHub prereleases. `kiosk update check` and the daily timer
  use `/releases/latest`, which excludes them. Install one explicitly with
  `kiosk update apply --version 0.9.0-rc.1 --yes`.
- Publishing a stable release makes it the latest release. Publishing a
  prerelease never does.
- Pins follow the tag: `KIOSK_REF=v0.8` today, `KIOSK_REF=v0.9.0` after the
  first full-semver release.
- The installer's `INSTALLER_VERSION` (`2.0`) and the sync protocol's
  `apiVersion` are separate version spaces. They do not track product tags.
```

- [ ] **Step 3: Add the prerelease note to the Updates section**

After the paragraph ending with "does not block the next manual or scheduled
run." in `docs/kiosk-cli.md`, add:

````markdown
`update check` and the daily timer follow the latest stable GitHub release.
Prereleases are never selected automatically. To install one on a test frame,
name it explicitly:

```bash
sudo kiosk update apply --version 0.9.0-rc.1 --yes
```
````

- [ ] **Step 4: Link the runbook from the README**

In `README.md`, after the bullet list under "Digital frame kiosk (CLI-first)",
add:

```markdown
Release maintainers: `docs/releasing.md` covers the release PR, the Release
workflow, dry runs, and draft publication.
```

- [ ] **Step 5: Scan the written docs for AI tells**

Run:

```bash
grep -n "—\|–\|TBD\|TODO\|FIXME" docs/releasing.md docs/kiosk-cli.md README.md || true
```

Expected: no output for the files just edited. Read the new sections once and
replace any filler or passive phrasing with plain, active sentences.

- [ ] **Step 6: Commit**

```bash
git add docs/releasing.md docs/kiosk-cli.md README.md
git commit -m "docs(release): add the release runbook and version policy"
```

---

## Task 8: Full verification and evidence

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npx vitest run
```

Expected: every test file passes, no failures. The count grows by the new
semver, version, notes, and archive tests.

- [ ] **Step 2: Run the type check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: the Next.js build completes and creates `.next/BUILD_ID`.

- [ ] **Step 4: Build the real archive**

Run:

```bash
npx tsx scripts/release.ts package 0.8.0 --out dist
```

Expected:

```text
asset=/absolute/path/to/dist/dscos-0.8.0.tar.gz
sha256=<64 hex characters>
```

- [ ] **Step 5: Inspect the archive**

Run:

```bash
tar -tzf dist/dscos-0.8.0.tar.gz | head -20
tar -tzf dist/dscos-0.8.0.tar.gz | grep -E "^(\./)?(node_modules|\.git|\.next/cache)" && exit 1 || true
tar -xOzf dist/dscos-0.8.0.tar.gz ./package.json | head -5
```

Expected: the listing has `package.json`, `pnpm-lock.yaml`, `.next/BUILD_ID`,
`next.config.mjs`, `lib/kiosk/cli.ts`, and `install-kiosk.sh`. The forbidden
grep prints nothing. The `package.json` excerpt shows `"version": "0.8.0"`.

- [ ] **Step 6: Capture the after evidence**

Run:

```bash
npx tsx -e "import { compareVersions } from './lib/semver'; const c = compareVersions('0.9.0', '0.9.0-rc.1'); console.log('compare(latest, current) =', c); console.log('update available =', c > 0)"
```

Expected:

```text
compare(latest, current) = 1
update available = true
```

Save this output and the archive listing for the PR description. The before
output from Task 0 and this after output are the measured proof.

- [ ] **Step 7: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output. `dist/` is ignored.

- [ ] **Step 8: Fix failures in the task that owns them**

If a check fails, return to the task that introduced the file, make the fix
there, rerun that task's focused test, and commit with that task's exact
`git add` line. Do not leave uncommitted changes.

---

## Post-merge verification

The `Release` workflow only runs from `main`, so it cannot be dispatched from
this branch. After the PR merges:

1. Open Actions, then Release, then Run workflow.
2. Use the next release PR, its version, and `dry_run` set to true.
3. Confirm the summary shows the tag, archive entries, SHA-256, and notes.
4. The dry run does not create a tag or release.

The first real release run is the live test of the tag and draft steps.

---

## Self-review notes

- Every spec section maps to a task: semver to Task 1, version rules to Task
  2, notes to Task 3, archive to Task 4, script and workflow to Tasks 5 and 6,
  docs to Task 7, and the live evidence to Task 8.
- The workflow uses `github.sha` for the tag and the checkout, so the tag
  points at the tested commit.
- The dry run stops before tagging and uses the same package and smoke-install
  path as a real release.
- Reruns accept a tag at the same commit and update only a draft release.
- Prereleases are marked from the version and never set as latest.
- The only new dependency is the `tsx` dev dependency, added with pnpm.
