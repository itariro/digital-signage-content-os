# Kiosk Release Automation - Design Spec

**Date:** 2026-11-06
**Sub-project:** 3 of 3 (release automation)
**Depends on:** sub-project 1 (CLI robustness) and sub-project 2 (update mechanism)

## Goal

Turn a reviewed release PR into a reproducible GitHub release. The release
workflow validates the version, runs the full checks, builds and packages the
frame archive, tags the tested commit, and creates a draft release with notes
reviewed in the PR. Publishing stays a deliberate human step.

The same change makes version comparison semver-aware so a frame on a
prerelease can move to the final release, while frames on stable never move to
a prerelease automatically.

## Non-goals

- Pull-request CI. The release workflow runs the checks, but this sub-project
  does not add a workflow that runs on every PR.
- Auto-publishing. The workflow always creates a draft.
- Release channels (stable/beta settings on the frame).
- A CHANGELOG file.
- Multi-architecture binaries or bundling `node_modules`.
- Bumping `INSTALLER_VERSION` or the sync `apiVersion`. Those remain separate
  version spaces.
- Changing how frames install dependencies during an update.

## Release flow

1. A maintainer creates a release PR by hand. It bumps `package.json` to
   `X.Y.Z` and adds a `## Release notes` section to the PR body. The title
   convention is `chore(release): vX.Y.Z`.
2. The PR is reviewed and merged.
3. The maintainer runs the `Release` workflow on `main` with:
   - `version`: `X.Y.Z` or `X.Y.Z-rc.1` (an optional leading `v` is accepted).
   - `release_pr`: the merged release PR number.
   - `dry_run`: optional, default `false`.
4. The workflow validates everything and runs the full checks and build.
5. It packages `dscos-X.Y.Z.tar.gz`.
6. It creates the annotated tag `vX.Y.Z` at the tested commit.
7. It generates GitHub notes since the previous tag, prepends the reviewed PR
   notes, and creates a draft release.
8. A maintainer reviews the draft and publishes it.

Publishing a stable draft with the default "Set as latest release" option
makes it the release returned by `/releases/latest`. A prerelease draft never
offers that option and never becomes latest.

## Version policy

- Tags use full semver: `vX.Y.Z`, optionally with a prerelease suffix such as
  `v0.9.0-rc.1`. Build metadata (`+...`) is rejected.
- `package.json` `version` is the tag without the leading `v`. A release fails
  if the two differ.
- Legacy two-part tags such as `v0.8` remain valid inputs for comparison. They
  are read as `0.8.0`. New releases always use three parts.
- Prereleases are marked as GitHub prereleases. `releases/latest` excludes
  them, so `kiosk update check` and the daily timer never select one.
  `kiosk update apply --version 0.9.0-rc.1` still works because that path
  fetches the release by tag.
- A frame on `0.9.0-rc.1` must see `0.9.0` as an update.
- Semver precedence still treats `0.9.1-rc.1` as greater than `0.9.0`. A
  stable frame is not offered it because the updater reads
  `/releases/latest`, which excludes prereleases. The filter is the release
  endpoint, not the comparison function.

## Components

### `lib/semver.ts`

Shared version parsing and comparison used by both the kiosk updater and the
release tooling.

```ts
export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseSemver(input: string): ParsedVersion | null
export function compareVersions(a: string, b: string): number
```

`parseSemver` follows semver for the core and prerelease parts. It returns
`null` for invalid input.

`compareVersions` stays tolerant of legacy values. A missing minor or patch is
zero. A non-numeric core component becomes zero, matching the current behavior
for `unknown`. Precedence rules:

- Core numbers compare numerically.
- A version without a prerelease is greater than the same core with one.
- Prerelease identifiers compare dot by dot. Numeric identifiers compare
  numerically, numeric is lower than alphanumeric, and alphanumeric compares
  in ASCII order. A longer list wins when all shared identifiers are equal.
- Build metadata is ignored.

