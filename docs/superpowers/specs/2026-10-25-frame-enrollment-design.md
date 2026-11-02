# Frame Enrollment and Two-Port Admin — Design Spec

- **Date:** 2026-10-25
- **Status:** Approved in brainstorming, awaiting spec review
- **Scope:** Secure zero-secret provisioning of frame devices (enrollment codes,
  key pull, local storage) and a two-port split on the frame (display vs.
  editor/admin).
- **Related:** `docs/superpowers/specs/2026-10-19-local-first-multi-frame-platform-design.md`
  (master architecture), `docs/kiosk-cli.md`, `docs/operations.md`

## 1. Problem

The app deployed to a frame must not ship with environment variables, yet each
frame needs per-device credentials to sync with the console. Today those values
(`SYNC_TOKEN`, `INSTANCE_ID`, `SYNC_ENDPOINT`) are expected to be placed on the
frame manually, and the console admin API hands out the plaintext device token
to whoever holds the admin credential. We need a way for each frame to pull the
keys it needs at setup time without exposing them in the artifact, the repo, or
the console UI.

Because this is a self-hosted tool, operators bring their own stack credentials
(Clerk keys, Postgres URL). Those belong to the console deployment only.

## 2. Decisions from brainstorming

1. **Key split.** The console holds stack secrets (`DATABASE_URL`, Postgres
   credentials, `CLERK_SECRET_KEY`). A frame pulls only `INSTANCE_ID`, its own
   `SYNC_TOKEN`, `SYNC_ENDPOINT`, and non-secret client config such as
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Secret keys never travel to a frame.
2. **Hands-on install.** A person is present at the frame during setup and can
   type one console URL and one enrollment code. No zero-touch provisioning
   required.
3. **One-time enrollment code** (chosen over installer flags and reverse
   pairing). The console issues a single-use code; the frame redeems it over
   TLS and receives its bundle. Nothing secret ships in the artifact.
4. **Two ports via an in-process TCP forwarder** (chosen over nginx and a
   second app instance). The app binds `127.0.0.1:3000` (display only,
   unreachable off-box). `instrumentation.ts` opens a forwarding listener on
   `0.0.0.0:8808` (editor/admin). The proxy layer gates routes by the `Host`
   header port. Raw TCP forwarding preserves the original `Host`, so the gate
   is reliable.
5. **Frame-local admin password** instead of Clerk on the frame, so local-first
   editing works with the internet down.

## 3. Console side: enrollment flow

### 3.1 Issue a code

`POST /api/instances` changes behavior: it no longer returns a plaintext
device token. It creates the instance row (`deviceTokenHash` stays NULL; the
column is already nullable) and returns a one-time enrollment code:

```json
{ "instanceId": "...", "enrollmentCode": "Ab3xK9...", "expiresAt": "..." }
```

- `enrollmentCode`: `nanoid(20)`, TTL 15 minutes, single use.
- `enrollment_codes` table (PG + SQLite, migration 0004): `codeHash` (PK,
  SHA-256 of the code via the existing `hashToken`), `instanceId`, `createdAt`,
  `expiresAt`, `consumedAt`. The table holds only hashed codes, so a console DB
  dump never yields live codes.
- The console "Add frame" card shows the code plus the ready-to-run command
  `sudo kiosk-ctl enroll https://<console> <CODE>` with an expiry countdown.
  The operator never handles the device token itself.
- This closes a gap from the PR #14 review: the admin API response no longer
  carries a per-device secret.

### 3.2 Redeem: `POST /api/enroll`

New public endpoint (no admin credential; TLS; rate limited). Request body:
`{ "code": "..." }`.

Inside one transaction:

1. Atomic claim:
   `UPDATE enrollment_codes SET consumed_at = now WHERE code_hash = ? AND
   consumed_at IS NULL AND expires_at > now`. Zero rows updated means the code
   is unknown, expired, or used: return `401` with a single generic message
   `invalid or expired code` for all three cases. Concurrent redemptions can
   have at most one winner.
2. On the winner: mint `deviceToken = nanoid(32)`, write `hashToken(token)` to
   `instances.deviceTokenHash`, and return the bundle.

The plaintext device token exists only inside this response. It is never
persisted anywhere in console or build.

Response:

```json
{
  "instanceId": "...",
  "deviceToken": "...",
  "syncEndpoint": "https://<console>/api/sync",
  "frameAdminSecret": "...",
  "config": { "clerkPublishableKey": "<NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY>" }
}
```

`frameAdminSecret` (a random `nanoid(32)`) is the HMAC key the frame signs its
own admin session cookie with. It is frame-local; the console never validates
it. Including it in the same authenticated exchange saves the frame from
generating and persisting its own random before first boot.

Rate limiting: fixed-window counter per source IP in console process memory
(10 redeem attempts/minute, then `429`). It is best-effort: a multi-instance
hosted console counts per instance. The 10^31-sized code space makes
enumeration impractical even when a limit is imperfect.

