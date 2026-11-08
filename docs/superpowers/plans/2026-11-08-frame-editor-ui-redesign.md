# Frame Editor UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the editor as a reference-led workspace with persistent theme choice and a complete widget-library overlay while preserving all current editor workflows.

**Architecture:** Keep editor state, persistence, widget definitions, and drag payloads intact. Refine the shared editor tokens and controls, expose existing panels through a compact rail and canvas overlays, and connect the existing library content to a searchable Widgets panel. The design is Phase 1 only; console, display, landing, and auth screens remain for separately scoped phases.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, lucide-react.

---

## Context and implementation rules

The approved design is [the Frame Editor UI Redesign spec](../specs/2026-11-08-frame-editor-ui-redesign-design.md). The reference uses white surfaces, fine neutral dividers, charcoal labels, restrained blue active states, compact controls, and subtle floating shadows. Keep the existing Inter and JetBrains Mono fonts and Lucide icons.

The editor currently has a left rail plus permanently docked panel, a center canvas with a bottom `WidgetToolbar`, and a right `Inspector`. `LibraryPanel` already renders widgets, combinations, stickers, and saved presets, but it is not mounted by `Editor`. `WidgetToolbar` is a distinct quick-add surface with search, category chips, composition guides, and Night preview; keep it.

Vitest uses the Node environment and has no jsdom or React Testing Library. Follow the established source-contract and pure-helper testing pattern in `tests/widget-toolbar.test.ts`, and use browser interaction checks for mounted UI behavior. Before editing Next.js layout behavior, read the installed Next.js 16 docs under `node_modules/next/dist/docs/` for the relevant layout, client-component, and script guidance.

## File map

- `lib/editor-theme.ts`: pure theme preference parsing/resolution shared by the toggle and tests.
- `lib/editor-library.ts`: pure library search and widget-category matching helpers.
- `app/globals.css`: light/dark theme tokens and reusable editor surface, section, field, and icon-control treatments.
- `app/layout.tsx`: remove the hard-coded dark class while preserving font variables and providers.
- `components/editor/top-bar.tsx`: initialize theme from browser preference, react to OS changes until overridden, persist an explicit choice, and style the top bar and toggle.
- `components/editor/editor.tsx`: replace permanent left panel with rail-controlled overlays, keep the canvas and inspector composition, add the narrow-screen Properties affordance, and close panels on Escape.
- `components/editor/library-panel.tsx`: add global search and widget category filters while retaining all existing widget, combination, sticker, and preset content/actions.
- `components/editor/widget-toolbar.tsx`: apply shared visual treatment without changing its quick-add and guide behavior.
- `components/editor/controls.tsx`, `components/editor/inspector.tsx`, `components/editor/layout-settings.tsx`, `components/editor/layers-panel.tsx`, `components/editor/layouts-panel.tsx`, `components/editor/albums-panel.tsx`, `components/editor/album-detail.tsx`, `components/editor/fonts-panel.tsx`, `components/editor/schedule-panel.tsx`, `components/editor/experiences-panel.tsx`, `components/editor/notifications-panel.tsx`, `components/editor/frame-switcher.tsx`, and `components/editor/preview-overlay.tsx`: apply the shared visual conventions while preserving each panel's interactions and content.
- `tests/editor-theme.test.ts`: test theme preference parsing and system fallback.
- `tests/editor-library.test.ts`: test case-insensitive search and category filtering against real widget definitions.
- `tests/editor-shell.test.ts`: source-contract tests for rail entries, overlays, focus/escape, and responsive Properties access.

## Task 1: Add explicit theme preference behavior

**Files:**
- Create: `lib/editor-theme.ts`
- Create: `tests/editor-theme.test.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `components/editor/top-bar.tsx`

- [ ] **Step 1: Write theme resolution tests**

Create `tests/editor-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveEditorTheme, storedEditorTheme } from '@/lib/editor-theme'

