# Frame enrollment hardening evidence

## 1. Admin secret invariant
- Test: `tests/frame-admin.test.ts`
- Before: login minted a cookie with a 5-character secret.
- After: 401 with no Set-Cookie for missing, empty, and short secrets.

## 2. frame.env boundary
- Test: `lib/kiosk/__tests__/frame-env.test.ts`
- Before: `SYNC_TOKEN="a\nB=evil"` wrote a corrupt file.
- After: `FrameEnvError`, no temp file, old file unchanged.

## 3. Management port validation
- Test: `tests/mgmt-port.test.ts`
- Before: `KIOSK_MGMT_PORT=abc` attempted a listener and produced a lower-level failure.
- After: one validation log and no listener.

## 4. Spoofed forwarded address
- Test: `tests/enroll-api.test.ts`
- Before: changing `x-forwarded-for` on every request got a new bucket.
- After: the same local bucket returns 429 on the 11th request.

## 5. Stale enrollment codes
- Test: `tests/enroll-service.test.ts`
- Before: the previous code still redeemed after a rotate.
- After: the previous code returns null and the newest code redeems.

## 6. Postgres redeem race
- Test: `tests/enroll-pg.test.ts`
- Before: a token could be returned for a deleted instance.
- After: null, and the code row stays consumed.

## Verification runs (Task 11)

### Before rebase

- Typecheck: `npx tsc --noEmit` → exit 0.
- Full suite: `npm run test` → 66 test files passed, 3 skipped (69 total); 380 tests passed, 7 skipped (387 total). Skipped files: `tests/enroll-pg.test.ts`, `lib/__tests__/persist.pg.test.ts`, `lib/db/__tests__/history.integration.test.ts` (all gated on `DATABASE_URL`).
- Postgres suite: `DATABASE_URL` unset → `skipped (no DATABASE_URL)`.
- Production build: `npm run build` → exit 0.

Raw red output from earlier tasks was not re-captured in this run; the Before lines above are the faithful summaries recorded in the task brief. No secrets, tokens, or full environment values are included.

### After rebase

- Rebase onto `origin/main`: already up to date (origin/main unchanged at `c487886`); no conflicts.
- Typecheck: `npx tsc --noEmit` → exit 0.
- Full suite: `npm run test` → 66 test files passed, 3 skipped (69 total); 380 tests passed, 7 skipped (387 total).
- Postgres suite: `DATABASE_URL` unset → `skipped (no DATABASE_URL)`.
- Production build: `npm run build` → exit 0.