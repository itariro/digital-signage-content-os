# Frame Administration Sidebar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the authorized Frame Console workflows into a three-tab editor sidebar drawer while retaining existing editor and server-side authorization behavior.

**Architecture:** Keep `Editor` as the client-side navigation owner, with a server-derived `canManageFrames` capability and a query-driven initial drawer state. The Frames, Conflicts, and Audit tabs load small DTOs through independently authorized read endpoints and use existing protected mutation endpoints. `/console` remains protected and redirects to the editor with Frames selected.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Clerk, Drizzle, Tailwind CSS 4, Vitest.

---

## Context and implementation rules

Follow [Frame Administration Sidebar Integration](../specs/2026-11-08-frame-admin-sidebar-integration-design.md). The subsequent [Editor UI Visual Consistency Refinement](../specs/2026-11-08-editor-visual-consistency-design.md) is a separate phase and follows this implementation.

The current console is `app/console/page.tsx`. It lists instances through `listInstanceCards`, issues enrollment codes with `POST /api/instances`, shows open/rejected conflicts, resolves conflicts through `POST /api/sync/conflicts/[id]/resolve`, and lists 20 audit entries. The API layer already has `resolveActor`, which supports Clerk operators and the automation token while enforcing `CONSOLE_ADMIN_ROLE` when configured. `Editor` is client-side and currently accepts `initialStore`, `frameId`, and `singleFrame`.

Do not pass authorization through query strings or trust client visibility as access control. Do not return device tokens or conflict payloads to the browser. The browser may receive the one-time enrollment code only in the successful issue/rotate response. Preserve the current conflict resolution values and behavior, including the tightly scoped correction that allows rejected conflicts to use the existing discard action. Failed network requests must produce an explicit error state, not an empty list.

Vitest uses the Node environment without jsdom. Use API-handler tests and pure helper/source-contract tests for unit coverage, then use browser QA for actual interaction. Before editing route or layout behavior, consult the installed Next.js 16 guides under `node_modules/next/dist/docs/`. Never inspect, print, or copy `.env.local`.

## File map

- `lib/console/admin-types.ts`: serializable response shapes for conflict and audit lists.
- `lib/console/access.ts`: pure helper for deriving console visibility from signed-in and optional-role results.
- `app/api/sync/conflicts/route.ts`: authorized, no-store list of open/rejected conflict summaries without payloads.
- `app/api/audit/route.ts`: authorized, no-store list of the 20 most recent audit summaries.
- `app/api/sync/conflicts/[id]/resolve/route.ts`: admit the existing `discard` form action while preserving service-level rejected-status enforcement.
- `app/page.tsx`: derive the capability from the Clerk session, parse `panel=frames`, and pass both values to `Editor`.
- `app/console/page.tsx`: preserve the authorization gate and redirect to `/?panel=frames`.
- `components/editor/editor.tsx`: conditionally add the Frames rail item and `frames` drawer state.
- `components/editor/frame-admin-panel.tsx`: own the three-button tab selection and render the active section.
- `components/editor/frame-admin/frames-tab.tsx`: load instance cards and handle enrollment-code issue and rotation.
- `components/editor/frame-admin/conflicts-tab.tsx`: load open/rejected conflicts and preserve resolve/discard actions.
- `components/editor/frame-admin/audit-tab.tsx`: load and render recent activity.
- `components/console/AddFrame.tsx`: remove the old page-only UI after moving its workflow.
- `tests/frame-admin-api.test.ts`: cover authorized/unauthorized reads, DTO filtering, no-store behavior, and rejected-only discard.
- `tests/frame-admin-access.test.ts`: cover optional-role visibility and server-derived editor capability/deep-link wiring.
- `tests/frame-admin-panel.test.ts`: source-contract tests for tabs, endpoints, and explicit UI states.
- `tests/console-route.test.ts`: cover authorization before redirect and redirect destination.
- `tests/editor-shell.test.ts`: assert the Frames rail is conditional and existing editor rail functions remain.
- `tests/enroll-api.test.ts`: retain existing issue/rotate API coverage.

## Task 1: Add protected read APIs and fix rejected-conflict discard validation

