# Editor UI Visual Consistency Refinement Design

## Goal

Refine the Frame Editor into a visually consistent, legible, and efficient workspace by applying its existing design system consistently across editor surfaces and the integrated Frame Administration drawer.

## Scope and sequencing

This is the second of two related phases. Implement [Frame Administration Sidebar Integration](./2026-11-08-frame-admin-sidebar-integration-design.md) first so the visual audit styles one consolidated product experience.

Audit the Frame Editor shell, top bar, rail, canvas controls, widget library, inspector, editor drawers and panels, dialogs, forms, notices, and empty/loading/error states. Include the new Frames, Conflicts, and Audit drawer tabs. The `/console` route redirects to this shared interface and is not maintained as a second visual surface.

The freestanding display, sign-in/up, and landing surfaces remain out of scope. Do not change the visual identity, user workflows, data state, CRUD behavior, APIs, or widget rendering.

## Existing design direction

Preserve the current reference-led neutral workspace and light/dark modes:

- White and near-white light surfaces, charcoal text, fine cool-gray borders, and restrained blue active/focus states.
- Matching charcoal dark surfaces with legible semantic text and the same blue interaction hierarchy.
- Existing Inter and JetBrains Mono typography and Lucide iconography.
- The canvas remains the visual focus; surrounding controls use compact, quiet surfaces.
- Semantic success, warning, and destructive colors remain distinct from the primary accent.

This pass improves consistency and execution. It does not introduce a new color palette, brand, or interaction model.

## Consistency rules

Audit equivalent components and standardize them through existing semantic tokens, shared UI components, and editor utilities where they already provide a suitable seam:

- **Actions:** primary, secondary, quiet/tertiary, and destructive buttons have consistent height, radius, icon size, focus ring, hover, pressed, disabled, and loading treatments.
- **Inputs:** text fields, selects, search, date/time, and numeric controls share border, background, label alignment, helper/error text, focus, and disabled states.
- **Typography:** page/surface title, section header, body, field label, helper text, status, and metadata use a consistent scale and line-height.
- **Spacing and grouping:** align panels to a consistent spacing scale; keep headings, descriptions, fields, actions, and section dividers grouped predictably without excessive whitespace or cramped content.
- **Surfaces:** cards, overlays, popovers, dialogs, tables, empty states, notices, and borders reuse existing surface tokens and radii. Use shadows only to establish elevation.
- **Icons and touch targets:** use the existing Lucide style with consistent sizes, alignment, and adequate button hit areas.
- **Responsive behavior:** preserve editor functionality at desktop/tablet sizes and keep rail panels, form actions, and guide controls reachable at narrow portrait widths. Prevent clipped text, horizontal overflow, and ambiguous wrapping.
- **Feedback states:** loading, success, empty, error, unauthorized, and disabled states remain visually and semantically distinct. Errors must not resemble empty success states.

Consolidate repeated styling only where equivalent controls currently diverge. Avoid broad component rewrites, new dependencies, and one-off token systems.

## Architecture boundaries

`app/globals.css` remains the source for shared semantic color and editor surface tokens. `components/ui/` remains the source for reusable primitives where appropriate. Editor-specific controls continue to follow the boundaries in `components/editor/controls.tsx` and their owning panel components. The administration components follow the data and access boundaries in the sidebar-integration design.

Do not refactor frame-rendering components for cosmetic uniformity where their output is part of the signage experience. Do not change data-bearing component state or handlers as part of a visual adjustment.

## Validation

- Compare equivalent buttons, inputs, labels, section headers, cards, and status messages across the editor and the new administration drawer in both themes.
- Run focused tests, TypeScript checking, and the repository's full test suite; report known unrelated failures independently.
- Run the production build and report existing build warnings or failures without folding unrelated fixes into this work.
- Use browser QA at desktop, tablet, and narrow portrait sizes. Check theme persistence, focus visibility, overflow, the widget library hierarchy, existing editor interactions, and all three administration tabs.
- Confirm each visual change preserves its associated behavior and keyboard/touch access.

## Acceptance criteria

- Equivalent editor and administration controls share consistent typography, sizing, spacing, borders, radii, icon treatment, and interaction states.
- Content is comfortably readable and visually grouped without unnecessary whitespace or crowding.
- Light and dark themes remain coherent and interactive states remain distinguishable.
- Desktop, tablet, and narrow portrait layouts remain legible, usable, and free from unintended overflow.
- Existing editor, widget, administration, and frame-display behavior remains intact.
