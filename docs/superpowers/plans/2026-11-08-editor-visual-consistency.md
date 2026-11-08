# Editor Visual Consistency Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the existing editor design direction consistently across the Frame Editor and integrated Frame Administration drawer without changing behavior or visual identity.

**Architecture:** Keep semantic color and surface tokens in `app/globals.css`, and add a small editor-scoped action primitive beside the existing editor controls. Update each owning editor component to use those shared treatments while leaving its state, event handlers, data flow, and the signage-rendering components intact.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, integrated browser QA.

---

## Context and implementation rules

Follow [Editor UI Visual Consistency Refinement](../specs/2026-11-08-editor-visual-consistency-design.md). The completed administration integration at `feat/editor-ui-redesign` is the starting point for this phase.

- Scope is the editor shell, top bar, rail, canvas controls, widget library, inspector, editor drawers and panels, dialogs, forms, notices, and the Frames, Conflicts, and Audit tabs.
- Keep the existing neutral light/dark palette, Inter and JetBrains Mono fonts, Lucide icons, canvas emphasis, and interaction patterns.
- Do not change data models, CRUD behavior, API contracts, state management, authorization, event handlers, widget rendering, or `/frame`, landing, sign-in/up, and other freestanding surfaces.
- Prefer shared editor utilities over changing global `components/ui` primitives. Those primitives are used by `components/frame-admin-gate.tsx`, which is outside this phase.
- Use semantic color tokens (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, and related values) rather than introducing a second palette or hard-coded surface colors.
- Vitest runs in Node without jsdom. Use focused source-contract tests for shared class conventions and existing functional tests for behavior, then validate rendered states in the browser.
- Do not inspect `.env.local`.
- Commit each task separately and include the required `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.

## File map

- `app/globals.css`: editor-scoped shared button and text treatments; retain existing semantic theme tokens and surface/control primitives.
- `components/editor/controls.tsx`: add the typed `EditorButton` primitive next to the existing `IconButton`, `Section`, and field controls.
- `components/editor/editor.tsx`: align the editor shell, rail, drawer, and drawer close action.
- `components/editor/top-bar.tsx`: align branding, layout-name field, and primary/secondary top-bar actions.
- `components/editor/canvas.tsx`: align canvas tool, guide, and selection controls without changing drag/drop or selection behavior.
- `components/editor/frame-switcher.tsx`: align frame selection and frame-editing form controls.
- `components/editor/preview-overlay.tsx`: align preview surface and its actions.
- `components/editor/inspector.tsx`, `components/editor/layout-settings.tsx`, and `components/editor/layers-panel.tsx`: align property sections, field labels, controls, and layer rows.
- `components/editor/layouts-panel.tsx`, `components/editor/library-panel.tsx`, `components/editor/albums-panel.tsx`, and `components/editor/album-detail.tsx`: align editor content cards, selection actions, search, empty states, and editing forms.
- `components/editor/fonts-panel.tsx`, `components/editor/schedule-panel.tsx`, `components/editor/notifications-panel.tsx`, and `components/editor/experiences-panel.tsx`: align specialized forms, action groups, status/empty states, and cards.
- `components/editor/frame-admin-panel.tsx` and `components/editor/frame-admin/{frames,conflicts,audit}-tab.tsx`: align administration tabs, cards, buttons, and feedback states.
- `tests/editor-visual-consistency.test.ts`: protect the editor-scoped shared styling contract without coupling tests to exact layout utility strings.
- Existing `tests/editor-shell.test.ts`, `tests/editor-theme.test.ts`, `tests/frame-admin-panel.test.ts`, and relevant panel/API tests: retain behavioral coverage.

## Task 1: Establish editor-scoped shared control styles

**Files:**
- Modify: `app/globals.css`
- Modify: `components/editor/controls.tsx`
- Create: `tests/editor-visual-consistency.test.ts`

- [ ] **Step 1: Add failing source-contract tests for the shared editor control API**

Create `tests/editor-visual-consistency.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const styles = readFileSync(path.join(root, 'app/globals.css'), 'utf8')
const controls = readFileSync(path.join(root, 'components/editor/controls.tsx'), 'utf8')