describe('editor theme preference', () => {
  it('accepts only explicit light and dark preferences', () => {
    expect(storedEditorTheme('light')).toBe('light')
    expect(storedEditorTheme('dark')).toBe('dark')
    expect(storedEditorTheme(null)).toBeNull()
    expect(storedEditorTheme('system')).toBeNull()
    expect(storedEditorTheme('')).toBeNull()
  })

  it('uses the saved preference before the operating-system preference', () => {
    expect(resolveEditorTheme('light', true)).toBe('light')
    expect(resolveEditorTheme('dark', false)).toBe('dark')
  })

  it('uses the operating-system preference when there is no saved choice', () => {
    expect(resolveEditorTheme(null, true)).toBe('dark')
    expect(resolveEditorTheme(null, false)).toBe('light')
    expect(resolveEditorTheme('invalid', true)).toBe('dark')
  })
})
```

- [ ] **Step 2: Run the tests and verify the missing helper fails**

Run: `pnpm exec vitest run tests/editor-theme.test.ts`

Expected: FAIL because `lib/editor-theme.ts` has not been created.

- [ ] **Step 3: Add the typed pure preference helpers**

Create `lib/editor-theme.ts`:

```ts
export type EditorTheme = 'light' | 'dark'

export const EDITOR_THEME_STORAGE_KEY = 'mural-editor-theme'

export function storedEditorTheme(value: string | null): EditorTheme | null {
  return value === 'light' || value === 'dark' ? value : null
}

export function resolveEditorTheme(value: string | null, systemPrefersDark: boolean): EditorTheme {
  return storedEditorTheme(value) ?? (systemPrefersDark ? 'dark' : 'light')
}
```

- [ ] **Step 4: Add the reference palette and system-dark fallback**

In `app/globals.css`, retain the current semantic token names and replace the light `:root` palette values with these reference-led values:

```css
:root,
.light {
  color-scheme: light;
  --background: #ffffff;
  --foreground: #20252b;
  --card: #ffffff;
  --card-foreground: #20252b;
  --popover: #ffffff;
  --popover-foreground: #20252b;
  --primary: #2678ed;
  --primary-foreground: #ffffff;
  --secondary: #f4f5f7;
  --secondary-foreground: #252a31;
  --muted: #f4f5f7;
  --muted-foreground: #69717d;
  --accent: #edf4ff;
  --accent-foreground: #20252b;
  --destructive: #dc3d4b;
  --border: #e5e8ec;
  --input: #dfe3e8;
  --ring: #80b4ff;
  --chart-1: #2678ed;
  --chart-2: #69717d;
  --chart-3: #8d96a3;
  --chart-4: #b1b8c2;
  --chart-5: #d3d8df;
  --radius: 0.375rem;
  --sidebar: #fbfbfc;
  --sidebar-foreground: #20252b;
  --sidebar-primary: #2678ed;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #edf4ff;
  --sidebar-accent-foreground: #20252b;
  --sidebar-border: #e5e8ec;
  --sidebar-ring: #80b4ff;
}
```

Keep the current semantic chart tokens. Replace `.dark` with the dark palette below. Duplicate the same declarations inside the media query for the OS-default case; this lets CSS honor the OS before React runs without overriding explicit `.light` or `.dark` classes:

```css
.dark {
  color-scheme: dark;
  --background: #191b1f;
  --foreground: #f0f2f5;
  --card: #202329;
  --card-foreground: #f0f2f5;
  --popover: #25282e;
  --popover-foreground: #f0f2f5;
  --primary: #67a5ff;
  --primary-foreground: #101923;
  --secondary: #2b2f36;
  --secondary-foreground: #f0f2f5;
  --muted: #25282e;
  --muted-foreground: #a0a7b2;
  --accent: #26364c;
  --accent-foreground: #f0f2f5;
  --destructive: #ff6977;
  --border: #383d46;
  --input: #454b55;
  --ring: #67a5ff;
  --chart-1: #67a5ff;
  --chart-2: #a0a7b2;
  --chart-3: #7d8692;
  --chart-4: #5b626d;
  --chart-5: #383d46;
  --sidebar: #202329;
  --sidebar-foreground: #f0f2f5;
  --sidebar-primary: #67a5ff;
  --sidebar-primary-foreground: #101923;
  --sidebar-accent: #26364c;
  --sidebar-accent-foreground: #f0f2f5;
  --sidebar-border: #383d46;
  --sidebar-ring: #67a5ff;
}

