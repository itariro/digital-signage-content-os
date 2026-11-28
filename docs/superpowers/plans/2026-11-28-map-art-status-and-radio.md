# Map art status panel and radio groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate map art validation status, generation activity, and the Generate action below the sidebar tabs, give poster type and zoom presets radio semantics, replace the zoom bar with a shadcn ButtonGroup, and remove the Base UI button warning.

**Architecture:** Keep state and handlers in `components/map-art/map-art-studio.tsx`. Lift the validation banner out of `LocationsTab` into one sidebar status panel beside `GenerationTrace`. Use shadcn Base UI `RadioGroup` in `StyleTab` and shadcn `ButtonGroup` in the preview. Navigation elements stay anchors styled with `buttonVariants()`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, shadcn/base-nova components, Base UI primitives, Vitest source-shape tests.

**Commit policy:** Do not commit. This checkout is a detached HEAD at `origin/main` with shared uncommitted work, including work from another agent. Re-read every file listed below immediately before editing it. If current contents conflict with the spec, stop and ask.

---

### Task 1: Zoom controls use shadcn ButtonGroup

**Files:**
- Create: `components/ui/button-group.tsx` (via shadcn CLI)
- Modify: `components/map-art/map-art-studio.tsx:961-967`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/map-art.test.ts`:

```ts
describe('map art zoom controls', () => {
  it('uses a shadcn button group for zoom and recentre controls', () => {
    expect(studioSource).toContain("from '@/components/ui/button-group'")
    expect(studioSource).toContain('<ButtonGroup aria-label="Map zoom and view controls">')
    expect(studioSource).toContain('<ButtonGroupSeparator />')
    expect(studioSource).toContain('<ButtonGroupText')
    expect(studioSource).toContain('{zoom.toFixed(1)}')
    expect(studioSource).toContain('onClick={() => stepZoom(-0.5)}')
    expect(studioSource).toContain('onClick={() => stepZoom(0.5)}')
    expect(studioSource).toContain('onClick={resetView}')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/map-art.test.ts -t 'uses a shadcn button group'`
Expected: FAIL because `studioSource` has no `button-group` import.

- [ ] **Step 3: Add the shadcn component**

Run: `printf 'n\n' | pnpm dlx shadcn@latest add button-group`

When prompted to overwrite `components/ui/button.tsx`, answer `n`. Confirm `components/ui/button-group.tsx` exists. If the added file imports `cn` from `"cn"`, change that one line to `import { cn } from '@/lib/utils'`.

- [ ] **Step 4: Replace the zoom bar**

In `components/map-art/map-art-studio.tsx`, add this import after the carousel import:

```tsx
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@/components/ui/button-group'
```

Replace the existing zoom control block:

```tsx
            <div className="flex items-center rounded-md border bg-background shadow-xs">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => stepZoom(-0.5)} disabled={zoom <= 8}><Minus /></Button>
              <span className="w-10 text-center text-xs tabular-nums">{zoom.toFixed(1)}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => stepZoom(0.5)} disabled={zoom >= 16}><Plus /></Button>
              <Separator orientation="vertical" className="h-4" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Reset map position" title="Recentre" onClick={resetView}><RotateCcw /></Button>
            </div>
```

with:

```tsx
            <ButtonGroup aria-label="Map zoom and view controls">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom out"
                onClick={() => stepZoom(-0.5)}
                disabled={zoom <= 8}
              >
                <Minus />
              </Button>
              <ButtonGroupText className="w-10 justify-center bg-background px-0 text-xs font-normal tabular-nums">
                {zoom.toFixed(1)}
              </ButtonGroupText>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom in"
                onClick={() => stepZoom(0.5)}
                disabled={zoom >= 16}
              >
                <Plus />
              </Button>
              <ButtonGroupSeparator />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Reset map position"
                title="Recentre"
                onClick={resetView}
              >
                <RotateCcw />
              </Button>
            </ButtonGroup>
```

Keep the `Separator` import: the top bar still uses it.

- [ ] **Step 5: Verify the test passes**

Run: `npx vitest run tests/map-art.test.ts -t 'uses a shadcn button group'`
Expected: PASS.

---

### Task 2: Remove the Base UI button warning

**Files:**
- Modify: `components/map-art/map-art-studio.tsx:24,850,996`
- Test: `tests/base-ui-button-links.test.ts`

- [ ] **Step 1: Run the existing regression test**

Run: `npx vitest run tests/base-ui-button-links.test.ts`
Expected: FAIL, reporting `components/map-art/map-art-studio.tsx` as an offender.

- [ ] **Step 2: Import `buttonVariants`**

Change line 24 of `components/map-art/map-art-studio.tsx` to:

```tsx
import { Button, buttonVariants } from '@/components/ui/button'
```

- [ ] **Step 3: Replace the two link buttons**

Replace:

```tsx
          <Button variant="ghost" size="sm" className="max-sm:hidden" render={<a href="/" />}><ArrowLeft data-icon="inline-start" /> Frame editor</Button>
```

with:

```tsx
          <a href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'max-sm:hidden' })}><ArrowLeft data-icon="inline-start" /> Frame editor</a>
