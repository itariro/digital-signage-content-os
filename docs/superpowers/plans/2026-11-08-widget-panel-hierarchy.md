# Widget Panel Hierarchy Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Widgets overlay compact and hierarchical, remove the redundant bottom toolbar, and keep guides and Night preview available in clear locations.

**Architecture:** Keep `Editor` as the owner of widget-add, guide, and Night preview state. `LibraryPanel` owns only its search and selected category; category tabs filter widget children while combinations, stickers, and saved presets remain globally searchable. Move guide controls into `Canvas` below the frame and move the Night preview action into `TopBar`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, lucide-react.

---

## Context and implementation rules

The approved refinement is documented in [the Frame Editor UI Redesign spec](../specs/2026-11-08-frame-editor-ui-redesign-design.md). The initial implementation plan, [Frame Editor UI Redesign Implementation Plan](./2026-11-08-frame-editor-ui-redesign.md), predates this refinement. Its instructions to preserve `WidgetToolbar` are superseded by this plan.

Keep the existing editor state and payload paths. Clicking or dragging a library item must continue to call the same `onAdd` behavior; a successful drag closes the overlay and a cancelled drag does not add an item. Keep widget search global across widgets, combinations, stickers, and saved presets. Selecting a category filters only widgets. Preserve all descriptions, previews, preset deletion, and empty states.

The category control is a horizontally scrollable parent row. It must not wrap into or share a row with child widgets. Use accessible button controls with `aria-pressed` within a labeled group; do not use ARIA `tab` roles unless implementing the full tab keyboard pattern. Keep composition-guide values in `Editor`, and continue to render the existing overlay lines in `Canvas`.

## File map

- `components/editor/library-panel.tsx`: turn category chips into a scrollable parent row, render compact widget children beneath it, and keep combinations, stickers, presets, search, preview, drag, and delete behavior.
- `components/editor/editor.tsx`: remove `WidgetToolbar`, narrow only the Widgets drawer to 288px, and pass guide and Night callbacks to their new controls.
- `components/editor/canvas.tsx`: add the existing composition-guide `Segmented` control below the preview and keep it bound to `overlay`.
- `components/editor/top-bar.tsx`: add the Night preview toggle and its props.
- `components/editor/widget-toolbar.tsx`: delete the obsolete bottom toolbar component after all controls have moved.
- `tests/editor-library.test.ts`: assert the parent/child hierarchy and preservation of global search and library workflows.
- `tests/editor-shell.test.ts`: assert the 288px Widgets drawer and removal of the bottom toolbar.
- `tests/widget-bar-state.test.ts`: replace toolbar-specific contracts with Canvas guide and TopBar Night-preview contracts.
- `tests/widget-toolbar.test.ts`: remove obsolete contracts for the deleted toolbar.

## Task 1: Specify the new hierarchy and control locations in tests

**Files:**
- Modify: `tests/editor-library.test.ts`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/widget-bar-state.test.ts`
- Delete: `tests/widget-toolbar.test.ts`

- [ ] **Step 1: Update library hierarchy contract tests**

In `tests/editor-library.test.ts`, replace the category-chip assertion with checks for an independent horizontally scrollable category group and a separate child panel:

```ts
it('renders categories as a separate horizontally scrollable parent row', () => {
  expect(librarySource).toContain('aria-label="Filter widgets by category"')
  expect(librarySource).toContain('aria-pressed={category === option}')
  expect(librarySource).toContain('overflow-x-auto')
  expect(librarySource).toContain('flex-nowrap')
  expect(librarySource).toContain('shrink-0')
  expect(librarySource).toContain('aria-label={`${category} widgets`}')
})