**Files:**
- Create: `lib/console/admin-types.ts`
- Create: `app/api/sync/conflicts/route.ts`
- Create: `app/api/audit/route.ts`
- Modify: `app/api/sync/conflicts/[id]/resolve/route.ts`
- Create: `tests/frame-admin-api.test.ts`

- [ ] **Step 1: Define browser-safe response DTOs**

Create `lib/console/admin-types.ts`:

```ts
export type AdminConflict = {
  id: string
  instanceId: string
  entityType: string
  entityId: string
  localRevision: number
  remoteRevision: number
  status: 'open' | 'rejected'
  createdAt: string | null
}

export type AdminAuditEntry = {
  id: string
  actor: string
  action: string
  targetType: string
  targetId: string
  createdAt: string | null
}
```

Keep local/remote payloads, enrollment codes, and device tokens out of these DTOs.

- [ ] **Step 2: Write failing API and discard tests**

Create `tests/frame-admin-api.test.ts`. Follow the in-memory SQLite setup in `tests/console-actor.test.ts`: clear `DATABASE_URL`, set `FRAME_DB_PATH=':memory:'`, set a test data directory, reset the SQLite database, and run migrations. Restore environment overrides after each test.

With `NODE_ENV='production'` and no `CONSOLE_ADMIN_TOKEN` header, call each new GET handler and assert status 401. With `x-admin-token` matching `CONSOLE_ADMIN_TOKEN`, seed one open conflict, one rejected conflict, one resolved conflict, and one audit row. Assert the conflict response includes only open/rejected summaries; audit summaries omit `details`; both responses set `cache-control: no-store`.

Also POST `resolution=discard` to the existing resolve handler with an authorized token. Assert a rejected conflict returns 200 and changes to `discarded`, while an open conflict returns 404 and remains `open`.

- [ ] **Step 3: Run tests and verify the current failures**

Run:

```bash
pnpm exec vitest run tests/frame-admin-api.test.ts
```

Expected: FAIL because the new GET routes are missing and the existing resolve route rejects `discard` with status 400.

- [ ] **Step 4: Implement the protected conflict list**

Create `app/api/sync/conflicts/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import type { AdminConflict } from '@/lib/console/admin-types'
import { resolveActor } from '@/lib/http-auth'
import { listConflicts } from '@/lib/sync/conflicts'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.reason },
      {
        status: outcome.reason === 'misconfigured' ? 500 : 401,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }

  const rows = await listConflicts()
  const conflicts: AdminConflict[] = rows
    .filter((row) => row.status === 'open' || row.status === 'rejected')
    .map(({ id, instanceId, entityType, entityId, localRevision, remoteRevision, status, createdAt }) => ({
      id,
      instanceId,
      entityType,
      entityId,
      localRevision,
      remoteRevision,
      status,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    }))

  return NextResponse.json({ conflicts }, { headers: { 'Cache-Control': 'no-store' } })
}
```

Keep `resolveActor` as the gate. Do not catch database failures and return a success-shaped empty list.

- [ ] **Step 5: Implement the protected audit list**

Create `app/api/audit/route.ts`. Resolve the actor first using the same 401/500 and `Cache-Control: no-store` behavior as the conflict endpoint. Call `listAudit(20)` only after authorization. Map each row to `AdminAuditEntry` using `id`, `actor`, `action`, `targetType`, `targetId`, and ISO `createdAt`; return `{ entries }`. Do not include `details`.

- [ ] **Step 6: Allow rejected-conflict discard through route validation**

In `app/api/sync/conflicts/[id]/resolve/route.ts`, change the schema to:

```ts
const resolutionSchema = z.enum(['local', 'remote', 'discard'])
```

Keep the actor gate, `resolveConflict`, and audit call unchanged. The service discards only rejected conflicts and returns `null` for an open-conflict discard, which the route continues to report as 404.

- [ ] **Step 7: Run focused API tests**

Run:

```bash
pnpm exec vitest run tests/frame-admin-api.test.ts tests/console-actor.test.ts tests/enroll-api.test.ts
```

Expected: selected tests pass, including device-token rejection, one-time enrollment responses, and rejected-only discard behavior.

## Task 2: Derive authorization and preserve the console URL

**Files:**
- Create: `lib/console/access.ts`
- Modify: `app/page.tsx`
- Modify: `app/console/page.tsx`
- Create: `tests/frame-admin-access.test.ts`
- Create: `tests/console-route.test.ts`

