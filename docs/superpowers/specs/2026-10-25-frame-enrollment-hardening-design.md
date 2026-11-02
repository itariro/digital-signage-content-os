# Frame enrollment hardening design

- Date: 2026-10-25
- Status: Approved
- Scope: fix the confirmed open issues from the adversarial review of tasks 1-12
  in the frame enrollment branch.
- Related: `docs/superpowers/specs/2026-10-25-frame-enrollment-design.md`,
  `docs/superpowers/plans/2026-10-25-frame-enrollment.md`,
  `docs/kiosk-cli.md`, `docs/operations.md`

## 1. Context

The frame enrollment work adds a one-time code flow, a frame-local admin
password, and a management-port forwarder. A review of tasks 1-12 confirmed the
main design and found a smaller set of boundary problems. Some review items
were already fixed in the working tree before this spec was written. This spec
covers only the gaps that remain.

The baseline is the `agent/frame-enrollment-1025a` worktree, including these
uncommitted changes:

- the login route rejects a missing `FRAME_ADMIN_SECRET`;
- the kiosk client has a request timeout and checks required bundle fields;
- the rate limiter sweeps stale windows on each check;
- the installer adds `build-essential` and `python3`.

The implementation plan starts by committing that baseline, so every later
task has a clean tree.

## 2. Verification notes

| Review item | State | What this spec does |
|---|---|---|
| Login rejects a missing admin secret | Partly fixed | Move the rule into one invariant that also rejects empty, short, and unsafe secrets, and make signing fail on its own. |
| `requestHasAdmin` denies when the secret is missing | Correct | Keep it, but parse cookies without assuming a space after `;`. |
| SQLite redeem burns the code and returns null on a revoked instance | Correct | Keep the transaction shape. Add the same guarantee to Postgres with an update that returns the affected row. |
| `frameAdminSecret` is never persisted on the console | Correct | Keep the generated value; add length and character checks. |
| `frame.env` values are not escaped | Confirmed | Validate keys and values before writing, and write through a unique temp file. |
| Forwarder error handlers | Correct | Keep them and add connect timeouts, close propagation, and a connection cap. |
| Gate returns a read-only 401 when no password is set | Correct | Keep the hint. Treat a hash without a valid secret as the same unavailable state. |
| Rate-limit map growth | Partly fixed | Bound the map and sweep less often. |
| `x-forwarded-for` is trusted | Confirmed gap | Trust it only when `TRUST_PROXY=1`; otherwise use one local bucket. |
| Kiosk client accepts plain `http://` | Confirmed gap | Require https, with a loopback exception for development. |
| Bundle fields are unvalidated | Partly fixed | Validate the whole response shape and the `syncEndpoint` URL. |
| Postgres redeem has a select-then-update race | Confirmed | Replace it with `UPDATE ... RETURNING` and check the returned row. |
| Enrollment codes stay valid after rotate or redeem | New finding | Consume outstanding codes for the instance inside the same transaction. |
| Audit failure can burn a code before the bundle is sent | New finding | Make audit writes best-effort on the enroll path. |
| Mgmt port accepts `NaN` and can equal `PORT` | Confirmed | Validate both ports and refuse a collision. |
| Password command persists an env-only secret | Incorrect review claim | The current code skips generation but does not write the env value. Fix it and write the secret plus hash in one operation. |
| File mode, forwarder logging, gate allow-list, generic 401 bodies | Correct | No change. |

## 3. Decisions

1. Fail closed for admin auth, but keep the display running. A broken admin
   secret disables login and mutations. It does not stop the frame from showing
   content.
2. Validate at the boundary that owns the data: the env writer validates env
   entries, the kiosk client validates the HTTP bundle, the forwarder validates
   ports, and the request helper validates the client key.
3. One definition of a valid admin secret. No caller may sign a session with a
   secret that the verifier would reject.
4. Trust proxy headers only when the operator asks for it. A frame has no
   proxy, so trusting `x-forwarded-for` there only creates a bypass.
5. Enrollment and sync traffic use TLS. Plain http is allowed only for loopback
   hosts so local development still works.
6. A new code replaces the old ones. Issuing a code for an instance consumes
   that instance's outstanding codes. A successful redeem consumes any that
   remain.
7. An audit write is not worth a lost device token. Success and rejection are
   audited best-effort, with a contextual error log on failure.
