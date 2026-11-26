# Map Art Editor Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Map Art control rail into Locations and Style tabs, add explicit location verification, and show validation and generation steps with the shadcn Trace component under the poster preview.

**Architecture:** `MapArtStudio` keeps all state, handlers, map refs, and persistence. Four small presentational components receive explicit props: `LocationsTab`, `StyleTab`, `RecentLocationsTable`, and `GenerationTrace`. Pure helpers for recent locations and trace steps live in `lib/map-art.ts` so they can be tested without rendering the map.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Base UI shadcn `base-nova` primitives, Vitest, pnpm.

**Prerequisite:** Worktrees do not share `node_modules`. Run `pnpm install --offline` in the worktree once before Task 1. The pnpm store on this machine already contains the locked packages.

---

### Task 1: Forward Tabs orientation to Base UI

**Files:**
- Modify: `components/ui/tabs.tsx:7-23`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Add a failing source assertion**

Append to `tests/map-art.test.ts`:

```ts
describe('tabs orientation', () => {
  it('passes orientation to the Base UI root', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../components/ui/tabs.tsx'),
      'utf8',
    )
    expect(source).toContain('orientation={orientation}')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/map-art.test.ts -t "passes orientation"`
Expected: FAIL because `components/ui/tabs.tsx` does not contain `orientation={orientation}`.

- [ ] **Step 3: Fix the primitive**

In `components/ui/tabs.tsx`, change:

```tsx
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
```

to:

```tsx
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      data-orientation={orientation}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm vitest run tests/map-art.test.ts -t "passes orientation"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/tabs.tsx tests/map-art.test.ts
git commit -m "fix(ui): forward tabs orientation to base ui"
```

---

### Task 2: Install the shadcn Trace primitive

**Files:**
- Create: `components/ui/trace.tsx`

- [ ] **Step 1: Install with the repo's configured style**

Run: `pnpm dlx shadcn@latest add trace --yes`

Expected: `components/ui/trace.tsx` is created and `package.json` is unchanged except for dependencies already present.

- [ ] **Step 2: Correct generated imports**

Open `components/ui/trace.tsx`. Replace any `from "cn"` import with:

```tsx
import { cn } from "@/lib/utils"
```

Replace any `IconPlaceholder` import and usage with Lucide icons imported from `lucide-react`. For a chevron in `TraceCollapsibleTrigger`, use:

```tsx
import { ChevronRightIcon } from "lucide-react"
```

If the CLI added `IconPlaceholder` to another file, remove that addition. Keep every `data-slot` and status class from the registry file intact.

- [ ] **Step 3: Verify the primitive compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/trace.tsx
git commit -m "feat(ui): add shadcn trace primitive"
```

---

### Task 3: Add pure map art helpers

**Files:**
- Modify: `lib/map-art.ts`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Write failing tests for recent-location helpers**

Append to `tests/map-art.test.ts`, updating the existing import from `@/lib/map-art` to include the new helpers:

```ts
import {
  appendRecentLocation,
  getRecentLocations,
  normalizeRecentLocations,
  removeAmbiguityRow,
  resolveExportView,
  waitForCameraSettled,
} from '@/lib/map-art'