- [ ] **Step 1: Write failing role-visibility tests**

Create `tests/frame-admin-access.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canManageFrames } from '@/lib/console/access'

describe('frame administration visibility', () => {
  it('requires a signed-in user', () => {
    expect(canManageFrames({ signedIn: false, roleConfigured: false, hasRole: false })).toBe(false)
  })

  it('allows a signed-in user when no console role is configured', () => {
    expect(canManageFrames({ signedIn: true, roleConfigured: false, hasRole: false })).toBe(true)
  })

  it('requires the configured console role', () => {
    expect(canManageFrames({ signedIn: true, roleConfigured: true, hasRole: true })).toBe(true)
    expect(canManageFrames({ signedIn: true, roleConfigured: true, hasRole: false })).toBe(false)
  })
})
```

Add a source-contract assertion that `app/page.tsx` supplies the server-derived result to `Editor` and forwards the initial Frames drawer only when the capability is true.

- [ ] **Step 2: Run the tests and verify the missing helper fails**

Run:

```bash
pnpm exec vitest run tests/frame-admin-access.test.ts
```

Expected: FAIL because `lib/console/access.ts` does not exist.

- [ ] **Step 3: Implement the access helper**

Create `lib/console/access.ts`:

```ts
export function canManageFrames(input: {
  signedIn: boolean
  roleConfigured: boolean
  hasRole: boolean
}): boolean {
  return input.signedIn && (!input.roleConfigured || input.hasRole)
}
```

- [ ] **Step 4: Derive access and deep-link state in the root page**

Update the root `Page` props to accept `searchParams: Promise<{ frame?: string; panel?: string }>` while preserving the existing `frame` behavior. When Clerk is configured, get `userId` and `has` from `auth()` and return the existing `Hero` for signed-out requests. Derive visibility:

```ts
const role = process.env.CONSOLE_ADMIN_ROLE
const canManageFrames = canManageFramesForUser({
  signedIn: Boolean(userId),
  roleConfigured: Boolean(role),
  hasRole: role ? has({ role: role as OrganizationCustomRoleKey }) : false,
})
```

Import the helper as `canManageFramesForUser`. When Clerk is not configured, use `false`. Accept only `panel === 'frames' && canManageFrames` as an initial drawer request. Pass `canManageFrames` and `initialPanel` to `Editor`. An unauthorized `?panel=frames` must leave the drawer closed.

- [ ] **Step 5: Test `/console` protection before redirect**

Create `tests/console-route.test.ts` with mocks for `@clerk/nextjs/server` and `next/navigation`. Assert that the page awaits the configured role-aware `auth.protect` before calling `redirect('/?panel=frames')`. Assert that a rejected `auth.protect` prevents the redirect. Keep the test isolated from database reads.

- [ ] **Step 6: Replace the old console rendering with the protected redirect**

Replace `app/console/page.tsx` with:

```tsx
import { auth } from '@clerk/nextjs/server'
import type { OrganizationCustomRoleKey } from '@clerk/shared/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  const role = process.env.CONSOLE_ADMIN_ROLE
  await auth.protect((has) => (role ? has({ role: role as OrganizationCustomRoleKey }) : true))
  redirect('/?panel=frames')
}
```

Keep the existing `/console` middleware gate in `proxy.ts` as defense in depth. Remove page-only list components and the `AddFrame` import; retain the API endpoints.

- [ ] **Step 7: Run access and redirect tests**

Run:

```bash
pnpm exec vitest run tests/frame-admin-access.test.ts tests/console-route.test.ts tests/proxy-gate.test.ts
```

Expected: new tests pass. If the known `proxy-gate.test.ts` expectation still fails with 401 instead of 200, record that pre-existing failure; do not weaken the gate.

## Task 3: Add the authorized Frames rail entry