### 3.3 Rotation and revocation

- `POST /api/instances/{id}/rotate` (admin credential): mints a fresh
  enrollment code bound to the existing instance. Redeeming it overwrites
  `deviceTokenHash`. This is the recovery path for a lost or leaked frame key
  without deleting the instance, its frame document, or its sync history.
- Revoke (existing flow): deleting the instance row makes the device token die
  on next sync with `401`. Unused codes for deleted instances expire
  harmlessly.
- Clerk publishable key rotation (operator swaps their Clerk app) only matters
  at frame build time; a re-enroll (same code flow via rotate) refreshes it.

## 4. Frame side: enrollment, storage, ports

### 4.1 `kiosk-ctl enroll <console-url> <CODE>`

New subcommand. Runs as root (installer step or manual):

1. `POST {console}/api/enroll` with the code. TLS verification on.
2. Write `/etc/dscos/frame.env` atomically (temp file plus rename):

   ```
   FRAME_MODE=instance
   SYNC_ENABLED=true
   SYNC_ENDPOINT=https://console.example.com/api/sync
   INSTANCE_ID=...
   SYNC_TOKEN=...
   FRAME_ADMIN_SECRET=...
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
   ```

   Owner `root:kiosk`, mode `0640`: invisible to other users, readable by the
   service user. A device token stolen with the kiosk user's compromise grants
   only that one frame's scope and is revocable.
3. `systemctl restart dscos`.

The installer prompts for console URL and code, or takes them as flags
(`--console-url`, `--enroll-code`), and runs `kiosk-ctl enroll` before
`npm run build`. Because Next inlines `NEXT_PUBLIC_*` at build time, the frame
build picks up the publishable key from its own `frame.env` (sourced before
build). The shipped artifact and repo stay secret-free; per-frame values land
on the device during install.

The systemd unit gains `EnvironmentFile=-/etc/dscos/frame.env` (the `-` prefix
tolerates an unenrolled frame) and binds the app to localhost:

```
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
Environment=KIOSK_MGMT_PORT=8808
EnvironmentFile=-/etc/dscos/frame.env
```

An unenrolled frame boots, shows the standby/placeholder page, and its sync
worker stays dormant: `lib/lifecycle/index.ts` already requires
`SYNC_ENDPOINT && SYNC_TOKEN && INSTANCE_ID` together, so no extra gating code.

`/etc/kiosk/kiosk.conf` gains `KIOSK_MGMT_PORT` (default `8808`), managed
through `kiosk-ctl config`, same as existing browser-side keys.

### 4.2 Two-port split

- App server: `127.0.0.1:3000`. The kiosk browser opens
  `http://localhost:3000/frame/<id>`. Nothing on 3000 is reachable from the
  LAN.
- `instrumentation.ts` starts a `node:net` forwarder listening on
  `0.0.0.0:${KIOSK_MGMT_PORT}` and piping each connection to
  `127.0.0.1:3000`. About twenty lines, no new packages. Client `Host`
  (`192.168.x.x:8808`) survives the pipe.