```

Replace:

```tsx
                      <Button variant="ghost" size="icon-xs" aria-label={`Download ${artwork.city.name} map`} render={<a href={artwork.url} download={`${artwork.city.name}-map.png`} />}><Download /></Button>
```

with:

```tsx
                      <a href={artwork.url} download={`${artwork.city.name}-map.png`} aria-label={`Download ${artwork.city.name} map`} className={buttonVariants({ variant: 'ghost', size: 'icon-xs' })}><Download /></a>
```

- [ ] **Step 4: Verify the test passes**

Run: `npx vitest run tests/base-ui-button-links.test.ts`
Expected: PASS with no offenders.

---

### Task 3: Status panel and Generate button below the tabs

**Files:**
- Modify: `components/map-art/map-art-studio.tsx:23,851,883-884,936-937,975`
- Modify: `components/map-art/locations-tab.tsx:3,38,62,214-222`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/map-art.test.ts`:

```ts
describe('map art status panel placement', () => {
  it('puts validation, trace and Generate below the tabs', () => {
    const tabsEnd = studioSource.indexOf('</Tabs>')
    const panel = studioSource.indexOf('aria-label="Generation status"', tabsEnd)
    const generate = studioSource.indexOf('{generateLabel}', panel)

    expect(tabsEnd).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(tabsEnd)
    expect(generate).toBeGreaterThan(panel)
    expect(studioSource.indexOf('<GenerationTrace steps={traceSteps} />')).toBeGreaterThan(tabsEnd)
  })

  it('keeps the validation marker out of the locations tab', () => {
    expect(locationsSource).not.toContain('{verifiedCount} location')
    expect(locationsSource).not.toContain('onEditVerified')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/map-art.test.ts -t 'map art status panel placement'`
Expected: both FAIL.

- [ ] **Step 3: Remove the banner from LocationsTab**

In `components/map-art/locations-tab.tsx`, change line 3 to:

```tsx
import { Check, MapPin, Search, X } from 'lucide-react'
```

Remove `onEditVerified` from the destructured props on line 38 and its type declaration on line 62 (`onEditVerified: () => void`). Delete the whole `{verifiedCount !== null && (...)}` block at lines 214-222. Keep `verifiedCount` in props.

- [ ] **Step 4: Remove the header button and preview trace**

In `components/map-art/map-art-studio.tsx`, change the lucide import to include the two banner icons:

```tsx
import { ArrowLeft, CircleCheck, Download, MapPin, Minus, Pencil, Plus, RotateCcw } from 'lucide-react'
```

Delete the Generate button from the header, leaving only the Frame editor anchor:

```tsx
        <div className="ml-auto flex items-center gap-2">
          <a href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'max-sm:hidden' })}><ArrowLeft data-icon="inline-start" /> Frame editor</a>
        </div>
```

Delete this line from the preview column:

```tsx
          <div className="map-art-status"><GenerationTrace steps={traceSteps} /></div>
```

- [ ] **Step 5: Add the panel and Generate button**

Immediately after `</Tabs>` and before `</aside>` in `components/map-art/map-art-studio.tsx`, insert:

```tsx
          {(verifiedCount !== null || traceSteps.length > 0) && (
            <section aria-label="Generation status" className="border-t p-4">
              {verifiedCount !== null && (
                <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/40 py-1.5 pl-3 pr-1.5">
                  <CircleCheck className="size-4 text-primary" />
                  <span className="flex-1 text-sm">{verifiedCount} location{verifiedCount === 1 ? '' : 's'} ready</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVerifiedCount(null)}>
                    <Pencil data-icon="inline-start" /> Edit
                  </Button>
                </div>
              )}
              <GenerationTrace steps={traceSteps} />
            </section>
          )}
          <div className="border-t p-4">
            <Button className="w-full" onClick={() => void generateBatch()} disabled={busy || !cities.length}>
              <Download data-icon="inline-start" /> {generateLabel}
            </Button>
          </div>
```

Remove the now-unused `onEditVerified={() => setVerifiedCount(null)}` prop from the `<LocationsTab>` call.

- [ ] **Step 6: Verify the tests pass**

Run: `npx vitest run tests/map-art.test.ts -t 'map art status panel placement'`
Expected: both PASS.

---

### Task 4: Poster type and zoom presets become radio groups

**Files:**
- Modify: `components/map-art/style-tab.tsx:4,17,116-133,177-193`
- Test: `tests/map-art.test.ts:262-277`