**Files:**
- Modify: `components/editor/editor.tsx`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/frame-admin-access.test.ts`

- [ ] **Step 1: Specify the conditional rail entry**

Extend `tests/editor-shell.test.ts` to assert that the editor supports a `frames` drawer and a Frames rail entry gated by `canManageFrames`, while retaining all existing rail IDs and controls. Assert that the admin panel renders only inside the existing drawer and that the canvas, inspector, and current editor sections remain mounted.

- [ ] **Step 2: Extend Editor props and initialize the drawer safely**

Extend `Editor` props:

```ts
{
  initialStore: FrameStore
  frameId?: string
  singleFrame?: boolean
  canManageFrames?: boolean
  initialPanel?: 'frames' | null
}
```

Default `canManageFrames` to `false`. Extend `PanelId` and `DrawerId` with `'frames'`. Initialize the drawer fail-closed:

```ts
const [activeDrawer, setActiveDrawer] = useState<DrawerId | null>(() =>
  canManageFrames && initialPanel === 'frames' ? 'frames' : null,
)
```

Add `frames` to `drawerTitle` as “Frame administration”; keep other drawer titles and focus restoration unchanged.

- [ ] **Step 3: Render the authorized Frames rail button**

Add a rail button named “Frames” adjacent to the existing editor rail entries, rendered only when `canManageFrames` is true. Set `aria-expanded` from `activeDrawer === 'frames'`, keep `aria-controls="editor-drawer"`, and use the same accessible focus/hover/open styles as the existing buttons. Use an existing suitable Lucide display icon; do not add a dependency.

- [ ] **Step 4: Run shell and access tests**

Run:

```bash
pnpm exec vitest run tests/editor-shell.test.ts tests/frame-admin-access.test.ts
```

Expected: all existing rail IDs remain, the new entry is conditional, and the canvas and inspector remain mounted.

## Task 4: Implement the three administration tabs

**Files:**
- Create: `components/editor/frame-admin-panel.tsx`
- Create: `components/editor/frame-admin/frames-tab.tsx`
- Create: `components/editor/frame-admin/conflicts-tab.tsx`
- Create: `components/editor/frame-admin/audit-tab.tsx`
- Modify: `components/editor/editor.tsx`
- Create: `tests/frame-admin-panel.test.ts`
- Delete: `components/console/AddFrame.tsx`

- [ ] **Step 1: Write admin panel contract tests**

Create `tests/frame-admin-panel.test.ts` following the existing source-contract pattern. Assert the panel defines `AdminTab = 'frames' | 'conflicts' | 'audit'`, renders three keyboard-operable buttons with an active state, and mounts the selected section. Assert:

```ts
expect(framesSource).toContain("fetch('/api/instances'")
expect(framesSource).toContain('/rotate')
expect(framesSource).toContain('kiosk-ctl enroll')
expect(conflictsSource).toContain("fetch('/api/sync/conflicts'")
expect(conflictsSource).toContain('/resolve')
expect(auditSource).toContain("fetch('/api/audit'")
```

Assert every tab has distinguishable loading, empty, request-error, and unauthorized states. Assert a successful conflict action refreshes or removes the row. Avoid checking arbitrary utility classes.

- [ ] **Step 2: Run the panel tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/frame-admin-panel.test.ts
```

Expected: FAIL because the tab modules do not exist.

- [ ] **Step 3: Implement the tab container**

Create `frame-admin-panel.tsx` with three native buttons labeled Frames, Conflicts, and Audit. Use `role="group"` with an accessible label and `aria-pressed` instead of ARIA `tab` roles; this provides native keyboard operation without an incomplete tab keyboard model. Default to Frames and mount only the selected tab so its data is loaded when selected.

- [ ] **Step 4: Implement the Frames tab**

In `frames-tab.tsx`, fetch `GET /api/instances` with `cache: 'no-store'` and `credentials: 'same-origin'`; validate the response shape before rendering. Add “Issue enrollment code” using `POST /api/instances` with JSON `{}`. Add “Rotate code” on each instance using `POST /api/instances/${encodeURIComponent(instanceId)}/rotate` with JSON `{}`.

On successful issue/rotation, show the instance ID, one-time code, expiry, and `sudo kiosk-ctl enroll ${window.location.origin} ${enrollmentCode}`. Keep the returned code only in the current result view; do not persist it. Display instance ID, associated frame name, revision, created/updated, and last-seen values. Provide explicit initial-loading, empty, request-error, and expired/unauthorized states. Disable the in-flight action and surface the result or error; never convert a failed request to an empty list.

- [ ] **Step 5: Implement the Conflicts tab**

