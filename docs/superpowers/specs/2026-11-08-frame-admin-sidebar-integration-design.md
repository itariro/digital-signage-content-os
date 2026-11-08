# Frame Administration Sidebar Integration Design

## Goal

Make frame administration discoverable inside the Frame Editor sidebar, so authorized operators can manage instances, enrollment, sync conflicts, and audit history without switching to a separate console interface.

## Scope and rollout

This is the first of two related phases. It consolidates the existing Frame Console into the editor navigation and preserves its current administration workflows. The following [Editor UI Visual Consistency Refinement](./2026-11-08-editor-visual-consistency-design.md) applies the existing design system across the editor and the newly integrated administration experience.

The freestanding display, sign-in/up, and landing surfaces remain outside these phases. This work does not change display behavior, editor data models, frame CRUD behavior, or introduce new instance operations such as rename or revoke.

## Navigation and access

- Add a **Frames** entry to the editor's existing left rail. Selecting it opens the existing editor overlay/drawer without resizing the canvas.
- Show this entry only to users authorized for the hosted console. Use the same signed-in Clerk and optional `CONSOLE_ADMIN_ROLE` policy as `/console`; when no role is configured, preserve the current console policy.
- Keep authorization enforcement on the server. Hiding the navigation item is not an access boundary. Each data read and mutation continues to verify the operator independently.
- Keep local frame-password administration separate. It does not grant hosted console access.
- Preserve `/console` for existing bookmarks. After applying its existing authorization gate, redirect to the editor with the Frames drawer selected.

## Drawer organization and workflows

The drawer defaults to **Frames** and provides three keyboard-accessible internal tabs:

1. **Frames** lists the instance identifier, associated frame name, revision, created/updated timestamps, and last-seen timestamp where present. It provides the existing enrollment-code issuance and rotation workflows.
2. **Conflicts** lists open and rejected sync conflicts. Open conflicts retain the existing actions to accept the console version or apply the instance version. Rejected writes retain the existing discard action.
3. **Audit** lists recent operator activity.

Use the existing editor shell and surface treatments. Keep the drawer usable at compact widths and on narrow screens. Tab changes remain within the drawer; the rail's active state continues to indicate the administration surface.

Issuing or rotating an enrollment code displays the existing one-time code, expiry time, and `kiosk-ctl enroll` command. The code is shown only in the issuance result and is not persisted or exposed in list data.

## Data flow and security

- Reuse `listInstanceCards`, `listConflicts`, and `listAudit` as the read-model services. Reuse existing instance issue/rotate and conflict-resolution mutations.
- Reuse `/api/instances` and `/api/instances/[id]/rotate` for instance and enrollment operations. Add narrowly scoped, authenticated read endpoints for conflicts and audit history if no existing read endpoint is available.
- Protect every administration API with the existing `resolveActor` policy, including optional `CONSOLE_ADMIN_ROLE` enforcement. Do not rely on client-provided role or visibility state.
- Load a tab's data when needed. Limit audit data to the existing recent-history scale (20 records). Refresh or remove successfully completed conflict actions from the active list.
- Keep API failure visible. Loading, empty, expired-session/unauthorized, and request-error states must be distinct. A failed read must never be rendered as an empty successful list.
- Preserve existing conflict-resolution validation and audit writes. Do not weaken existing server authorization or introduce a new credential path.

The editor route receives an explicit server-derived `canManageFrames` capability. It must not infer the capability from a query parameter or client state. The `/console` route remains protected before redirecting.

## URL behavior

Use a stable editor query parameter such as `?panel=frames` to open the administration drawer after the `/console` redirect. A direct editor visit without that parameter preserves the current default editor state. The selected internal tab defaults to Frames; no additional deep-link behavior is required for this phase.

## Validation

- Test that only the server-authorized capability exposes the Frames rail item and that unauthorized API requests are rejected.
- Test `/console` authorization and redirect behavior, including the Frames drawer query parameter.
- Test loading, error, empty, and success states for all three tabs; issue/rotate responses; conflict actions; and audit display.
- Verify existing editor rail, overlays, save, widget, inspector, and panel behavior remains unchanged.
- In the browser, verify the administration drawer at desktop, tablet, and narrow portrait widths and exercise the complete administration workflows using the isolated QA setup.

## Non-goals

- Redesigning the visual identity or changing the light/dark theme.
- Moving frame administration to a standalone full-page workspace.
- Adding frame rename, delete/revoke, health monitoring, or other new administration operations.
- Changing APIs used by kiosk enrollment, sync, or the freestanding display beyond the protected read endpoints required by the drawer.
