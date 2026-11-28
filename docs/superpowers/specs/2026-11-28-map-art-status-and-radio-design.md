# Map art status panel and radio groups

## Context

`components/map-art/map-art-studio.tsx` puts the Generate button in the top bar, the validation marker inside the Locations tab, and the generation trace in the preview column. These three pieces describe the same operation but are split across the layout. The Style tab uses toggle buttons for Poster orientation and zoom presets, which do not expose radio semantics. Two calls in `map-art-studio.tsx` render a Base UI `Button` as an anchor, which produces a console warning about native button semantics.

The shadcn `radio-group` and `carousel` components are now present in `components/ui/`, and `embla-carousel-react` is installed. The preview zoom controls are a hand-built `div` with `Separator`; `button-group` is not installed yet.

## Goals

- Remove the Base UI button warning by using anchors for navigation.
- Put validation status, generation activity, and the Generate button together under the Locations/Style tabs.
- Give Poster orientation and zoom presets real radio semantics with one-line descriptions.
- Replace the preview zoom control bar with shadcn `ButtonGroup` without changing its behavior.

## Non-goals

- Moving the status message and progress bar out of the preview column.
- Changing generation, validation, export, or persistence logic.
- Committing or opening a PR for this work.

## Decisions

- The left sidebar is ordered: tabs, one status panel, full-width Generate button.
- The status panel contains the "N locations ready" marker when `verifiedCount !== null` and `GenerationTrace` when there are trace steps. It is not rendered when both are absent.
- The Generate button moves out of the top bar. Its label, disabled condition, and `generateBatch` handler are unchanged.
- The validation banner is removed from `LocationsTab`; its Validate action and other controls stay there.
- Poster orientation and zoom presets use the Base UI `RadioGroup` and `RadioGroupItem` from `@/components/ui/radio-group`, grouped with `FieldSet` and `FieldLegend`, each option paired with `FieldLabel` and `FieldDescription`.
- Zoom keeps its slider above the preset radios.
- The two `Button render={<a>}` calls become anchors styled with `buttonVariants()`.
- The preview zoom bar uses `ButtonGroup`, `ButtonGroupSeparator`, and `ButtonGroupText` from `@/components/ui/button-group`. Its zoom value, step handlers, disabled states, labels, and reset handler are unchanged. The component stays inline in `map-art-studio.tsx`; no new wrapper component is introduced.

## Changes

### `components/map-art/map-art-studio.tsx`

- Import `buttonVariants` alongside `Button`.
- Replace the Frame editor and per-artwork download `Button render={<a>}` calls with anchors using `buttonVariants()`, preserving hrefs, download names, aria labels, and classes.
- Remove the Generate button from the header.
- Remove `<GenerationTrace />` from the preview column.
- After `</Tabs>` inside `<aside className="map-art-left">`, render a status panel containing the validation marker and `GenerationTrace`, followed by a full-width Generate button using the existing `generateLabel`, `disabled={busy || !cities.length}`, and `onClick={() => void generateBatch()}`.
- Keep `status` and `Progress` in the preview column.
- Replace the zoom control `div` with `ButtonGroup`: outline icon buttons for zoom out, zoom in and recentre; `ButtonGroupText` showing `{zoom.toFixed(1)}`; and `ButtonGroupSeparator` between zoom in and recentre. Preserve `aria-label`, `title`, disabled bounds, and handlers.

### `components/ui/button-group.tsx`

- Add the component with `pnpm dlx shadcn@latest add button-group`, declining any offer to overwrite `components/ui/button.tsx`.

### `components/map-art/locations-tab.tsx`

- Remove the verified banner block that renders `CircleCheck` and the "N locations ready" text.
- Keep `verifiedCount` in the props because `map-art-studio.tsx` uses it for the new panel.
- Keep the Validate, discover, edit-verified, and confirm actions unchanged.

### `components/map-art/style-tab.tsx`

- Import `RadioGroup` and `RadioGroupItem` from `@/components/ui/radio-group`.
- Replace the Poster orientation `ToggleGroup` with `RadioGroup value={values.orientation} onValueChange={...}` and two items: portrait and landscape.
- Replace the zoom preset `ToggleGroup` with `RadioGroup` using `String(preset.value)` values and a handler that calls `onZoomPreset(Number(value))`.
- Add one-line descriptions: Portrait "Tall 11 MP poster for walls and portrait displays", Landscape "Wide 8 MP poster for screens and landscape frames", City "Whole city context", District "Neighbourhood clusters", Streets "Street-level detail", Detail "Closest streets and blocks".
- Keep the zoom slider and all other controls unchanged.

### `tests/map-art.test.ts`

- Update the zoom preset assertion from `aria-pressed` toggle semantics to `RadioGroup` and `RadioGroupItem` with radio semantics.
- Add assertions that the sidebar panel contains both the validation marker and `GenerationTrace`, and that the Generate button follows the panel.
- Add assertions that orientation and zoom options include their descriptions.
- Add an assertion that the preview zoom controls use `ButtonGroup` with a separator and value text.

## Verification

- `npm test -- --run`
- `npx tsc --noEmit`
- `npm run build`
- Check the dev-server log after recompilation for a fresh Base UI button warning.

## Risks

- `locations-tab.tsx` and `map-art-studio.tsx` have recent uncommitted changes from another agent. Re-read both immediately before editing and keep edits targeted. If their changes conflict with this spec, stop and ask before proceeding.
- The checkout is a detached HEAD at `origin/main` with shared uncommitted work, so the spec and implementation remain uncommitted.