it('keeps global search on supporting sections while category filters widgets only', () => {
  expect(librarySource).toContain('matchesWidgetCategory(category, widget.category)')
  expect(librarySource).toContain('matchesLibrarySearch(query, [combo.name, combo.description])')
  expect(librarySource).toContain('matchesLibrarySearch(query, [sticker.name, sticker.description])')
  expect(librarySource).toContain('const visiblePresets = presets.filter')
})
```

In the existing action-preservation test, also assert that a widget button renders its `def.description` alongside `def.label`. Keep the existing checks for widget/combo/sticker/preset `onAdd`, previews, drag payloads, and preset deletion.

- [ ] **Step 2: Update shell and control contract tests**

In `tests/editor-shell.test.ts`, replace the assertion that `<WidgetToolbar>` remains mounted with:

```ts
it('keeps the canvas and inspector mounted without a bottom widget toolbar', () => {
  expect(editorSource).toContain('<Inspector')
  expect(editorSource).toContain('<Canvas')
  expect(editorSource).not.toContain('<WidgetToolbar')
  expect(editorSource).toContain('w-72')
})
```

In `tests/widget-bar-state.test.ts`, remove the source read of `widget-toolbar.tsx` and add:

```ts
const topBarSrc = readFileSync(path.join(root, 'components/editor/top-bar.tsx'), 'utf8')
```

Assert that:

```ts
expect(canvasSrc).toMatch(/onOverlayChange:\s*\(.*Overlay.*\)\s*=>\s*void/)
expect(canvasSrc).toContain('label="Composition guides"')
expect(canvasSrc).toContain('onChange={onOverlayChange}')
expect(editorSrc).toMatch(/<Canvas[\s\S]*?onOverlayChange=\{setOverlay\}/)
expect(editorSrc).toMatch(/<TopBar[\s\S]*?nightPreview=\{nightPreview\}/)
expect(editorSrc).toMatch(/<TopBar[\s\S]*?onToggleNight=/)
expect(topBarSrc).toContain('aria-pressed={nightPreview}')
expect(topBarSrc).toContain('onClick={onToggleNight}')
```

Read `components/editor/top-bar.tsx` into `topBarSrc` in that test. Retain the assertions that `Editor` owns the `overlay` and `nightPreview` state and passes the overlay value to `Canvas`. Delete `tests/widget-toolbar.test.ts`; its assertions target the component being removed.

- [ ] **Step 3: Run the focused tests and verify the new contracts fail**

Run:

```bash
pnpm exec vitest run tests/editor-library.test.ts tests/editor-shell.test.ts tests/widget-bar-state.test.ts
```

Expected: FAIL because the library still uses wrapping chips, the drawer is still `w-80`, `WidgetToolbar` is still mounted, `Canvas` does not own the guide control callback, and `TopBar` does not yet receive Night preview state.

## Task 2: Implement the compact parent-category and child-widget layout

**Files:**
- Modify: `components/editor/library-panel.tsx`
- Modify: `tests/editor-library.test.ts`

- [ ] **Step 1: Make category buttons a distinct horizontal parent row**

Keep `WIDGET_LIBRARY_CATEGORIES` and `setCategory`. Replace the wrapping category group with a labeled, single-line scroll region. Each button remains a native button and uses `aria-pressed`:

```tsx
<div
  role="group"
  aria-label="Filter widgets by category"
  className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