@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.dark) {
    color-scheme: dark;
    --background: #191b1f;
    --foreground: #f0f2f5;
    --card: #202329;
    --card-foreground: #f0f2f5;
    --popover: #25282e;
    --popover-foreground: #f0f2f5;
    --primary: #67a5ff;
    --primary-foreground: #101923;
    --secondary: #2b2f36;
    --secondary-foreground: #f0f2f5;
    --muted: #25282e;
    --muted-foreground: #a0a7b2;
    --accent: #26364c;
    --accent-foreground: #f0f2f5;
    --destructive: #ff6977;
    --border: #383d46;
    --input: #454b55;
    --ring: #67a5ff;
    --chart-1: #67a5ff;
    --chart-2: #a0a7b2;
    --chart-3: #7d8692;
    --chart-4: #5b626d;
    --chart-5: #383d46;
    --sidebar: #202329;
    --sidebar-foreground: #f0f2f5;
    --sidebar-primary: #67a5ff;
    --sidebar-primary-foreground: #101923;
    --sidebar-accent: #26364c;
    --sidebar-accent-foreground: #f0f2f5;
    --sidebar-border: #383d46;
    --sidebar-ring: #67a5ff;
  }
}
```

The chart values in the snippets retain the chart token names while making their contrast appropriate to each theme. Keep the existing `@theme inline` font mappings. In `app/layout.tsx`, remove only the hard-coded `dark` class from `<html>` while retaining `bg-background`, all font variables, and providers.

- [ ] **Step 5: Run theme tests and type checking**

Run:

```bash
pnpm exec vitest run tests/editor-theme.test.ts
pnpm exec tsc --noEmit
```

Expected: all three theme tests pass and TypeScript reports no errors.

- [ ] **Step 6: Implement browser-local theme synchronization**

Update `ThemeToggle` in `components/editor/top-bar.tsx` so it:

1. Reads `EDITOR_THEME_STORAGE_KEY` and `matchMedia('(prefers-color-scheme: dark)')` after mount.
2. Calls `resolveEditorTheme` and applies an explicit `.light` or `.dark` class to `<html>`.
3. Listens for `MediaQueryList` changes only while no valid stored preference exists; remove the listener on unmount.
4. On user toggle, update the class and React state, then persist exactly `'light'` or `'dark'`.
5. Reports storage read/write failures through the existing Sonner toast API rather than silently pretending persistence succeeded.
6. Keeps the existing accessible label/title in sync with the current theme and keeps the toggle available from the rail.

Initialize component state as `null` so server rendering does not assume a theme. While it is `null`, render a non-interactive placeholder with the same `size-8` dimensions. On mount, resolve the theme, apply the root class, and render the sun/moon action. Do not initialize state as dark or force dark on the root layout.

Import `EditorTheme`, `EDITOR_THEME_STORAGE_KEY`, `resolveEditorTheme`, and `storedEditorTheme` from `@/lib/editor-theme`; import `toast` from `sonner`; and add `useRef` to the React imports.

Use this synchronization shape, adapting only the toast message and existing button markup:

```tsx
const [theme, setTheme] = useState<EditorTheme | null>(null)
const explicitPreference = useRef(false)

useEffect(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let saved: EditorTheme | null = null
  try {
    saved = storedEditorTheme(window.localStorage.getItem(EDITOR_THEME_STORAGE_KEY))
  } catch {
    toast.error('Could not read the saved theme preference')
  }
  explicitPreference.current = saved !== null
  const apply = (next: EditorTheme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.classList.toggle('light', next === 'light')
    setTheme(next)
  }
  apply(resolveEditorTheme(saved, media.matches))
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (!explicitPreference.current) apply(event.matches ? 'dark' : 'light')
  }
  media.addEventListener('change', onSystemChange)
  return () => media.removeEventListener('change', onSystemChange)
}, [])

