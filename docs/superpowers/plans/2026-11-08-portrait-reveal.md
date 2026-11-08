# Portrait Reveal implementation plan

Feature: new album presentation `reveal` ("Portrait Reveal") - a grayscale
subject portrait sits behind a wall of album covers; wall-clock-deterministic
reveal events open cells (single cells or rectangular groups of adjacent
cells, never overlapping) until the portrait is fully visible, then the cycle
re-covers. Mirrors the mosaic engine pattern: pure calc module + tick-driven
client component. Mosaic stays as-is.

## Files

1. `lib/types.ts` - add `'reveal'` to `PRESENTATIONS`; `Reveal` (tilesAcross
   6, tilesDown 5, gap 2, group `single|pair|quad|row`, effect `fade|none`);
   `SubjectPortrait` (name, type `search|upload`, image, sourceUrl,
   imagePosition `top|center|bottom`); `Slideshow.reveal?`;
   `Album.subject?: SubjectPortrait | null`.
2. `lib/albums.ts` - `PRESENTATION_META.reveal`, `defaultReveal()`,
   `defaultRevealSlideshow()`.
3. `lib/reveal.ts` (new, pure, no React/DOM) - `revealPartition(cols, rows,
   group)` deterministic rectangular partition (every cell covered exactly
   once, remainders become smaller rectangles); `revealAt({nowMs, offset,
   seed, intervalSec, itemCount, cols, rows, group})` returning per-cell
   state (cell, item, openedAtMs, progress, group), cycle, newlyOpened,
   nextEventAtMs. Cycle = G groups x interval + 1 interval hold. Item
   sequence continues across cycles via seeded shuffle. Bounded caches.
4. `lib/schema.ts` - `revealSchema` (optional on `slideshowSchema`),
   `subjectSchema` (optional-nullable on `albumUpdateSchema`). No DB change.
5. `lib/store.ts` - `normalize` clamps legacy reveal fields like mosaic.
6. `components/frame/reveal-slideshow.tsx` (new) - ResizeObserver, tick +
   setTimeout on `nextEventAtMs`, visibility/focus resync, 2 s-ahead preload
   of next group's images, reduced motion, safe fallbacks (0 items -> bare
   portrait/backdrop; bad config -> clamped).
7. `components/frame/album-slideshow.tsx` - dispatch `reveal` to the new
   component when >= 1 item; other presentations untouched.
8. `components/frame/frame-scene.tsx` - `activeSlide` gains a reveal branch
   (Now Showing follows the newest reveal).
9. `components/editor/album-detail.tsx` - selector seeds reveal defaults;
   conditional reveal settings (grid across/down, gap, group shape, effect);
   portrait section (search, upload, position, remove) shown for reveal or
   when a subject already exists.
10. `hooks/use-frame-store.ts` - `usePortraitSearch` hook for `/api/portrait`.
11. `app/api/portrait/route.ts` (new) - Wikipedia person-portrait search,
    same conventions/limits as `/api/artwork`; caching through `/api/media`
    (allowlist already covers upload.wikimedia.org).
12. Tests - `lib/__tests__/reveal.test.ts` (partition properties,
    determinism, progression, completion + cycle rollover, item
    distribution, fallbacks, offset, perf); `lib/__tests__/reveal-schema.test.ts`
    (schema validation, legacy albums, normalize repair, subject rules);
    regression: existing suite, tsc, lint, build.
13. `README.md` - presentation list + Portrait Reveal / subject portrait docs.

## Risks / notes

- Debounced editor PUT replaces the whole slideshow object; subject rides on
  `albumUpdateSchema` so existing saves keep other fields (Object.assign
  semantics: absent optional key never deletes; null clears).
- Reveal rendering is fade-only (CSS opacity) - cheap on the Wyse 3040.
- No component-level React tests exist in this repo (no testing-library);
  engine + schema tests plus regression suite cover the logic.
