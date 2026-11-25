# Multi-frame canvas: spec assessment and plan map

- **Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md`
- **Assessed against:** `main` at `9c4cedb` (the spec baseline is `a245f44`)
- **Date:** 2026-11-25

## Verdict

The core design is sound and unusually complete: scenes are pure functions of synced
time, canvas state is centrally owned, and the display runtime never needs frame-to-frame
networking. Nothing in the spec needs a redesign.

It does need four corrections and a few additions before it can be implemented literally.
They are listed below, with the decision each plan takes.

The work is delivered as four plans, one per phase, in order:

| Plan | Covers | Working software at the end |
|---|---|---|
| `01-phase-1-engine-and-display.md` | Types, validation, persistence, pure engine, sync plumbing, display runtime, dev harness | A kiosk (or the harness) plays a canvas from a seeded `canvas_state` row |
| `02-phase-2-authoring-and-deployment.md` | Library document, route guards, deploy/release/identify services, admin UI, scene forms, wall preview | An operator builds a canvas and takes it live from the console |
| `03-phase-3-observability.md` | Status tab, report columns shown, unpublished-change detection, revoke cleanup, docs | Operators can see and fix a broken frame |
| `04-phase-4-catalog-and-extras.md` | Content-addressed assets, canvas draw path, deterministic game replay, bezel modes, 28 catalog scenes, bounce trails, physical size mode, rotation | All catalog scenes run on a wall and stay deterministic |
| `05-phase-5-composition.md` | Layers, wall transitions, palettes, six starter templates | Mixed shows composed from the catalog with no uploads for templates |

Each plan produces a testable slice on its own. Do not start a later plan on an
unmerged branch unless the branch is explicitly stacked on the earlier one.

## Spec drift against current `main`

The spec says "if something here conflicts with the code, the code wins for existing
behavior". These are the conflicts found.

1. **Baseline moved.** The spec was written at `a245f44`. `main` is now `9c4cedb`
   and includes the map-art generator (`423a388`, `addce2c`, `64fe1a4`, `cafd76c`).
   `ALBUM_THEMES` is now `['movies', 'tv', 'books', 'music', 'photos', 'map-art']`
   and `THEME_META` / `THEME_PRESENTATION` have `map-art` entries.
   **Decision:** append `'canvas'`, never replace the list shown in spec §7.1.
   Keep `map-art` in every map and picker.
2. **`PRESENTATIONS` is unchanged** (`fill, poster, book, vinyl, gallery, mosaic,
   reveal`). Only append `'canvas'`.
3. **`lib/schema.ts` grew.** Widget style validation is still inline there, and the
   spec's scene schemas need it. Importing scene schemas from `lib/schema.ts` while
   scene definitions import `lib/schema.ts` would create a cycle.
   **Decision:** move widget-style schema primitives to `lib/widget-style-schema.ts`
   and re-export them from `lib/schema.ts`, so existing imports keep working.
4. **`scripts/release.ts`, release check and docs.** The repo has a release workflow
   (`pnpm release:check`). Plans run it before the PR.

## Addendum scope (2026-11-25)

A later addendum expands the catalog and adds a fifth phase. It is authoritative for
new behavior; the original spec still governs everything it does not change.

- The catalog is **28 scenes**, not nine. They are grouped by mood: Gallery
  (`panorama`, `gallery-wall`, `exhibit`, `mosaic-wall`, `tile-reveal`), Type
  (`kinetic-type`, `split-flap`, `multi-lane-marquee`, `wall-clock`, `countdown`),
  Ambient colour (`gradient-flow`, `color-field`, `light-sweep`), Ambient motion
  (`ripples`, `metaballs`, `lissajous`, `flow-lines`, `moire`), Ambient particles
  (`starfield`, `matrix-rain`, `fireworks`, `bouncing-balls`), and Arcade/setup
  (`chase-lights`, `breakout`, `snake`, `sprite-parade`, `life`, `calibration`).
  The original phase-4 names `wall-clock`, `countdown`, `gradient-flow`,
  `starfield`, `matrix-rain`, `fireworks` and `bouncing-balls` are included here;
  `sync-test` remains a phase-1 scene and `calibration` is the addendum's setup
  scene, not a duplicate.
- `mosaic-wall` and `tile-reveal` reuse `lib/mosaic.ts` and `lib/reveal.ts` at wall
  scale. They do not copy those engines.
- Phase 5 adds composition: up to three stacked layers, wall-wide wipe/iris/chase
  transitions, shared palettes, and six starter shows that need no uploads.
- Shared pieces land before the scene files that use them: a canvas 2D drawing
  path for heavier effects, a bounded deterministic replay rule for small
  self-playing games, and a bezel mode that shows, hides or collapses the gap.

### Image delivery decision

The addendum asked whether existing album images already reach kiosks through
`/api/media`. They do not:

- `app/api/media/route.ts` writes bytes to the console's `FRAME_DATA_DIR/media`;
  `app/api/media/[file]/route.ts` reads that same local directory. Sync transfers
  only the frame-document JSON (`lib/sync/server.ts` `handlePull`), never the
  media bytes.
- A kiosk browser resolves `/api/media/<name>` against its **own** origin, where
  the file does not exist. The URL string survives the pull; the image does not.
- Remote `https://` artwork URLs do reach a kiosk because the browser fetches
  them directly, but they depend on the allowlist and on WAN access.