describe('recent map locations', () => {
  it('drops duplicates and keeps the newest first', () => {
    const result = normalizeRecentLocations([tokyo, tokyo, { ...tokyo, name: 'Tokyo again' }])
    expect(result).toEqual([tokyo])
  })

  it('caps the stored list at ten cities', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...tokyo, id: index + 1 }))
    expect(normalizeRecentLocations(many)).toHaveLength(10)
    expect(normalizeRecentLocations(many)[0].id).toBe(1)
  })

  it('places a newly generated city at the front', () => {
    const older = { ...tokyo, id: 9, name: 'Osaka' }
    expect(appendRecentLocation([older], tokyo).map((city) => city.id)).toEqual([2, 9])
  })

  it('treats missing settings as an empty list', () => {
    expect(getRecentLocations({})).toEqual([])
    expect(getRecentLocations({ recentLocations: [tokyo] })).toEqual([tokyo])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/map-art.test.ts -t "recent map locations"`
Expected: FAIL because the helpers are not exported.

- [ ] **Step 3: Implement the helpers and trace step type**

Append to `lib/map-art.ts`:

```ts
export type TraceStepStatus = 'running' | 'error' | 'pending'

export type TraceStep = {
  id: string
  title: string
  description?: string
  status?: TraceStepStatus
  detail?: string
  children?: TraceStep[]
}

const RECENT_LOCATION_LIMIT = 10

export function normalizeRecentLocations(
  locations: MapArtLocation[] | undefined,
  limit = RECENT_LOCATION_LIMIT,
): MapArtLocation[] {
  if (!locations?.length) return []
  const seen = new Set<number>()
  const result: MapArtLocation[] = []
  for (const city of locations) {
    if (seen.has(city.id)) continue
    seen.add(city.id)
    result.push(city)
    if (result.length >= limit) break
  }
  return result
}

export function appendRecentLocation(
  locations: MapArtLocation[] | undefined,
  city: MapArtLocation,
  limit = RECENT_LOCATION_LIMIT,
): MapArtLocation[] {
  return normalizeRecentLocations([city, ...(locations ?? [])], limit)
}

export function getRecentLocations(settings: { recentLocations?: MapArtLocation[] }): MapArtLocation[] {
  return normalizeRecentLocations(settings.recentLocations)
}
```

- [ ] **Step 4: Run the tests again**

Run: `pnpm vitest run tests/map-art.test.ts -t "recent map locations"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/map-art.ts tests/map-art.test.ts
git commit -m "feat(map-art): add recent location helpers"
```

---

### Task 4: Persist recent locations in settings

**Files:**
- Modify: `lib/types.ts:137-158`
- Modify: `lib/schema.ts:121-147`
- Modify: `components/map-art/map-art-studio.tsx:34-57`
- Test: `tests/map-art.test.ts`

- [ ] **Step 1: Write failing schema assertions**

Append to `tests/map-art.test.ts`:

```ts
describe('map art settings schema', () => {
  it('accepts recent locations without requiring them', async () => {
    const { albumUpdateSchema } = await import('@/lib/schema')
    const base = {
      name: 'Map album',
      theme: 'map-art',
      items: [],
      slideshow: { presentation: 'sequence', interval: 25, transition: 'fade', order: 'sequence' },
      mapArt: {
        mode: 'cities', query: '', continent: 'Europe', count: '5', customCount: 5,
        cities: [], results: [], ambiguities: [],
        city: tokyo, activeIndex: 0, styleId: 'classic', title: true, showCoords: true,
        orientation: 'portrait', zoom: 12, backgroundColor: '#f5f0e3',
        streetLabels: 'all', showRailways: true, showTrails: true, customText: '',
      },
    }
    expect(albumUpdateSchema.safeParse(base).success).toBe(true)
    const withRecent = albumUpdateSchema.safeParse({
      ...base,
      mapArt: { ...base.mapArt, recentLocations: [tokyo] },
    })
    expect(withRecent.success).toBe(true)
    expect(withRecent.success ? withRecent.data.mapArt?.recentLocations : []).toEqual([tokyo])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/map-art.test.ts -t "accepts recent locations"`
Expected: FAIL because the schema strips or rejects `recentLocations`.

- [ ] **Step 3: Add the optional type field**

In `lib/types.ts`, inside `MapArtSettings`, add after `customText: string`:

```ts
  recentLocations?: MapArtLocation[]
```

- [ ] **Step 4: Add the schema field**

In `lib/schema.ts`, inside `mapArtSettingsSchema`, add after `customText: z.string().max(60),`:

```ts
  recentLocations: z.array(mapArtLocationSchema).max(10).default([]),
```

- [ ] **Step 5: Seed the default settings**

In `components/map-art/map-art-studio.tsx`, inside `defaultMapArtSettings()`, add after `customText: '',`:

```ts
    recentLocations: [],
```

- [ ] **Step 6: Run the tests again**

Run: `pnpm vitest run tests/map-art.test.ts -t "accepts recent locations"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/schema.ts components/map-art/map-art-studio.tsx tests/map-art.test.ts
git commit -m "feat(map-art): persist recent locations"
```

---

### Task 5: Build the recent locations table

**Files:**
- Create: `components/map-art/recent-locations-table.tsx`

- [ ] **Step 1: Create the component**

Create `components/map-art/recent-locations-table.tsx` with exactly:

```tsx
'use client'

import { ArrowRight, Trash2 } from 'lucide-react'
import type { MapArtLocation } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function RecentLocationsTable({ locations, onUse, onRemove }: {
  locations: MapArtLocation[]
  onUse: (city: MapArtLocation) => void
  onRemove: (city: MapArtLocation) => void
}) {
  if (!locations.length) {
    return <Empty className="border py-4"><EmptyDescription>No generated locations yet.</EmptyDescription></Empty>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((city) => (
          <TableRow key={city.id}>
            <TableCell>
              <span className="block text-xs font-medium text-foreground">{city.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[city.region, city.country].filter(Boolean).join(', ')}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Use ${city.name}`} onClick={() => onUse(city)}>
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${city.name} from recent locations`}
                onClick={() => onRemove(city)}
              >
                <Trash2 />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/map-art/recent-locations-table.tsx
git commit -m "feat(map-art): add recent locations table"
```

---

### Task 6: Build the Locations tab

**Files:**
- Create: `components/map-art/locations-tab.tsx`

- [ ] **Step 1: Create the component**

Create `components/map-art/locations-tab.tsx` with exactly this file. It preserves the current controls and adds Confirm, the verified summary, and the recent table.

```tsx
'use client'

import { Check, MapPin, Search, X } from 'lucide-react'
import type { MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { RecentLocationsTable } from './recent-locations-table'

export function LocationsTab({
  mode, query, continent, count, customCount, continentOptions,
  results, ambiguities, verifiedCount, recentLocations, busy,
  onModeChange, onQueryChange, onContinentChange, onCountChange, onCustomCountChange,
  onValidate, onDiscover, onChooseMatch, onRemoveLocation, onConfirm, onEditVerified,
  onUseRecent, onRemoveRecent,
}: {
  mode: MapArtSettings['mode']
  query: string
  continent: string
  count: string
  customCount: number
  continentOptions: string[]
  results: MapArtLocation[]
  ambiguities: MapArtAmbiguity[]
  verifiedCount: number | null
  recentLocations: MapArtLocation[]
  busy: boolean
  onModeChange: (mode: MapArtSettings['mode']) => void
  onQueryChange: (query: string) => void
  onContinentChange: (continent: string) => void
  onCountChange: (count: string) => void
  onCustomCountChange: (count: number) => void
  onValidate: () => void
  onDiscover: () => void
  onChooseMatch: (query: string, id: number) => void
  onRemoveLocation: (city: MapArtLocation) => void
  onConfirm: () => void
  onEditVerified: () => void
  onUseRecent: (city: MapArtLocation) => void
  onRemoveRecent: (city: MapArtLocation) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ToggleGroup
        className="grid w-full grid-cols-2"
        aria-label="City selection mode"
        value={[mode]}
        onValueChange={(next) => next[0] && onModeChange(next[0] as MapArtSettings['mode'])}
      >
        <ToggleGroupItem value="cities" variant="outline" className="h-9">Enter cities</ToggleGroupItem>
        <ToggleGroupItem value="continent" variant="outline" className="h-9">Choose continent</ToggleGroupItem>
      </ToggleGroup>

      {mode === 'cities' ? (
        <section className="map-art-block">
          <Field className="gap-1">
            <div className="flex items-center justify-between">
              <FieldLabel className="map-art-label" htmlFor="city-list">Your cities</FieldLabel>
              <span className="map-art-label-count">{query.split(/\n|;/).filter((line) => line.trim()).length}</span>
            </div>
            <Textarea
              id="city-list"
              className="map-art-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={'Melbourne, Australia\nTokyo, Japan\nParis, France'}
              rows={7}
            />
          </Field>
          <p className="map-art-hint">One location per line. Add a country to resolve ambiguous names.</p>
          <Button variant="outline" size="sm" className="w-full" onClick={onValidate} disabled={busy}>
            <Search size={15} data-icon="inline-start" /> Validate locations
          </Button>
        </section>
      ) : (
        <section className="map-art-block flex flex-col gap-3">
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="continent">Continent</FieldLabel>
            <Select
              items={continentOptions.map((name) => ({ value: name, label: name }))}
              value={continent}
              onValueChange={(next) => next !== null && onContinentChange(String(next))}
            >
              <SelectTrigger id="continent" className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {continentOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="city-count">Number of cities</FieldLabel>
            <Select
              items={['5', '10', '20', 'custom'].map((value) => ({
                value,
                label: value === 'custom' ? 'Custom number' : `${value} cities`,
              }))}
              value={count}
              onValueChange={(next) => next !== null && onCountChange(String(next))}
            >
              <SelectTrigger id="city-count" className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {['5', '10', '20', 'custom'].map((value) => (
                    <SelectItem key={value} value={value}>{value === 'custom' ? 'Custom number' : `${value} cities`}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {count === 'custom' && (
            <Input
              className="map-art-input"
              aria-label="Custom number of cities"
              type="number"
              min={1}
              max={20}
              value={customCount}
              onChange={(event) => onCustomCountChange(Math.min(20, Math.max(1, Number(event.target.value))))}
            />
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={onDiscover} disabled={busy}>
            <MapPin size={15} data-icon="inline-start" /> Find cities
          </Button>
          <p className="map-art-hint">Up to 20 curated candidates are geocoded and checked before generation.</p>
        </section>
      )}

      {verifiedCount === null && results.length > 0 && (
        <section className="map-art-block">
          <div className="map-art-label">Review locations <span>{results.length}</span></div>
          <div className="map-art-city-list">
            {results.map((item) => (
              <div key={item.id}>
                <span className="truncate text-xs">{item.name}</span>
                <small>{[item.region, item.country].filter(Boolean).join(', ')}</small>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onRemoveLocation(item)}
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={onConfirm} disabled={busy}>
            <Check size={15} data-icon="inline-start" /> Confirm {results.length} locations
          </Button>
        </section>
      )}

      {verifiedCount !== null && (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">{verifiedCount} locations verified</span>
          <Button type="button" variant="ghost" size="sm" onClick={onEditVerified}>Edit</Button>
        </div>
      )}

      {ambiguities.map((entry, index) => (
        <section className="map-art-block" key={entry.query}>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor={`ambiguous-city-${index}`}>
              Choose match for “{entry.query}”
            </FieldLabel>
            <Select
              items={entry.matches.map((match) => ({
                value: String(match.id),
                label: [match.name, match.region, match.country].filter(Boolean).join(', '),
              }))}
              value={String(entry.chosenId)}
              onValueChange={(next) => next !== null && onChooseMatch(entry.query, Number(next))}
            >
              <SelectTrigger id={`ambiguous-city-${index}`} className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {entry.matches.map((match) => (
                    <SelectItem key={match.id} value={String(match.id)}>
                      {[match.name, match.region, match.country].filter(Boolean).join(', ')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </section>
      ))}

      <section className="map-art-block">
        <div className="map-art-label">Recent locations</div>
        <RecentLocationsTable locations={recentLocations} onUse={onUseRecent} onRemove={onRemoveRecent} />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/map-art/locations-tab.tsx
git commit -m "feat(map-art): add locations tab"
```

---

### Task 7: Build the Style tab

**Files:**
- Create: `components/map-art/style-tab.tsx`

- [ ] **Step 1: Create the component**

Create `components/map-art/style-tab.tsx` with exactly:

```tsx
'use client'

import type { MapArtSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

export type StyleOption = {
  id: MapArtSettings['styleId']
  label: string
  swatches: string[]
}

const zoomLevels = [
  { value: 10, label: 'City', description: 'Whole city context' },
  { value: 12, label: 'District', description: 'Neighbourhood clusters' },
  { value: 14, label: 'Neighbourhood', description: 'Street-level detail' },
  { value: 16, label: 'Detail', description: 'Closest streets and blocks' },
] as const

export function StyleTab({
  values, styles, presets,
  onStyleChange, onOrientationChange, onBackgroundChange, onZoomChange, onZoomPreset,
  onStreetLabelsChange, onTitleChange, onCoordsChange, onRailwaysChange, onTrailsChange,
  onCustomTextChange,
}: {
  values: Pick<
    MapArtSettings,
    'styleId' | 'orientation' | 'backgroundColor' | 'zoom' | 'streetLabels' |
    'title' | 'showCoords' | 'showRailways' | 'showTrails' | 'customText'
  >
  styles: readonly StyleOption[]
  presets: string[]
  onStyleChange: (style: StyleOption) => void
  onOrientationChange: (orientation: MapArtSettings['orientation']) => void
  onBackgroundChange: (color: string) => void
  onZoomChange: (zoom: number) => void
  onZoomPreset: (zoom: number) => void
  onStreetLabelsChange: (value: MapArtSettings['streetLabels']) => void
  onTitleChange: (value: boolean) => void
  onCoordsChange: (value: boolean) => void
  onRailwaysChange: (value: boolean) => void
  onTrailsChange: (value: boolean) => void
  onCustomTextChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <FieldSet className="gap-3">
        <FieldLegend>Map style</FieldLegend>
        <div className="map-art-presets">
          {presets.map((preset, index) => {
            const option = styles[index % styles.length]
            const active = values.styleId === option.id
            return (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'outline'}
                className={`h-auto flex-col items-stretch whitespace-normal ${active ? 'active' : ''}`}
                onClick={() => onStyleChange(option)}
                aria-pressed={active}
              >
                <span className={`map-art-swatch swatch-${option.id}`}><i /><i /><i /></span>
                <span>{preset}</span>
              </Button>
            )
          })}
        </div>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Poster</FieldLegend>
        <div className="map-art-segment">
          <Button type="button" size="sm" variant={values.orientation === 'portrait' ? 'secondary' : 'ghost'} aria-pressed={values.orientation === 'portrait'} onClick={() => onOrientationChange('portrait')}>Portrait</Button>
          <Button type="button" size="sm" variant={values.orientation === 'landscape' ? 'secondary' : 'ghost'} aria-pressed={values.orientation === 'landscape'} onClick={() => onOrientationChange('landscape')}>Landscape</Button>
        </div>
        <div className="map-art-resolution">
          {values.orientation === 'portrait' ? '11 MP · 2880 × 3840' : '8 MP · 3840 × 2160'} <span>PNG</span>
        </div>
        <Field className="gap-1">
          <FieldLabel className="map-art-label" htmlFor="poster-background">Poster background</FieldLabel>
          <div className="map-art-color-picker">
            <Input id="poster-background" type="color" className="map-art-color-input" value={values.backgroundColor} onChange={(event) => onBackgroundChange(event.target.value)} />
            <Input className="map-art-input" aria-label="Background hex color" value={values.backgroundColor} onChange={(event) => {
              if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onBackgroundChange(event.target.value)
            }} />
          </div>
        </Field>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Zoom level</FieldLegend>
        <Field className="gap-1">
          <div className="flex items-center justify-between">
            <FieldLabel className="map-art-label" htmlFor="map-zoom">Map zoom</FieldLabel>
            <span className="map-art-label-count">{values.zoom.toFixed(1)}</span>
          </div>
          <Slider
            id="map-zoom"
            aria-label="Map zoom"
            value={values.zoom}
            min={8}
            max={16}
            step={0.1}
            onValueChange={(next) => onZoomChange(next as number)}
          />
        </Field>
        <div role="radiogroup" aria-label="Zoom level" className="map-art-zoom-presets">
          {zoomLevels.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              role="radio"
              size="sm"
              variant={Math.abs(values.zoom - preset.value) < 0.1 ? 'secondary' : 'outline'}
              aria-checked={Math.abs(values.zoom - preset.value) < 0.1}
              title={preset.description}
              onClick={() => onZoomPreset(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Labels and layers</FieldLegend>
        <Field className="gap-1">
          <FieldLabel className="map-art-label" htmlFor="street-label-density">Street names</FieldLabel>
          <Select
            items={[
              { value: 'major', label: 'Major streets' },
              { value: 'all', label: 'All street names' },
              { value: 'none', label: 'Hide street names' },
            ]}
            value={values.streetLabels}
            onValueChange={(next) => next !== null && onStreetLabelsChange(String(next) as MapArtSettings['streetLabels'])}
          >
            <SelectTrigger id="street-label-density" className="map-art-input w-full"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="major">Major streets</SelectItem>
                <SelectItem value="all">All street names</SelectItem>
                <SelectItem value="none">Hide street names</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="map-art-layer-toggle">
          <Switch id="map-layer-railways" checked={values.showRailways} onCheckedChange={onRailwaysChange} />
          <FieldLabel htmlFor="map-layer-railways" className="font-normal">Railway lines</FieldLabel>
        </div>
        <div className="map-art-layer-toggle">
          <Switch id="map-layer-trails" checked={values.showTrails} onCheckedChange={onTrailsChange} />
          <FieldLabel htmlFor="map-layer-trails" className="font-normal">Trails &amp; paths</FieldLabel>
        </div>
        <div className="map-art-checks flex flex-col gap-3">
          <div>
            <Checkbox id="poster-title" checked={values.title} onCheckedChange={(checked) => onTitleChange(checked === true)} />
            <FieldLabel htmlFor="poster-title" className="font-normal">City title</FieldLabel>
          </div>
          <div>
            <Checkbox id="poster-coordinates" checked={values.showCoords} onCheckedChange={(checked) => onCoordsChange(checked === true)} />
            <FieldLabel htmlFor="poster-coordinates" className="font-normal">Coordinates</FieldLabel>
          </div>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="poster-note">Custom subtitle</FieldLabel>
            <Input
              id="poster-note"
              className="map-art-input"
              maxLength={60}
              value={values.customText}
              onBlur={() => onCustomTextChange(values.customText)}
              onChange={(event) => onCustomTextChange(event.target.value)}
              placeholder="Optional text"
            />
          </Field>
        </div>
      </FieldSet>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors. If `FieldLegend` or `FieldSet` is not exported from `components/ui/field.tsx`, add named exports there using the existing `FieldSet` and `FieldLegend` implementations rather than changing other primitives.

- [ ] **Step 3: Commit**

```bash
git add components/map-art/style-tab.tsx components/ui/field.tsx
git commit -m "feat(map-art): add style tab"
```

---

### Task 8: Build the generation trace adapter

**Files:**
- Create: `components/map-art/generation-trace.tsx`

- [ ] **Step 1: Create the component**

Create `components/map-art/generation-trace.tsx` with exactly:

```tsx
'use client'

import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import type { TraceStep, TraceStepStatus } from '@/lib/map-art'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

function StatusIcon({ status }: { status?: TraceStepStatus }) {
  if (status === 'error') return <CircleAlert />
  if (status === 'pending') return <CircleDashed />
  if (status === 'running') return <LoaderCircle className="animate-spin" />
  return <CircleCheck />
}

function StepLine({ step }: { step: TraceStep }) {
  return (
    <TraceLine status={step.status}>
      <TraceIcon><StatusIcon status={step.status} /></TraceIcon>
      <TraceTitle>{step.title}</TraceTitle>
      {step.description && <TraceDescription>{step.description}</TraceDescription>}
      {step.children?.length ? <TraceDescription>{step.children.length} steps</TraceDescription> : null}
    </TraceLine>
  )
}

export function GenerationTrace({ steps }: { steps: TraceStep[] }) {
  if (!steps.length) return null

  return (
    <section aria-label="Generation activity" className="w-full rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-foreground">Generation activity</p>
      <Trace className="gap-1">
        {steps.map((step) => {
          const hasDetail = Boolean(step.detail || step.children?.length)
          if (!hasDetail) return <StepLine key={step.id} step={step} />
          return (
            <TraceCollapsible key={step.id} defaultOpen={step.status === 'running'}>
              <TraceCollapsibleTrigger>
                <StepLine step={step} />
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>
                {step.detail && <p className="mb-2 text-xs text-muted-foreground">{step.detail}</p>}
                {step.children?.length ? <GenerationTrace steps={step.children} /> : null}
              </TraceCollapsibleContent>
            </TraceCollapsible>
          )
        })}
      </Trace>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors. If a named export is missing from `components/ui/trace.tsx`, add it using the registry implementation rather than changing the other Trace parts.

- [ ] **Step 3: Commit**

```bash
git add components/map-art/generation-trace.tsx
git commit -m "feat(map-art): add generation trace adapter"
```

---

### Task 9: Rewire MapArtStudio

**Files:**
- Modify: `components/map-art/map-art-studio.tsx`

- [ ] **Step 1: Add failing wiring assertions**

Append to `tests/map-art.test.ts`:

```ts
describe('map art tab and trace wiring', () => {
  it('renders both tabs and the trace under the preview', () => {
    expect(studioSource).toContain('<Tabs value={tab}')
    expect(studioSource).toContain('<TabsTrigger value="locations">Locations</TabsTrigger>')
    expect(studioSource).toContain('<TabsTrigger value="style">Style</TabsTrigger>')
    expect(studioSource).toContain('<GenerationTrace steps={traceSteps} />')
  })

  it('appends a recent location only after generation succeeds', () => {
    const appendIndex = studioSource.indexOf('appendRecentLocation(')
    const savedIndex = studioSource.indexOf('const url = await renderArtwork(selected, view)')
    expect(appendIndex).toBeGreaterThan(savedIndex)
    expect(studioSource).toContain("persistField('recentLocations'")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/map-art.test.ts -t "map art tab and trace wiring"`
Expected: FAIL because the studio does not yet contain the tabs or trace.

- [ ] **Step 3: Update imports**

Replace the existing imports in `components/map-art/map-art-studio.tsx` lines 4-27 with:

```ts
import './map-art.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import * as maplibregl from 'maplibre-gl'
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { Album, AlbumItem, FrameStore, MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import {
  appendRecentLocation,
  getRecentLocations,
  removeAmbiguityRow,
  resolveExportView,
  waitForCameraSettled,
  type MapView,
  type TraceStep,
} from '@/lib/map-art'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerationTrace } from './generation-trace'
import { LocationsTab } from './locations-tab'
import { StyleTab, type StyleOption } from './style-tab'
```

- [ ] **Step 4: Add the new state**

After `const [customText, setCustomText] = useState(initialSettings.customText)` add:

```ts
  const [tab, setTab] = useState<'locations' | 'style'>('locations')
  const [recentLocations, setRecentLocations] = useState(() => getRecentLocations(initialSettings))
  const [verifiedCount, setVerifiedCount] = useState<number | null>(null)
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([])
```

After the setter group, add:

```ts
  const setRecent = (value: MapArtLocation[]) => setRecentLocations(persistField('recentLocations', value))
```

- [ ] **Step 5: Write trace rows during validation and discovery**

In `validateCities`, before `setBusy(true)`, add:

```ts
    setTraceSteps([{
      id: 'validate',
      title: 'Validating locations',
      status: 'running',
      children: unique.map((line) => ({ id: `geocode-${line}`, title: `Resolving ${line}`, status: 'pending' })),
    }])
```

Replace the loop body with:

```ts
      for (const line of unique) {
        const matches = await resolveCity(line)
        const chosen = matches[0]
        setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
          ...step,
          children: step.children?.map((child) => child.id === `geocode-${line}` ? {
            ...child,
            status: chosen ? undefined : 'error',
            description: chosen ? `${[chosen.name, chosen.region, chosen.country].filter(Boolean).join(', ')}` : 'No match found',
            detail: `Geocoded ${line} with /api/geocode.`,
          } : child),
        } : step))
        if (chosen) {
          const rowId = found.length
          found.push(chosen)
          if (matches.length > 1) needsReview.push({ query: line, rowId, chosenId: chosen.id, matches })
        }
      }
```

After `setStatus(...)` success message, update the parent row:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
        ...step,
        title: `Validated ${found.length} of ${unique.length} locations`,
        status: undefined,
      } : step))
```

In `discoverCities`, add before `setBusy(true)`:

```ts
    setTraceSteps([{
      id: 'discover',
      title: `Validating city candidates across ${continent}`,
      status: 'running',
      children: candidates.slice(0, target).map((candidate) => ({
        id: `candidate-${candidate}`,
        title: `Checking ${candidate}`,
        status: 'pending',
      })),
    }])
```

Inside its loop, after each `resolveCity(candidate)` call, add:

```ts
        setTraceSteps((current) => current.map((step) => step.id === 'discover' ? {
          ...step,
          children: step.children?.map((child) => child.id === `candidate-${candidate}` ? {
            ...child,
            status: match ? undefined : 'error',
            description: match ? `${[match.name, match.region, match.country].filter(Boolean).join(', ')}` : 'No match found',
            detail: `Geocoded ${candidate} with /api/geocode.`,
          } : child),
        } : step))
```

After its success status message, add:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'discover' ? {
        ...step,
        title: `Found ${found.length} cities in ${continent}`,
        status: undefined,
      } : step))
```

In the `validateCities` catch block, before `setStatus`, add:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'validate' ? {
        ...step,
        title: 'Failed to validate locations',
        status: 'error',
      } : step))
```

In the `discoverCities` catch block, before `setStatus`, add:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'discover' ? {
        ...step,
        title: `Failed to validate cities in ${continent}`,
        status: 'error',
      } : step))
```

- [ ] **Step 6: Write trace rows during generation**

Before the generation loop in `generateBatch`, add:

```ts
    setTraceSteps([{
      id: 'generate',
      title: `Generating ${batch.length} poster${batch.length === 1 ? '' : 's'}`,
      status: 'running',
      children: batch.map((selected) => ({
        id: `poster-${selected.id}`,
        title: `Preparing ${selected.name}`,
        status: 'pending',
        children: [
          { id: `camera-${selected.id}`, title: 'Settling preview camera', status: 'pending' },
          { id: `render-${selected.id}`, title: 'Rendering map tiles', status: 'pending' },
          { id: `compose-${selected.id}`, title: 'Composing poster', status: 'pending' },
          { id: `upload-${selected.id}`, title: 'Uploading PNG', status: 'pending' },
          { id: `album-${selected.id}`, title: onAddToAlbum ? 'Adding to this album' : 'Saving to image library', status: 'pending' },
        ],
      })),
    }])
```

Inside the loop, after `const url = await renderArtwork(selected, view)`, add:

```ts
        setRecent(appendRecentLocation(recentRef.current, selected))
```

Add `const recentRef = useRef(recentLocations)` beside the existing `settingsRef`, `preferencesRef`, and `cityRef` declarations. Beside the existing `cityRef.current = city` assignment, add `recentRef.current = recentLocations` so the loop reads the latest value without closing over a stale array.

Also inside the loop, mark the poster row done and link the result:

```ts
        setTraceSteps((current) => current.map((step) => step.id === 'generate' ? {
          ...step,
          children: step.children?.map((child) => child.id === `poster-${selected.id}` ? {
            ...child,
            status: undefined,
            title: `Generated poster for ${selected.name}`,
            detail: `Style: ${style.label}. Zoom: ${view.zoom.toFixed(1)}.`,
            children: child.children?.map((grandchild) => ({ ...grandchild, status: undefined })),
          } : child),
        } : step))
```

After the loop, before the final `setStatus`, add:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'generate' ? {
        ...step,
        title: `Generated ${output.length} poster${output.length === 1 ? '' : 's'}`,
        status: undefined,
      } : step))
```

In the `generateBatch` catch block, before `setStatus`, add:

```ts
      setTraceSteps((current) => current.map((step) => step.id === 'generate' ? {
        ...step,
        title: 'Poster generation failed',
        status: 'error',
      } : step))
```

- [ ] **Step 7: Replace the left rail render**

Replace the whole `<aside className="map-art-left"> ... </aside>` block (currently lines 606-767) with:

```tsx
        <aside className="map-art-left">
          <Tabs value={tab} onValueChange={(next) => setTab(next as 'locations' | 'style')}>
            <TabsList className="m-4 w-auto">
              <TabsTrigger value="locations">Locations</TabsTrigger>
              <TabsTrigger value="style">Style</TabsTrigger>
            </TabsList>
            <TabsContent value="locations">
              <LocationsTab
                mode={mode}
                query={query}
                continent={continent}
                count={count}
                customCount={customCount}
                continentOptions={Object.keys(continentCities)}
                results={results}
                ambiguities={ambiguities}
                verifiedCount={verifiedCount}
                recentLocations={recentLocations}
                busy={busy}
                onModeChange={setMode}
                onQueryChange={(value) => { setQuery(value); persistField('query', value) }}
                onContinentChange={setContinent}
                onCountChange={setCount}
                onCustomCountChange={setCustomCount}
                onValidate={() => void validateCities()}
                onDiscover={() => void discoverCities()}
                onChooseMatch={chooseCityMatch}
                onRemoveLocation={removeLocation}
                onConfirm={() => setVerifiedCount(results.length)}
                onEditVerified={() => setVerifiedCount(null)}
                onUseRecent={(city) => {
                  setCities((current) => [...current, city])
                  setResults((current) => [...current, city])
                  setCity(city)
                  setActiveIndex(cities.length)
                }}
                onRemoveRecent={(city) => setRecent(recentLocations.filter((entry) => entry.id !== city.id))}
              />
            </TabsContent>
            <TabsContent value="style">
              <StyleTab
                values={{
                  styleId: style.id,
                  orientation,
                  backgroundColor,
                  zoom,
                  streetLabels,
                  title,
                  showCoords,
                  showRailways,
                  showTrails,
                  customText,
                }}
                styles={styles as readonly StyleOption[]}
                presets={presets}
                onStyleChange={setStyle}
                onOrientationChange={setOrientation}
                onBackgroundChange={setBackgroundColor}
                onZoomChange={(value) => { setZoom(value); mapRef.current?.setZoom(value) }}
                onZoomPreset={(value) => {
                  setZoom(value)
                  mapRef.current?.flyTo({ center: [city.lon, city.lat], zoom: value, duration: 300 })
                }}
                onStreetLabelsChange={setStreetLabels}
                onTitleChange={setTitle}
                onCoordsChange={setShowCoords}
                onRailwaysChange={setShowRailways}
                onTrailsChange={setShowTrails}
                onCustomTextChange={setCustomText}
              />
            </TabsContent>
          </Tabs>
        </aside>
```

Keep `continentCities`, `styles`, and `presets` where they are in the studio.

- [ ] **Step 8: Place the trace in the stage**

In the center `<main className="map-art-stage">`, change the status block from:

```tsx
          {status && <div className="map-art-status" role="status"><span>{status}</span>{busy && <Progress aria-label="Map generation progress" max={Math.max(1, onAddToAlbum ? Math.min(cities.length, 200 - albumCount) : cities.length)} value={batchProgress} />}</div>}
```

to:

```tsx
          {status && <div className="map-art-status" role="status"><span>{status}</span>{busy && <Progress aria-label="Map generation progress" max={Math.max(1, onAddToAlbum ? Math.min(cities.length, 200 - albumCount) : cities.length)} value={batchProgress} />}</div>}
          <GenerationTrace steps={traceSteps} />
```

Keep the gallery after the trace.

- [ ] **Step 9: Run the wiring tests**

Run: `pnpm vitest run tests/map-art.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add components/map-art/map-art-studio.tsx tests/map-art.test.ts
git commit -m "feat(map-art): restructure editor into tabs with generation trace"
```

---

### Task 10: Verify and capture evidence

**Files:**
- No source files in this task.

- [ ] **Step 1: Confirm dependencies are installed**

Run: `pnpm install --offline`

Expected: install is already satisfied from the prerequisite, or completes using the shared pnpm store.

- [ ] **Step 2: Run the full check set**

Run each command separately and record the output:

```bash
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test --run
pnpm build
```

Expected: TypeScript clean, all tests pass, production build compiled successfully.

- [ ] **Step 3: Capture before and after screenshots**

Start the app on a dedicated port and capture the Map Art panel before and after using `@vercel/before-and-after`, setting `AGENT_BROWSER_ARGS="--no-sandbox"` if Chrome reports a sandbox error. Use the merge commit `2b5f269` for the before state in a separate detached worktree. Save the images under `docs/evidence/map-art-tabs/`.

- [ ] **Step 4: Review the diff**

Run: `git diff origin/main...HEAD --stat`
Expected: only the files named in Tasks 1 through 9 plus the evidence images and the spec.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/evidence/map-art-tabs
git commit -m "docs: add map art restructure screenshots"
```