function toggleTheme() {
  if (theme === null) return
  const next: EditorTheme = theme === 'dark' ? 'light' : 'dark'
  explicitPreference.current = true
  document.documentElement.classList.toggle('dark', next === 'dark')
  document.documentElement.classList.toggle('light', next === 'light')
  setTheme(next)
  try {
    window.localStorage.setItem(EDITOR_THEME_STORAGE_KEY, next)
  } catch {
    toast.error('Theme changed, but could not be saved in this browser')
  }
}
```

- [ ] **Step 7: Verify the theme toggle in a browser**

Run: `pnpm dev`

Open the editor in a browser. Verify light and dark OS settings with cleared local storage, toggle each mode, reload, and confirm the explicit choice persists. Change the OS preference while no saved choice exists and confirm the editor follows it. Confirm the top bar, canvas, rail, inspector, library overlay, and dialogs remain legible in both modes.

Stop the development server after the browser checks.

- [ ] **Step 8: Commit the theme foundation**

```bash
git add lib/editor-theme.ts tests/editor-theme.test.ts app/globals.css app/layout.tsx components/editor/top-bar.tsx
git commit -m "feat: add persistent editor themes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Add testable widget-library filtering

**Files:**
- Create: `lib/editor-library.ts`
- Create: `tests/editor-library.test.ts`
- Modify: `components/editor/library-panel.tsx`

- [ ] **Step 1: Write helper tests against real widget definitions**

Create `tests/editor-library.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WIDGETS } from '@/lib/widgets'
import { matchesLibrarySearch, matchesWidgetCategory } from '@/lib/editor-library'

describe('widget library filtering', () => {
  it('searches label, description, and category without case sensitivity', () => {
    expect(matchesLibrarySearch('SUN', ['Sunrise & sunset', 'Daylight tracker', 'Weather'])).toBe(true)
    expect(matchesLibrarySearch('planner', ['Upcoming events', 'Calendar', 'Planner'])).toBe(true)
    expect(matchesLibrarySearch('missing', ['Large lockscreen time', 'Time'])).toBe(false)
  })

  it('filters widgets by category and keeps all categories for All', () => {
    expect(matchesWidgetCategory('All', 'Time')).toBe(true)
    expect(matchesWidgetCategory('Weather', 'Weather')).toBe(true)
    expect(matchesWidgetCategory('Weather', 'Time')).toBe(false)
    expect(matchesWidgetCategory('Family', 'Family')).toBe(true)
    expect(WIDGETS.filter((widget) => matchesWidgetCategory('All', widget.category))).toHaveLength(WIDGETS.length)
    expect(WIDGETS.filter((widget) => matchesWidgetCategory('Weather', widget.category))
      .every((widget) => widget.category === 'Weather')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests and verify the missing library helpers fail**

Run: `pnpm exec vitest run tests/editor-library.test.ts`

Expected: FAIL because `lib/editor-library.ts` does not exist.

- [ ] **Step 3: Add the pure filter helpers**

Create `lib/editor-library.ts`:

```ts
import type { WidgetDefinition } from '@/lib/widgets'

export type WidgetLibraryCategory = 'All' | WidgetDefinition['category']

export const WIDGET_LIBRARY_CATEGORIES: WidgetLibraryCategory[] = [
  'All',
  'Time',
  'Weather',
  'Planner',
  'Decor',
  'Family',
]

export function matchesLibrarySearch(query: string, values: Array<string | undefined>): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery))
}

export function matchesWidgetCategory(category: WidgetLibraryCategory, itemCategory: WidgetDefinition['category']): boolean {
  return category === 'All' || category === itemCategory
}
```

- [ ] **Step 4: Run helper tests and type checking**

Run:

```bash
pnpm exec vitest run tests/editor-library.test.ts
pnpm exec tsc --noEmit
```

Expected: both filtering tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the filter behavior**

```bash
git add lib/editor-library.ts tests/editor-library.test.ts
git commit -m "test: add widget library filtering helpers" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Make the full widget library searchable

**Files:**
- Modify: `components/editor/library-panel.tsx`
- Test: `tests/editor-library.test.ts`

- [ ] **Step 1: Add search, category selection, and explicit empty states**

In `LibraryPanel`, add controlled `query` and `category` state. Use `matchesLibrarySearch` for widget label, description, and category; apply `matchesWidgetCategory` to widget definitions only. Search combinations by `name` and `description`, stickers by `name` and `description`, and presets by `name`, widget count, and contained widget labels. Keep combinations, stickers, and saved presets present when a widget category chip is selected; global text search filters all sections.

