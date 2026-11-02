# Mosaic presentation: design

## Goal
Add sixth album presentation `mosaic`: full-screen grid of covers (iTunes/MusaicFM style), one tile changes at a time, wall-clock driven.

## Data model
- Presentation gains 'mosaic'.
- Slideshow.mosaic? = { tilesAcross 2..10, gap 0..12, effect flip|fade|zoom|none }.
- Backward compatible; normalize fills/clamps only for mosaic albums.
- Defaults: tilesAcross 4, gap 2, effect flip, interval 25, backdrop solid near-black.

## Engine
Pure lib/mosaic.ts: mosaicGrid (geometry + reduction/fallback), mosaicAt (deterministic time-to-state with schedule modes), activeSlide returns last changed cover.

## Rendering
MosaicSlideshow: CSS grid via ResizeObserver; stable tile keys; only changing tile animates; flip/fade/zoom/cut via CSS; one setTimeout; preload; reduced-motion fallback.

## Editor
Presentation picker includes mosaic; mosaic-specific controls; hints for small pools.

## Integration
AlbumSlideshow dispatches to MosaicSlideshow when mosaic and >=5 items; fill fallback otherwise. FrameDisplay/SceneBackground unchanged. activeSlide mosaic branch.

## Non-goals
No filesystem scanning, no new providers, no DB migrations, no auth changes.