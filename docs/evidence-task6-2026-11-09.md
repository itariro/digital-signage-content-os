# Task 6 — Frame verification evidence (oculus-02, 192.168.4.77)

Date: 2026-11-09 ~11:00-11:02 UTC. Root ssh. Read-only verification + reboot.
No `--update-runtime` deploy: frame was already fixed manually (surf via apt,
dscos enabled); fix code is unreleased, so no unreleased deploy was attempted.

## Step 1 — Deploy/confirm runtime (read-only)

```
$ systemctl is-enabled dscos kiosk-update.timer ; systemctl is-active dscos
enabled
enabled
active
$ which surf ; ls -l /usr/bin/surf
/usr/bin/surf
-rwxr-xr-x 1 root root 62624 Apr 21  2025 /usr/bin/surf
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
200
$ kiosk app health
{ "state": "healthy", "checks": [process/port/http/config ok],
  "summary": "all checks passed" }
$ pgrep -u kiosk -x surf        # pre-reboot
1050                             # started 21:41 (prior boot)
$ journalctl -t kiosk -n 10     # pre-reboot
Nov 09 21:41:07 kiosk[1020]: display DP-1: rotation 'normal' -> 'left'
Nov 09 21:41:12 kiosk[1049]: browser started (pid 1048) -> http://127.0.0.1:3000/frame/home
```

Note: kiosk-standby timer units absent on frame
(`/etc/systemd/system/kiosk-standby*`: No such file; `list-timers` empty).
Spec §4b fix restores them on next `--update-runtime`; not a boot blocker.

## Step 2 — Reboot and verify

Reboot issued ~11:01:10 UTC; first post-reboot SSH at 11:01:19 (uptime 0 min).

```
=== BEFORE (disabled/missing-surf boot, spec §1a / DEBUG file) ===
WARNING: http://127.0.0.1:3000/frame/home unreachable after 60s; starting browser anyway
browser started -> http://127.0.0.1:3000/frame/home
browser exited after 0s (rc=127)

=== AFTER (this reboot, boot_id 2318c84e-…, 22:00:41 AEDT) ===
$ systemctl is-enabled dscos kiosk-update.timer
enabled
enabled
$ systemctl is-active dscos
active
$ curl health code
200
$ journalctl -t kiosk -b 0
Nov 09 22:01:01 kiosk[1036]: display DP-1: rotation 'normal' -> 'left'
Nov 09 22:01:03 kiosk[1051]: browser started (pid 1050) -> http://127.0.0.1:3000/frame/home
$ grep WARNING|60s  -> NONE - clean boot (browser 2 s after display, no 60 s warning)
$ ps surf  -> PID 1052, ELAPSED 00:21, /usr/bin/surf -F http://127.0.0.1:3000/frame/home
$ curl http://127.0.0.1:3000/api/health
{"status":"ok","database":"connected","bob":{"ticks":6,"throttleSkips":5,
 "inflightSkips":0,"evaluations":1,"publishes":0,"failures":0,
 "lastTickAt":"2026-11-09T11:01:21.661Z"}}
$ kiosk app health -> healthy, all checks passed
```

Reboot survival: PASS — enabled/enabled/active/200/surf running, no 60 s warning.

## Step 3 — Manual restart proof

```
$ echo "surf pid BEFORE: $(pgrep -u kiosk -x surf)"   # 1052
$ kiosk app restart  ->  restarted dscos (rc=0)
$ echo "surf pid AFTER: $(pgrep -u kiosk -x surf)"    # 1052  (unchanged)
$ journalctl -u dscos -b 0  (app DID bounce)
Nov 09 22:01:30 npm[1270]: > my-project@0.9.8 start
Nov 09 22:01:36 npm[1297]: ▲ Next.js 16.4.5 … ✓ Ready in 2.9s
$ systemctl show dscos  -> ExecMainPID=1270, ActiveEnterTimestamp 22:01:29, running
$ curl health -> 200
```

CLI restart does NOT cycle the surf pid on the current (pre-fix, unreleased)
CLI — matches spec §1c. The Task 3–4 `refreshBrowserAfterApp` fix is not yet
released/deployed, so this path is covered by unit tests, not frame evidence.

Manual pkill (supervisor mechanism the fix relies on) — PASSES:

```
$ pkill -TERM -u kiosk -x surf   # rc=0 ; pid 1052 -> 1399 in 4 s
Nov 09 22:01:51 kiosk[1385]: browser exited after 48s (rc=143); restarting
Nov 09 22:01:55 kiosk[1398]: browser started (pid 1397) -> http://127.0.0.1:3000/frame/home
$ curl health -> 200 ; pgrep surf -> 1399
```

## Final state

```
up 1 min; enabled/enabled/active; /usr/bin/surf; health:200; surf pid 1399;
kiosk app health -> healthy
```

Prior-boot journal rotated (only Oct boot retained), so the "before" 60 s-warning
lines exist only in spec §1a / DEBUG file, not on-frame.