Use `WIDGET_LIBRARY_CATEGORIES` (`All`, `Time`, `Weather`, `Planner`, `Decor`, `Family`) as compact chips. Include Family so the full widget definition set is discoverable. Give the search input an accessible name, a visible focus treatment, and a clear button. Show a section-specific empty result message rather than hiding a section title with no explanation. Retain every existing `WidgetPreview`, delete action, description, category, and `DropPayload`.

The filtering expressions must use the shared helpers:

```tsx
const visibleWidgets = WIDGETS.filter(
  (widget) =>
    matchesWidgetCategory(category, widget.category) &&
    matchesLibrarySearch(query, [widget.label, widget.description, widget.category]),
)

const visibleCombos = combos.filter((combo) =>
  matchesLibrarySearch(query, [combo.name, combo.description]),
)

const visibleStickers = BUILTIN_STICKERS.filter((sticker) =>
  matchesLibrarySearch(query, [sticker.name, sticker.description]),
)

const visiblePresets = presets.filter((preset) =>
  matchesLibrarySearch(query, [
    preset.name,
    String(preset.widgets.length),
    ...preset.widgets.map((widget) => getDefinition(widget.type).label),
  ]),
)
```

Import `getDefinition` for the preset labels. Do not remove existing click-to-add or drag-start behavior.

- [ ] **Step 2: Add source-contract checks for all library sections**

Add tests to `tests/editor-library.test.ts` that read `components/editor/library-panel.tsx` using the existing Node source-contract pattern:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'

const librarySource = readFileSync(
  path.resolve(__dirname, '../components/editor/library-panel.tsx'),
  'utf8',
)
```

Assert that the source uses both shared filter helpers, preserves `BUILTIN_COMBOS`, `BUILTIN_STICKERS`, `presets`, `WidgetPreview`, `DRAG_MIME`, and `onDeletePreset`, and provides an accessible search label plus an empty-results message. These are behavior-contract checks; do not snapshot the entire JSX file.

- [ ] **Step 3: Run the focused library tests**

Run: `pnpm exec vitest run tests/editor-library.test.ts tests/widget-toolbar.test.ts`

Expected: the library search/category and source-contract tests pass, and the existing quick-add toolbar tests remain green.

- [ ] **Step 4: Commit the searchable library**

```bash
git add components/editor/library-panel.tsx tests/editor-library.test.ts
git commit -m "feat: add searchable widget library" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Replace the fixed left pane with rail overlays

**Files:**
- Modify: `components/editor/editor.tsx`
- Modify: `components/editor/library-panel.tsx`
- Modify: `tests/editor-shell.test.ts`

- [ ] **Step 1: Write shell contract tests**

Create `tests/editor-shell.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const editorSource = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const librarySource = readFileSync(path.join(root, 'components/editor/library-panel.tsx'), 'utf8')

describe('editor navigation shell', () => {
  it('retains all editor sections and adds a Widgets rail item', () => {
    for (const id of ['widgets', 'layers', 'layouts', 'albums', 'fonts', 'schedule', 'notifications', 'experiences']) {
      expect(editorSource).toContain(`'${id}'`)
    }
  })

  it('mounts the existing library and connects it to the existing add path', () => {
    expect(editorSource).toContain('<LibraryPanel')
    expect(editorSource).toContain('addItem(payload)')
    expect(editorSource).toContain('closeDrawer()')
    expect(editorSource).toContain('onDeletePreset={deletePreset}')
  })

  it('exposes an overlay state and Escape dismissal', () => {
    expect(editorSource).toContain('aria-expanded')
    expect(editorSource).toContain('Escape')
    expect(editorSource).toContain('role="dialog"')
  })

  it('keeps the existing canvas toolbar and inspector mounted', () => {
    expect(editorSource).toContain('<WidgetToolbar')
    expect(editorSource).toContain('<Inspector')
    expect(editorSource).toContain('<Canvas')
  })

  it('provides a narrow-screen Properties control', () => {
    expect(editorSource).toContain('Properties')
    expect(editorSource).toMatch(/lg:hidden/)
  })

  it('keeps widget-library click and drag completion connected to close behavior', () => {
    expect(librarySource).toContain('onAdd')
    expect(librarySource).toContain('onClose')
    expect(librarySource).toContain('onDragEnd')
    expect(librarySource).toContain('dropEffect')
  })
})
```