8. The rate limiter stays in process memory and best-effort. It gets a bounded
   map and a trusted client key, not a shared store.
9. `frame.env` writes stay atomic. The temp file gets a unique name, exclusive
   create, fsync, mode `0640`, and a rename.
10. The forwarder validates its config but does not crash the app. A bad port
    logs an error and leaves the display surface untouched.

## 4. Design

### 4.1 Admin auth invariant

Files: `lib/frame-admin.ts`, `app/api/admin/login/route.ts`, `proxy.ts`,
`tests/frame-admin.test.ts`.

Add one rule:

```ts
export const MIN_ADMIN_SECRET_LENGTH = 32
export const MAX_ADMIN_SECRET_LENGTH = 128

export class AdminConfigError extends Error {}

export function isValidAdminSecret(value: string | undefined): value is string
```

A valid secret is a string of 32 to 128 characters matching
`^[A-Za-z0-9_-]+$`. It has no spaces, no padding, and no control characters.
The enrollment service generates base64url values. The password command
generates the same shape when it cannot reuse a valid secret, so this rule
matches what the system produces.

`adminAuthEnabled()` returns true only when `FRAME_ADMIN_HASH` is set and the
secret is valid. `signAdminSession(secret, nowMs)` throws an
`AdminConfigError` when the secret is invalid. `verifyAdminSession` keeps
returning false. This makes the empty-secret path impossible to reach again,
even if a new caller appears later.

`requestHasAdmin` reads cookies with a helper that splits the header on `;`,
trims each part, and compares the name exactly. The current split on `; `
misses valid cookie headers that omit the space.

The login route:

1. Applies the rate limit.
2. Parses the body.
3. Calls `adminAuthEnabled()` and returns one generic 401 when it is false.
4. Verifies the password only when the hash and secret are both usable.
5. Sets the cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, and the existing
   seven-day `Max-Age`. It does not set `Secure` on the frame's plain http
   management port. It sets `Cache-Control: no-store`.

The proxy gate calls `adminAuthEnabled()`. When it is false, the gate returns
the existing 401 with the `kiosk-ctl password` hint. This covers both "no
password yet" and "hash set but secret missing or invalid" without telling the
caller which one it is.

Tests:

- a valid 32-character secret signs and verifies;
- an empty, whitespace-only, 31-character, or non-base64url secret is invalid;
- `signAdminSession` throws on each invalid secret;
- `adminAuthEnabled` is false when the hash is missing, when the secret is
  missing, and when the secret is short;
- the login route returns 401 and no `Set-Cookie` for each unavailable state;
- the login route returns the same body for a wrong password and a missing
  secret;
- a cookie header written without a space after `;` is accepted;
- the success response has `Cache-Control: no-store`.

### 4.2 Password command

Files: `lib/kiosk/cli.ts`, `lib/kiosk/__tests__/frame-env.test.ts`.

`kiosk-ctl password <secret>` must leave a usable secret and hash in
`frame.env` after one write.

The command reads the existing file, then chooses the secret in this order:

1. A valid secret already in the file.
2. A valid `FRAME_ADMIN_SECRET` from the process environment. This is the
   case the review missed: the current code sees the env value, skips
   generation, and never writes it to the file.
3. A new `crypto.randomBytes(32).toString('base64url')` value.

If the file held a non-empty but invalid secret, print a warning that it was
replaced. Keep the eight-character password minimum. Build the merged env
object with `FRAME_ADMIN_SECRET` and `FRAME_ADMIN_HASH`, then call
`writeFrameEnv` once. A crash cannot leave a new secret with an old hash or the
other way around.

Tests:

- an env-only secret is written to the file and preserved;
- a valid file secret is preserved;
- a short or malformed file secret is replaced, with a warning;
- a missing file gets a generated secret and a hash;
- the file is written once (assert that no temp file remains and the final file
  has both keys).

### 4.3 `frame.env` boundary

Files: `lib/kiosk/frame-env.ts`, `lib/kiosk/__tests__/frame-env.test.ts`.

Add a typed error and a validator:

```ts
export class FrameEnvError extends Error {}

export function validateFrameEnvEntry(key: string, value: string): void
```

Rules:

- keys match `^[A-Z][A-Z0-9_]*$`;
- values are strings with no `\0`, `\n`, `\r`, or other C0 control characters;
- values have no leading or trailing whitespace;
- `=` inside a value is allowed because parsing splits on the first `=`.