### `lib/kiosk/updates.ts`

Replaces its local `compareVersions` with the shared implementation. The rest
of `parseLatestRelease`, `isUpdateAvailable`, and `isUpdateAvailableFor` keeps
its current shape.

### `lib/release/version.ts`

Strict release parsing and validation.

```ts
export interface ReleaseVersion {
  version: string
  tag: string
  prerelease: boolean
}

export function parseReleaseVersion(input: string): ReleaseVersion
export function assertPackageVersion(pkgVersion: string, release: ReleaseVersion): void
```

- Accepts `X.Y.Z` and `X.Y.Z-<prerelease>`.
- Accepts an optional leading `v` and normalizes it away.
- Rejects leading zeros, four-part versions, build metadata, whitespace, and
  empty prerelease identifiers.
- `prerelease` is true whenever a suffix is present.
- `assertPackageVersion` throws a clear error when `package.json` does not
  match.

### `lib/release/notes.ts`

```ts
export function extractReleaseNotes(prBody: string): string
```

- Finds the first `## Release notes` heading, case-insensitive, with optional
  trailing whitespace.
- Returns the content until the next `## ` heading. `###` subheadings inside
  the section are kept.
- Ignores heading-looking lines inside fenced code blocks (``` or ~~~).
- Trims the result and throws when the section is missing or empty.

### `lib/release/archive.ts`

```ts
export interface ReleaseArchive {
  path: string
  sha256: string
  entries: string[]
}

export function createReleaseArchive(opts: {
  root: string
  version: string
  outDir: string
}): ReleaseArchive

export function verifyReleaseArchive(opts: {
  path: string
  version: string
}): void
```

`createReleaseArchive`:

1. Runs `git archive` for `HEAD` into a temporary directory. Only tracked
   files are included.
2. Copies the built `.next` from `root`, excluding `.next/cache`.
3. Writes `dscos-<version>.tar.gz` in `outDir` with no wrapping directory.
4. Calls `verifyReleaseArchive` and removes the temporary directory.

`verifyReleaseArchive` lists the tar entries and checks:

- Required entries exist: `package.json`, `pnpm-lock.yaml`, `.next/BUILD_ID`,
  `next.config.mjs`, `lib/kiosk/cli.ts`, and `install-kiosk.sh`.
- The archived `package.json` version matches the release version.
- There is no wrapping directory.
- There are no `node_modules/`, `.git/`, or `.next/cache/` entries.
- There are no absolute paths.

Any failure throws before the tag or release is created.

### `scripts/release.ts`

A thin CLI over the modules above.

| Command | Behavior | Stdout |
|---|---|---|
| `check <version>` | parse, validate, compare with `package.json` | `version=`, `tag=`, `prerelease=` lines |
| `notes` | read the PR body from stdin, extract notes | the extracted notes |
| `package <version> --out <dir>` | create and verify the archive | `asset=`, `sha256=` lines |

`package.json` gains `release:check`, `release:notes`, and `release:package`
scripts that call `tsx scripts/release.ts ...`. `tsx` becomes a dev
dependency.

### `.github/workflows/release.yml`

Trigger: `workflow_dispatch` only.

Inputs:

| Input | Type | Required | Default |
|---|---|---|---|
| `version` | string | yes | |
| `release_pr` | number | yes | |
| `dry_run` | boolean | no | `false` |

Permissions: `contents: write` and `pull-requests: read`. No other write
scopes.

Concurrency: one group named `release`, `cancel-in-progress: false`, so two
releases cannot overlap.

Runner: `ubuntu-latest`, Node 22, timeout 30 minutes.

The job checks out `github.sha` with `fetch-depth: 0` and fails unless the
dispatch ref is `refs/heads/main`. It then runs these steps in order:

1. Install pnpm from the `packageManager` field in `package.json` with
   `npm install -g "pnpm@<version>"`. Corepack's pnpm 12 shim points at a file
   that no longer exists, so the workflow does not use `corepack enable`.
2. `pnpm install --frozen-lockfile`.
3. `release check`. The output lines go into `$GITHUB_OUTPUT`.
4. Verify the release PR with `gh pr view`: state is `MERGED`, its merge
   commit is an ancestor of the checked-out commit, and the body has notes.
5. Extract the notes with `release notes` into `release-notes.md`.
6. `pnpm exec tsc --noEmit`.
7. `pnpm test`.
8. `pnpm build`.
9. `release package <version> --out dist`. The asset path and SHA-256 go into
   `$GITHUB_OUTPUT`.
10. Smoke-install the archive into a temporary directory with
    `pnpm install --frozen-lockfile`, proving a frame can stage it.
11. If `dry_run` is true, write the planned tag, asset, SHA-256, and notes
    summary to the job summary and stop.
12. Guard and create the tag.
13. Generate GitHub notes since the previous tag with
    `gh api repos/{owner}/{repo}/releases/generate-notes`.
14. Compose the reviewed notes and generated notes into one body, then create
    or update the draft release.
15. Write the draft URL to the job summary.

## Tag and draft behavior

Tag guard:

- No tag exists: create an annotated tag at `github.sha` and push it.
- Tag exists at `github.sha`: continue, so a rerun can finish an interrupted
  release.
- Tag exists at another commit: fail without changing the release.

Draft release:

- No release exists: `gh release create` with the asset, `--verify-tag`,
  `--draft`, a title of `vX.Y.Z`, and the composed notes.
- A draft exists: replace the asset with `gh release upload --clobber`,
  rewrite the title and notes with `gh release edit`, and keep it a draft.
- A published release exists: fail without changing it.

The prerelease flag is always set from the version, never inferred at
publish time. A rerun recomputes generated notes from the tag and the previous
tag, so new commits on `main` cannot change what the draft says.

## Failure handling

- Checks, tests, build, archive creation, and archive verification all happen
  before the tag exists. A failure leaves no public state.
- A failure after the tag but before the draft is recoverable by rerunning the
  same inputs. The tag guard accepts the same commit.
- A failure during draft creation or asset upload is recoverable the same way.
- No step deletes a published release, moves a tag, or force-pushes.
- The workflow never creates a tag for a dry run.

## Errors and messages

- Invalid version, package mismatch, missing notes, missing required archive
  entry, forbidden archive entry, wrong tag target, and published release all
  fail the job with a message that names the version and the failed check.
- The release script writes errors to stderr and exits non-zero.
- `gh` and `git` failures are not swallowed. Their output stays in the job log.

## Security and invariants

- Only users with write access can dispatch the workflow. GitHub enforces
  this.
- The PR body is written to a file and passed with `--notes-file`. It is never
  interpolated into a shell command.
- The version is validated before it is used in a path, tag, or release name.
- The tag is placed on the commit that was checked out, tested, and packaged,
  not on a moving branch name.
- The release job has no `actions: write` or `packages: write` permission.
- The archive is built from `git archive HEAD`, so untracked files and local
  build leftovers cannot enter the release.

## Documentation

- New `docs/releasing.md` runbook:
  - Release PR checklist and the `## Release notes` template.
  - Workflow inputs and a dry-run walkthrough.
  - How to review and publish the draft.
  - Latest-release behavior for stable and prerelease.
  - How to install a prerelease on a test frame.
  - Rerun behavior and manual recovery if a tag or draft must be removed.
  - The tag-protection fallback when `GITHUB_TOKEN` cannot push `v*` tags.
- `docs/kiosk-cli.md`:
  - Replace the two-part tag policy with full semver.
  - Document prerelease opt-in and latest-stable behavior.
  - Keep the current `v0.8` pin examples until the first full-semver release,
    then update them in that release PR.
- `README.md`: link the release runbook from the Deployment section.
- `.gitignore`: add `dist/`.

## Testing

Unit tests:

- `lib/semver`:
  - `0.9.0-rc.1 < 0.9.0`.
  - `0.9.0-rc.2 < 0.9.0-rc.10`.
  - `0.9.0-alpha < 0.9.0-alpha.1 < 0.9.0-beta < 0.9.0`.
  - `v0.8` equals `0.8.0`, and `2.0` compares as `2.0.0`.
  - Build metadata is ignored.
- `lib/release/version`:
  - Valid stable, prerelease, and leading-`v` inputs.
  - Rejected four-part, leading-zero, and build-metadata inputs.
  - Package version mismatch throws.
- `lib/release/notes`:
  - Heading case and trailing whitespace.
  - Content stops at the next `##` heading but keeps `###`.
  - Fenced code blocks with heading-looking lines.
  - Missing and empty sections throw.
- `lib/release/archive`:
  - Temp git repo with tracked and untracked files.
  - Tracked files are included and untracked files are not.
  - `.next/cache` and `node_modules` are excluded.
  - Required entries are present and there is no wrapping directory.
  - A version mismatch fails.
- `lib/kiosk/updates`:
  - A frame on `0.9.0-rc.1` sees `0.9.0` as an update.
  - `0.9.1-rc.1` compares greater than `0.9.0`, which is correct semver. The
    `/releases/latest` endpoint is what keeps it away from stable frames.

The full suite, `tsc --noEmit`, and `pnpm build` must pass. A `dry_run`
dispatch is the live check of the workflow itself.

## Risks

- Repository rules may block tag pushes from `GITHUB_TOKEN`. The runbook
  documents using a token that can create `v*` tags if that happens.
- Publishing is manual by design. A forgotten publish leaves a draft and
  frames stay on the old release. The workflow summary and runbook both point
  at the draft.
- GitHub cannot mark a draft as latest. Latest labeling depends on the
  maintainer publishing a stable draft with the default option. The runbook
  makes this explicit.
- Generated notes depend on PR titles and merge history. The reviewed PR
  notes are the part under the maintainer's control and appear first.
- The workflow cannot be run end to end on a laptop. The dry-run mode and the
  unit tests are the local evidence; the first real tag and draft are the live
  evidence.
- `pnpm` 12.3.4's Corepack shim is broken in this environment. The workflow
  installs pnpm globally from the pinned `packageManager` value instead of
  using Corepack.

## Files touched

- `.github/workflows/release.yml` (new)
- `lib/semver.ts` (new)
- `lib/release/version.ts` (new)
- `lib/release/notes.ts` (new)
- `lib/release/archive.ts` (new)
- `lib/release/__tests__/version.test.ts` (new)
- `lib/release/__tests__/notes.test.ts` (new)
- `lib/release/__tests__/archive.test.ts` (new)
- `lib/__tests__/semver.test.ts` (new)
- `lib/kiosk/updates.ts` (use the shared comparison)
- `lib/kiosk/__tests__/updates.test.ts` (extend)
- `scripts/release.ts` (new)
- `package.json` (release scripts and `tsx`)
- `pnpm-lock.yaml` (regenerate with `tsx`)
- `.gitignore` (`dist/`)
- `docs/releasing.md` (new)
- `docs/kiosk-cli.md` (version policy and prerelease behavior)
- `README.md` (link to the runbook)

`install-kiosk.sh` is not changed. The installer version and sync
`apiVersion` stay as they are.

## Success criteria

- A dry run on a merged release PR reports the exact tag, archive entries,
  SHA-256, and notes without creating a tag or release.
- A real run creates the tag, archive, and draft. A rerun after a simulated
  failure at release creation resumes without manual cleanup.
- Publishing a stable draft makes `/releases/latest` return it. A prerelease
  never does.
- A frame on `0.9.0-rc.1` is offered `0.9.0`. A frame on `0.9.0` is never
  offered `0.9.1-rc.1` automatically.
- The updater's existing tests still pass with the shared comparison.
