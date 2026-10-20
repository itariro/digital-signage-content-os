# Canva-Style Text Stickers — Implementation Plan & Task Ledger

## Status

Complete (after 2026-10-21 adversarial-review remediation).

## Tasks

| ID | Task | Status | Verification |
|---|---|---|---|
| T1 | Add `StickerLayer` and `layers?` to `Widget`; add `'sticker'` type | Done | `npx tsc --noEmit` |
| T2 | Add `stickerLayerSchema` and `layers` to `widgetSchema` (+ sticker/non-sticker layer rules) | Done | `npm run test` |
| T3 | Add `sticker` definition in `lib/widgets.ts` | Done (re-fixed in remediation; initially marked Done while missing) | `npm run test` — `widget-registry.test.ts` |
| T4 | Create `lib/text-stickers.ts` templates and `createStickerWidget` | Done | `npm run test` |
| T5 | Render `StickerWidget` in `widget-content.tsx` | Done | `npm run build` |
| T6 | Add sticker drop payload kind and handler | Done | `npm run build` |
| T7 | Add Text Stickers section to library panel | Done | `npm run build` |
| T8 | Add `StickerLayersSection` to inspector | Done | `npm run build` |
| T9 | Add pure logic tests in `lib/__tests__/text-stickers.test.ts` and `lib/__tests__/widget-registry.test.ts` | Done | `npm run test` |
| T10 | Run quality gates and document results | Done | `npm run test`, `npx tsc --noEmit`, `npm run build` |

## Ledger

All tasks T1–T10 completed. Quality gates passed:
- `npm run test`: 39 files, 202 tests passed (2 skipped).
- `npx tsc --noEmit`: no errors.
- `npm run build`: successful (`next build`, exit 0).

## Review Remediation (2026-10-21)

Adversarial two-axis review (Standards + Spec) found the initial "Done" status wrong; fixes applied:

1. **Registry gap (critical):** `sticker` was in `WIDGET_TYPES` but missing from `WIDGETS`; `getDefinition` silently fell back to `WIDGETS[0]` (clock-digital), so the inspector/canvas/layers panels treated stickers as clocks and aspect-locked resize never engaged. Added the `sticker` `WidgetDefinition` (Decor, `lockAspect: true`, min 200×100, default single-layer content) and made `getDefinition` throw on an unregistered type so the class of bug becomes a loud failure + compile-visible usage.
2. **Regression tests:** `lib/__tests__/widget-registry.test.ts` asserts one definition per `WidgetType`, no silent fallback, schema-valid defaults for every type, and sticker lock/fields.
3. **Validation (spec §7):** `widgetSchema` now rejects sticker widgets with zero layers and rejects `layers` on non-sticker widgets.
4. **Rendering (spec §4):** sticker space clipped (`overflow: hidden` on the 1000×500 frame) so layers can never detach visually from the box.
5. **Scope creep removed:** unrequested `props.rotation` dropped from `createStickerWidget` and `StickerWidget`; unused `instantiateSticker` deleted.
6. **Smells cleaned:** base 1000×500 constants and scale-to-fit math centralized as `STICKER_SPACE`/`stickerFit` in `lib/text-stickers.ts` (imported by `widget-content.tsx`); `layer()` builder now takes a rect object instead of 4 positional numbers; test file renamed to match its module (`text-stickers.test.ts`).
7. **Verified non-issue:** the `templates.length <= 1` guard in `TemplateSection` changes no existing behavior — every pre-existing definition has ≥2 templates.