Decision: gallery images use the designed **content-addressed canvas asset
path**, not `/api/media`. Phase 4 adds a pull-only `canvas_assets` table and
local delivery route before any gallery scene is added. Scene configs reference
assets as `canvas-asset:<sha256>`; never as `/api/media/...` or
`/api/uploads/...`.

## Gaps and ambiguities found

Each item is resolved in a plan. None require a spec rewrite before coding.

1. **`MarqueeConfig` has no font size.** It reuses `WidgetStyle`, which has no
   `fontSize` field (text widgets size through container queries). §10.3 nevertheless
   says "160 cpx font".
   **Decision:** add `fontSize: number` (cpx, 16..1600) to `MarqueeConfig`.
2. **`visibleCopies` formula in §10.3 is wrong.** With `x_j = L - tau + j·P` and a
   strip occupying `[x_j, x_j + T]`, the slot-visible range is
   `j ∈ ((tau + slotStart - T - L)/P, (tau + slotEnd - L)/P)`, not
   `(tau - slotEnd - T)/P .. (tau - slotStart)/P`. Plan 1 derives the bounds, writes
   the test first, and records the correction in the PR.
3. **Pong hit times and overshoot disagree.** §10.5 sets `t_j = serveDelay + j·tau`
   with `tau = D/vu` but also extends the final traversal by `O`. The two cannot both
   hold at a constant `vu`.
   **Decision:** the first `n-1` traversals take `D/vu`; the final traversal takes
   `(D+O)/vu`, so the miss lands exactly at `serveDelay + flightSec`. Plan 1 tests
   that equality.
4. **Deployment revision is two counters.** `CanvasDeployment.revision` is per-canvas
   (§7.4, §13.1 step 3), while `canvas_state.revision` is per-row delivery revision
   (§7.4 table, §13.3). The spec uses "revision" for both.
   **Decision:** name them `deploymentRevision` and `rowRevision` in service internals.
   The row carries the deployment object whose own `revision` is the deployment one.
5. **`SceneField` is referenced but never defined.** The editor's generic form needs a
   shape.
   **Decision:** define it in plan 1 (`lib/canvas/scenes/types.ts`) as a discriminated
   union (`number`, `slider`, `text`, `textarea`, `lines`, `select`, `color`, `toggle`,
   `font`, `style`, `image`) keyed by dot path into the scene config.
6. **`MarqueeStrip` is required but API-created scenes cannot measure.** §10.3 says the
   server fills an estimate.
   **Decision:** `strip` is optional in the type and schema; `ensureStrip(config)` in
   `lib/canvas/scenes/marquee.ts` returns stored, block-derived, or estimated strip.
   The editor sets `needsMeasure` only as a UI hint; it is not persisted.
7. **`Album.scenes` invariant versus `POST /api/albums`.** The generic create path makes
   an empty album with `defaultSlideshow(theme)`, which would violate the canvas
   invariant (`scenes` undefined, `items: []`).
   **Decision:** `POST /api/albums` special-cases `theme: 'canvas'` and creates one
   enabled `sync-test` scene (30 s). `albumCreateSchema` stays theme-only.
8. **Canvas layouts and albums can arrive through generic PUTs.** A `kind: 'frame'`
   layout could be mutated into `kind: 'canvas'` through `PUT /api/layouts/[id]`.
   **Decision:** server guards in plan 2 compare the stored document's existing kind
   and the frame id, not just the request body.
