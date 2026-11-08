# Frame Editor UI Redesign Design

## Goal

Redesign the Frame Editor as a cohesive, reference-led workspace while retaining every existing editing workflow, widget capability, data relationship, and interaction. Establish reusable editor design tokens and components that later phases can apply to the rest of the application.

## Scope and rollout

This design covers Phase 1: the editor shell, navigation, widget library, canvas toolbar, inspector, and all editor panels and shared controls. The console, display pages, landing page, and sign-in surfaces are not part of this phase. They can adopt the shared design language in separately scoped follow-up phases.

The supplied `desired_UI.png` is the primary reference for composition and styling. The selected direction is a hybrid workspace: a compact rail, an open central canvas, a right inspector, and contextual left-side overlays. The widget library specifically overlays the canvas rather than resizing it.

## Design language

- Use the reference's bright, neutral workspace as the light theme: white and near-white surfaces, fine cool-gray borders, charcoal text, restrained blue active and focus states, and subtle shadows for floating panels.
- Use a matching dark theme with charcoal surfaces and the same hierarchy and blue accent.
- Keep the signage canvas and preview visually prominent. Use a quiet, fine-dot canvas grid and let widget/frame content supply most of the color.
- Reuse the existing Inter and JetBrains Mono fonts and Lucide icon set. Standardize icon dimensions and stroke treatment, control heights, spacing, radii, dividers, and interactive states through shared tokens and utilities.
- Use clear, persistent focus-visible, selected, active, pressed, disabled, and loading treatments. Preserve semantic success and warning colors rather than reusing the active blue.
- Default to the operating-system color preference until the user chooses a theme. Store an explicit light/dark choice in browser-local storage so it persists on the same browser, including on freestanding frames. Do not require account state or server-side preference storage.

## Workspace structure and behavior

### Main shell

The desktop/tablet editor uses four regions:

1. A compact, fixed-width left icon rail.
2. The central canvas, which remains the main workspace.
3. A right inspector that continues to reflect the selected widget or layout.
4. A floating quick-add toolbar at the bottom of the canvas.

Selecting a rail item opens its corresponding panel as a left-side overlay over the canvas. The overlay does not resize or recenter the canvas, and only one rail panel is open at a time. Selecting the active rail item or pressing Escape dismisses it. The inspector remains available while a rail overlay is open. Rail entries continue to expose Layers, Layouts, Albums, Fonts, Schedule, Notifications, and Bob/Experiences without removing any of their current operations.

### Widget library

Add a Widgets entry to the rail and connect it to the existing `LibraryPanel` content. The panel includes the complete widget catalog and live previews, the existing categories and descriptions, combinations, text stickers, and saved presets with their delete actions. Search and category filters narrow the relevant entries without hiding supporting content permanently.

Adding a widget by clicking returns to the canvas and closes the library. Dragging remains supported: the library stays open during the drag and closes after a successful drop. A cancelled drag does not add an item. Every add path continues to use the editor's existing drop payloads and `addItem` behavior.

The existing bottom `WidgetToolbar` remains a separate quick-add surface with its search, category chips, quick-add buttons, composition guides, and Night preview. Its current behavior remains available; redesigning the library does not replace or silently change the toolbar.

### Inspector and editor panels

Keep all current inspector sections and their context-sensitive behavior. Refine their headings, section spacing, field alignment, and shared input/control appearance without changing what fields edit, when they appear, or how values update editor state. The same applies to Layers, Layouts, Albums, Fonts, Schedule, Notifications, and Experiences panels.

### Responsive behavior

Desktop and tablet are the primary editing targets. On narrow portrait screens, keep the canvas as the main surface, replace the persistent side-by-side inspector with an accessible properties overlay, and keep navigation panels as overlays. The bottom toolbar may scroll or wrap within the viewport. All actions and information remain reachable; compact mode must not remove functionality.

## Architecture and implementation boundaries

Reuse the current editor state, persistence calls, widget definitions, preview rendering, drag-and-drop MIME payloads, and panel components. Do not change API contracts, schemas, frame behavior, save semantics, or widget behavior as part of this visual refactor.

Likely implementation surfaces:

- `app/globals.css`: shared editor theme tokens and canvas/focus styling.
- `components/editor/editor.tsx`: workspace shell, navigation state, overlay lifecycle, responsive structure, and panel composition.
- `components/editor/library-panel.tsx`: searchable, categorized widget library while retaining previews, combinations, stickers, and presets.
- `components/editor/widget-toolbar.tsx`: visual refinement without removing quick-add, filter, guide, or Night preview behavior.
- `components/editor/top-bar.tsx`: consistent toolbar controls and theme-toggle persistence/system default.
- `components/editor/inspector.tsx`, `components/editor/controls.tsx`, `components/editor/layout-settings.tsx`, and the other editor panels: shared visual treatment while preserving existing section logic.
- Focused editor tests: cover library search/category behavior, click-add and drag-add, overlay dismissal, theme initialization/persistence, and preservation of existing panel actions.

Changes should follow existing component boundaries. Extract or extend shared editor styling only when it removes repeated inconsistent treatment; avoid replacing working controls with static mockups or adding a new UI dependency.

## Accessibility and interaction details

- Use buttons for rail and panel actions, expose the selected/open state with appropriate accessible attributes, and keep visible focus rings.
- Give overlays a clear title and close action. Escape closes the active overlay; closing returns focus to its opening rail control.
- Keep the library search keyboard-accessible and provide a clear empty-results state.
- Do not close the library while a drag is in progress. Only a successful add/drop closes it.
- Keep controls operable with keyboard and touch, with usable hit areas on compact screens.
- Respect reduced-motion preferences for overlay transitions.

## Validation

1. Run focused tests for the edited editor modules and new interaction coverage.
2. Run the full Vitest suite and TypeScript check.
3. Run a production build.
4. Exercise the editor in a browser at desktop, tablet, and narrow portrait dimensions. Verify rail overlays, inspector access, widget search/filter, click-add, drag-add, panel actions, keyboard dismissal, and both themes.
5. Compare screenshots with the reference for composition, hierarchy, spacing, neutral surfaces, active blue, icon scale, and floating toolbar treatment.

Visual acceptance is not a substitute for behavior checks. Existing save/load, layout and album management, selection, widget configuration, drag-and-drop, undo/redo, preview, export, schedules, fonts, presets, and keyboard shortcuts must continue to work.

## Acceptance criteria

- The desktop editor adopts the selected hybrid composition and closely follows the reference's neutral, compact visual language.
- The widget library is accessible from the rail as an overlay and retains the complete catalog, previews, descriptions, categories, combinations, stickers, and saved presets.
- The bottom quick-add toolbar and every existing editor section remain functional.
- Inspector content continues to follow canvas selection, including while overlays are open.
- Narrow portrait mode keeps editor functions reachable without turning the canvas into a permanently displaced or unusable region.
- Light/dark mode follows the system until explicitly changed and then persists browser-locally.
- No API, persistence, widget, or editor-state behavior changes are introduced.
- Tests, type checking, production build, and desktop/tablet/portrait browser checks pass.