- [ ] **Step 2: Run the shell tests and verify they fail**

Run: `pnpm exec vitest run tests/editor-shell.test.ts`

Expected: FAIL because `Editor` does not yet expose the Widgets rail item, overlay state, or Properties control.

- [ ] **Step 3: Add typed panel state and toggle behavior**

Replace the always-selected `tab` state with:

```ts
type PanelId = 'widgets' | (typeof PANELS)[number]['id']

type DrawerId = PanelId | 'properties'

const [activeDrawer, setActiveDrawer] = useState<DrawerId | null>(null)
const drawerTriggers = useRef(new Map<DrawerId, HTMLButtonElement>())

function closeDrawer() {
  if (!activeDrawer) return
  const trigger = drawerTriggers.current.get(activeDrawer)
  setActiveDrawer(null)
  requestAnimationFrame(() => trigger?.focus())
}

function toggleDrawer(id: DrawerId, trigger: HTMLButtonElement) {
  if (activeDrawer === id) {
    closeDrawer()
    return
  }
  drawerTriggers.current.set(id, trigger)
  setActiveDrawer(id)
}
```

Use the existing panel definitions and icons. Add a Widgets rail entry using the existing `LayoutTemplate` icon only if it does not conflict visually; otherwise use `Grid2X2` from the already installed Lucide package. Preserve all current rail entries. Each rail button must set `aria-expanded={activeDrawer === panel.id}`, `aria-controls` pointing to the drawer, and an accessible name.

- [ ] **Step 4: Place the canvas, drawer, and inspector in the new shell**

Keep the header. In the main editor row, render the rail, a `relative min-w-0 flex-1` canvas region, and the inspector. Place the drawer inside the canvas region using absolute positioning, a bounded width, a full-height white/dark surface, a divider, and a restrained shadow. The drawer must not change the canvas region's width or the inspector width. Render exactly one panel from `activeDrawer`; move the current panel JSX into this drawer and preserve every existing component and prop expression.

The Widgets drawer renders:

```tsx
{activeDrawer === 'widgets' && (
  <LibraryPanel
    presets={store.presets}
    onAdd={(payload) => {
      addItem(payload)
      closeDrawer()
    }}
    onDeletePreset={deletePreset}
    onClose={closeDrawer}
  />
)}
```

Pass the existing editor/store callbacks to every other panel unchanged. Add one Widgets rail button and one separate `Properties` rail button with `className="lg:hidden"`; its click calls `toggleDrawer('properties', event.currentTarget)`. Render the same `<Inspector>` in the Properties drawer on narrow screens. Keep `<Canvas>`, `<WidgetToolbar>`, and the desktop `<Inspector>` mounted; do not wrap them in a conditional that unmounts them when an overlay opens.

- [ ] **Step 5: Preserve successful drag-and-drop close semantics**

Add required `onClose: () => void` to `LibraryPanelProps`. Pass it to `dragProps`, which remains outside the component, and use this complete helper:

```ts
function dragProps(payload: DropPayload, onClose: () => void) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
      event.dataTransfer.effectAllowed = 'copy'
    },
    onDragEnd: (event: React.DragEvent) => {
      if (event.dataTransfer.dropEffect === 'copy') onClose()
    },
  }
}
```

Ensure every widget, combination, sticker, and preset button spreads `dragProps(payload, onClose)`. Click-to-add closes through the `onAdd` callback from Step 4. A cancelled drag (`dropEffect !== 'copy'`) leaves the overlay open.

- [ ] **Step 6: Add Escape dismissal and focus return**

Add an effect that listens for Escape only while `activeDrawer` is not `null`. Prevent the default action and call `closeDrawer()`. Clean up the listener on effect cleanup. Render the drawer with `role="dialog"`, `aria-modal="false"`, `aria-labelledby`, a visible title, and a labeled close button that calls `closeDrawer()`. Avoid trapping focus because the canvas remains an interactive workspace behind the non-modal drawer.

- [ ] **Step 7: Add compact portrait Properties access**

