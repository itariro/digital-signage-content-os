# Frame Editor Sign-In and Installer Environment — Design Spec

- **Date:** 2026-11-08
- **Status:** Approved in brainstorming, awaiting spec review
- **Scope:** Add the missing frame-local sign-in flow for editor writes and
  prevent the installer from shell-expanding values in `frame.env`.
- **Related:** `docs/superpowers/specs/2026-10-25-frame-enrollment-design.md`,
  `docs/kiosk-cli.md`

## 1. Problem

The frame editor is served through the management port, where mutation
requests require a valid frame-admin session cookie. The CLI can set the
password, and `/api/admin/login` can issue the cookie, but the editor has no
sign-in UI that calls this endpoint. As a result, editor writes return
`401 unauthorized` even after an operator sets a password. Before the
password is configured, writes return `401 admin_password_not_configured`.

The installer sources `/etc/dscos/frame.env` as a shell script before the
Next.js build. That file is a plain `KEY=VALUE` environment file and can
contain a scrypt hash with `$` characters. With `set -u`, a hash containing
`$3` is expanded as a positional parameter and aborts the build with
`$3: unbound variable`.

## 2. Decisions

1. **Keep the write gate.** Frame mutations continue to require a valid
   frame-admin session. Do not make management-port writes anonymous.
2. **Use a frame-local sign-in gate.** On an installed frame, the editor
   checks the session before rendering. If no session is valid, it shows the
   approved shadcn/ui `login-03` layout adapted to one password field. The
   browser submits to the existing `POST /api/admin/login`; the server's
   HTTP-only cookie authorizes subsequent same-origin editor requests.
3. **Do not retain passwords.** The password is kept only in component state
   while submitting and is cleared after the response. No local or session
   storage is used.
4. **Keep password setup and reset on the frame CLI.** If the password is not
   configured, show `sudo kiosk-ctl password <password>`. The web UI does not
   change the root-owned frame environment file.
5. **Read frame build variables literally.** The installer must not source
   `frame.env`. It reads and exports only `NEXT_PUBLIC_*` entries as literal
   values for the build. Systemd continues to load the full file at runtime.
6. **Preserve non-frame behavior.** Hosted-console and ordinary development
   editor behavior remains unchanged. The sign-in gate is enabled only when
   the frame management port is configured.

## 3. Frame sign-in flow

Add a read-only `GET /api/admin/session` endpoint. It returns only whether
frame admin auth is configured and whether the request's cookie is valid; it
never returns a password, hash, secret, or session token.

The client gate handles the response as follows:

- Configured and authenticated: render the existing editor.
- Configured but unauthenticated: show the password form.
- Not configured: show the CLI setup instruction.
- Request failure: show an explicit error and retry action; do not silently
  render an editor whose writes will fail.

On submit, the form posts the password to the existing login route. A
successful response sets the existing seven-day HTTP-only session cookie and
reveals the editor. An invalid password shows an inline error. A rate-limited
response shows the retry delay. The password input is cleared after either
response.

The login route and port gate remain responsible for authentication. The
session endpoint only reports configuration and cookie validity to the
client. Display-port mutations continue to return 404, and unauthenticated
management-port mutations continue to return 401.

## 4. Installer build environment

Replace the shell `source` of `/etc/dscos/frame.env` with a small, testable
loader. It reads each `KEY=VALUE` line without evaluating its contents and
exports only keys beginning with `NEXT_PUBLIC_`, since those are the only
frame values needed at build time. Values containing `$`, quotes, spaces, or
additional `=` characters remain literal. Private sync and admin values are
not copied into the build process environment.

The service's existing systemd `EnvironmentFile` remains unchanged, so the
application still receives its full runtime configuration.

## 5. Tests and acceptance

- Session endpoint reports unconfigured, configured/unauthenticated, and
  configured/authenticated states without exposing secrets.
- Login success sets the session cookie; invalid credentials remain 401 and
  rate limiting remains visible.
- An unauthenticated management write is denied, and a valid session permits
  editor CRUD through the frame management port. Display-port writes remain
  404.
- The frame sign-in UI renders only for configured frame deployments, clears
  password state, and exposes setup and error states.
- A `frame.env` fixture with a `$3` hash loads without shell expansion. The
  build receives public values literally and does not receive private values.
- Existing hosted-console and local development write behavior remains
  unchanged.

## 6. Out of scope

- Changing the frame's password from the browser.
- Removing or weakening the frame mutation gate.
- Changing console authentication, enrollment, synchronization, or display
  port behavior.