Errors name the key and never echo the value.

`frameEnvLines` validates every entry before it builds the text. `writeFrameEnv`
validates first, then:

1. creates the parent directory with mode `0750`;
2. creates a temp file named `${file}.tmp.${pid}.${randomHex}` with
   `openSync(tmp, 'wx', 0o600)`;
3. writes the text, fsyncs the file descriptor, and closes it;
4. chmods the temp file to `0640`;
5. renames the temp file over the target;
6. fsyncs the directory, ignoring `EINVAL` on platforms that do not support it;
7. unlinks the temp file on any failure.

`setFrameEnvValue` merges into the parsed file and calls the same writer.
`parseFrameEnv` stays last-wins for duplicate keys. The writer owns the file, so
duplicates should not appear in files this code creates.

Tests:

- a newline in a value throws and writes nothing;
- a carriage return, NUL, tab, or other control character throws;
- a lowercase key, a key starting with a digit, and a key with a dash throw;
- a value containing `=` round-trips;
- leading or trailing whitespace throws;
- a failed write leaves no temp file and does not replace the existing file;
- two writers with different temp names do not collide and the final file is
  one complete set;
- the target has mode `0640`, and a newly created parent directory has mode
  `0750`.

### 4.4 Kiosk enrollment client

Files: `lib/kiosk/enroll.ts`, `lib/kiosk/cli.ts`,
`lib/kiosk/__tests__/frame-env.test.ts`, new
`lib/kiosk/__tests__/enroll.test.ts`.

Parse the console URL with `new URL`:

- require `https:`;
- allow `http:` only when the hostname is `localhost`, `127.0.0.1`, `::1`, or
  the bracketed form `[::1]`;
- reject usernames, passwords, query strings, and fragments;
- build the endpoint with `new URL('api/enroll', base)` where `base` keeps its
  path and ends with `/`.

Use `AbortSignal.timeout(timeoutMs)` with a default of 30 seconds. The signal
stays active through `res.json()` so a stalled body also aborts. `EnrollDeps`
gets an optional `timeoutMs` so tests do not wait 30 seconds.

Validate the response with zod:

```ts
const bundleSchema = z.object({
  instanceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  syncEndpoint: z.string().url().refine(isHttpsOrLoopback),
  frameAdminSecret: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  config: z.object({
    clerkPublishableKey: z.string().regex(/^[A-Za-z0-9_-]*$/).optional(),
  }).optional(),
})
```

A malformed response writes nothing. The code may already be consumed, so the
message tells the operator to issue a fresh code. A non-JSON body and an
abort get their own messages.

Build the env object, call `writeFrameEnv`, then apply the kiosk group
ownership. The chown helper returns a warning when running as root and the
group cannot be resolved or applied. The CLI prints that warning to stderr and
still exits 0, because the bundle is written; the operator can fix ownership
without another code.

Tests:

- `http://console.example.com` is rejected;
- `http://localhost:3000`, `http://127.0.0.1:3000`, and `http://[::1]:3000`
  are accepted;
- a URL with credentials, a query, or a fragment is rejected;
- a timeout aborts and writes nothing;
- malformed JSON writes nothing;
- a missing field, a short token, a newline in any field, and an http
  `syncEndpoint` all write nothing;
- a valid bundle writes every key and the file is readable;
- a chown failure as root returns a warning.

### 4.5 Client identity and rate limiting

Files: new `lib/request-ip.ts`, `lib/rate-limit.ts`,
`app/api/enroll/route.ts`, `app/api/admin/login/route.ts`,
`lib/__tests__/rate-limit.test.ts`, new `lib/__tests__/request-ip.test.ts`.

`clientKey(request, env)` returns a short key for the limiter:

- when `TRUST_PROXY` is `1` or `true`, use the first `x-forwarded-for` hop, or
  `x-real-ip` when the forwarded header is missing;
- otherwise return `"local"`;
- validate the result as an IP address with `net.isIP`; fall back to
  `"local"` when it is not an address;
- cap the key at 64 characters.

On a frame, every LAN client shares the `local` bucket. A 10-per-minute limit
for the whole frame is enough to stop password brute force. On a hosted
console, the operator sets `TRUST_PROXY=1` behind a proxy that overwrites the
header. Enabling it without a proxy lets clients spoof the key, so the docs
must say that.

