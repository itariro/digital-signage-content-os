# Map Art editor restructure design

## Goal

Make the Map Art editor easier to scan and use. Split its single long control rail into two tabs, give location verification an explicit step, and show validation and poster generation as a trace of steps under the poster preview.

This is the first of three editor polish pieces. The other two are a shared data table for long lists (audit, notifications, and similar panels) and sidebar icon sizing with tooltips. Each gets its own spec and implementation cycle.

## Scope

`MapArtStudio` in `components/map-art/map-art-studio.tsx` owns this change. The album sections in `components/editor/album-detail.tsx` named Staging, In This Album, and Slideshow already work well and stay as they are. The freestanding map art page and the kiosk display stay out of scope.

Generation behavior does not change. The same geocoding endpoints, map rendering, upload endpoint, album cap, and persistence rules still apply.

## Component boundaries

New files under `components/map-art/`:

- `locations-tab.tsx`: selection mode, city textarea or continent controls, validation and discovery actions, the review list with ambiguity selects, the Confirm action, the compact verified summary, and the recent locations table.
- `recent-locations-table.tsx`: a compact shadcn `Table` of persisted locations, with Use and Remove row actions.
- `style-tab.tsx`: map style presets, poster format, poster background, zoom slider, zoom level radios, street names, map layer switches, and caption options.
- `generation-trace.tsx`: an adapter from editor task steps to the shadcn Trace parts. It holds no task state.

`MapArtStudio` keeps every piece of state, every handler, the map refs, and the `persistField` writes. Each new component receives explicit props and reports intent through callbacks.

The shadcn base-nova `Trace` component is installed with the shadcn CLI. Its registry version imports from `cn` and a placeholder icon component, so those imports are corrected to this repo's aliases and Lucide icons. No AI SDK dependency is added.

`components/ui/tabs.tsx` currently drops the destructured `orientation` prop before calling Base UI. It is fixed to forward that prop so the primitive knows its own state and keyboard direction.

## Layout

The left rail starts with `Tabs` labelled Locations and Style.

Locations keeps the current mode toggle and search controls. The reviewed candidate list stays visible while the user resolves ambiguous matches. A Confirm action marks the batch verified. Once confirmed, the list collapses into a short summary such as "12 locations ready" with an Edit action that reopens it. Below that, a Recent locations table lists persisted cities with Use and Remove actions.

Style groups controls with `FieldSet` and `FieldLegend`:

- Map style: the existing preset swatches.
- Poster: format and background colour.
- Zoom: the zoom slider plus radios for City, District, Neighbourhood, and Detail.
- Labels and layers: street names, railway and trail switches, title and coordinates checkboxes, and the custom subtitle.

The center stage keeps its preview header, map canvas, zoom footer, and finished map gallery. A trace panel sits below the status and progress row and above the gallery. It has the full stage width, so step text and detail do not squeeze the narrow rail.

The right aside stays unchanged. It is hidden in the embedded album view, and no new information is placed there.

## State and data flow

The existing `status` string stays as a short summary for screen readers and for simple errors. A new `traceSteps` state holds structured rows for the trace. A row has an id, title, optional description, status, optional detail, and optional child rows. Status values match Trace: unset for done, `running`, `error`, and `pending`.

Validation and discovery write trace rows as they run. Each geocoded city produces a row with the resolved name and region in its description, and the geocode endpoint as a detail link. Ambiguous matches produce a child row for the chosen match. Failures produce an error row and keep the existing status message.

Generation writes a parent row for the batch and one child row per poster. Child rows cover camera settle, map render, poster composition, upload, and album add. Completed rows link to the saved image. The trace panel clears when a new validation or generation run starts.

A `recentLocations` field is added to `MapArtSettings`. It holds at most ten cities that were verified and then generated successfully. A city is appended only after its poster is saved. Existing albums have no field, so the reader defaults it to an empty list and writes it through `onSettingsChange` on the first change. Remove in the recent table only changes this field, never the active batch. Use copies a city back into the active batch.

Verification is a UI state for the current batch, not a new persisted field. Confirm keeps the existing `cities`, `results`, and `activeIndex` values intact so generation still receives the same list.

## Accessibility

Tabs follow the existing shadcn keyboard behavior. Field sets give each style group a legend and, where useful, a short description. Radio groups expose their label through the legend.

Trace rows use sentence titles because Trace icons are decorative. Running and failed work is named in the title as well as shown by status colour and motion. Collapsible rows keep the keyboard behavior supplied by the Trace primitive. The status row keeps `role="status"` so short completion messages are still announced.

## Validation

Run TypeScript checking, the full Vitest suite, and the production build. Existing tests that pin map art markup are updated where the markup moved. No new test files are added, following the repo AGENTS.md.

Check in the browser at desktop, narrow rail, and mobile stacked widths, in both the standalone map art page and the embedded album view. Exercise city validation, ambiguity choice, confirm and edit, recent location use and remove, style changes, trace expansion, generation, failure paths, and the album item cap.

Capture before and after screenshots for the pull request. The before state comes from the merge commit on `origin/main` before any edits.

## Risks

The shadcn CLI can generate imports that do not match this repo. The generated Trace file is checked and corrected before the build runs.

The left rail is 276px wide and becomes a stacked column on small screens. Tabs, field legends, and trace text are checked for overflow in all three layouts.

Persisted settings from older albums lack `recentLocations`. All reads go through a default so those albums keep loading and generating.

Generation must remain sequential and gated by `busy`. The trace only observes and reports the existing flow. It does not start, stop, or reorder work.

## Non-goals

No new geocoding service, map renderer, export format, or album operation.

No changes to the album sections outside `MapArtStudio`.

No shared data table or sidebar polish in this spec. Those are separate pieces with their own design and implementation cycles.