- The proxy layer (this Next version's `proxy.ts`-style middleware) gates by
  the `Host` header port. The gate is active only when `KIOSK_MGMT_PORT` is
  set, which happens only on frames; the console never sets it.
  - Requests whose port is the management port may hit: `/login`,
    `/api/admin/login`, the editor routes, the instance-management APIs the
    editor uses, and `/frame/<id>` (handy laptop preview of the live frame).
    The frame's own browser can use `localhost:8808` too, so plugging a
    keyboard into the frame edits through the same gate.
  - Requests on any other port may hit only the display surface: `/frame/<id>`,
    `/sw.js`, public assets, and the read APIs the display page fetches
    (`/api/active`, `/api/store`, assets). Editor and admin APIs are blocked
    (`404`) so a local process cannot reach the admin surface on 3000 without
    passing the 8808 gate.
  - On the console deployment the gate is inert by the same rule: no
    `KIOSK_MGMT_PORT`, behavior stays as-is (Clerk-protected).
- The middleware must not let a client forge the management port: the gate
  reads `Host`, and the app only ever binds `127.0.0.1:3000` and
  `0.0.0.0:8808`, so a request arriving with a `:8808` `Host` truly came
  through the forwarder or directly to 8808, which is the same gate either
  way. Requests with a `:3000` `Host` cannot arrive from the LAN at all.

### 4.3 Frame-local admin auth

The 8808 surface is reachable by anyone on the frame's LAN, so it requires a
session:

- `sudo kiosk-ctl password <secret>` hashes the secret with scrypt
  (`N=2^15, r=8, p=1`) and adds `FRAME_ADMIN_HASH=<hex>` to `frame.env`.
- `POST /api/admin/login` (8808 only): compares against `FRAME_ADMIN_HASH`
  with `timingSafeEqual`, then sets an HttpOnly, SameSite=Lax cookie holding
  `{ scope: "admin", exp: now+7d }` signed with `HMAC-SHA256(FRAME_ADMIN_SECRET)`.
  Rate limited per source IP.
- Editor routes and mutating APIs (`POST/PATCH/DELETE /api/*` on 8808)
  require the cookie.
- **Read-only by default:** if `FRAME_ADMIN_HASH` is unset (nobody chose a
  password yet), 8808 editor reads work but every mutation returns `401` with
  a pointer to `kiosk-ctl password`. We ship no default password.
- The person at the frame always has the physical escape hatch: `kiosk-ctl`
  as root.

## 5. Error handling

Frame side (`kiosk-ctl enroll`):

| Failure | Behavior |
|---|---|
| Console unreachable / TLS error | Exit non-zero, `frame.env` untouched, message: verify URL and network. Frame stays in unpaired standby. |
| `401 invalid or expired code` | Message: issue a fresh code from the console (rotate for an existing instance). Safe: nothing half-written. |
| `429` | Back off, retry a few times, then give up with the same guidance as 401. |
| Write interrupted | Atomic rename means the service never reads a torn file. A failed enroll after a received bundle is recoverable only with a fresh code (the old one is consumed and the token is unknown to the operator); document this. |

Console side:

| Failure | Behavior |
|---|---|
| Code expired/unknown/consumed | Single generic `401`, no state leaked. |
| Redeem races consume | Winner determined by the conditional UPDATE; loser gets `401`. |
| Instance row gone at redeem | `401` (treat as invalid code). |
| `/api/enroll` missing/broken body | `400`. |

Every enroll attempt, success or rejection, writes an audit log entry with the
instance id (when resolved) and source IP, never the code or token.

## 6. Testing

Vitest, following the existing suites (`tests/kiosk-bootstrap.test.ts`,
`tests/e2e-sync.test.ts` patterns), dual-dialect where the schema is involved:

1. **Unit, enrollment service:** issue, redeem happy path, expiry, consumed,
   concurrent double-redeem race (exactly one winner), rotate overwrite of
   `deviceTokenHash`, hashed code storage.
2. **API e2e:** `POST /api/instances` returns a code and no token;
   `POST /api/enroll` valid/expired/consumed/garbage/missing-body cases; rate
   limiter trips at threshold and returns `429`; audit entries written.
3. **Frame CLI:** `kiosk-ctl enroll` against a mocked console. Assert it writes
   `frame.env` with expected keys, mode `0640`, root:kiosk (assert the mode
   bits; ownership asserted via injectable user/group in unit tests), atomic
   rename, non-zero exit with untouched file on `401`; `kiosk-ctl password`
   adds `FRAME_ADMIN_HASH` scrypt hash; login + cookie verification roundtrip.
4. **Port gating:** with `Host: x:8808` editor/admin routes resolve, with
   `Host: x:3000` they are blocked while display routes work; console-mode
   requests (no mgmt port in `Host`) behave exactly as today.
5. **Read-only default:** mutations over 8808 return `401` when
   `FRAME_ADMIN_HASH` unset; `kiosk-ctl password` then unlocks them.
6. **Unpaired standby:** boot with no `frame.env`; display serves, sync stays
   dormant, `kiosk-ctl enroll` succeeds later and a restart turns sync on.
7. **Existing suites:** extend the bootstrap roundtrip test to start from an
   enrollment exchange instead of pre-seeded env vars.

## 7. Out of scope / follow-ups

- Zero-touch provisioning (no human at the frame). The code flow assumes the
  hands-on install.
- Replacing the existing `CONSOLE_ADMIN_TOKEN`/Clerk admin surface on the
  console; enrollment codes are an additional path for frames, not a new
  operator login.
- Documentation updates to `docs/operations.md` and `docs/kiosk-cli.md`
  describing the enrollment commands ship with this change.
- Migrating already-installed frames: they can adopt `kiosk-ctl enroll`
  without reinstalling; no fleet migration tooling here.

## 8. Risks

- **Next version drift:** implementation must re-verify the middleware
  port-gate and the `instrumentation.ts` hook against
  `node_modules/next/dist/docs/` (this repo's Next build differs from older conventions).
- **In-memory rate limiting** is per-process; a horizontally scaled hosted
  console weakens it. The code entropy covers the gap; a shared-store limiter
  is a possible follow-up.
- **`NEXT_PUBLIC_*` baked at build** means console publishable-key changes
  require a frame rebuild (via re-enroll plus reinstall or a rebuild step on
  the frame). Accepted: it is a public value and changes are rare.
- **Token theft via kiosk-user compromise** on one frame exposes only that
  frame's token. Mitigated by revocation and rotate; the file mode keeps other
  local users out.