The limiter gets two constants:

```ts
const MAX_WINDOWS = 10_000
const SWEEP_EVERY = 256
```

`checkLimit` increments a check counter. It sweeps when the map is at or above
`MAX_WINDOWS`, or every `SWEEP_EVERY` calls. If the map is still at the bound
after a sweep, it removes entries with the earliest `resetAt` until the size is
below the bound. It does not remove the key it is about to update. `sweepLimits`
and `__resetLimits` stay exported for tests and operations. `__resetLimits`
clears the map and resets the check counter.

Both routes use `clientKey`. The login 429 gains a `Retry-After` header. Both
success responses set `Cache-Control: no-store`.

Tests:

- with `TRUST_PROXY` unset, different `x-forwarded-for` values share one
  bucket;
- with `TRUST_PROXY=1`, different forwarded addresses get separate buckets;
- an invalid forwarded value falls back to `local`;
- the map stays at or below `MAX_WINDOWS` after many unique keys;
- the oldest windows are the first to go;
- the existing fixed-window behavior still passes;
- the login 429 has `Retry-After`;
- login and enroll success responses have `Cache-Control: no-store`.

### 4.6 Audit safety

Files: `lib/audit.ts`, `app/api/enroll/route.ts`,
`lib/__tests__/audit.test.ts`, `tests/enroll-api.test.ts`.

Add:

```ts
export interface AuditEntry {
  actor: string
  action: string
  targetType: string
  targetId: string
  details?: unknown
}

export async function auditSafe(
  entry: AuditEntry,
  write: typeof audit = audit,
): Promise<void>
```

`auditSafe` calls `write` and catches failures. It logs
`console.error('audit write failed', { action, targetType, targetId, error })`.
It does not log `details`, because other callers may put sensitive values
there.

The enroll route uses `auditSafe` for rejected and redeemed attempts. A failed
insert no longer turns a successful redemption into a 500 after the token has
been minted and the code has been burned.

Tests:

- `auditSafe` swallows a writer error and logs the action and target;
- the logged object does not contain `details`;
- the enroll route still returns 200 and the bundle when the audit writer
  throws (mock `auditSafe` or the underlying writer);
- a rejected enrollment still returns 401 when the audit writer throws.

### 4.7 Enrollment service atomicity and stale codes

Files: `lib/console/enroll.ts`, `tests/enroll-service.test.ts`, new
`tests/enroll-pg.test.ts` gated on `DATABASE_URL`.

`issueEnrollmentCode(instanceId?, ttlMs)`:

- rejects a non-positive or non-finite TTL;
- when `instanceId` is supplied, runs the old-code invalidation and the new
  code insert in one transaction;
- when creating a new instance, keeps the current insert and seed path;
- sets `consumedAt` on every outstanding code for that instance before
  inserting the new one.

This means a rotate makes the previous code dead as soon as the new one is
issued. It closes the window where a leaked old code can overwrite the token
after the legitimate frame enrolls.

`redeemEnrollmentCode(code)`:

1. Hash the code and capture `now`.
2. Start the dialect-specific transaction.
3. Claim the code with the existing conditional update and returning clause.
4. If no row, return null.
5. Update the instance with
   `SET device_token_hash = ? WHERE id = ? RETURNING id`.
6. If the update returns no row, return null. The code stays consumed because
   the transaction commits the claim. This is the Postgres race fix.
7. Consume every remaining outstanding code for that instance.
8. Build the bundle with the token and generated admin secret.
9. Commit and return the bundle.

The SQLite branch uses the sync transaction API and `.returning().all()`.
The Postgres branch uses the async transaction API and `.returning()`.

`frameAdminSecret` is generated with `crypto.randomBytes(32).toString('base64url')`
before the transaction, so a crypto failure does not burn a code.

Tests:

- issue A, issue B for the same instance, redeem A returns null, redeem B
  succeeds;
- issue A, issue B, redeem B, redeem A returns null;
- a successful redeem consumes every other outstanding code for the instance;
- an instance deleted before redeem returns null and leaves the code consumed;
- the minted token hash matches `hashToken(token)`;
- the token does not appear in any stored column;
- the Postgres cases run when `DATABASE_URL` is set, including the missing
  instance path and the update-returning helper.

### 4.8 Management forwarder

Files: `lib/mgmt-port.ts`, `tests/mgmt-port.test.ts`.