9. **`GET /api/canvas/state` on the console has no clock.** Clock samples live in the
   kiosk Node process. On the console, the route returns
   `{ offsetMs: 0, uncertaintyMs: 0, quality: 'poor', source: 'system', sampledAt: null }`.
   The editor preview uses `/api/time` instead.
10. **Gaps geometry is under-specified.** Plan 1 computes gap rectangles by pairwise
    projection between non-overlapping slots (positive cross-axis overlap, positive
    along-axis separation). This covers row, column and grid, including offsets, and
    is deterministic.
11. **Scene registry typing.** A heterogeneous `SceneDefinition<TType, TConfig, TState>`
    array forces `any` at the boundary. The repo avoids `any`.
    **Decision:** `SCENE_META` keyed by type for editor metadata, plus an exhaustive
    `computeSceneState(scene, ctx)` dispatch returning a union. `SceneDefinition`
    remains the documented per-module shape.
12. **`handlePull` report writes on kiosk.** The same handler exists in both dialects.
    Report columns are console-only.
    **Decision:** write report columns only when the resolved database mode is
    `postgres`; kiosk pulls never write status columns.

## Assumptions taken from the open questions

- Recurring windows: not this cycle. Manual deploy plus optional `releaseAt`.
- Shared logo library: no. Logos are per scene, embedded.
- Global canvas widgets: no. `widgets` stays `[]` and the schema enforces it.
- WAN clock quality: measured in phase 3, not guaranteed now.
- "Release all canvases": not included.

## Phase 1 module contracts used by later plans

Later plans must use these names verbatim.

```ts
// lib/types.ts
CanvasConfig, CanvasArrangement, CanvasSlot, CanvasScene, CanvasSceneType,
MarqueeConfig, MarqueeStrip, BounceConfig, BounceLogo, PongConfig, SyncTestConfig,
CanvasDeployment, CanvasIdentify, CanvasState, DeploymentAlbum
Layout.kind?: 'frame' | 'canvas', Layout.canvas?: CanvasConfig
Album.scenes?: CanvasScene[]
Slideshow.canvas?: { crossfadeMs: number }

// lib/canvas/geometry.ts
ResolvedSlot, ResolvedGeometry, GeometryIssue, resolveGeometry, validateGeometry

// lib/canvas/scheduler.ts
ScenePlan, sceneAt(album, albumSeed, timeSinceEpochMs, crossfadeMs)

// lib/canvas/clock.ts
ClockSample, ClockEstimate, sampleFrom, estimate, slewOffset

// lib/canvas/takeover.ts
CanvasTakeover, resolveCanvasTakeover(state, nowMs)

// lib/canvas/state-store.ts
CanvasStateRow, getCanvasState, putCanvasState, applyRemoteCanvasState,
listCanvasStates, deleteCanvasState, recordCanvasReport, pruneCanvasState

// lib/canvas/library.ts
CANVAS_LIBRARY_ID, isLibraryFrame, ensureCanvasLibrary

// lib/canvas/scenes/registry.ts
SCENE_META, defaultScene, coerceScene, computeSceneState, sceneStateAt

// lib/canvas/poll.ts
pollDelayMs(active, env), startCanvasPoll, stopCanvasPoll
```

Phase 4 adds these contracts. Later plans must use them verbatim.

```ts
// lib/canvas/assets.ts
CANVAS_ASSET_PREFIX, canvasAssetUrl, parseCanvasAssetRef, hashCanvasAsset
CanvasAssetRecord, getCanvasAsset, putCanvasAsset, listCanvasAssets

// lib/canvas/draw.ts
DrawCommand, drawCommands, executeDrawCommands

// lib/canvas/games.ts
GameStep, gameStateAt, GAME_ROUND_TICKS

// lib/canvas/types additions in phase 4
CanvasConfig.bezelMode?: 'show' | 'hide' | 'collapse'
CanvasSceneType includes all 28 addendum scene names

// phase 5 additions
CanvasAlbum.layers?: CanvasLayer[]   // 1..3; phase 1 scenes stay in layers[0]
CanvasAlbum.transition?: CanvasWallTransition
CanvasPalette, CanvasTemplate
```

## Verification baseline

Before any plan starts, record:

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

All three are expected to pass on a clean `origin/main` worktree. A failure here is a
baseline problem, not a regression to fix inside the canvas work.
