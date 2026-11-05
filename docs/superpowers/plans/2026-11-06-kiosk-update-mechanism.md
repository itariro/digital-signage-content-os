# Kiosk Update Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable frames to detect and apply updates from GitHub releases, manually and via a daily timer, covering app + installer/runtime.

**Architecture:** Pure helpers in `lib/kiosk/updates.ts` for version comparison and release parsing. A new `lib/kiosk/updater.ts` performs download/validate/switch/rollback using node:https and fs. CLI `cmdUpdate` orchestrates. Installer adds timer units and writes installer version.

**Tech Stack:** TypeScript, vitest, node:https, node:fs, systemd.

---

## File Structure

- Modify: `lib/kiosk/updates.ts` — add release parsing helpers.
- Create: `lib/kiosk/updater.ts` — download, validate, switch, rollback.
- Modify: `lib/kiosk/cli.ts` — implement cmdUpdate fully + enable/disable/status.
- Modify: `install-kiosk.sh` — timer units, installer version file.
- Modify: `lib/kiosk/__tests__/` — tests.
- Modify: `docs/kiosk-cli.md`.

---

### Task 1: Release parsing helpers

**Files:** Modify `lib/kiosk/updates.ts`, create tests.

- [ ] **Step 1: Add helpers**

```ts
export interface ReleaseInfo { tag: string; version: string; assetUrl: string | null; assetName: string | null }
export function parseLatestRelease(json: any): ReleaseInfo {
  const tag = String(json?.tag_name ?? '')
  const version = tag.replace(/^v/, '')
  const assets = Array.isArray(json?.assets) ? json.assets : []
  const asset = assets.find((a: any) => typeof a?.name === 'string' && /^dscos-.*\.tar\.gz$/.test(a.name)) || null
  return { tag, version, assetUrl: asset?.browser_download_url ?? null, assetName: asset?.name ?? null }
}
export function isUpdateAvailableFor(currentApp: string, currentInstaller: string, latest: string): boolean {
  return compareVersions(latest, currentApp) > 0 || compareVersions(latest, currentInstaller) > 0
}
```

- [ ] **Step 2: Tests** in `lib/kiosk/__tests__/updates.test.ts` for parseLatestRelease + isUpdateAvailableFor.

- [ ] **Step 3: Commit**

### Task 2: Updater module

**Files:** Create `lib/kiosk/updater.ts`.

- [ ] **Step 1: Implement download + validate + switch + rollback (pure-ish, injectable deps).**

Provide functions:
```ts
export async function fetchLatestRelease(fetchFn): Promise<ReleaseInfo>
export function stagingDir(version: string): string
export function backupDir(version: string): string
export function validateStaging(dir: string): boolean  // package.json version + .next
export function switchRelease(opts): { ok: boolean; error?: string }
export function rollback(opts): { ok: boolean; error?: string }
```

Use fs operations; injectable via params for testing.

- [ ] **Step 2: Tests** with temp dirs.

- [ ] **Step 3: Commit**

### Task 3: Implement cmdUpdate

**Files:** Modify `lib/kiosk/cli.ts`.

- [ ] **Step 1: Implement check/apply/rollback/enable/disable/status.**

- [ ] **Step 2: Wire in runCli (already routed).**

- [ ] **Step 3: Commit**

### Task 4: Installer timer units

**Files:** Modify `install-kiosk.sh`.

- [ ] **Step 1: Add t_write_update_timer writing kiosk-update.service + .timer.**
- [ ] **Step 2: Enable timer.**
- [ ] **Step 3: Write installer version to /etc/kiosk/installer.version.**
- [ ] **Step 4: Commit**

### Task 5: Docs + tests + verification

- [ ] Update docs/kiosk-cli.md.
- [ ] Run build + tests.
- [ ] Smoke test `kiosk update check` (network).
- [ ] Commit, push, PR.