Add a port parser:

```ts
export function parsePort(value: string | undefined, fallback?: number): number | null
```

It accepts an integer from 0 to 65535. `0` means an ephemeral port and stays
available for tests. It rejects `NaN`, negatives, fractions, and values above
65535. A missing value uses the fallback when one is supplied.

`maybeStartMgmtForwarder(env)`:

1. Returns null when `KIOSK_MGMT_PORT` is unset.
2. Returns null during the production build phase.
3. Parses `KIOSK_MGMT_PORT` and `PORT` (default `3000`).
4. Logs and returns null for an invalid value.
5. Logs and returns null when the management port is non-zero and equals the
   app port.
6. Logs and returns null when the app port is `0`.
7. Starts the forwarder and logs a bind failure.

`startMgmtForwarder` keeps accepting explicit ports for tests and throws on an
invalid value.

Connection handling:

- connect upstream with a 10-second timeout;
- set `server.maxConnections = 256`;
- destroy both sockets on an error in either direction;
- destroy the upstream when the incoming socket closes, and the other way
  around;
- keep a permanent server error handler after listen instead of only the
  one-shot reject handler.

Tests:

- `KIOSK_MGMT_PORT=abc` returns null and logs;
- `PORT=abc` returns null and logs;
- a management port equal to the app port returns null and logs;
- `KIOSK_MGMT_PORT=70000` returns null;
- `KIOSK_MGMT_PORT=0` still starts an ephemeral listener;
- a bind conflict returns null and leaves the app unaffected;
- bytes still proxy in both directions;
- a connection to a dead upstream destroys both sockets without an unhandled
  error.

### 4.9 Documentation

Files: `docs/operations.md`, `docs/kiosk-cli.md`, `.env.example`.

Document:

- `TRUST_PROXY`: leave it unset on frames; set it to `1` only behind a proxy
  that overwrites `x-forwarded-for`.
- Enrollment requires https except for loopback development URLs.
- Rotating a code invalidates the previous code for that instance.
- `kiosk-ctl password` writes the secret and hash together, and replaces an
  invalid secret.
- A hash without a valid secret leaves the management surface read-only and
  the login returns 401.
- Invalid port values are logged and do not stop the display.
- The audit log is best-effort on the enroll path.

## 5. Data flow

Console issue:

```text
request -> admin gate -> issueEnrollmentCode
  -> transaction: consume old codes for instance, insert hashed code
  -> return code and expiry
```

Frame redeem:

```text
POST /api/enroll
  -> clientKey (trusted proxy or local)
  -> rate limit
  -> redeemEnrollmentCode transaction
       claim code -> update instance returning id -> consume other codes
  -> auditSafe
  -> no-store bundle
```

Frame enroll:

```text
kiosk-ctl enroll
  -> parse console URL (https or loopback http)
  -> bounded fetch, schema-check bundle
  -> validate env entries
  -> atomic frame.env write (0640)
  -> best-effort chown, warning on failure
  -> restart service
```

Admin login:

```text
POST /api/admin/login
  -> clientKey -> rate limit -> parse body
  -> adminAuthEnabled (hash + valid secret)
  -> scrypt verify
  -> sign with the same secret
  -> HttpOnly cookie, no-store
```

Management port:

```text
instrumentation -> validate ports -> TCP forwarder -> proxy gate by Host port
  -> admin cookie check for mutations
```

## 6. Error handling

| Failure | Behavior |
|---|---|
| Missing, empty, short, or malformed admin secret | Login returns a generic 401 with no cookie. The gate returns 401 with the `kiosk-ctl password` hint. The display keeps serving. |
| Wrong admin password | The same generic 401 as a missing secret. |
| Invalid `frame.env` key or value | `FrameEnvError` names the key, writes nothing, and removes the temp file. |
| Console URL uses non-loopback http | Enroll stops before the request and writes nothing. |
| Console unreachable, timeout, or malformed body | Enroll exits non-zero, writes nothing, and tells the operator to issue a fresh code. The code may already be consumed. |
| Valid JSON with a bad bundle | Enroll exits non-zero, writes nothing, and advises a fresh code. |
| Revoked instance during redeem | Returns null, burns the code, and the route returns the generic 401. |
| Audit write fails | Logs the action and target, and the request still succeeds or fails as it would have. |
| Invalid or colliding ports | Logs the error, starts no forwarder, and leaves the app running. |
| Forwarder connection error | Destroys both sockets. No unhandled error event. |
| chown failure as root | Prints a warning with the group fix. The bundle stays written. |