On widths below `lg`, hide the permanently docked inspector and show a `Properties` button in the rail with `className="lg:hidden"`. It opens the existing `Inspector` in a bounded overlay that shares the same close and Escape behavior. Keep the canvas toolbar within the viewport using a horizontally scrollable, non-wrapping container at narrow widths. Do not hide or remove any inspector fields or rail panels.

- [ ] **Step 8: Run shell and existing editor contract tests**

Run:

```bash
pnpm exec vitest run tests/editor-shell.test.ts tests/editor-library.test.ts tests/widget-toolbar.test.ts tests/inspector-text-effects.test.ts
pnpm exec tsc --noEmit
```

Expected: all selected tests pass and TypeScript reports no errors.

- [ ] **Step 9: Commit the rail and overlay behavior**

```bash
git add components/editor/editor.tsx components/editor/library-panel.tsx tests/editor-shell.test.ts
git commit -m "feat: add editor rail overlays" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Align editor panels and controls to shared tokens

**Files:**
- Modify: `app/globals.css`
- Modify: `components/editor/controls.tsx`
- Modify: `components/editor/editor.tsx`
- Modify: `components/editor/top-bar.tsx`
- Modify: `components/editor/widget-toolbar.tsx`
- Modify: `components/editor/inspector.tsx`
- Modify: `components/editor/layout-settings.tsx`
- Modify: `components/editor/layers-panel.tsx`
- Modify: `components/editor/layouts-panel.tsx`
- Modify: `components/editor/albums-panel.tsx`
- Modify: `components/editor/album-detail.tsx`
- Modify: `components/editor/fonts-panel.tsx`
- Modify: `components/editor/schedule-panel.tsx`
- Modify: `components/editor/experiences-panel.tsx`
- Modify: `components/editor/notifications-panel.tsx`
- Modify: `components/editor/frame-switcher.tsx`
- Modify: `components/editor/preview-overlay.tsx`

- [ ] **Step 1: Define reusable editor surface and control classes**

In `app/globals.css`, add these component recipes under `@layer components` and use the existing semantic tokens:

```css
.editor-panel {
  @apply border-border bg-card text-card-foreground;
}

.editor-panel-heading {
  @apply border-b border-border px-3 py-2 text-sm font-semibold tracking-tight;
}

.editor-panel-section {
  @apply flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0;
}

.editor-control {
  @apply min-h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors;
}

.editor-control:focus-visible {
  @apply border-primary ring-2 ring-ring/30;
}

.editor-icon-button {
  @apply inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40;
}

.editor-floating-surface {
  @apply rounded-lg border border-border bg-popover text-popover-foreground shadow-lg;
}

.canvas-surface {
  background-color: var(--background);
  background-image: radial-gradient(
    color-mix(in srgb, var(--foreground) 8%, transparent) 1px,
    transparent 1px
  );
  background-size: 20px 20px;
}
```

If Tailwind 4 rejects a recipe, use equivalent plain CSS declarations with the same semantic variables; do not add a dependency or duplicate the recipe per panel.

- [ ] **Step 2: Apply the shared recipes to editor chrome**

Update `Editor`, `TopBar`, and `WidgetToolbar` to use the same surface, divider, radius, icon size, focus, and hover conventions. Keep the header 48px high, the rail 40px wide, the desktop inspector 288px wide, and the canvas drawer 320px wide with `max-width: calc(100% - 1rem)`. Use 32px icon-button and input heights, 16px standard icons, 18px rail icons, and the existing Lucide stroke weight. Keep the floating toolbar bottom-centered, and use a distinct blue active state. Preserve Save/Saved labels, dirty indicator, undo/redo/export/preview actions, frame status, search/chips, composition guides, and Night preview.

- [ ] **Step 3: Apply the shared recipes to the inspector and controls**

Update `Section`, `IconButton`, `Segmented`, `SelectField`, `NumberField`, `SliderField`, `ToggleField`, `ColorField`, `TimeField`, and related controls in `controls.tsx`; update inspector section headings and panel fields in `inspector.tsx` and `layout-settings.tsx`. Use 12px uppercase section labels, 14px field labels, consistent 8px vertical spacing, and 32px controls. Keep labels, input types, ranges, selected values, event handlers, and conditional fields unchanged. Replace hard-coded dark-only input color schemes with theme-aware styles.

- [ ] **Step 4: Align each editor panel without changing its operations**

Apply the shared panel, heading, section, control, and icon treatments to Layers, Layouts, Albums/Album detail, Fonts, Schedule, Experiences, Notifications, Frame Switcher, and Preview Overlay. Retain all current text, counts, confirmations, sorting/order controls, selection states, album actions, font actions, schedule editing, experiences, notifications, and preview behavior. Keep success and destructive feedback semantically distinct from the blue active state.

- [ ] **Step 5: Run the existing panel contracts and type checking**

Run:

```bash
pnpm exec vitest run tests/widget-toolbar.test.ts tests/inspector-text-effects.test.ts tests/single-frame.test.ts
pnpm exec tsc --noEmit
```

Expected: all selected tests pass and TypeScript reports no errors. Review the diff to confirm all changes are presentational and event handlers/API payloads are unchanged.

- [ ] **Step 6: Commit the editor visual system**

```bash
git add app/globals.css components/editor
git commit -m "style: align editor panels and controls" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Validate visual fidelity and functional integrity