describe('editor visual system', () => {
  it('defines editor-scoped action variants and field focus treatment', () => {
    for (const selector of [
      '.editor-button',
      '.editor-button-primary',
      '.editor-button-secondary',
      '.editor-button-quiet',
      '.editor-button-destructive',
      '.editor-control:focus-visible',
      '.editor-icon-button',
    ]) {
      expect(styles).toContain(selector)
    }
  })

  it('exposes a typed EditorButton that composes the shared action styles', () => {
    expect(controls).toContain("export type EditorButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'")
    expect(controls).toContain('export function EditorButton')
    expect(controls).toContain('editor-button-${variant}')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails before implementation**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts
```

Expected: FAIL because the shared variants and `EditorButton` do not yet exist.

- [ ] **Step 3: Define editor-only semantic action styles**

In the `@layer components` section of `app/globals.css`, add these rules after `.editor-icon-button`. Keep all colors tied to the existing semantic tokens:

```css
.editor-button {
  @apply inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50;
}

.editor-button-primary {
  @apply bg-primary text-primary-foreground hover:bg-primary/90;
}

.editor-button-secondary {
  @apply border border-border bg-background text-foreground hover:bg-secondary;
}

.editor-button-quiet {
  @apply bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground;
}

.editor-button-destructive {
  @apply bg-destructive/10 text-destructive hover:bg-destructive/20;
}
```

Do not modify `:root`, `.dark`, or the system-theme tokens in this task.
Set the shared `.editor-control` minimum height to `min-h-9` and the shared `.editor-icon-button` hit area to `size-9` in the same CSS block. This gives fields and common actions a consistent 36px minimum target; explicitly compact controls may retain their current size only when the narrow layout requires it.

- [ ] **Step 4: Add the typed editor action primitive**

Import `type ButtonHTMLAttributes` from React and add the following next to `IconButton` in `components/editor/controls.tsx`:

```tsx
export type EditorButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'

export function EditorButton({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: EditorButtonVariant }) {
  return (
    <button
      {...props}
      className={cn('editor-button', `editor-button-${variant}`, className)}
    />
  )
}
```

The primitive must not add state or change any action's `onClick`, `type`, `disabled`, or accessible name.

- [ ] **Step 5: Run the new test and typecheck**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts
pnpm exec tsc --noEmit
```

Expected: the new source-contract test passes and TypeScript reports no errors.

- [ ] **Step 6: Commit the shared controls**

```bash
git add app/globals.css components/editor/controls.tsx tests/editor-visual-consistency.test.ts
git commit -m "refactor: define shared editor control styles" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Align the editor shell, top bar, canvas tools, and preview

**Files:**
- Modify: `components/editor/editor.tsx`
- Modify: `components/editor/top-bar.tsx`
- Modify: `components/editor/canvas.tsx`
- Modify: `components/editor/frame-switcher.tsx`
- Modify: `components/editor/preview-overlay.tsx`
- Modify: `tests/editor-visual-consistency.test.ts`
- Test: `tests/editor-shell.test.ts`

- [ ] **Step 1: Extend the source-contract test for shared shell actions**

Read each named component in full before changing it. Extend `tests/editor-visual-consistency.test.ts` to read the five shell files and verify that text actions use an `editor-button-*` variant and icon-only actions use `editor-icon-button` where those shared treatments fit. Assert that existing shell behavior remains wired by checking the established handlers: `onPreview`, `onSave`, `onExport`, `onToggleNight`, `toggleDrawer`, and the canvas drop/selection handlers.

- [ ] **Step 2: Run the focused tests to confirm the new usage assertions fail**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/editor-shell.test.ts
```

Expected: existing shell tests pass; the new shared-action assertions fail until the components are migrated.

- [ ] **Step 3: Standardize text actions without changing their handlers**

Use the shared variants for equivalent actions:

```tsx
<EditorButton type="button" variant="primary" onClick={onSave} disabled={saving || !dirty}>
  {saving ? 'Saving…' : 'Save'}
</EditorButton>
<EditorButton type="button" variant="secondary" onClick={onPreview}>
  <Play className="size-4" aria-hidden />
  <span>Preview</span>
</EditorButton>
<IconButton label="Undo" onClick={editor.undo} disabled={state.past.length === 0}>
  <Undo2 className="size-4" aria-hidden />
</IconButton>
```

Apply the same treatment to frame-switcher save/cancel actions, preview exit/action buttons, drawer controls, and canvas tool actions. Keep icon-only controls as `IconButton` with their existing accessible labels, `aria-pressed` values, and disabled states. Keep destructive actions in the destructive variant. Do not remove or rename any existing controls.

- [ ] **Step 4: Normalize shell spacing and responsive behavior**

Keep the current header height, rail width, canvas dimensions, drawer widths, and breakpoints. Standardize repeated header/action gaps and focus/hover treatments using the shared utilities; do not make the rail or drawer wider. Keep primary text actions and common icon actions at least 36px high/wide, while preserving compact rail spacing. Ensure the frame switcher, top-bar save/export controls, guide controls, and preview actions remain reachable at narrow widths.

- [ ] **Step 5: Run shell and shared-style tests**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/editor-shell.test.ts tests/editor-theme.test.ts
pnpm exec tsc --noEmit
```

Expected: tests pass; theme toggling, drawer focus/Escape behavior, widget drag/drop, and canvas event handlers remain unchanged.

- [ ] **Step 6: Commit the shell refinement**

```bash
git add components/editor/editor.tsx components/editor/top-bar.tsx components/editor/canvas.tsx components/editor/frame-switcher.tsx components/editor/preview-overlay.tsx tests/editor-visual-consistency.test.ts
git commit -m "style: align editor shell controls" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Align the inspector and layout/library panels

**Files:**
- Modify: `components/editor/controls.tsx`
- Modify: `components/editor/inspector.tsx`
- Modify: `components/editor/layout-settings.tsx`
- Modify: `components/editor/layers-panel.tsx`
- Modify: `components/editor/layouts-panel.tsx`
- Modify: `components/editor/library-panel.tsx`
- Modify: `tests/editor-visual-consistency.test.ts`
- Test: `tests/editor-shell.test.ts`, `tests/editor-library.test.ts`, and relevant inspector tests

- [ ] **Step 1: Add assertions for shared section and content-panel conventions**

Extend `tests/editor-visual-consistency.test.ts` to assert that `inspector.tsx` and `layout-settings.tsx` retain the shared `Section` layout, `layers-panel.tsx` and `layouts-panel.tsx` use shared action treatments for equivalent actions, and all applicable form fields use `editor-control`. Keep assertions about behavior handlers separate from visual classes.

- [ ] **Step 2: Run targeted tests before styling changes**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/editor-shell.test.ts tests/editor-library.test.ts tests/inspector-text-effects.test.ts
```

Expected: current behavioral coverage passes; new conventions fail only for components not yet migrated.

- [ ] **Step 3: Standardize inspector labels, fields, and section headers**

In `components/editor/controls.tsx`, retain existing field props and callbacks. Align `Section`, `SelectField`, `TimeField`, `NumberField`, `ColorField`, and `Segmented` around a consistent label scale, `editor-control` border/background/focus state, and spacing. Keep sliders, swatches, color pickers, toggles, and keyboard behaviors functionally unchanged.

Use this existing semantic field pattern for text, select, time, and number controls:

```tsx
<label className="text-sm font-medium text-foreground" htmlFor={id}>{label}</label>
<input id={id} className="editor-control w-full" />
<p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
```

Add a helper only where its repeated appearance justifies sharing; do not change widget-style values or editor state.

- [ ] **Step 4: Standardize layout, layer, and library surfaces**

Use semantic surfaces and the shared action variants for layout creation/selection, layer actions, widget-library presets, and empty states. Keep widget categories, search/filter logic, drag payloads, and add/delete handlers unchanged. Keep preview thumbnails at their existing sizes and preserve the 288px Widgets drawer width.

- [ ] **Step 5: Run the inspector/library regression tests**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/editor-shell.test.ts tests/editor-library.test.ts tests/inspector-text-effects.test.ts
pnpm exec tsc --noEmit
```

Expected: tests pass and no widget, inspector, or layout behavior changes.

- [ ] **Step 6: Commit the inspector and library refinement**

```bash
git add components/editor/controls.tsx components/editor/inspector.tsx components/editor/layout-settings.tsx components/editor/layers-panel.tsx components/editor/layouts-panel.tsx components/editor/library-panel.tsx tests/editor-visual-consistency.test.ts
git commit -m "style: align inspector and library panels" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Align content-management and specialized editor panels

**Files:**
- Modify: `components/editor/albums-panel.tsx`
- Modify: `components/editor/album-detail.tsx`
- Modify: `components/editor/fonts-panel.tsx`
- Modify: `components/editor/schedule-panel.tsx`
- Modify: `components/editor/notifications-panel.tsx`
- Modify: `components/editor/experiences-panel.tsx`
- Modify: `tests/editor-visual-consistency.test.ts`
- Test: existing album, schedule, notification, and experience tests

- [ ] **Step 1: Add panel-specific contract coverage**

Extend `tests/editor-visual-consistency.test.ts` to verify these six components use the shared editor action and field styles for equivalent actions and controls. Include assertions that submit, cancel, delete, reset, and save callbacks remain present; do not assert arbitrary utility-class sequences.

- [ ] **Step 2: Run relevant tests before styling**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/e2e-roundtrip.test.ts tests/e2e-sync.test.ts
```

Expected: existing functional tests pass and new panel-style assertions identify the unstandardized actions.

- [ ] **Step 3: Normalize cards, action groups, forms, and feedback states**

Use the shared button variants for equivalent primary, secondary, quiet, and destructive actions. Use `editor-control` for form fields and a consistent `Section` header/spacing pattern. Standardize loading, success, empty, warning, error, and disabled feedback with semantic status colors and text sizes. Keep notification lifecycle controls, schedule editing, album mutations, font loading, and experience state transitions unchanged.

- [ ] **Step 4: Validate behavior and types**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/e2e-roundtrip.test.ts tests/e2e-sync.test.ts
pnpm exec tsc --noEmit
```

Expected: selected tests and TypeScript pass.

- [ ] **Step 5: Commit the content-panel refinement**

```bash
git add components/editor/albums-panel.tsx components/editor/album-detail.tsx components/editor/fonts-panel.tsx components/editor/schedule-panel.tsx components/editor/notifications-panel.tsx components/editor/experiences-panel.tsx tests/editor-visual-consistency.test.ts
git commit -m "style: align editor management panels" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Align the integrated administration drawer

**Files:**
- Modify: `components/editor/frame-admin-panel.tsx`
- Modify: `components/editor/frame-admin/frames-tab.tsx`
- Modify: `components/editor/frame-admin/conflicts-tab.tsx`
- Modify: `components/editor/frame-admin/audit-tab.tsx`
- Modify: `tests/editor-visual-consistency.test.ts`
- Test: `tests/frame-admin-panel.test.ts`, `tests/frame-admin-api.test.ts`

- [ ] **Step 1: Extend visual contracts for all administration states**

Assert that tab navigation, frame cards, conflict rows, audit entries, action buttons, and loading/empty/error/unauthorized notices use the same editor-scoped conventions as the inspector and management panels. Preserve checks that responses are validated and that no token or conflict payload is rendered.

- [ ] **Step 2: Run admin tests before styling**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/frame-admin-panel.test.ts tests/frame-admin-api.test.ts
```

Expected: all existing admin behavior passes; any new visual convention assertions fail for components that have not yet adopted the shared styles.

- [ ] **Step 3: Standardize tab states, cards, and operation feedback**

Use shared button variants for issue, rotate, resolve, discard, and other equivalent operations. Retain the selected tab’s `aria-pressed` state, all labels, enrollment-code expiry display, existing error roles, and the distinction between empty and failed reads. Use consistent card borders, surface tokens, spacing, metadata typography, and focus styles.

- [ ] **Step 4: Run admin and access regression tests**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/frame-admin-panel.test.ts tests/frame-admin-api.test.ts tests/frame-admin-access.test.ts tests/console-route.test.ts
pnpm exec tsc --noEmit
```

Expected: all selected tests and TypeScript pass.

- [ ] **Step 5: Commit the administration refinement**

```bash
git add components/editor/frame-admin-panel.tsx components/editor/frame-admin/frames-tab.tsx components/editor/frame-admin/conflicts-tab.tsx components/editor/frame-admin/audit-tab.tsx tests/editor-visual-consistency.test.ts
git commit -m "style: align frame administration panels" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Verify the full editor and administration experience

**Files:**
- Modify only if validation finds a visual regression or a behavior regression caused by this phase.

- [ ] **Step 1: Run all targeted functional and visual-contract tests**

Run:

```bash
pnpm exec vitest run tests/editor-visual-consistency.test.ts tests/editor-shell.test.ts tests/editor-theme.test.ts tests/editor-library.test.ts tests/inspector-text-effects.test.ts tests/frame-admin-panel.test.ts tests/frame-admin-api.test.ts tests/frame-admin-access.test.ts tests/console-route.test.ts tests/enroll-api.test.ts tests/console-actor.test.ts
pnpm exec tsc --noEmit
```

Expected: all selected tests and TypeScript pass.

- [ ] **Step 2: Run the full suite and production build**

Run:

```bash
pnpm test
pnpm build
```

Record exact results. The known `tests/proxy-gate.test.ts` 401-vs-200 failure is unrelated to visual styling; do not weaken authorization to make it pass. Keep unrelated build warnings separate from regressions.

- [ ] **Step 3: Compare rendered controls at desktop, tablet, and narrow portrait widths**

Use the integrated browser against the isolated QA setup:

1. At desktop width, compare top-bar actions, rail controls, inspector fields, cards, and all three admin tabs for consistent dimensions, typography, borders, radii, and focus/hover states.
2. At tablet width, check the open drawer and inspector controls for clipping and overlap.
3. At 390px and 320px widths, check that the rail, widget library, panel actions, and Frames/Conflicts/Audit content remain reachable without horizontal overflow.
4. Toggle light and dark themes; confirm both remain legible and the preference persists after reload.
5. Verify widget category filtering, search, drag/click add, editor selection, save, drawer close/Escape, conflict actions, and enrollment-code actions still work.
6. Confirm unauthorized visitors still cannot reach the Frames drawer and `/console` remains protected.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git status --short
```

Confirm only the editor and integrated administration surfaces changed. Do not include generated files, environment files, or unrelated worktree changes.

- [ ] **Step 5: Commit any final corrections**

If browser validation finds a defect, fix only the relevant editor/admin component, rerun its focused test and TypeScript, then commit with a descriptive style message and the required Co-authored-by trailer.

## Completion criteria

- Equivalent editor and administration controls share consistent sizing, typography, spacing, borders, focus, hover, active, disabled, and loading treatments.
- Existing color tokens, light/dark theme behavior, widget hierarchy, data flows, handlers, and authorization remain intact.
- No clipping or unintended horizontal overflow appears at desktop, tablet, or narrow portrait sizes.
- Focused tests, TypeScript, production build, and the full suite are reported with exact outcomes; known unrelated failures remain clearly identified.