>
  {WIDGET_LIBRARY_CATEGORIES.map((option) => (
    <button
      key={option}
      type="button"
      aria-pressed={category === option}
      onClick={() => setCategory(option)}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        category === option
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground'
      }`}
    >
      {option}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Keep widget children beneath the parent row**

Wrap the widget-category rendering in a separate section with `aria-label={`${category} widgets`}`. Keep the existing `widgetCategories` logic: `All` renders one heading per category, and a selected category renders only that category's heading and children. Leave the Combinations, Text stickers, and My widgets sections after this widget section so category selection cannot hide them.

Replace the widget grid card with a compact one-column row so its fixed-size preview cannot overflow the narrowed drawer. Keep each complete widget preview, label, and description visible:

```tsx
<button
  key={def.type}
  type="button"
  {...dragProps({ kind: 'widget', type: def.type }, onClose)}
  onClick={() => onAdd({ kind: 'widget', type: def.type })}
  className="group flex min-w-0 cursor-grab items-center gap-2 overflow-hidden rounded-lg bg-secondary p-2 text-left ring-1 ring-border transition hover:ring-primary active:cursor-grabbing"
>
  <WidgetPreview widgets={[samples[def.type]]} width={72} height={48} className="shrink-0 rounded-md" />
  <span className="flex min-w-0 flex-col gap-0.5">
    <span className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
      <def.icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
      <span className="truncate">{def.label}</span>
    </span>
    <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{def.description}</span>
  </span>
</button>
```

- [ ] **Step 3: Run the library tests**

Run:

```bash
pnpm exec vitest run tests/editor-library.test.ts
```

Expected: PASS. Confirm the existing helper tests still cover case-insensitive search and all six category filters, and that contracts still verify global search, click-add, drag-add, widget previews, combinations, stickers, preset deletion, and empty states.

## Task 3: Move composition guides and Night preview, and remove the old toolbar

**Files:**
- Modify: `components/editor/editor.tsx`
- Modify: `components/editor/canvas.tsx`
- Modify: `components/editor/top-bar.tsx`
- Delete: `components/editor/widget-toolbar.tsx`
- Modify: `tests/editor-shell.test.ts`
- Modify: `tests/widget-bar-state.test.ts`

- [ ] **Step 1: Put the guide control below the canvas preview**

In `components/editor/canvas.tsx`, import `Grid3x3`, `Scan`, and `Segmented`. Extend `CanvasProps` with `onOverlayChange: (value: Overlay) => void` and include it in the `Canvas` parameters. In the block beneath `FrameScene`, render a `Segmented<Overlay>` immediately below the preview and keep the existing status line after it:

```tsx
<div className="mt-4 flex flex-col items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
  <Segmented
    label="Composition guides"
    value={overlay}
    onChange={onOverlayChange}
    className="w-full max-w-sm"
    options={[
      { value: 'none', label: 'No guides' },
      { value: 'thirds', label: <><Grid3x3 className="size-4" aria-hidden />Thirds</> },
      { value: 'safe', label: <><Scan className="size-4" aria-hidden />Safe area</> },
    ]}
  />
  <p className="text-center font-mono text-xs text-muted-foreground">
    {resW} × {resH} portrait · {Math.round(scale * 100)}% · {widgets.length} widget{widgets.length === 1 ? '' : 's'}
  </p>
</div>
```

The guide buttons must update the existing `overlay` state, which continues to control the guide overlays already rendered inside `FrameScene`.

- [ ] **Step 2: Move Night preview into the top bar**

In `components/editor/top-bar.tsx`, add `MoonStar` to the Lucide imports. Add `nightPreview: boolean` and `onToggleNight: () => void` to `TopBarProps`, then render a pressed-state button adjacent to Preview:

```tsx
<button
  type="button"
  aria-label="Night preview"
  aria-pressed={nightPreview}
  onClick={onToggleNight}
  className={cn(
    'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
    nightPreview ? 'bg-primary/10 text-primary' : 'bg-secondary text-foreground hover:bg-secondary/70',
  )}
>
  <MoonStar className="size-4" aria-hidden />
  <span className="hidden sm:inline">Night</span>
</button>
```

- [ ] **Step 3: Wire the controls and remove the duplicate bottom strip**

In `components/editor/editor.tsx`:

1. Remove the `WidgetToolbar` import, its JSX, and the inline `<style>` block that only positions `[role="toolbar"]`.
2. Pass `onOverlayChange={setOverlay}` to `Canvas`.
3. Pass `nightPreview={nightPreview}` and `onToggleNight={() => setNightPreview((value) => !value)}` to `TopBar`.
4. Give only the Widgets drawer a 288px width and retain 320px for the existing panels:

```tsx
className={cn(
  'editor-panel absolute inset-y-0 right-0 z-20 max-w-[calc(100%-1rem)] flex-col overflow-hidden border-l border-border shadow-xl',
  activeDrawer === 'widgets' ? 'w-72' : 'w-80',
  activeDrawer ? 'flex' : 'hidden',
)}
```

5. Delete `components/editor/widget-toolbar.tsx` after verifying it has no remaining imports or references.

- [ ] **Step 4: Run all focused contract tests and type-check**

Run:

```bash
pnpm exec vitest run tests/editor-library.test.ts tests/editor-shell.test.ts tests/widget-bar-state.test.ts
pnpm exec tsc --noEmit
```

Expected: both commands pass. The toolbar-specific test was deleted in Task 1 because its component no longer exists.

## Task 4: Verify the user-visible layout and preserved workflows

**Files:**
- No additional files unless validation uncovers a defect.

- [ ] **Step 1: Run the production build**

Run:

```bash
pnpm build
```

Expected: build succeeds. Record any existing filesystem-tracing warnings separately; do not make unrelated build changes.

- [ ] **Step 2: Check the editor in browser at desktop and portrait widths**

With the editor running, verify:

1. The Widgets overlay measures 288px at desktop width and is bounded by the viewport on portrait width.
2. The six category parents remain on one horizontally scrollable row and never share a line with widget children.
3. `All` displays compact children grouped under category headings. Selecting Time or Weather displays only that category's widgets.
4. Search filters widgets, combinations, stickers, and presets regardless of selected category; clearing search restores results.
5. Clicking a widget adds it and closes the overlay. Dragging a widget to the canvas adds it and closes the overlay; cancelling a drag adds nothing.
6. Combo, sticker, preset add, and preset delete actions still work.
7. Guide selection is visible below the preview and toggles the same frame overlays as before.
8. Night preview is available in the top bar and toggles the existing simulated night scene.
9. The bottom toolbar is absent, and no panel content is clipped or horizontally overflowing.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: all focused tests pass. The known unrelated `tests/proxy-gate.test.ts` failure may remain (it expects HTTP 200 but gets 401); report it separately and do not alter auth behavior for this UI task.