**Files:**
- Modify only if validation finds a regression in the files from Tasks 1-5.
- Test: `tests/editor-theme.test.ts`
- Test: `tests/editor-library.test.ts`
- Test: `tests/editor-shell.test.ts`
- Test: existing editor/API tests

- [ ] **Step 1: Capture the before state**

Use the current production baseline or the existing editor in the isolated worktree before styling changes to capture a desktop screenshot of the editor and a narrow portrait screenshot. Keep the captures outside source control or in the task's session artifacts.

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm exec vitest run --maxWorkers=4`

Expected: all tests pass, with only the repository's existing skips. If a timeout occurs, rerun the specific failed test file in isolation before attributing it to the change.

- [ ] **Step 3: Type-check and build**

Run:

```bash
pnpm exec tsc --noEmit
pnpm run build
```

Expected: both commands exit successfully. Record any pre-existing Next.js filesystem tracing warnings separately; do not change unrelated backup code.

- [ ] **Step 4: Exercise the full browser workflow**

At desktop and tablet widths, verify:

1. Rail items open one overlay at a time without resizing or recentering the canvas.
2. The Widgets entry shows all widget categories, descriptions, live previews, combinations, stickers, and saved presets.
3. Search matches names/descriptions and category chips filter widgets; empty results are clear.
4. Clicking each kind of library item adds it and closes the drawer.
5. Dragging each kind adds at the drop point and closes only after a successful drop; cancelling the drag adds nothing and keeps the drawer open.
6. Escape and the close button dismiss overlays and return focus to the trigger.
7. The bottom quick-add toolbar still supports its search, category chips, guides, and Night preview.
8. Selecting widgets updates the inspector, and all layout, album, font, schedule, notification, and experience controls remain available.
9. Save, undo/redo, preview, export, and existing keyboard shortcuts still work.
10. Light/dark selection follows OS when unset and persists after manual selection/reload.

At narrow portrait width, verify that the canvas remains usable, the Properties overlay exposes every inspector field, rail panels remain reachable, and the quick-add toolbar can scroll without clipping its actions.

Stop the development server after the browser checks and confirm its process has exited.

- [ ] **Step 5: Capture the after state and compare with the reference**

Capture the same desktop and portrait views as Step 1. Compare against `desired_UI.png` for composition, surface contrast, dividers, active blue, icon scale, compact controls, whitespace, and floating toolbar. Fix any mismatch or inaccessible interaction before completing.

- [ ] **Step 6: Record the validation result**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended editor redesign files are modified. Ensure no `.next`, browser profile, screenshot, or temporary database artifacts were added to Git.

## Spec coverage review

- Reference-led layout and visual system: Tasks 1 and 5.
- Light/dark toggle, OS fallback, and browser persistence: Task 1.
- Rail, contextual overlays, inspector, keyboard dismissal, and responsive Properties access: Task 4.
- Complete widget library, search, categories, previews, combinations, stickers, presets, click-add, and drag-add: Tasks 2-4.
- Existing quick-add toolbar and every editor panel: Task 5.
- Functionality preservation and visual/browser proof: Task 6.
- Console, display, landing, and sign-in restyling: explicitly deferred to separately approved phases.