## 7. Testing and evidence

Test files:

- `tests/frame-admin.test.ts`
- `tests/proxy-gate.test.ts` for the gate hint on a misconfigured secret
- `lib/kiosk/__tests__/frame-env.test.ts`
- new `lib/kiosk/__tests__/enroll.test.ts`
- `tests/enroll-service.test.ts`
- new `tests/enroll-pg.test.ts` (runs when `DATABASE_URL` is set)
- `tests/enroll-api.test.ts`
- `lib/__tests__/rate-limit.test.ts`
- new `lib/__tests__/request-ip.test.ts`
- `lib/__tests__/audit.test.ts`
- `tests/mgmt-port.test.ts`

Run the SQLite suite by default. Run the Postgres cases with `DATABASE_URL`
set, including the redeem race path.

Repo gate:

```bash
npx tsc --noEmit
npm run test
npm run build
```

This branch has no lint script or ESLint config, so typecheck, tests, and the
production build are the checks.

Runtime smoke for the before and after evidence. Take the before state from
the branch tip before the baseline commit where the first-pass fix is already
present, or from a temporary revert of that fix:

1. Set `FRAME_ADMIN_HASH` and leave `FRAME_ADMIN_SECRET` unset. Before:
   login sets a cookie. After: 401 with no `Set-Cookie`.
2. Call `writeFrameEnv` with `SYNC_TOKEN="a\nB=evil"`. Before: a corrupt file
   is written. After: `FrameEnvError` and the old file is unchanged.
3. Set `KIOSK_MGMT_PORT=not-a-port`. Before: a failed listener with a less
   clear error. After: one validation error and no listener.
4. Send 11 login attempts with different `x-forwarded-for` values and
   `TRUST_PROXY` unset. Before: every attempt gets a new bucket. After: the
   later attempts get 429.
5. Issue two codes for one instance and redeem the first. Before: the first
   code still works. After: it returns 401 and the second code works.
6. With `DATABASE_URL` set, delete an instance between issue and redeem.
   Before: a token can be returned for the deleted row. After: null and the
   code stays consumed.

## 8. Out of scope

- Re-planning the review items marked correct.
- Clerk, sync engine, and port-gate redesign.
- Zero-touch provisioning.
- A shared-store rate limiter.
- Startup fail-fast or degraded-mode UI for admin misconfiguration.
- Enrollment code table cleanup or indexes.
- Changing the eight-character password minimum.
- Replacing the installer's `--enroll-code` flag with an interactive prompt.

## 9. Risks and compatibility

- `TRUST_PROXY` is a sharp setting. Enabled without a proxy, clients can spoof
  the limiter key. Disabled behind a proxy, all clients share one bucket. The
  docs call this out in both directions.
- Stale-code invalidation changes rotate behavior. An operator who issues two
  codes for one instance must use the newest one. This is intentional.
- `signAdminSession` now throws on short secrets. Tests and callers must use a
  secret of at least 32 base64url characters.
- `frameEnvLines` now throws on invalid input. The enrollment client and the
  password command validate before calling it, so users see a friendly error.
- The stricter bundle schema may reject a console response from an older
  build. The console and frame should ship together. A rejected response burns
  the code, so the operator rotates.
- The Postgres race test needs a real database in CI. Without
  `DATABASE_URL`, the suite still passes but does not prove that path.
- Best-effort audit can lose a row when the database is down. Losing an audit
  row is better than losing a device token.
- The loopback http exception trusts the local host. A frame configured to
  enroll through a local port forward to a remote console would use plain
  http. The docs say to use https on real frames.

## 10. Acceptance criteria

- No login can mint a cookie with a missing, empty, short, or malformed admin
  secret.
- No `frame.env` write can contain a newline, control character, or invalid
  key.
- Invalid or colliding management ports start no forwarder and do not stop the
  display.
- A spoofed `x-forwarded-for` cannot bypass the limiter when `TRUST_PROXY` is
  unset.
- A redeem against a deleted instance returns null on both dialects.
- Old enrollment codes are dead after rotate and after a successful redeem.
- An audit failure does not lose a bundle.
- The full repo gate passes, and the before and after evidence is captured for
  each runtime smoke case.