In `conflicts-tab.tsx`, fetch `GET /api/sync/conflicts` with `cache: 'no-store'`. Render open and rejected conflict details without payloads. For open conflicts, submit `remote` and `local` as `FormData` to `/api/sync/conflicts/${encodeURIComponent(id)}/resolve`; for rejected conflicts submit `discard`. On success, refresh the list. Keep per-row busy/error feedback and explicit loading, empty, unauthorized, and request-error states.

- [ ] **Step 6: Implement the Audit tab**

In `audit-tab.tsx`, fetch `GET /api/audit` with `cache: 'no-store'`. Display up to 20 returned rows with timestamp, actor, action, and target. Provide separate loading, empty, unauthorized, and request-error states. Do not use `catch(() => [])`.

- [ ] **Step 7: Mount the panel and remove the duplicate console-only component**

In `Editor`, render `<FrameAdminPanel />` only when `canManageFrames && activeDrawer === 'frames'`. Keep the shared drawer header, close action, focus restoration, Escape behavior, and other drawer children unchanged. Delete `components/console/AddFrame.tsx`, which is only used by the page being replaced.

- [ ] **Step 8: Run panel and existing API tests**

Run:

```bash
pnpm exec vitest run tests/frame-admin-panel.test.ts tests/editor-shell.test.ts tests/enroll-api.test.ts tests/console-actor.test.ts tests/frame-admin-api.test.ts
```

Expected: panel contracts pass and existing enrollment, operator authorization, and rejected-discard tests pass.

## Task 5: Verify the full phase and browser workflows

**Files:**
- Modify only if validation finds a defect in the files above.

- [ ] **Step 1: Run focused tests and TypeScript**

Run:

```bash
pnpm exec vitest run tests/frame-admin-api.test.ts tests/frame-admin-access.test.ts tests/frame-admin-panel.test.ts tests/console-route.test.ts tests/editor-shell.test.ts tests/enroll-api.test.ts tests/console-actor.test.ts
pnpm exec tsc --noEmit
```

Expected: selected tests and TypeScript pass.

- [ ] **Step 2: Run the full tests and production build**

Run:

```bash
pnpm test
pnpm build
```

Report exact outcomes. A known existing `proxy-gate.test.ts` expectation may fail with 401 instead of 200. A previous worktree build compiled and passed TypeScript but failed prerendering `/_global-error` and `/_not-found` with a null `useContext` error and emitted filesystem-tracing warnings. Recheck on this branch, isolate regressions from baseline, and do not fold unrelated fixes into this feature.

- [ ] **Step 3: Verify browser behavior at desktop, tablet, and portrait widths**

With the editor running and an authorized isolated QA session:

1. Confirm the Frames entry is visible to an authorized console user and absent for a signed-in user lacking the configured role.
2. Open and close the drawer; confirm focus restoration and Escape behavior.
3. Confirm `/?panel=frames` opens Frames and `/console` redirects there after authorization.
4. Issue a code, verify its command/expiry, rotate an existing instance code, and confirm the secret is not present in instance-list data.
5. Resolve open conflicts as remote and local; discard a rejected conflict; confirm each action updates the list and an open conflict cannot be discarded.
6. Load the Audit tab and verify the 20-row limit and explicit empty/error states.
7. Test expired authorization and a simulated network failure; verify neither appears as an empty successful list.
8. Recheck widget, inspector, canvas, and other editor-panel navigation.

- [ ] **Step 4: Commit the phase**

After review and validation, stage only these paths and their tests, including the removed legacy component:

```bash
git add -A -- app/page.tsx app/console/page.tsx app/api/sync/conflicts/route.ts app/api/audit/route.ts 'app/api/sync/conflicts/[id]/resolve/route.ts' lib/console/access.ts lib/console/admin-types.ts components/editor/editor.tsx components/editor/frame-admin-panel.tsx components/editor/frame-admin components/console/AddFrame.tsx tests/frame-admin-api.test.ts tests/frame-admin-access.test.ts tests/frame-admin-panel.test.ts tests/console-route.test.ts tests/editor-shell.test.ts
git commit -m "feat: move frame administration into editor sidebar" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Do not push or create a PR unless explicitly requested. Once this phase is accepted, prepare the separate implementation plan for [Editor UI Visual Consistency Refinement](../specs/2026-11-08-editor-visual-consistency-design.md).