- [ ] **Step 1: Replace the stale zoom control tests**

Replace the whole `describe('map art zoom preset controls', ...)` block at lines 262-277 of `tests/map-art.test.ts` with:

```ts
describe('map art zoom preset controls', () => {
  it('uses radio semantics for zoom presets', () => {
    expect(styleSource).toContain("from '@/components/ui/radio-group'")
    expect(styleSource).toContain('<RadioGroup')
    expect(styleSource).toContain('<RadioGroupItem')
    expect(styleSource).not.toContain('aria-pressed=')
    expect(styleSource).not.toContain('<ToggleGroup')
  })

  it('shows a one-line description for each zoom preset', () => {
    for (const description of [
      'Whole city context',
      'Neighbourhood clusters',
      'Street-level detail',
      'Closest streets and blocks',
    ]) {
      expect(styleSource).toContain(description)
    }
  })

  it('uses radio semantics for poster type', () => {
    expect(styleSource).toContain('aria-label="Poster type"')
    expect(styleSource).toContain('Tall 11 MP poster for walls and portrait displays')
    expect(styleSource).toContain('Wide 8 MP poster for screens and landscape frames')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/map-art.test.ts -t 'radio semantics'`
Expected: FAIL because `styleSource` still uses `ToggleGroup`.

- [ ] **Step 3: Update imports in StyleTab**

In `components/map-art/style-tab.tsx`, add after the field import:

```tsx
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
```

Remove the `ToggleGroup, ToggleGroupItem` import on line 17.

- [ ] **Step 4: Replace the Poster orientation toggle**

Replace only the orientation `Field` block inside the Poster `FieldSet` (the block containing the `ToggleGroup` and the size `FieldDescription`) with:

```tsx
        <Field className="gap-2">
          <FieldLabel className="text-xs text-muted-foreground">Poster type</FieldLabel>
          <RadioGroup
            aria-label="Poster type"
            value={values.orientation}
            onValueChange={(next: string) => onOrientationChange(next as MapArtSettings['orientation'])}
          >
            <Field orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id="poster-type-portrait" value="portrait" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="poster-type-portrait" className="font-normal">Portrait</FieldLabel>
                <FieldDescription>Tall 11 MP poster for walls and portrait displays</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id="poster-type-landscape" value="landscape" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="poster-type-landscape" className="font-normal">Landscape</FieldLabel>
                <FieldDescription>Wide 8 MP poster for screens and landscape frames</FieldDescription>
              </div>
            </Field>
          </RadioGroup>
          <FieldDescription className="flex justify-between text-xs tabular-nums">
            <span>{isPortrait ? '2880 × 3840 · 11 MP' : '3840 × 2160 · 8 MP'}</span>
            <span>PNG</span>
          </FieldDescription>
        </Field>
```

The background colour `Field` that follows in the Poster `FieldSet` stays unchanged.

- [ ] **Step 5: Replace the zoom preset toggle**

Replace the zoom preset `ToggleGroup` block with:

```tsx
        <RadioGroup
          aria-label="Zoom presets"
          value={zoomLevels.find((preset) => Math.abs(values.zoom - preset.value) < 0.1)?.value}
          onValueChange={(next: string) => onZoomPreset(Number(next))}
          className="gap-2"
        >
          {zoomLevels.map((preset) => (
            <Field key={preset.value} orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id={`zoom-preset-${preset.value}`} value={String(preset.value)} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor={`zoom-preset-${preset.value}`} className="font-normal">{preset.label}</FieldLabel>
                <FieldDescription>{preset.description}</FieldDescription>
              </div>
            </Field>
          ))}
        </RadioGroup>
```

Keep the zoom slider and its label above this group.

- [ ] **Step 6: Verify the tests pass**

Run: `npx vitest run tests/map-art.test.ts -t 'radio semantics'`
Expected: all three PASS.

---

### Task 5: Align the stale trace assertion and verify everything

**Files:**
- Modify: `tests/map-art.test.ts:353`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Fix the stale assertion**

In `tests/map-art.test.ts`, change:

```ts
    expect(traceSource).toContain('<TraceList steps={step.children} />')
```

to:

```ts
    expect(traceSource).toContain('<TraceSteps steps={step.children} />')
```

The component was renamed by concurrent work; the live region behavior is unchanged.

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass, no failures.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 with no output.

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | grep -E 'Compiled successfully|Failed|Error'`
Expected: `✓ Compiled successfully` and no error lines.

- [ ] **Step 5: Check the dev log**

Inspect the dev-server output for a fresh `expected a native <button>` line after recompilation. Expected: none.

- [ ] **Step 6: Report the final state**

Run `git status --short` and report that all changes remain uncommitted.
