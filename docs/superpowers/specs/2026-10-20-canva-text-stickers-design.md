# Canva-Style Text Stickers and Layered Compositions — Design Spec

## 1. Goal

Add a browsable library of reusable text sticker templates and editable multi-layer text compositions to the digital signage editor, rendered through the existing frame display pipeline.

## 2. Scope

In scope:
- Text sticker template library.
- Composite `sticker` widget with 2-3 text layers.
- Layer text and color editing.
- Group-level move, resize, duplicate, delete, reorder.
- Persistence and validation.
- Pure logic tests.

Out of scope:
- Full graphic design suite.
- Marketplace/collaboration.
- Browser/E2E/screenshot harness.
- Image widget or decorative-element engine.

## 3. Architecture

Reuse existing `Widget` abstraction. Add a composite `sticker` widget type with `layers: StickerLayer[]`. Rendering uses `FrameScene` + `WidgetContent`, so editor and display share the same pipeline.

## 4. Data model

- `StickerLayer`: id, text, x, y, w, h, style.
- `Widget.layers?: StickerLayer[]`.
- Sticker widget uses fixed 1000×500 internal coordinate space scaled to widget box.
- Optional field, backward compatible.

## 5. Rendering

- `StickerWidget` renders layers as absolutely positioned divs.
- Text wraps (`white-space: pre-wrap`).
- Aspect-locked resize scales all layers uniformly.

## 6. Interactions

- Add from library via drag/click.
- Move, resize, duplicate, delete, reorder as one widget.
- Edit layer text/colors in inspector.
- Save/reload via existing layout persistence.

## 7. Validation

- `widgetSchema` validates layers (max 12, text max 300, finite numbers).
- Builder output must pass `widgetSchema`.

## 8. Testing

- Vitest node tests for builders, ids, finite positions, schema acceptance.
- Type check and production build.

## 9. Risks

- No browser test harness; visual/interaction behavior not automated.
- Extreme aspect ratios may distort text.
- Layer editing limited to text and colors in initial version.